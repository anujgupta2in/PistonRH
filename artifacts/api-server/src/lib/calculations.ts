export function computeComponentLiveRh(
  totalAccumulatedRh: number,
  currentStatus: string,
  fittedAtMeRh: number | null | undefined,
  currentMeRh: number
): number {
  let base = totalAccumulatedRh ?? 0;
  if (currentStatus === "In Service" && fittedAtMeRh != null) {
    base += Math.max(0, currentMeRh - fittedAtMeRh);
  }
  return base;
}

export function getAlertStatus(
  totalRh: number,
  crownOverhaulRh: number,
  crownWarningRh: number
): string {
  if (totalRh >= crownOverhaulRh) return "Overdue";
  if (totalRh >= crownOverhaulRh * 0.9) return "Due";
  if (totalRh >= crownWarningRh) return "Warning";
  return "OK";
}

export function getDismantlingAlert(
  rhSinceDismantling: number,
  dismantlingWarningRh: number
): string {
  if (rhSinceDismantling >= dismantlingWarningRh) return "Due";
  if (rhSinceDismantling >= dismantlingWarningRh * 0.85) return "Warning";
  return "OK";
}

interface ValveComponentState {
  currentStatus: string;
  currentLocation: string;
  totalAccumulatedRh: number;
  fittedAtMeRh: number | null;
}

/**
 * A child valve component (nozzle, spring, etc.) has no independent location or
 * status — it always mirrors its parent valve, and while the parent is in
 * service it runs hours from the parent's fitting point. Its accumulated LIFE
 * hours, however, are its own: a new nozzle fitted to a 20,000-hr valve body
 * starts from its own prior hours, not the body's. (Fuel valve overhaul cycle
 * vs body lifetime is likewise separated via lastOverhaulRh on the parent.)
 */
export function resolveValveComponentState<T extends ValveComponentState & { id: number; parentComponentId: number | null }>(
  comp: T,
  byId: Map<number, T>
): ValveComponentState {
  if (comp.parentComponentId != null) {
    const parent = byId.get(comp.parentComponentId);
    if (parent) {
      return {
        currentStatus: parent.currentStatus,
        currentLocation: parent.currentLocation,
        totalAccumulatedRh: comp.totalAccumulatedRh,
        fittedAtMeRh: parent.fittedAtMeRh,
      };
    }
  }
  return {
    currentStatus: comp.currentStatus,
    currentLocation: comp.currentLocation,
    totalAccumulatedRh: comp.totalAccumulatedRh,
    fittedAtMeRh: comp.fittedAtMeRh,
  };
}
