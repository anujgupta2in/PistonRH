import { Router } from "express";
import { and, eq, asc } from "drizzle-orm";
import { db, cylinderSetup } from "@workspace/db";
import {
  ListCylindersParams,
  UpdateCylinderParams,
  UpdateCylinderBody,
} from "@workspace/api-zod";

const router = Router();

// ─── List cylinders ────────────────────────────────────────────────────────
router.get("/vessels/:vesselId/cylinders", async (req, res): Promise<void> => {
  const params = ListCylindersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(cylinderSetup)
    .where(eq(cylinderSetup.vesselId, params.data.vesselId))
    .orderBy(asc(cylinderSetup.cylinderNumber));
  res.json(rows.map(toDto));
});

// ─── Update cylinder ───────────────────────────────────────────────────────
router.patch("/vessels/:vesselId/cylinders/:cylinderNumber", async (req, res): Promise<void> => {
  const params = UpdateCylinderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCylinderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if ("fittedComponentId" in parsed.data) updates.fittedComponentId = parsed.data.fittedComponentId;
  if ("fittedAtMeRh" in parsed.data) updates.fittedAtMeRh = parsed.data.fittedAtMeRh;
  if ("lastOverhaulRh" in parsed.data) updates.lastOverhaulRh = parsed.data.lastOverhaulRh;
  if ("lastDismantlingRh" in parsed.data) updates.lastDismantlingRh = parsed.data.lastDismantlingRh;

  const [cyl] = await db
    .update(cylinderSetup)
    .set(updates)
    .where(
      and(
        eq(cylinderSetup.vesselId, params.data.vesselId),
        eq(cylinderSetup.cylinderNumber, params.data.cylinderNumber)
      )
    )
    .returning();

  if (!cyl) {
    res.status(404).json({ error: "Cylinder not found" });
    return;
  }

  res.json(toDto(cyl));
});

function toDto(c: typeof cylinderSetup.$inferSelect) {
  return {
    id: c.id,
    vesselId: c.vesselId,
    cylinderNumber: c.cylinderNumber,
    fittedComponentId: c.fittedComponentId,
    fittedAtMeRh: c.fittedAtMeRh,
    lastOverhaulRh: c.lastOverhaulRh,
    lastDismantlingRh: c.lastDismantlingRh,
    updatedAt: c.updatedAt.toISOString(),
  };
}

export default router;
