import { Router } from "express";
import { eq, desc, asc } from "drizzle-orm";
import { db, valveComponents, valveCylinderSlots, componentTypeThresholds, monthlyRhLog, vessels, cylinderSetup } from "@workspace/db";
import { computeComponentLiveRh, getAlertStatus, resolveValveComponentState } from "../lib/calculations";

const router = Router();

router.get("/vessels/:vesselId/valves/:valveType/dashboard", async (req, res): Promise<void> => {
  const vesselId = parseInt(req.params.vesselId);
  const { valveType } = req.params;
  if (isNaN(vesselId) || !["fuel", "exhaust"].includes(valveType)) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const [vessel] = await db.select().from(vessels).where(eq(vessels.id, vesselId));
  if (!vessel) { res.status(404).json({ error: "Vessel not found" }); return; }

  const [latestRh] = await db
    .select()
    .from(monthlyRhLog)
    .where(eq(monthlyRhLog.vesselId, vesselId))
    .orderBy(desc(monthlyRhLog.logDate))
    .limit(1);
  const currentMeRh = latestRh?.meTotalRh ?? 0;

  const vesselOverhaulRh = valveType === "fuel" ? vessel.fuelValveOverhaulRh : vessel.exhaustValveOverhaulRh;
  const vesselWarningRh  = valveType === "fuel" ? vessel.fuelValveWarningRh  : vessel.exhaustValveWarningRh;
  const slotsPerCyl = valveType === "fuel" ? vessel.fuelValveSlotsPerCyl : 1;

  const [allComps, allSlots, typeThreshRows, allCylinders] = await Promise.all([
    db.select().from(valveComponents).where(eq(valveComponents.vesselId, vesselId)),
    db.select().from(valveCylinderSlots).where(eq(valveCylinderSlots.vesselId, vesselId))
      .orderBy(asc(valveCylinderSlots.cylinderNumber), asc(valveCylinderSlots.slotNumber)),
    db.select().from(componentTypeThresholds).where(eq(componentTypeThresholds.vesselId, vesselId)),
    db.select().from(cylinderSetup).where(eq(cylinderSetup.vesselId, vesselId)),
  ]);
  const lastOverhaulByCyl = new Map(allCylinders.map((c) => [c.cylinderNumber, c.lastOverhaulRh ?? 0]));

  const typeThreshMap = new Map(typeThreshRows.map((t) => [t.componentType, { overhaulRh: t.overhaulRh, warningRh: t.warningRh }]));

  function resolveThresh(comp: { overhaulRh: number | null; warningRh: number | null; componentType: string }) {
    const t = typeThreshMap.get(comp.componentType);
    return {
      overhaulRh: comp.overhaulRh ?? t?.overhaulRh ?? vesselOverhaulRh,
      warningRh: comp.warningRh ?? t?.warningRh ?? vesselWarningRh,
    };
  }

  // Build cylinder status using valve slots for the requested valve type
  const cylNums = Array.from({ length: vessel.numCylinders }, (_, i) => i + 1);
  const thisTypeSlots = allSlots.filter((s) => s.valveType === valveType);
  const thisTypeComps = allComps.filter((c) => c.valveType === valveType);
  const byId = new Map(thisTypeComps.map((c) => [c.id, c]));

  // Children (nozzles, springs, etc.) have no slot of their own — they inherit
  // location/status/RH clock from their parent and are nested under it here.
  // lastOverhaulRh is the MAIN ENGINE RH at the component's last overhaul —
  // hours since overhaul = current ME RH minus that baseline (falls back to
  // the component's lifetime hours when no overhaul has been recorded).
  function sinceOverhaul(liveRh: number, lastOverhaulRh: number | null) {
    return Math.round(lastOverhaulRh != null ? Math.max(0, currentMeRh - lastOverhaulRh) : liveRh);
  }

  function childDto(child: typeof allComps[0]) {
    const { overhaulRh: effectiveOverhaulRh, warningRh: effectiveWarningRh } = resolveThresh(child);
    const state = resolveValveComponentState(child, byId);
    const liveRh = Math.round(computeComponentLiveRh(state.totalAccumulatedRh, state.currentStatus, state.fittedAtMeRh, currentMeRh));
    const sinceOh = sinceOverhaul(liveRh, child.lastOverhaulRh);
    return {
      componentId: child.componentId,
      componentType: child.componentType,
      condition: child.condition,
      totalRh: sinceOh,
      limit: effectiveOverhaulRh,
      alertStatus: getAlertStatus(sinceOh, effectiveOverhaulRh, effectiveWarningRh),
      lastOverhaulDate: child.lastOverhaulDate,
      lastOverhaulRh: child.lastOverhaulRh,
    };
  }
  function childrenOf(parentId: number) {
    return thisTypeComps.filter((c) => c.parentComponentId === parentId).map(childDto);
  }

  const compDtoFull = (c: typeof allComps[0]) => {
    const { overhaulRh, warningRh } = resolveThresh(c);
    const state = resolveValveComponentState(c, byId);
    const liveRh = computeComponentLiveRh(state.totalAccumulatedRh, state.currentStatus, state.fittedAtMeRh, currentMeRh);
    const sinceOh = sinceOverhaul(liveRh, c.lastOverhaulRh);
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
      parentComponentId: c.parentComponentId,
      remarks: c.remarks,
      liveRh: Math.round(liveRh),
      alertStatus: getAlertStatus(sinceOh, overhaulRh, warningRh),
      children: c.parentComponentId == null ? childrenOf(c.id) : [],
      createdAt: c.createdAt.toISOString(),
    };
  };

  const cylinderStatus = cylNums.map((cylNum) => {
    const cylSlots = thisTypeSlots.filter((s) => s.cylinderNumber === cylNum);

    // Build slot entries — include empty slots up to slotsPerCyl
    const slots = Array.from({ length: slotsPerCyl }, (_, i) => {
      const slotNum = i + 1;
      const slot = cylSlots.find((s) => s.slotNumber === slotNum);
      const fittedId = slot?.fittedComponentId;
      if (!fittedId) return null;

      const comp = thisTypeComps.find((c) => c.componentId === fittedId && c.parentComponentId == null);
      if (!comp) return null;

      const { overhaulRh: effectiveOverhaulRh, warningRh: effectiveWarningRh } = resolveThresh(comp);
      const liveRh = Math.round(computeComponentLiveRh(comp.totalAccumulatedRh, comp.currentStatus, comp.fittedAtMeRh, currentMeRh));
      const sinceOh = sinceOverhaul(liveRh, comp.lastOverhaulRh);
      return {
        slotNumber: slotNum,
        componentId: comp.componentId,
        componentType: comp.componentType,
        condition: comp.condition,
        totalRh: sinceOh,
        limit: effectiveOverhaulRh,
        alertStatus: getAlertStatus(sinceOh, effectiveOverhaulRh, effectiveWarningRh),
        lastOverhaulDate: comp.lastOverhaulDate,
        lastOverhaulRh: comp.lastOverhaulRh,
        children: childrenOf(comp.id),
      };
    }).filter((s): s is NonNullable<typeof s> => s !== null);

    // Also pick up any "In Service" components whose location matches this cylinder but aren't in slots table
    const inServiceLocs = thisTypeComps.filter(
      (c) => c.parentComponentId == null && c.currentStatus === "In Service" && /^Cyl\s*\d+/i.test(c.currentLocation)
    );
    for (const comp of inServiceLocs) {
      const match = comp.currentLocation.match(/^Cyl\s*(\d+)/i);
      if (!match || parseInt(match[1]) !== cylNum) continue;
      if (slots.some((s) => s.componentId === comp.componentId)) continue;
      const { overhaulRh: effectiveOverhaulRh, warningRh: effectiveWarningRh } = resolveThresh(comp);
      const liveRh = Math.round(computeComponentLiveRh(comp.totalAccumulatedRh, comp.currentStatus, comp.fittedAtMeRh, currentMeRh));
      const sinceOh = sinceOverhaul(liveRh, comp.lastOverhaulRh);
      slots.push({
        slotNumber: slots.length + 1,
        componentId: comp.componentId,
        componentType: comp.componentType,
        condition: comp.condition,
        totalRh: sinceOh,
        limit: effectiveOverhaulRh,
        alertStatus: getAlertStatus(sinceOh, effectiveOverhaulRh, effectiveWarningRh),
        lastOverhaulDate: comp.lastOverhaulDate,
        lastOverhaulRh: comp.lastOverhaulRh,
        children: childrenOf(comp.id),
      });
    }

    // The Unit's own status is about the cylinder's overhaul cycle (same crown-based
    // clock as the piston dashboard) — not the fuel/exhaust valve's own wear, which
    // is a separate concern already shown on each slot/child individually.
    const rhSinceOverhaul = Math.max(0, currentMeRh - (lastOverhaulByCyl.get(cylNum) ?? 0));
    const overallAlertStatus = getAlertStatus(rhSinceOverhaul, vessel.crownOverhaulRh, vessel.crownWarningRh);
    return {
      cylinder: cylNum,
      slots,
      overallAlertStatus,
      rhSinceOverhaul: Math.round(rhSinceOverhaul),
    };
  });

  const alerts = [];
  for (const cs of cylinderStatus) {
    for (const slot of cs.slots) {
      if (slot.alertStatus !== "OK") {
        alerts.push({
          cylinder: cs.cylinder,
          componentId: slot.componentId,
          type: `${valveType === "fuel" ? "Fuel" : "Exhaust"} Valve Overhaul`,
          status: slot.alertStatus,
          totalRh: slot.totalRh,
          limit: slot.limit,
          isChild: false,
        });
      }
      for (const child of slot.children) {
        if (child.alertStatus !== "OK") {
          alerts.push({
            cylinder: cs.cylinder,
            componentId: child.componentId,
            type: `${child.componentType} Overhaul`,
            isChild: true,
            status: child.alertStatus,
            totalRh: child.totalRh,
            limit: child.limit,
          });
        }
      }
    }
  }

  const spareComponents = thisTypeComps
    .filter((c) => c.parentComponentId == null && c.currentStatus === "Onboard Spare")
    .map(compDtoFull);

  const ashoreComponents = thisTypeComps
    .filter((c) => c.parentComponentId == null && ["Landed Ashore", "Under Reconditioning"].includes(c.currentStatus))
    .map(compDtoFull);

  res.json({
    currentMeRh,
    valveType,
    cylinderStatus,
    spareComponents,
    ashoreComponents,
    alerts,
    alertConfig: { overhaulRh: vesselOverhaulRh, warningRh: vesselWarningRh },
    crownOverhaulRh: vessel.crownOverhaulRh,
    crownWarningRh: vessel.crownWarningRh,
  });
});

export default router;
