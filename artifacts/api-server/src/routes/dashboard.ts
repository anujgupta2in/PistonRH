import { Router } from "express";
import { and, eq, desc, asc } from "drizzle-orm";
import { db, components, componentTypeThresholds, cylinderSetup, monthlyRhLog, movementLog, vessels } from "@workspace/db";
import { GetDashboardParams, RecalculateComponentRhParams } from "@workspace/api-zod";
import {
  computeComponentLiveRh,
  getAlertStatus,
  getDismantlingAlert,
} from "../lib/calculations";

const router = Router();

// ─── Get dashboard ─────────────────────────────────────────────────────────
router.get("/vessels/:vesselId/dashboard", async (req, res): Promise<void> => {
  const params = GetDashboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const vid = params.data.vesselId;

  const [vessel] = await db.select().from(vessels).where(eq(vessels.id, vid));
  if (!vessel) {
    res.status(404).json({ error: "Vessel not found" });
    return;
  }

  const [latestRh] = await db
    .select()
    .from(monthlyRhLog)
    .where(eq(monthlyRhLog.vesselId, vid))
    .orderBy(desc(monthlyRhLog.logDate))
    .limit(1);
  const currentMeRh = latestRh?.meTotalRh ?? 0;

  const allComponents = await db
    .select()
    .from(components)
    .where(eq(components.vesselId, vid));

  const allCylinders = await db
    .select()
    .from(cylinderSetup)
    .where(eq(cylinderSetup.vesselId, vid))
    .orderBy(asc(cylinderSetup.cylinderNumber));

  const typeThreshRows = await db
    .select()
    .from(componentTypeThresholds)
    .where(eq(componentTypeThresholds.vesselId, vid));
  const typeThreshMap = new Map(typeThreshRows.map((t) => [t.componentType, { overhaulRh: t.overhaulRh, warningRh: t.warningRh }]));

  const cfg = {
    crownOverhaulRh: vessel.crownOverhaulRh,
    crownWarningRh: vessel.crownWarningRh,
    dismantlingWarningRh: vessel.dismantlingWarningRh,
  };

  function resolveThresh(comp: { overhaulRh: number | null; warningRh: number | null; componentType: string }) {
    const t = typeThreshMap.get(comp.componentType);
    return {
      overhaulRh: comp.overhaulRh ?? t?.overhaulRh ?? cfg.crownOverhaulRh,
      warningRh: comp.warningRh ?? t?.warningRh ?? cfg.crownWarningRh,
    };
  }

  // Build cylinder status — find ALL In-Service components by location (not just fittedComponentId)
  const cylinderStatus = allCylinders.map((cyl) => {
    const cylLabel = `Cyl ${cyl.cylinderNumber}`;
    const fittedComps = allComponents.filter(
      (c) => c.currentStatus === "In Service" && c.currentLocation === cylLabel
    );

    const rhSinceOverhaul = Math.max(0, currentMeRh - (cyl.lastOverhaulRh ?? 0));
    const rhSinceDismantling = Math.max(0, currentMeRh - (cyl.lastDismantlingRh ?? 0));
    const dismantlingAlert = getDismantlingAlert(rhSinceDismantling, cfg.dismantlingWarningRh);
    // The Unit's own overhaul-cycle status is about the cylinder itself (when it's
    // next due for overhaul), independent of any individual component's own wear —
    // this is what drives the "UNIT N" badge, consistently across every valve-type tab.
    const overallAlertStatus = getAlertStatus(rhSinceOverhaul, cfg.crownOverhaulRh, cfg.crownWarningRh);

    if (fittedComps.length === 0) {
      return {
        cylinder: cyl.cylinderNumber,
        components: [],
        rhSinceOverhaul: Math.round(rhSinceOverhaul),
        rhSinceDismantling: Math.round(rhSinceDismantling),
        overallAlertStatus,
        dismantlingAlert,
      };
    }

    const compStatuses = fittedComps.map((comp) => {
      const { overhaulRh: effectiveOverhaulRh, warningRh: effectiveWarningRh } = resolveThresh(comp);
      const totalRh = Math.round(
        computeComponentLiveRh(comp.totalAccumulatedRh, comp.currentStatus, comp.fittedAtMeRh, currentMeRh)
      );
      const alertStatus = getAlertStatus(totalRh, effectiveOverhaulRh, effectiveWarningRh);
      return {
        componentId: comp.componentId,
        componentType: comp.componentType,
        condition: comp.condition,
        totalRh,
        limit: effectiveOverhaulRh,
        alertStatus,
      };
    });

    return {
      cylinder: cyl.cylinderNumber,
      components: compStatuses,
      rhSinceOverhaul: Math.round(rhSinceOverhaul),
      rhSinceDismantling: Math.round(rhSinceDismantling),
      overallAlertStatus,
      dismantlingAlert,
    };
  });

  // Build alerts from all fitted components across all cylinders
  const alerts = [];
  for (const cs of cylinderStatus) {
    for (const comp of cs.components) {
      if (comp.alertStatus !== "OK") {
        alerts.push({
          cylinder: cs.cylinder,
          componentId: comp.componentId,
          type: `${comp.componentType} Overhaul`,
          status: comp.alertStatus,
          totalRh: comp.totalRh,
          limit: cfg.crownOverhaulRh,
        });
      }
    }
    if (cs.dismantlingAlert !== "OK") {
      const primaryComp = cs.components[0];
      alerts.push({
        cylinder: cs.cylinder,
        componentId: primaryComp?.componentId ?? `Cyl ${cs.cylinder}`,
        type: "Dismantling Routine",
        status: cs.dismantlingAlert,
        totalRh: cs.rhSinceDismantling,
        limit: cfg.dismantlingWarningRh,
      });
    }
  }

  const componentToDto = (c: typeof allComponents[0]) => {
    const { overhaulRh: effectiveOverhaulRh, warningRh: effectiveWarningRh } = resolveThresh(c);
    const liveRh = computeComponentLiveRh(c.totalAccumulatedRh, c.currentStatus, c.fittedAtMeRh, currentMeRh);
    return {
      componentId: c.componentId,
      vesselId: c.vesselId,
      componentType: c.componentType,
      condition: c.condition,
      currentStatus: c.currentStatus,
      currentLocation: c.currentLocation,
      totalAccumulatedRh: c.totalAccumulatedRh,
      fittedAtMeRh: c.fittedAtMeRh,
      remarks: c.remarks,
      liveRh: Math.round(liveRh),
      alertStatus: getAlertStatus(liveRh, effectiveOverhaulRh, effectiveWarningRh),
      createdAt: c.createdAt.toISOString(),
    };
  };

  const spareComponents = allComponents
    .filter((c) => c.currentStatus === "Onboard Spare")
    .map(componentToDto);

  const ashoreComponents = allComponents
    .filter((c) => ["Landed Ashore", "Under Reconditioning"].includes(c.currentStatus))
    .map(componentToDto);

  res.json({
    currentMeRh,
    cylinderStatus,
    spareComponents,
    ashoreComponents,
    alerts,
    alertConfig: cfg,
  });
});

// ─── Recalculate component RH ──────────────────────────────────────────────
router.post("/vessels/:vesselId/recalculate-rh", async (req, res): Promise<void> => {
  const params = RecalculateComponentRhParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const vid = params.data.vesselId;

  const allComponents = await db
    .select()
    .from(components)
    .where(eq(components.vesselId, vid));

  const allMovements = await db
    .select()
    .from(movementLog)
    .where(eq(movementLog.vesselId, vid))
    .orderBy(asc(movementLog.meRh));

  const details: { componentId: string; oldRh: number; newRh: number }[] = [];

  for (const comp of allComponents) {
    const compMovements = allMovements.filter(
      (m) => m.componentId === comp.componentId && m.action === "Remove"
    );
    const newRh = compMovements.reduce((sum, m) => sum + (m.rhAdded ?? 0), 0);

    if (Math.abs(newRh - comp.totalAccumulatedRh) > 0.5) {
      details.push({ componentId: comp.componentId, oldRh: comp.totalAccumulatedRh, newRh });
      await db
        .update(components)
        .set({ totalAccumulatedRh: newRh })
        .where(and(eq(components.vesselId, vid), eq(components.componentId, comp.componentId)));
    }
  }

  res.json({ count: details.length, details });
});

export default router;
