import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, valveComponents, componentTypeThresholds, monthlyRhLog, vessels } from "@workspace/db";
import { computeComponentLiveRh, getAlertStatus, resolveValveComponentState } from "../lib/calculations";

type ValveComponentRow = typeof valveComponents.$inferSelect;

async function getVesselValveComponentsById(vesselId: number, valveType: string): Promise<Map<number, ValveComponentRow>> {
  const rows = await db
    .select()
    .from(valveComponents)
    .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType)));
  return new Map(rows.map((r) => [r.id, r]));
}

const router = Router();

async function getLatestMeRh(vesselId: number): Promise<number> {
  const [row] = await db
    .select()
    .from(monthlyRhLog)
    .where(eq(monthlyRhLog.vesselId, vesselId))
    .orderBy(desc(monthlyRhLog.logDate))
    .limit(1);
  return row?.meTotalRh ?? 0;
}

async function getValveAlertCfg(vesselId: number, valveType: string) {
  const [v, typeThreshRows] = await Promise.all([
    db.select().from(vessels).where(eq(vessels.id, vesselId)).limit(1).then((r) => r[0]),
    db.select().from(componentTypeThresholds).where(eq(componentTypeThresholds.vesselId, vesselId)),
  ]);
  const typeThreshMap = new Map(typeThreshRows.map((t) => [t.componentType, { overhaulRh: t.overhaulRh, warningRh: t.warningRh }]));
  if (valveType === "fuel") {
    return {
      overhaulRh: v?.fuelValveOverhaulRh ?? 8000,
      warningRh: v?.fuelValveWarningRh ?? 6500,
      typeThreshMap,
    };
  }
  return {
    overhaulRh: v?.exhaustValveOverhaulRh ?? 8000,
    warningRh: v?.exhaustValveWarningRh ?? 6500,
    typeThreshMap,
  };
}

function toDto(
  c: typeof valveComponents.$inferSelect,
  currentMeRh: number,
  overhaulRh: number,
  warningRh: number,
  typeThreshMap: Map<string, { overhaulRh: number; warningRh: number }> = new Map(),
  byId: Map<number, typeof valveComponents.$inferSelect> = new Map()
) {
  const typeThresh = typeThreshMap.get(c.componentType);
  const effectiveOverhaulRh = c.overhaulRh ?? typeThresh?.overhaulRh ?? overhaulRh;
  const effectiveWarningRh = c.warningRh ?? typeThresh?.warningRh ?? warningRh;
  const state = resolveValveComponentState(c, byId);
  const liveRh = computeComponentLiveRh(state.totalAccumulatedRh, state.currentStatus, state.fittedAtMeRh, currentMeRh);
  return {
    id: c.id,
    componentId: c.componentId,
    vesselId: c.vesselId,
    valveType: c.valveType,
    componentType: c.componentType,
    condition: c.condition,
    currentStatus: state.currentStatus,
    currentLocation: state.currentLocation,
    totalAccumulatedRh: c.totalAccumulatedRh,
    fittedAtMeRh: c.fittedAtMeRh,
    overhaulRh: c.overhaulRh,
    warningRh: c.warningRh,
    parentComponentId: c.parentComponentId,
    lastOverhaulDate: c.lastOverhaulDate,
    effectiveOverhaulRh,
    effectiveWarningRh,
    remarks: c.remarks,
    liveRh: Math.round(liveRh),
    alertStatus: getAlertStatus(liveRh, effectiveOverhaulRh, effectiveWarningRh),
    createdAt: c.createdAt.toISOString(),
  };
}

// ─── List ──────────────────────────────────────────────────────────────────
router.get("/vessels/:vesselId/valves/:valveType/components", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  const { valveType } = req.params;
  if (isNaN(vesselId) || !["fuel", "exhaust"].includes(valveType)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const [currentMeRh, cfg] = await Promise.all([
    getLatestMeRh(vesselId),
    getValveAlertCfg(vesselId, valveType),
  ]);
  const rows = await db
    .select()
    .from(valveComponents)
    .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  res.json(rows.map((c) => toDto(c, currentMeRh, cfg.overhaulRh, cfg.warningRh, cfg.typeThreshMap, byId)));
});

// ─── Create ────────────────────────────────────────────────────────────────
router.post("/vessels/:vesselId/valves/:valveType/components", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  const { valveType } = req.params;
  if (isNaN(vesselId) || !["fuel", "exhaust"].includes(valveType)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const { componentId, componentType, condition, currentStatus, currentLocation, totalAccumulatedRh, fittedAtMeRh, remarks, parentComponentId, lastOverhaulDate } = req.body;
  if (!componentId || !componentType || !condition || !currentStatus) {
    res.status(400).json({ error: "componentId, componentType, condition, currentStatus are required" });
    return;
  }

  const existing = await db
    .select()
    .from(valveComponents)
    .where(and(eq(valveComponents.componentId, componentId), eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType)));
  if (existing.length > 0) {
    res.status(400).json({ error: `Component ID '${componentId}' already exists for this vessel and valve type.` });
    return;
  }

  if (parentComponentId != null) {
    const [parent] = await db.select().from(valveComponents).where(and(eq(valveComponents.id, parentComponentId), eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType)));
    if (!parent) {
      res.status(400).json({ error: "parentComponentId does not refer to a component of this vessel/valve type." });
      return;
    }
    if (parent.parentComponentId != null) {
      res.status(400).json({ error: "Cannot attach to a component that is itself a child (only one level of nesting is supported)." });
      return;
    }
  }

  const { overhaulRh: compOverhaulRh, warningRh: compWarningRh } = req.body;
  const [comp] = await db
    .insert(valveComponents)
    .values({
      componentId,
      vesselId,
      valveType,
      componentType,
      condition,
      currentStatus,
      currentLocation: currentLocation ?? currentStatus,
      totalAccumulatedRh: totalAccumulatedRh ?? 0,
      fittedAtMeRh: fittedAtMeRh ?? null,
      overhaulRh: compOverhaulRh ?? null,
      warningRh: compWarningRh ?? null,
      parentComponentId: parentComponentId ?? null,
      lastOverhaulDate: lastOverhaulDate ?? null,
      remarks: remarks ?? null,
    })
    .returning();

  const [currentMeRh, cfg, byId] = await Promise.all([getLatestMeRh(vesselId), getValveAlertCfg(vesselId, valveType), getVesselValveComponentsById(vesselId, valveType)]);
  res.status(201).json(toDto(comp, currentMeRh, cfg.overhaulRh, cfg.warningRh, cfg.typeThreshMap, byId));
});

// ─── Get ───────────────────────────────────────────────────────────────────
router.get("/vessels/:vesselId/valves/:valveType/components/:componentId", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  const { valveType, componentId } = req.params;
  if (isNaN(vesselId) || !["fuel", "exhaust"].includes(valveType)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const [comp] = await db
    .select()
    .from(valveComponents)
    .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType), eq(valveComponents.componentId, componentId)));
  if (!comp) { res.status(404).json({ error: "Not found" }); return; }
  const [currentMeRh, cfg, byId] = await Promise.all([getLatestMeRh(vesselId), getValveAlertCfg(vesselId, valveType), getVesselValveComponentsById(vesselId, valveType)]);
  res.json(toDto(comp, currentMeRh, cfg.overhaulRh, cfg.warningRh, cfg.typeThreshMap, byId));
});

// ─── Update ────────────────────────────────────────────────────────────────
router.patch("/vessels/:vesselId/valves/:valveType/components/:componentId", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  const { valveType, componentId } = req.params;
  if (isNaN(vesselId) || !["fuel", "exhaust"].includes(valveType)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const updates: Record<string, unknown> = {};
  const b = req.body;
  if (b.componentType != null) updates.componentType = b.componentType;
  if (b.condition != null) updates.condition = b.condition;
  if (b.currentStatus != null) updates.currentStatus = b.currentStatus;
  if (b.currentLocation != null) updates.currentLocation = b.currentLocation;
  if (b.totalAccumulatedRh != null) updates.totalAccumulatedRh = b.totalAccumulatedRh;
  if ("fittedAtMeRh" in b) updates.fittedAtMeRh = b.fittedAtMeRh;
  if ("overhaulRh" in b) updates.overhaulRh = b.overhaulRh;
  if ("warningRh" in b) updates.warningRh = b.warningRh;
  if ("lastOverhaulDate" in b) updates.lastOverhaulDate = b.lastOverhaulDate;
  if ("remarks" in b) updates.remarks = b.remarks;

  if ("parentComponentId" in b) {
    const parentComponentId = b.parentComponentId;
    if (parentComponentId != null) {
      const [self] = await db.select().from(valveComponents).where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType), eq(valveComponents.componentId, componentId)));
      if (self && parentComponentId === self.id) {
        res.status(400).json({ error: "A component cannot be its own parent." });
        return;
      }
      const [parent] = await db.select().from(valveComponents).where(and(eq(valveComponents.id, parentComponentId), eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType)));
      if (!parent) {
        res.status(400).json({ error: "parentComponentId does not refer to a component of this vessel/valve type." });
        return;
      }
      if (parent.parentComponentId != null) {
        res.status(400).json({ error: "Cannot attach to a component that is itself a child (only one level of nesting is supported)." });
        return;
      }
    }
    updates.parentComponentId = parentComponentId;
  }

  const [comp] = await db
    .update(valveComponents)
    .set(updates)
    .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType), eq(valveComponents.componentId, componentId)))
    .returning();
  if (!comp) { res.status(404).json({ error: "Not found" }); return; }

  const [currentMeRh, cfg, byId] = await Promise.all([getLatestMeRh(vesselId), getValveAlertCfg(vesselId, valveType), getVesselValveComponentsById(vesselId, valveType)]);
  res.json(toDto(comp, currentMeRh, cfg.overhaulRh, cfg.warningRh, cfg.typeThreshMap, byId));
});

// ─── Delete ────────────────────────────────────────────────────────────────
router.delete("/vessels/:vesselId/valves/:valveType/components/:componentId", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  const { valveType, componentId } = req.params;
  if (isNaN(vesselId) || !["fuel", "exhaust"].includes(valveType)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  await db
    .delete(valveComponents)
    .where(and(eq(valveComponents.vesselId, vesselId), eq(valveComponents.valveType, valveType), eq(valveComponents.componentId, componentId)));
  res.sendStatus(204);
});

export { getLatestMeRh, getValveAlertCfg, toDto as valveComponentToDto };
export default router;
