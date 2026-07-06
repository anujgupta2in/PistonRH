import { Router, type IRouter } from "express";
import { and, eq, inArray, asc } from "drizzle-orm";
import { db, vessels, userVesselAccess, cylinderSetup, components, monthlyRhLog, movementLog } from "@workspace/db";
import {
  CreateVesselBody,
  UpdateVesselBody,
  UpdateVesselParams,
  GetVesselParams,
  DeleteVesselParams,
  ResetVesselDataParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/requireRole";
import { authorizeVesselAccess } from "../middlewares/authorizeVesselAccess";

const router: IRouter = Router();

// ─── List vessels (scoped to caller's access) ──────────────────────────────
router.get("/vessels", async (req, res): Promise<void> => {
  if (req.user!.role === "technical_office") {
    const rows = await db.select().from(vessels).orderBy(asc(vessels.vesselName));
    res.json(rows.map(toVesselDto));
    return;
  }

  const access = await db
    .select({ vesselId: userVesselAccess.vesselId })
    .from(userVesselAccess)
    .where(eq(userVesselAccess.userId, req.user!.userId));
  const vesselIds = access.map((a) => a.vesselId);
  if (vesselIds.length === 0) {
    res.json([]);
    return;
  }
  const rows = await db
    .select()
    .from(vessels)
    .where(inArray(vessels.id, vesselIds))
    .orderBy(asc(vessels.vesselName));
  res.json(rows.map(toVesselDto));
});

// ─── Load demo vessel ──────────────────────────────────────────────────────
router.post("/vessels/demo", requireRole("technical_office"), async (_req, res): Promise<void> => {
  const [existing] = await db
    .select()
    .from(vessels)
    .where(eq(vessels.vesselName, "MT. BOCHEM MARENGO"));
  if (existing) {
    res.status(201).json(toVesselDto(existing));
    return;
  }

  const [vessel] = await db
    .insert(vessels)
    .values({
      vesselName: "MT. BOCHEM MARENGO",
      imoNumber: "9876543",
      vesselType: "Chemical Tanker",
      engineMake: "MAN B&W",
      engineModel: "6S50MC-C",
      numCylinders: 6,
      crownOverhaulRh: 24000,
      crownWarningRh: 20000,
      dismantlingWarningRh: 16000,
    })
    .returning();

  // Create cylinders 1-6
  for (let i = 1; i <= 6; i++) {
    await db.insert(cylinderSetup).values({ vesselId: vessel.id, cylinderNumber: i });
  }

  // Seed initial ME RH entry
  await db.insert(monthlyRhLog).values({
    vesselId: vessel.id,
    logDate: "2024-01-31",
    meTotalRh: 43836,
    monthlyRh: 43836,
    remarks: "Initial seed entry",
  });

  // Seed components (from original BMG data)
  // totalAccumulatedRh = RH accumulated in PREVIOUS fittings only (0 if never removed before).
  // liveRh is computed as totalAccumulatedRh + max(0, currentMeRh - fittedAtMeRh).
  // Verified: at currentMeRh=43836 these produce the correct totals:
  //   6033-1: 0 + (43836-0) = 43836  ✓
  //   6033-2: 0 + (43836-0) = 43836  ✓
  //   6033-3: 0 + (43836-40144) = 3692  ✓
  //   6033-4: 0 + (43836-0) = 43836  ✓
  //   6033-5: 40223 (spare, not computing live RH)  ✓
  //   6033-6: 0 + (43836-2856) = 40980  ✓
  //   6033-7: 0 + (43836-33540) = 10296  ✓
  const seedComponents = [
    { componentId: "6033-1", componentType: "Piston Crown", condition: "Original", currentStatus: "In Service", currentLocation: "Cyl 1", totalAccumulatedRh: 0, fittedAtMeRh: 0 },
    { componentId: "6033-2", componentType: "Piston Crown", condition: "Original", currentStatus: "In Service", currentLocation: "Cyl 2", totalAccumulatedRh: 0, fittedAtMeRh: 0 },
    { componentId: "6033-3", componentType: "Piston Crown", condition: "New", currentStatus: "In Service", currentLocation: "Cyl 6", totalAccumulatedRh: 0, fittedAtMeRh: 40144 },
    { componentId: "6033-4", componentType: "Piston Crown", condition: "Original", currentStatus: "In Service", currentLocation: "Cyl 4", totalAccumulatedRh: 0, fittedAtMeRh: 0 },
    { componentId: "6033-5", componentType: "Piston Crown", condition: "Original", currentStatus: "Onboard Spare", currentLocation: "Onboard Spare", totalAccumulatedRh: 40223, fittedAtMeRh: null },
    { componentId: "6033-6", componentType: "Piston Crown", condition: "Original", currentStatus: "In Service", currentLocation: "Cyl 5", totalAccumulatedRh: 0, fittedAtMeRh: 2856 },
    { componentId: "6033-7", componentType: "Piston Crown", condition: "Reconditioned", currentStatus: "In Service", currentLocation: "Cyl 3", totalAccumulatedRh: 0, fittedAtMeRh: 33540 },
  ];

  for (const c of seedComponents) {
    await db.insert(components).values({ vesselId: vessel.id, ...c });
  }

  // Update cylinder assignments
  const cylAssignments: Record<string, string> = {
    "Cyl 1": "6033-1",
    "Cyl 2": "6033-2",
    "Cyl 3": "6033-7",
    "Cyl 4": "6033-4",
    "Cyl 5": "6033-6",
    "Cyl 6": "6033-3",
  };

  for (const [loc, compId] of Object.entries(cylAssignments)) {
    const cylNum = parseInt(loc.replace("Cyl ", ""));
    const comp = seedComponents.find((c) => c.componentId === compId);
    await db
      .update(cylinderSetup)
      .set({
        fittedComponentId: compId,
        fittedAtMeRh: comp?.fittedAtMeRh ?? 0,
        lastOverhaulRh: 0,
        lastDismantlingRh: 0,
      })
      .where(and(eq(cylinderSetup.vesselId, vessel.id), eq(cylinderSetup.cylinderNumber, cylNum)));
  }

  res.status(201).json(toVesselDto(vessel));
});

// ─── Create vessel ─────────────────────────────────────────────────────────
router.post("/vessels", requireRole("technical_office"), async (req, res): Promise<void> => {
  const parsed = CreateVesselBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const [vessel] = await db
    .insert(vessels)
    .values({
      vesselName: data.vesselName,
      imoNumber: data.imoNumber ?? "",
      vesselType: data.vesselType ?? "",
      engineMake: data.engineMake ?? "",
      engineModel: data.engineModel ?? "",
      numCylinders: data.numCylinders,
      crownOverhaulRh: data.crownOverhaulRh ?? 24000,
      crownWarningRh: data.crownWarningRh ?? 20000,
      dismantlingWarningRh: data.dismantlingWarningRh ?? 16000,
    })
    .returning();

  // Create cylinders for the new vessel
  for (let i = 1; i <= vessel.numCylinders; i++) {
    await db.insert(cylinderSetup).values({ vesselId: vessel.id, cylinderNumber: i });
  }

  res.status(201).json(toVesselDto(vessel));
});

// ─── Get vessel ────────────────────────────────────────────────────────────
router.get("/vessels/:vesselId", authorizeVesselAccess, async (req, res): Promise<void> => {
  const params = GetVesselParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [vessel] = await db.select().from(vessels).where(eq(vessels.id, params.data.vesselId));
  if (!vessel) {
    res.status(404).json({ error: "Vessel not found" });
    return;
  }
  res.json(toVesselDto(vessel));
});

// ─── Update vessel ─────────────────────────────────────────────────────────
router.patch("/vessels/:vesselId", authorizeVesselAccess, async (req, res): Promise<void> => {
  const params = UpdateVesselParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateVesselBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.vesselName != null) updates.vesselName = parsed.data.vesselName;
  if (parsed.data.imoNumber != null) updates.imoNumber = parsed.data.imoNumber;
  if (parsed.data.vesselType != null) updates.vesselType = parsed.data.vesselType;
  if (parsed.data.engineMake != null) updates.engineMake = parsed.data.engineMake;
  if (parsed.data.engineModel != null) updates.engineModel = parsed.data.engineModel;
  if (parsed.data.numCylinders != null) updates.numCylinders = parsed.data.numCylinders;
  if (parsed.data.crownOverhaulRh != null) updates.crownOverhaulRh = parsed.data.crownOverhaulRh;
  if (parsed.data.crownWarningRh != null) updates.crownWarningRh = parsed.data.crownWarningRh;
  if (parsed.data.dismantlingWarningRh != null) updates.dismantlingWarningRh = parsed.data.dismantlingWarningRh;
  updates.updatedAt = new Date();

  const [vessel] = await db
    .update(vessels)
    .set(updates)
    .where(eq(vessels.id, params.data.vesselId))
    .returning();

  if (!vessel) {
    res.status(404).json({ error: "Vessel not found" });
    return;
  }

  // Ensure cylinders exist if numCylinders changed
  if (parsed.data.numCylinders != null) {
    for (let i = 1; i <= parsed.data.numCylinders; i++) {
      await db
        .insert(cylinderSetup)
        .values({ vesselId: vessel.id, cylinderNumber: i })
        .onConflictDoNothing();
    }
  }

  res.json(toVesselDto(vessel));
});

// ─── Delete vessel ─────────────────────────────────────────────────────────
router.delete("/vessels/:vesselId", requireRole("technical_office"), async (req, res): Promise<void> => {
  const params = DeleteVesselParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(vessels).where(eq(vessels.id, params.data.vesselId));
  res.sendStatus(204);
});

// ─── Reset vessel data ─────────────────────────────────────────────────────
router.post("/vessels/:vesselId/reset", authorizeVesselAccess, async (req, res): Promise<void> => {
  const params = ResetVesselDataParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const vid = params.data.vesselId;
  await db.delete(movementLog).where(eq(movementLog.vesselId, vid));
  await db.delete(components).where(eq(components.vesselId, vid));
  await db.delete(monthlyRhLog).where(eq(monthlyRhLog.vesselId, vid));
  await db
    .update(cylinderSetup)
    .set({ fittedComponentId: null, fittedAtMeRh: null, lastOverhaulRh: 0, lastDismantlingRh: 0 })
    .where(eq(cylinderSetup.vesselId, vid));
  res.json({ message: "All operational data cleared. Vessel record retained." });
});

function toVesselDto(v: typeof vessels.$inferSelect) {
  return {
    id: v.id,
    vesselName: v.vesselName,
    imoNumber: v.imoNumber,
    vesselType: v.vesselType,
    engineMake: v.engineMake,
    engineModel: v.engineModel,
    numCylinders: v.numCylinders,
    crownOverhaulRh: v.crownOverhaulRh,
    crownWarningRh: v.crownWarningRh,
    dismantlingWarningRh: v.dismantlingWarningRh,
    fuelValveOverhaulRh: v.fuelValveOverhaulRh,
    fuelValveWarningRh: v.fuelValveWarningRh,
    fuelValveSlotsPerCyl: v.fuelValveSlotsPerCyl,
    exhaustValveOverhaulRh: v.exhaustValveOverhaulRh,
    exhaustValveWarningRh: v.exhaustValveWarningRh,
    createdAt: v.createdAt.toISOString(),
  };
}

export default router;
