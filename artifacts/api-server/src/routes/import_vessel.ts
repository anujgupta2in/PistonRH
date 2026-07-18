import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, vessels, components, valveComponents, valveCylinderSlots, monthlyRhLog, cylinderSetup, componentTypeThresholds } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Excel parsing helpers ────────────────────────────────────────────────────

function strVal(v: unknown): string {
  return v == null ? "" : String(v).trim();
}
function numVal(v: unknown): number {
  const n = parseFloat(String(v ?? "0").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

// Normalize a date cell to "YYYY-MM-DD". Excel stores dates as serial numbers
// unless the cell is formatted as text, so both forms must be accepted.
function dateVal(v: unknown): string {
  if (v == null || v === "") return "";
  // A serial may arrive as a string if the cell was read via strVal first
  if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())) v = parseFloat(v.trim());
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Excel serial date (days since 1899-12-30); 25569 = days to Unix epoch
    return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function parseVesselInfo(wb: XLSX.WorkBook): Record<string, string> {
  const sheet = wb.Sheets["Vessel Info"];
  if (!sheet) return {};
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  const map: Record<string, string> = {};
  for (const row of rows as unknown[][]) {
    const label = strVal(row[0]).replace(/\*/g, "").trim();
    const val   = strVal(row[1]);
    if (label && val) map[label] = val;
  }
  return map;
}

interface ParsedComponent {
  componentId: string;
  componentType: string;
  condition: string;
  currentStatus: string;
  totalAccumulatedRh: number;
  fittedInCylinder: string;
  fittedAtMeRh: number | null;
  remarks: string;
  parentComponentId: string;
  // "Last Decarb Date" column (Piston Components sheet) — applies to the
  // cylinder the piston is fitted in. "Last Overhaul Date" column (valve
  // sheets) — applies to the valve component itself. Both YYYY-MM-DD or "".
  lastDecarbDate: string;
  // "Last Decarb ME RH" (Piston sheet): ME total RH at the unit's last decarb,
  // stored as the cylinder's overhaul baseline alongside the decarb date.
  lastDecarbMeRh: number | null;
  lastOverhaulDate: string;
  // "Last Overhaul RH" (valve sheets): the component's own RH at its last
  // overhaul — the overhaul-due clock counts from here. null = not recorded.
  lastOverhaulRh: number | null;
}

function parseComponentSheet(wb: XLSX.WorkBook, sheetName: string): ParsedComponent[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rawRows.length < 2) return [];

  const headers = (rawRows[0] as unknown[]).map(h =>
    strVal(h).split("\n")[0].replace(/\*/g, "").trim().toLowerCase()
  );

  const colIdx = (name: string) => headers.findIndex(h => h.includes(name));
  const idCol      = headers.findIndex(h => h.includes("component id") && !h.includes("parent"));
  const typeCol    = colIdx("component type");
  const condCol    = colIdx("condition");
  const statusCol  = colIdx("status");
  const rhCol      = colIdx("accumulated rh");
  const cylCol     = colIdx("fitted in cylinder");
  const meRhCol    = colIdx("fitted at me rh");
  const remCol     = colIdx("remarks");
  const parentCol  = colIdx("parent component id");
  const decarbCol  = colIdx("last decarb date");
  const decarbRhCol = colIdx("last decarb me rh");
  const lastOhCol  = colIdx("last overhaul date");
  const lastOhRhCol = colIdx("last overhaul rh");

  const results: ParsedComponent[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    const id = strVal(row[idCol]);
    if (!id) continue;

    const rawMeRh = strVal(row[meRhCol]);
    const fittedAtMeRh = rawMeRh !== "" ? numVal(rawMeRh) : null;

    results.push({
      componentId:       id,
      componentType:     strVal(row[typeCol]),
      condition:         strVal(row[condCol]),
      currentStatus:     strVal(row[statusCol]),
      totalAccumulatedRh: numVal(row[rhCol]),
      fittedInCylinder:  strVal(row[cylCol]),
      fittedAtMeRh,
      remarks:           strVal(row[remCol]),
      parentComponentId: parentCol >= 0 ? strVal(row[parentCol]) : "",
      lastDecarbDate:    decarbCol >= 0 ? dateVal(row[decarbCol]) : "",
      lastDecarbMeRh:    decarbRhCol >= 0 && strVal(row[decarbRhCol]) !== "" ? numVal(row[decarbRhCol]) : null,
      lastOverhaulDate:  lastOhCol >= 0 ? dateVal(row[lastOhCol]) : "",
      lastOverhaulRh:    lastOhRhCol >= 0 && strVal(row[lastOhRhCol]) !== "" ? numVal(row[lastOhRhCol]) : null,
    });
  }
  return results;
}

// Optional "Cylinder Units" sheet: Unit | Last Decarb Date | Last Decarb ME RH | Last Dismantling ME RH.
// The authoritative carrier for unit baselines — works even for units with no
// piston currently fitted (the piston-row columns only cover fitted units).
function parseCylinderUnits(wb: XLSX.WorkBook) {
  const sheet = wb.Sheets["Cylinder Units"];
  if (!sheet) return [];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rawRows.length < 2) return [];
  const headers = (rawRows[0] as unknown[]).map(h => strVal(h).split("\n")[0].replace(/\*/g, "").trim().toLowerCase());
  const unitCol   = headers.findIndex(h => h.includes("unit") || h.includes("cylinder"));
  const dateCol   = headers.findIndex(h => h.includes("decarb date"));
  const decarbCol = headers.findIndex(h => h.includes("decarb me rh"));
  const disCol    = headers.findIndex(h => h.includes("dismantling"));
  const out: { cylinderNumber: number; lastDecarbDate: string; lastDecarbMeRh: number | null; lastDismantlingMeRh: number | null }[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    const cylinderNumber = parseInt(strVal(row[unitCol]).replace(/[^0-9]/g, ""));
    if (isNaN(cylinderNumber) || cylinderNumber < 1) continue;
    out.push({
      cylinderNumber,
      lastDecarbDate: dateCol >= 0 ? dateVal(row[dateCol]) : "",
      lastDecarbMeRh: decarbCol >= 0 && strVal(row[decarbCol]) !== "" ? numVal(row[decarbCol]) : null,
      lastDismantlingMeRh: disCol >= 0 && strVal(row[disCol]) !== "" ? numVal(row[disCol]) : null,
    });
  }
  return out;
}

// Optional "Type Thresholds" sheet: Category | Component Type | Interval | Warning
function parseTypeThresholds(wb: XLSX.WorkBook) {
  const sheet = wb.Sheets["Type Thresholds"];
  if (!sheet) return [];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rawRows.length < 2) return [];
  const headers = (rawRows[0] as unknown[]).map(h => strVal(h).split("\n")[0].replace(/\*/g, "").trim().toLowerCase());
  const catCol  = headers.findIndex(h => h.includes("category"));
  const typeCol = headers.findIndex(h => h.includes("component type"));
  const ohCol   = headers.findIndex(h => h.includes("interval") || h.includes("overhaul"));
  const warnCol = headers.findIndex(h => h.includes("warning"));
  const out: { category: string; componentType: string; overhaulRh: number; warningRh: number }[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    const componentType = strVal(row[typeCol]);
    const overhaulRh = numVal(row[ohCol]);
    if (!componentType || overhaulRh <= 0) continue;
    const warningRh = numVal(row[warnCol]) || overhaulRh;
    out.push({ category: strVal(row[catCol]) || "piston", componentType, overhaulRh, warningRh });
  }
  return out;
}

// Parse "Cyl N Slot M" → { cyl, slot } | null
function parseCylSlot(loc: string): { cyl: number; slot: number } | null {
  const slotM = loc.match(/Cyl\s*(\d+)\s+Slot\s*(\d+)/i);
  if (slotM) return { cyl: parseInt(slotM[1]), slot: parseInt(slotM[2]) };
  const cylM = loc.match(/Cyl\s*(\d+)/i);
  if (cylM) return { cyl: parseInt(cylM[1]), slot: 1 };
  return null;
}

// ─── Parse sectioned vessel info ──────────────────────────────────────────────
function parseSectionedVesselInfo(wb: XLSX.WorkBook) {
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Vessel Info"] || {}, { header: 1, defval: "" }) as unknown[][];
  let section = "";
  const sv: Record<string, Record<string, string>> = {
    piston: {}, fuel: {}, exhaust: {}, me: {}, vessel: {},
  };
  for (const row of rawRows) {
    const label = strVal((row as unknown[])[0]).replace(/\*/g, "").trim();
    const val   = strVal((row as unknown[])[1]);
    if (label.toUpperCase() === "VESSEL INFORMATION")    { section = "vessel"; continue; }
    if (label.toUpperCase() === "PISTON THRESHOLDS")     { section = "piston"; continue; }
    if (label.toUpperCase() === "FUEL VALVE THRESHOLDS") { section = "fuel";   continue; }
    if (label.toUpperCase() === "EXHAUST VALVE THRESHOLDS") { section = "exhaust"; continue; }
    if (label.toUpperCase() === "ME RUNNING HOURS AT SETUP") { section = "me"; continue; }
    if (label && val && section) sv[section][label] = val;
  }
  return sv;
}

// ─── Preview (no DB changes) ──────────────────────────────────────────────────

router.post(
  "/vessels/:vesselId/import/preview",
  upload.single("file"),
  async (req, res): Promise<void> => {
    const vesselId = parseInt(String(req.params.vesselId));
    if (isNaN(vesselId)) { res.status(400).json({ error: "Invalid vesselId" }); return; }
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    try {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const vesselInfo    = parseVesselInfo(wb);
      const pistons       = parseComponentSheet(wb, "Piston Components");
      const fuelValves    = parseComponentSheet(wb, "Fuel Valves");
      const exhaustValves = parseComponentSheet(wb, "Exhaust Valves");

      // ── Detect conflicts: which IDs already exist in DB ──────────────────
      const [existingPistons, existingFuel, existingExhaust] = await Promise.all([
        db.select({ componentId: components.componentId })
          .from(components)
          .where(eq(components.vesselId, vesselId)),
        db.select({ componentId: valveComponents.componentId })
          .from(valveComponents)
          .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, "fuel"))),
        db.select({ componentId: valveComponents.componentId })
          .from(valveComponents)
          .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, "exhaust"))),
      ]);

      const existingPistonIds  = new Set(existingPistons.map((r) => r.componentId));
      const existingFuelIds    = new Set(existingFuel.map((r) => r.componentId));
      const existingExhaustIds = new Set(existingExhaust.map((r) => r.componentId));

      res.json({
        vesselInfo,
        summary: {
          pistons:      pistons.length,
          fuelValves:   fuelValves.length,
          exhaustValves: exhaustValves.length,
        },
        pistons,
        fuelValves,
        exhaustValves,
        conflicts: {
          pistons:      pistons.filter((p) => existingPistonIds.has(p.componentId)).map((p) => p.componentId),
          fuelValves:   fuelValves.filter((f) => existingFuelIds.has(f.componentId)).map((f) => f.componentId),
          exhaustValves: exhaustValves.filter((e) => existingExhaustIds.has(e.componentId)).map((e) => e.componentId),
        },
      });
    } catch (err: unknown) {
      res.status(400).json({ error: `Failed to parse file: ${(err as Error).message}` });
    }
  }
);

// ─── Import (writes to DB) ────────────────────────────────────────────────────

router.post(
  "/vessels/:vesselId/import",
  upload.single("file"),
  async (req, res): Promise<void> => {
    const vesselId = parseInt(String(req.params.vesselId));
    if (isNaN(vesselId)) { res.status(400).json({ error: "Invalid vesselId" }); return; }
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    // Parse overwrite IDs from form body
    let overwriteIds: { pistons: string[]; fuelValves: string[]; exhaustValves: string[] } = {
      pistons: [], fuelValves: [], exhaustValves: [],
    };
    try {
      if (req.body.overwriteIds) overwriteIds = JSON.parse(req.body.overwriteIds);
    } catch {
      // ignore parse errors — use defaults (skip all)
    }

    const overwritePistons  = new Set(overwriteIds.pistons);
    const overwriteFuel     = new Set(overwriteIds.fuelValves);
    const overwriteExhaust  = new Set(overwriteIds.exhaustValves);

    // Make sure vessel exists
    const [vessel] = await db.select().from(vessels).where(eq(vessels.id, vesselId));
    if (!vessel) { res.status(404).json({ error: "Vessel not found" }); return; }

    try {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const pistons       = parseComponentSheet(wb, "Piston Components");
      const fuelValves    = parseComponentSheet(wb, "Fuel Valves");
      const exhaustValves = parseComponentSheet(wb, "Exhaust Valves");
      const sv            = parseSectionedVesselInfo(wb);

      const results = {
        pistonCreated: 0, pistonSkipped: 0, pistonOverwritten: 0,
        fuelCreated: 0,   fuelSkipped: 0,   fuelOverwritten: 0,
        exhaustCreated: 0, exhaustSkipped: 0, exhaustOverwritten: 0,
        monthlyRhCreated: false,
        vesselUpdated: false,
      };

      // ── 1. Update vessel thresholds from sheet ───────────────────────────
      const sp = (sec: string, k: string) => { const v = parseInt(sv[sec]?.[k] || ""); return isNaN(v) ? null : v; };
      const updates: Partial<typeof vessel> = {};
      if (sv.vessel["Vessel Name"])            updates.vesselName        = sv.vessel["Vessel Name"];
      if (sv.vessel["Number of Cylinders"])    updates.numCylinders     = sp("vessel", "Number of Cylinders") ?? vessel.numCylinders;
      if (sv.vessel["Engine Make"])            updates.engineMake        = sv.vessel["Engine Make"];
      if (sv.vessel["Engine Model"])           updates.engineModel       = sv.vessel["Engine Model"];
      if (sv.vessel["Vessel Type"])            updates.vesselType        = sv.vessel["Vessel Type"];
      if (sv.vessel["IMO Number"])             updates.imoNumber         = sv.vessel["IMO Number"];
      if (sp("piston","Overhaul Interval (hrs)"))    updates.crownOverhaulRh      = sp("piston","Overhaul Interval (hrs)") ?? vessel.crownOverhaulRh;
      if (sp("piston","Warning Threshold (hrs)"))    updates.crownWarningRh       = sp("piston","Warning Threshold (hrs)") ?? vessel.crownWarningRh;
      if (sp("piston","Dismantling Warning (hrs)"))  updates.dismantlingWarningRh = sp("piston","Dismantling Warning (hrs)") ?? vessel.dismantlingWarningRh;
      if (sp("fuel","Overhaul Interval (hrs)"))      updates.fuelValveOverhaulRh  = sp("fuel","Overhaul Interval (hrs)") ?? vessel.fuelValveOverhaulRh;
      if (sp("fuel","Warning Threshold (hrs)"))      updates.fuelValveWarningRh   = sp("fuel","Warning Threshold (hrs)") ?? vessel.fuelValveWarningRh;
      if (sp("fuel","Fuel Valve Slots per Cylinder")) updates.fuelValveSlotsPerCyl = sp("fuel","Fuel Valve Slots per Cylinder") ?? vessel.fuelValveSlotsPerCyl;
      if (sp("exhaust","Overhaul Interval (hrs)"))   updates.exhaustValveOverhaulRh = sp("exhaust","Overhaul Interval (hrs)") ?? vessel.exhaustValveOverhaulRh;
      if (sp("exhaust","Warning Threshold (hrs)"))   updates.exhaustValveWarningRh  = sp("exhaust","Warning Threshold (hrs)") ?? vessel.exhaustValveWarningRh;

      if (Object.keys(updates).length > 0) {
        await db.update(vessels).set({ ...updates, updatedAt: new Date() }).where(eq(vessels.id, vesselId));
        results.vesselUpdated = true;
      }

      // ── 2. Create initial ME RH log entry ────────────────────────────────
      const meRhStr   = sv.me["Current ME Total Running Hours"];
      // dateVal also converts an Excel date-cell serial (e.g. "46173") to ISO
      const meDateStr = dateVal(sv.me["Date of Reading (YYYY-MM-DD)"]);
      if (meRhStr && meDateStr) {
        const meRh = parseFloat(meRhStr);
        if (!isNaN(meRh) && meRh > 0) {
          const existing = await db.select().from(monthlyRhLog)
            .where(and(eq(monthlyRhLog.vesselId, vesselId), eq(monthlyRhLog.logDate, meDateStr)));
          if (existing.length === 0) {
            await db.insert(monthlyRhLog).values({ vesselId, logDate: meDateStr, meTotalRh: meRh });
            results.monthlyRhCreated = true;
          }
        }
      }

      // ── 2a. Upsert per-unit baselines from optional Cylinder Units sheet ──
      for (const u of parseCylinderUnits(wb)) {
        const set: Record<string, unknown> = { updatedAt: new Date() };
        if (u.lastDecarbDate) set.lastDecarbDate = u.lastDecarbDate;
        if (u.lastDecarbMeRh != null) set.lastOverhaulRh = u.lastDecarbMeRh;
        if (u.lastDismantlingMeRh != null) set.lastDismantlingRh = u.lastDismantlingMeRh;
        if (Object.keys(set).length === 1) continue;
        await db.insert(cylinderSetup)
          .values({
            vesselId,
            cylinderNumber: u.cylinderNumber,
            lastDecarbDate: u.lastDecarbDate || null,
            lastOverhaulRh: u.lastDecarbMeRh ?? 0,
            lastDismantlingRh: u.lastDismantlingMeRh ?? 0,
          })
          .onConflictDoUpdate({
            target: [cylinderSetup.vesselId, cylinderSetup.cylinderNumber],
            set,
          });
      }

      // ── 2b. Upsert component-type thresholds from optional sheet ─────────
      for (const t of parseTypeThresholds(wb)) {
        await db.insert(componentTypeThresholds)
          .values({ vesselId, category: t.category, componentType: t.componentType, overhaulRh: t.overhaulRh, warningRh: t.warningRh })
          .onConflictDoUpdate({
            target: [componentTypeThresholds.vesselId, componentTypeThresholds.componentType],
            set: { category: t.category, overhaulRh: t.overhaulRh, warningRh: t.warningRh },
          });
      }

      // ── 3. Import piston components ───────────────────────────────────────
      for (const p of pistons) {
        const [existing] = await db.select().from(components)
          .where(and(eq(components.vesselId, vesselId), eq(components.componentId, p.componentId)));

        const row = {
          vesselId,
          componentId:        p.componentId,
          componentType:      p.componentType || "Piston Crown",
          condition:          p.condition || "New",
          currentStatus:      p.currentStatus || "Onboard Spare",
          currentLocation:    p.currentStatus === "In Service" ? (p.fittedInCylinder || p.currentStatus) : p.currentStatus,
          totalAccumulatedRh: p.totalAccumulatedRh,
          fittedAtMeRh:       p.currentStatus === "In Service" ? p.fittedAtMeRh : null,
          remarks:            p.remarks || null,
        };

        if (existing) {
          if (overwritePistons.has(p.componentId)) {
            await db.update(components)
              .set(row)
              .where(and(eq(components.vesselId, vesselId), eq(components.componentId, p.componentId)));
            results.pistonOverwritten++;
          } else {
            results.pistonSkipped++;
          }
        } else {
          await db.insert(components).values(row);
          results.pistonCreated++;
        }

        // "Last Decarb Date" / "Last Decarb ME RH" on an in-service piston row
        // apply to the Unit (cylinder) it is fitted in, not the piston itself:
        // the date is informational; the ME RH is the unit's overhaul baseline
        // that drives "RH after overhaul" on the dashboard.
        const applied = !existing || overwritePistons.has(p.componentId);
        if (applied && (p.lastDecarbDate || p.lastDecarbMeRh != null) && p.currentStatus === "In Service") {
          const parsed = parseCylSlot(p.fittedInCylinder);
          if (parsed) {
            const cylUpdates: Record<string, unknown> = { updatedAt: new Date() };
            if (p.lastDecarbDate) cylUpdates.lastDecarbDate = p.lastDecarbDate;
            if (p.lastDecarbMeRh != null) cylUpdates.lastOverhaulRh = p.lastDecarbMeRh;
            await db.insert(cylinderSetup)
              .values({
                vesselId,
                cylinderNumber: parsed.cyl,
                lastDecarbDate: p.lastDecarbDate || null,
                lastOverhaulRh: p.lastDecarbMeRh ?? 0,
              })
              .onConflictDoUpdate({
                target: [cylinderSetup.vesselId, cylinderSetup.cylinderNumber],
                set: cylUpdates,
              });
          }
        }
      }

      // ── 4. Import fuel valve components ──────────────────────────────────
      // Parents (no "Parent Component ID" in the sheet) are imported first, so
      // children referencing them by componentId can resolve the parent's
      // DB-generated integer id afterwards, whether the parent is pre-existing
      // or was just created in this same import.
      const fuelValvesOrdered = [
        ...fuelValves.filter((fv) => !fv.parentComponentId),
        ...fuelValves.filter((fv) => fv.parentComponentId),
      ];
      for (const fv of fuelValvesOrdered) {
        let parentDbId: number | null = null;
        if (fv.parentComponentId) {
          const [parentRow] = await db.select({ id: valveComponents.id }).from(valveComponents)
            .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, "fuel"), eq(valveComponents.componentId, fv.parentComponentId)));
          parentDbId = parentRow?.id ?? null;
        }

        const [existing] = await db.select().from(valveComponents)
          .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, "fuel"), eq(valveComponents.componentId, fv.componentId)));

        const row = {
          vesselId,
          valveType:          "fuel" as const,
          componentId:        fv.componentId,
          componentType:      fv.componentType || "Fuel Injector",
          condition:          fv.condition || "New",
          currentStatus:      fv.currentStatus || "Onboard Spare",
          currentLocation:    fv.currentStatus === "In Service" ? (fv.fittedInCylinder || fv.currentStatus) : fv.currentStatus,
          totalAccumulatedRh: fv.totalAccumulatedRh,
          fittedAtMeRh:       fv.currentStatus === "In Service" ? fv.fittedAtMeRh : null,
          remarks:            fv.remarks || null,
          parentComponentId:  parentDbId,
          lastOverhaulDate:   fv.lastOverhaulDate || null,
          lastOverhaulRh:     fv.lastOverhaulRh,
        };

        if (existing) {
          if (overwriteFuel.has(fv.componentId)) {
            await db.update(valveComponents)
              .set(row)
              .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, "fuel"), eq(valveComponents.componentId, fv.componentId)));
            results.fuelOverwritten++;
          } else {
            results.fuelSkipped++;
            continue;
          }
        } else {
          await db.insert(valveComponents).values(row);
          results.fuelCreated++;
        }

        // Update cylinder slot if In Service
        if (fv.currentStatus === "In Service" && fv.fittedInCylinder) {
          const parsed = parseCylSlot(fv.fittedInCylinder);
          if (parsed) {
            const meRhEntry = sv.me["Current ME Total Running Hours"];
            const fittedMeRh = fv.fittedAtMeRh ?? (meRhEntry ? parseFloat(meRhEntry) : 0);
            await db.insert(valveCylinderSlots).values({
              vesselId, valveType: "fuel", cylinderNumber: parsed.cyl, slotNumber: parsed.slot,
              fittedComponentId: fv.componentId, fittedAtMeRh: fittedMeRh,
            }).onConflictDoUpdate({
              target: [valveCylinderSlots.vesselId, valveCylinderSlots.valveType, valveCylinderSlots.cylinderNumber, valveCylinderSlots.slotNumber],
              set: { fittedComponentId: fv.componentId, fittedAtMeRh: fittedMeRh, updatedAt: new Date() },
            });
          }
        }
      }

      // ── 5. Import exhaust valve components ────────────────────────────────
      const exhaustValvesOrdered = [
        ...exhaustValves.filter((ev) => !ev.parentComponentId),
        ...exhaustValves.filter((ev) => ev.parentComponentId),
      ];
      for (const ev of exhaustValvesOrdered) {
        let parentDbId: number | null = null;
        if (ev.parentComponentId) {
          const [parentRow] = await db.select({ id: valveComponents.id }).from(valveComponents)
            .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, "exhaust"), eq(valveComponents.componentId, ev.parentComponentId)));
          parentDbId = parentRow?.id ?? null;
        }

        const [existing] = await db.select().from(valveComponents)
          .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, "exhaust"), eq(valveComponents.componentId, ev.componentId)));

        const row = {
          vesselId,
          valveType:          "exhaust" as const,
          componentId:        ev.componentId,
          componentType:      ev.componentType || "Exhaust Valve",
          condition:          ev.condition || "New",
          currentStatus:      ev.currentStatus || "Onboard Spare",
          currentLocation:    ev.currentStatus === "In Service" ? (ev.fittedInCylinder || ev.currentStatus) : ev.currentStatus,
          totalAccumulatedRh: ev.totalAccumulatedRh,
          fittedAtMeRh:       ev.currentStatus === "In Service" ? ev.fittedAtMeRh : null,
          remarks:            ev.remarks || null,
          parentComponentId:  parentDbId,
          lastOverhaulDate:   ev.lastOverhaulDate || null,
          lastOverhaulRh:     ev.lastOverhaulRh,
        };

        if (existing) {
          if (overwriteExhaust.has(ev.componentId)) {
            await db.update(valveComponents)
              .set(row)
              .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, "exhaust"), eq(valveComponents.componentId, ev.componentId)));
            results.exhaustOverwritten++;
          } else {
            results.exhaustSkipped++;
            continue;
          }
        } else {
          await db.insert(valveComponents).values(row);
          results.exhaustCreated++;
        }

        // Update cylinder slot if In Service
        if (ev.currentStatus === "In Service" && ev.fittedInCylinder) {
          const parsed = parseCylSlot(ev.fittedInCylinder);
          if (parsed) {
            const meRhEntry = sv.me["Current ME Total Running Hours"];
            const fittedMeRh = ev.fittedAtMeRh ?? (meRhEntry ? parseFloat(meRhEntry) : 0);
            await db.insert(valveCylinderSlots).values({
              vesselId, valveType: "exhaust", cylinderNumber: parsed.cyl, slotNumber: 1,
              fittedComponentId: ev.componentId, fittedAtMeRh: fittedMeRh,
            }).onConflictDoUpdate({
              target: [valveCylinderSlots.vesselId, valveCylinderSlots.valveType, valveCylinderSlots.cylinderNumber, valveCylinderSlots.slotNumber],
              set: { fittedComponentId: ev.componentId, fittedAtMeRh: fittedMeRh, updatedAt: new Date() },
            });
          }
        }
      }

      const totalCreated = results.pistonCreated + results.fuelCreated + results.exhaustCreated;
      const totalSkipped = results.pistonSkipped + results.fuelSkipped + results.exhaustSkipped;
      const totalOverwritten = results.pistonOverwritten + results.fuelOverwritten + results.exhaustOverwritten;

      res.json({
        success: true,
        results,
        message: `Import complete. ${totalCreated} created, ${totalOverwritten} overwritten, ${totalSkipped} skipped.`,
      });
    } catch (err: unknown) {
      res.status(400).json({ error: `Import failed: ${(err as Error).message}` });
    }
  }
);

export default router;
