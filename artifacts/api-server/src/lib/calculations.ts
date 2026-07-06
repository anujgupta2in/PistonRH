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
 * A child valve component (nozzle, spring, etc.) has no independent location/status/RH clock —
 * it always mirrors its parent valve. Resolving this at read time (rather than duplicating the
 * parent's fields onto the child row) keeps a single source of truth as the parent moves.
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
        totalAccumulatedRh: parent.totalAccumulatedRh,
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
