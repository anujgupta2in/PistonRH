import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, movementLog, components, cylinderSetup, monthlyRhLog } from "@workspace/db";
import {
  ListMovementsParams,
  RecordMovementParams,
  RecordMovementBody,
  DeleteMovementParams,
} from "@workspace/api-zod";
import { computeComponentLiveRh } from "../lib/calculations";

const router = Router();

const VALID_ACTIONS = ["Fit", "Remove", "Rotate", "Land Ashore", "Receive Onboard", "Scrap"];

// ─── List movements ────────────────────────────────────────────────────────
router.get("/vessels/:vesselId/movements", async (req, res): Promise<void> => {
  const params = ListMovementsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(movementLog)
    .where(eq(movementLog.vesselId, params.data.vesselId))
    .orderBy(desc(movementLog.createdAt))
    .limit(200);
  res.json(rows.map(toDto));
});

// ─── Record movement ───────────────────────────────────────────────────────
router.post("/vessels/:vesselId/movements", async (req, res): Promise<void> => {
  const params = RecordMovementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RecordMovementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const vid = params.data.vesselId;
  const { movementDate, meRh, componentId, fromLocation, toLocation, action, remarks } = parsed.data;

  if (!VALID_ACTIONS.includes(action)) {
    res.status(400).json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` });
    return;
  }

  // Fetch component
  const [comp] = await db
    .select()
    .from(components)
    .where(and(eq(components.vesselId, vid), eq(components.componentId, componentId)));
  if (!comp) {
    res.status(400).json({ error: `Component '${componentId}' not found.` });
    return;
  }

  // Get current ME RH
  const [latestRh] = await db
    .select()
    .from(monthlyRhLog)
    .where(eq(monthlyRhLog.vesselId, vid))
    .orderBy(desc(monthlyRhLog.logDate))
    .limit(1);
  const currentMeRh = latestRh?.meTotalRh ?? 0;

  if (meRh < currentMeRh) {
    res.status(400).json({
      error: `Movement ME RH (${meRh}) cannot be less than latest monthly ME RH (${currentMeRh}).`,
    });
    return;
  }

  let rhAdded = 0;

  if (action === "Fit") {
    // Update component status to In Service
    await db
      .update(components)
      .set({ currentStatus: "In Service", currentLocation: toLocation, fittedAtMeRh: meRh })
      .where(and(eq(components.vesselId, vid), eq(components.componentId, componentId)));

    // Update cylinder
    const cylMatch = toLocation.match(/^Cyl\s*(\d+)$/i);
    if (cylMatch) {
      const cylNum = parseInt(cylMatch[1]);
      await db
        .update(cylinderSetup)
        .set({ fittedComponentId: componentId, fittedAtMeRh: meRh })
        .where(and(eq(cylinderSetup.vesselId, vid), eq(cylinderSetup.cylinderNumber, cylNum)));
    }
  } else if (action === "Remove") {
    // Calculate RH added
    if (comp.currentStatus === "In Service" && comp.fittedAtMeRh != null) {
      rhAdded = Math.max(0, meRh - comp.fittedAtMeRh);
    }

    const newTotal = comp.totalAccumulatedRh + rhAdded;
    const newStatus = toLocation.toLowerCase().includes("spare") ? "Onboard Spare" :
                      toLocation.toLowerCase().includes("ashore") ? "Landed Ashore" : "Onboard Spare";

    await db
      .update(components)
      .set({
        currentStatus: newStatus,
        currentLocation: toLocation,
        fittedAtMeRh: null,
        totalAccumulatedRh: newTotal,
      })
      .where(and(eq(components.vesselId, vid), eq(components.componentId, componentId)));

    // Clear cylinder
    const cylMatch = fromLocation.match(/^Cyl\s*(\d+)$/i);
    if (cylMatch) {
      const cylNum = parseInt(cylMatch[1]);
      await db
        .update(cylinderSetup)
        .set({ fittedComponentId: null, fittedAtMeRh: null })
        .where(and(eq(cylinderSetup.vesselId, vid), eq(cylinderSetup.cylinderNumber, cylNum)));
    }
  } else if (action === "Land Ashore") {
    rhAdded = 0;
    await db
      .update(components)
      .set({ currentStatus: "Landed Ashore", currentLocation: "Landed Ashore" })
      .where(and(eq(components.vesselId, vid), eq(components.componentId, componentId)));
  } else if (action === "Receive Onboard") {
    await db
      .update(components)
      .set({ currentStatus: "Onboard Spare", currentLocation: "Onboard Spare" })
      .where(and(eq(components.vesselId, vid), eq(components.componentId, componentId)));
  } else if (action === "Scrap") {
    await db
      .update(components)
      .set({ currentStatus: "Scrapped", currentLocation: "Scrapped" })
      .where(and(eq(components.vesselId, vid), eq(components.componentId, componentId)));
  } else if (action === "Rotate") {
    // Swap between cylinders - just update location
    await db
      .update(components)
      .set({ currentLocation: toLocation, fittedAtMeRh: meRh })
      .where(and(eq(components.vesselId, vid), eq(components.componentId, componentId)));
  }

  const [entry] = await db
    .insert(movementLog)
    .values({
      vesselId: vid,
      movementDate,
      meRh,
      componentId,
      fromLocation,
      toLocation,
      action,
      rhAdded,
      remarks: remarks ?? null,
    })
    .returning();

  res.status(201).json(toDto(entry));
});

// ─── Delete movement ───────────────────────────────────────────────────────
router.delete("/vessels/:vesselId/movements/:movementId", async (req, res): Promise<void> => {
  const params = DeleteMovementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(movementLog).where(eq(movementLog.id, params.data.movementId));
  res.sendStatus(204);
});

function toDto(r: typeof movementLog.$inferSelect) {
  return {
    id: r.id,
    vesselId: r.vesselId,
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

export default router;
