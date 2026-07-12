import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, valveMovementLog, valveComponents, valveCylinderSlots, monthlyRhLog } from "@workspace/db";
import { computeComponentLiveRh } from "../lib/calculations";

const router = Router();

const VALID_ACTIONS = ["Fit", "Remove", "Land Ashore", "Receive Onboard", "Scrap"];

function toDto(r: typeof valveMovementLog.$inferSelect) {
  return {
    id: r.id,
    vesselId: r.vesselId,
    valveType: r.valveType,
    movementDate: r.movementDate,
    meRh: r.meRh,
    componentId: r.componentId,
    fromLocation: r.fromLocation,
    toLocation: r.toLocation,
    action: r.action,
    rhAdded: r.rhAdded,
    remarks: r.remarks,
    createdAt: r.createdAt.toISOString(),
  };
}

// Parse "Cyl N Slot M" → { cylinderNumber: N, slotNumber: M }
// Parse "Cyl N" → { cylinderNumber: N, slotNumber: 1 }
function parseCylSlot(loc: string): { cylinderNumber: number; slotNumber: number } | null {
  const slotMatch = loc.match(/^Cyl\s*(\d+)\s+Slot\s*(\d+)$/i);
  if (slotMatch) return { cylinderNumber: parseInt(slotMatch[1]), slotNumber: parseInt(slotMatch[2]) };
  const cylMatch = loc.match(/^Cyl\s*(\d+)$/i);
  if (cylMatch) return { cylinderNumber: parseInt(cylMatch[1]), slotNumber: 1 };
  return null;
}

// ─── List movements ────────────────────────────────────────────────────────
router.get("/vessels/:vesselId/valves/:valveType/movements", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  const { valveType } = req.params;
  if (isNaN(vesselId) || !["fuel", "exhaust"].includes(valveType)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const rows = await db
    .select()
    .from(valveMovementLog)
    .where(and(eq(valveMovementLog.vesselId, vesselId), eq(valveMovementLog.valveType, valveType)))
    .orderBy(desc(valveMovementLog.createdAt))
    .limit(200);
  res.json(rows.map(toDto));
});

// ─── Record movement ───────────────────────────────────────────────────────
router.post("/vessels/:vesselId/valves/:valveType/movements", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  const { valveType } = req.params;
  if (isNaN(vesselId) || !["fuel", "exhaust"].includes(valveType)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const { movementDate, meRh, componentId, fromLocation, toLocation, action, slotNumber, remarks } = req.body;
  if (!movementDate || meRh == null || !componentId || !fromLocation || !toLocation || !action) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  if (!VALID_ACTIONS.includes(action)) {
    res.status(400).json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` });
    return;
  }

  const [comp] = await db
    .select()
    .from(valveComponents)
    .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType), eq(valveComponents.componentId, componentId)));
  if (!comp) {
    res.status(400).json({ error: `Component '${componentId}' not found.` });
    return;
  }

  const [latestRh] = await db
    .select()
    .from(monthlyRhLog)
    .where(eq(monthlyRhLog.vesselId, vesselId))
    .orderBy(desc(monthlyRhLog.logDate))
    .limit(1);
  const currentMeRh = latestRh?.meTotalRh ?? 0;

  if (meRh < currentMeRh) {
    res.status(400).json({ error: `Movement ME RH (${meRh}) cannot be less than latest monthly ME RH (${currentMeRh}).` });
    return;
  }

  let rhAdded = 0;
  const effectiveSlot = slotNumber ?? 1;

  if (action === "Fit") {
    await db
      .update(valveComponents)
      .set({ currentStatus: "In Service", currentLocation: toLocation, fittedAtMeRh: meRh })
      .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType), eq(valveComponents.componentId, componentId)));

    const parsed = parseCylSlot(toLocation);
    if (parsed) {
      await db
        .insert(valveCylinderSlots)
        .values({
          vesselId,
          valveType,
          cylinderNumber: parsed.cylinderNumber,
          slotNumber: effectiveSlot,
          fittedComponentId: componentId,
          fittedAtMeRh: meRh,
        })
        .onConflictDoUpdate({
          target: [valveCylinderSlots.vesselId, valveCylinderSlots.valveType, valveCylinderSlots.cylinderNumber, valveCylinderSlots.slotNumber],
          set: { fittedComponentId: componentId, fittedAtMeRh: meRh, updatedAt: new Date() },
        });
    }
  } else if (action === "Remove") {
    if (comp.currentStatus === "In Service" && comp.fittedAtMeRh != null) {
      rhAdded = Math.max(0, meRh - comp.fittedAtMeRh);
    }
    const newTotal = comp.totalAccumulatedRh + rhAdded;
    const newStatus = toLocation.toLowerCase().includes("spare") ? "Onboard Spare" :
                      toLocation.toLowerCase().includes("ashore") ? "Landed Ashore" : "Onboard Spare";
    await db
      .update(valveComponents)
      .set({ currentStatus: newStatus, currentLocation: toLocation, fittedAtMeRh: null, totalAccumulatedRh: newTotal })
      .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType), eq(valveComponents.componentId, componentId)));

    // Children (nozzle, spindle, etc.) ran the same hours while attached —
    // bank those hours into each child's own life counter as well.
    if (rhAdded > 0) {
      const children = await db
        .select()
        .from(valveComponents)
        .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType), eq(valveComponents.parentComponentId, comp.id)));
      for (const child of children) {
        await db
          .update(valveComponents)
          .set({ totalAccumulatedRh: child.totalAccumulatedRh + rhAdded })
          .where(eq(valveComponents.id, child.id));
      }
    }

    const parsed = parseCylSlot(fromLocation);
    if (parsed) {
      await db
        .update(valveCylinderSlots)
        .set({ fittedComponentId: null, fittedAtMeRh: null, updatedAt: new Date() })
        .where(
          and(
            eq(valveCylinderSlots.vesselId, vesselId),
            eq(valveCylinderSlots.valveType, valveType),
            eq(valveCylinderSlots.cylinderNumber, parsed.cylinderNumber),
            eq(valveCylinderSlots.slotNumber, effectiveSlot)
          )
        );
    }
  } else if (action === "Land Ashore") {
    await db
      .update(valveComponents)
      .set({ currentStatus: "Landed Ashore", currentLocation: "Landed Ashore" })
      .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType), eq(valveComponents.componentId, componentId)));
  } else if (action === "Receive Onboard") {
    await db
      .update(valveComponents)
      .set({ currentStatus: "Onboard Spare", currentLocation: "Onboard Spare" })
      .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType), eq(valveComponents.componentId, componentId)));
  } else if (action === "Scrap") {
    await db
      .update(valveComponents)
      .set({ currentStatus: "Scrapped", currentLocation: "Scrapped" })
      .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType), eq(valveComponents.componentId, componentId)));
  }

  const [entry] = await db
    .insert(valveMovementLog)
    .values({ vesselId, valveType, movementDate, meRh, componentId, fromLocation, toLocation, action, rhAdded, remarks: remarks ?? null })
    .returning();

  res.status(201).json(toDto(entry));
});

// ─── Delete movement ───────────────────────────────────────────────────────
router.delete("/vessels/:vesselId/valves/:valveType/movements/:movementId", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  const movementId = parseInt(req.params.movementId);
  const { valveType } = req.params;
  if (isNaN(vesselId) || isNaN(movementId) || !["fuel", "exhaust"].includes(valveType)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  await db.delete(valveMovementLog).where(eq(valveMovementLog.id, movementId));
  res.sendStatus(204);
});

export default router;
