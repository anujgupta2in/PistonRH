import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, componentTypeThresholds } from "@workspace/db";

const router = Router();

// ─── List ──────────────────────────────────────────────────────────────────
router.get("/vessels/:vesselId/component-type-thresholds", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  if (isNaN(vesselId)) { res.status(400).json({ error: "Invalid vesselId" }); return; }
  const rows = await db
    .select()
    .from(componentTypeThresholds)
    .where(eq(componentTypeThresholds.vesselId, vesselId));
  res.json(rows);
});

// ─── Create ────────────────────────────────────────────────────────────────
router.post("/vessels/:vesselId/component-type-thresholds", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  if (isNaN(vesselId)) { res.status(400).json({ error: "Invalid vesselId" }); return; }
  const { category, componentType, overhaulRh, warningRh } = req.body;
  if (!category || !componentType || overhaulRh == null || warningRh == null) {
    res.status(400).json({ error: "category, componentType, overhaulRh, warningRh are required" });
    return;
  }
  const [row] = await db
    .insert(componentTypeThresholds)
    .values({ vesselId, category, componentType, overhaulRh, warningRh })
    .onConflictDoUpdate({
      target: [componentTypeThresholds.vesselId, componentTypeThresholds.componentType],
      set: { overhaulRh, warningRh, category },
    })
    .returning();
  res.status(201).json(row);
});

// ─── Update ────────────────────────────────────────────────────────────────
router.patch("/vessels/:vesselId/component-type-thresholds/:id", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  const id = parseInt(req.params.id);
  if (isNaN(vesselId) || isNaN(id)) { res.status(400).json({ error: "Invalid params" }); return; }
  const { overhaulRh, warningRh } = req.body;
  const updates: Record<string, unknown> = {};
  if (overhaulRh != null) updates.overhaulRh = overhaulRh;
  if (warningRh != null) updates.warningRh = warningRh;
  const [row] = await db
    .update(componentTypeThresholds)
    .set(updates)
    .where(and(eq(componentTypeThresholds.id, id), eq(componentTypeThresholds.vesselId, vesselId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ─── Delete ────────────────────────────────────────────────────────────────
router.delete("/vessels/:vesselId/component-type-thresholds/:id", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  const id = parseInt(req.params.id);
  if (isNaN(vesselId) || isNaN(id)) { res.status(400).json({ error: "Invalid params" }); return; }
  await db
    .delete(componentTypeThresholds)
    .where(and(eq(componentTypeThresholds.id, id), eq(componentTypeThresholds.vesselId, vesselId)));
  res.sendStatus(204);
});

export default router;
