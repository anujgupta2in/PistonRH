import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, components, componentTypeThresholds, monthlyRhLog, vessels } from "@workspace/db";
import {
  ListComponentsParams,
  CreateComponentParams,
  CreateComponentBody,
  GetComponentParams,
  UpdateComponentParams,
  UpdateComponentBody,
  DeleteComponentParams,
} from "@workspace/api-zod";
import { computeComponentLiveRh, getAlertStatus } from "../lib/calculations";

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

async function getVesselAlertConfig(vesselId: number) {
  const [vessel, typeThreshRows] = await Promise.all([
    db.select().from(vessels).where(eq(vessels.id, vesselId)).limit(1).then((r) => r[0]),
    db.select().from(componentTypeThresholds).where(eq(componentTypeThresholds.vesselId, vesselId)),
  ]);
  const typeThreshMap = new Map(typeThreshRows.map((t) => [t.componentType, { overhaulRh: t.overhaulRh, warningRh: t.warningRh }]));
  return {
    crownOverhaulRh: vessel?.crownOverhaulRh ?? 24000,
    crownWarningRh: vessel?.crownWarningRh ?? 20000,
    typeThreshMap,
  };
}

// ─── List components ───────────────────────────────────────────────────────
router.get("/vessels/:vesselId/components", async (req, res): Promise<void> => {
  const params = ListComponentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [currentMeRh, cfg] = await Promise.all([
    getLatestMeRh(params.data.vesselId),
    getVesselAlertConfig(params.data.vesselId),
  ]);
  const rows = await db
    .select()
    .from(components)
    .where(eq(components.vesselId, params.data.vesselId));

  res.json(rows.map((c) => toDto(c, currentMeRh, cfg.crownOverhaulRh, cfg.crownWarningRh, cfg.typeThreshMap)));
});

// ─── Create component ──────────────────────────────────────────────────────
router.post("/vessels/:vesselId/components", async (req, res): Promise<void> => {
  const params = CreateComponentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateComponentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const vid = params.data.vesselId;
  const data = parsed.data;

  // Check for duplicate componentId
  const existing = await db
    .select()
    .from(components)
    .where(and(eq(components.componentId, data.componentId), eq(components.vesselId, vid)));
  if (existing.length > 0) {
    res.status(400).json({
      error: `Component ID '${data.componentId}' already exists for this vessel.`,
    });
    return;
  }

  const [comp] = await db
    .insert(components)
    .values({
      componentId: data.componentId,
      vesselId: vid,
      componentType: data.componentType,
      condition: data.condition,
      currentStatus: data.currentStatus,
      currentLocation: data.currentLocation ?? data.currentStatus,
      totalAccumulatedRh: data.totalAccumulatedRh ?? 0,
      fittedAtMeRh: data.fittedAtMeRh ?? null,
      overhaulRh: data.overhaulRh ?? null,
      warningRh: data.warningRh ?? null,
      remarks: data.remarks ?? null,
    })
    .returning();

  const [currentMeRh, cfg] = await Promise.all([
    getLatestMeRh(vid),
    getVesselAlertConfig(vid),
  ]);
  res.status(201).json(toDto(comp, currentMeRh, cfg.crownOverhaulRh, cfg.crownWarningRh, cfg.typeThreshMap));
});

// ─── Get single component ──────────────────────────────────────────────────
router.get("/vessels/:vesselId/components/:componentId", async (req, res): Promise<void> => {
  const params = GetComponentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [comp] = await db
    .select()
    .from(components)
    .where(
      and(
        eq(components.vesselId, params.data.vesselId),
        eq(components.componentId, params.data.componentId)
      )
    );
  if (!comp) {
    res.status(404).json({ error: "Component not found" });
    return;
  }
  const [currentMeRh, cfg] = await Promise.all([
    getLatestMeRh(params.data.vesselId),
    getVesselAlertConfig(params.data.vesselId),
  ]);
  res.json(toDto(comp, currentMeRh, cfg.crownOverhaulRh, cfg.crownWarningRh, cfg.typeThreshMap));
});

// ─── Update component ──────────────────────────────────────────────────────
router.patch("/vessels/:vesselId/components/:componentId", async (req, res): Promise<void> => {
  const params = UpdateComponentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateComponentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.componentType != null) updates.componentType = parsed.data.componentType;
  if (parsed.data.condition != null) updates.condition = parsed.data.condition;
  if (parsed.data.currentStatus != null) updates.currentStatus = parsed.data.currentStatus;
  if (parsed.data.currentLocation != null) updates.currentLocation = parsed.data.currentLocation;
  if (parsed.data.totalAccumulatedRh != null) updates.totalAccumulatedRh = parsed.data.totalAccumulatedRh;
  if ("fittedAtMeRh" in parsed.data) updates.fittedAtMeRh = parsed.data.fittedAtMeRh;
  if ("overhaulRh" in parsed.data) updates.overhaulRh = parsed.data.overhaulRh;
  if ("warningRh" in parsed.data) updates.warningRh = parsed.data.warningRh;
  if ("remarks" in parsed.data) updates.remarks = parsed.data.remarks;

  const [comp] = await db
    .update(components)
    .set(updates)
    .where(
      and(
        eq(components.vesselId, params.data.vesselId),
        eq(components.componentId, params.data.componentId)
      )
    )
    .returning();

  if (!comp) {
    res.status(404).json({ error: "Component not found" });
    return;
  }

  const [currentMeRh, cfg] = await Promise.all([
    getLatestMeRh(params.data.vesselId),
    getVesselAlertConfig(params.data.vesselId),
  ]);
  res.json(toDto(comp, currentMeRh, cfg.crownOverhaulRh, cfg.crownWarningRh, cfg.typeThreshMap));
});

// ─── Delete component ──────────────────────────────────────────────────────
router.delete("/vessels/:vesselId/components/:componentId", async (req, res): Promise<void> => {
  const params = DeleteComponentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(components)
    .where(
      and(
        eq(components.vesselId, params.data.vesselId),
        eq(components.componentId, params.data.componentId)
      )
    );
  res.sendStatus(204);
});

export function toDto(
  c: typeof components.$inferSelect,
  currentMeRh: number,
  crownOverhaulRh: number,
  crownWarningRh: number,
  typeThreshMap: Map<string, { overhaulRh: number; warningRh: number }> = new Map()
) {
  const typeThresh = typeThreshMap.get(c.componentType);
  const effectiveOverhaulRh = c.overhaulRh ?? typeThresh?.overhaulRh ?? crownOverhaulRh;
  const effectiveWarningRh = c.warningRh ?? typeThresh?.warningRh ?? crownWarningRh;
  const liveRh = computeComponentLiveRh(
    c.totalAccumulatedRh,
    c.currentStatus,
    c.fittedAtMeRh,
    currentMeRh
  );
  return {
    componentId: c.componentId,
    vesselId: c.vesselId,
    componentType: c.componentType,
    condition: c.condition,
    currentStatus: c.currentStatus,
    currentLocation: c.currentLocation,
    totalAccumulatedRh: c.totalAccumulatedRh,
    fittedAtMeRh: c.fittedAtMeRh,
    overhaulRh: c.overhaulRh,
    warningRh: c.warningRh,
    effectiveOverhaulRh,
    effectiveWarningRh,
    remarks: c.remarks,
    liveRh: Math.round(liveRh),
    alertStatus: getAlertStatus(liveRh, effectiveOverhaulRh, effectiveWarningRh),
    createdAt: c.createdAt.toISOString(),
  };
}

export { getLatestMeRh };
export default router;
