import { useState } from "react";
import { useVesselContext } from "@/contexts/VesselContext";
import {
  useGetValveDashboard,
  getGetValveDashboardQueryKey,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge-status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Gauge, ShieldAlert, Box, Flame, Wind } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { getStatusLabel } from "@/lib/utils";
import { CornerDownRight } from "lucide-react";

type ValveType = "fuel" | "exhaust";

export function ValveDashboardPanel({ valveType }: { valveType: ValveType }) {
  const { activeVesselId } = useVesselContext();
  const { data: dashboard, isLoading } = useGetValveDashboard(activeVesselId!, valveType, {
    query: {
      enabled: !!activeVesselId,
      queryKey: getGetValveDashboardQueryKey(activeVesselId ?? 0, valveType),
    },
  });

  if (isLoading || !dashboard) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { currentMeRh, cylinderStatus, alerts, spareComponents, ashoreComponents, alertConfig, crownOverhaulRh } = dashboard;
  const label = valveType === "fuel" ? "Fuel Valve" : "Exhaust Valve";
  const Icon = valveType === "fuel" ? Flame : Wind;

  return (
    <div className="space-y-6">
      {/* Current ME RH banner */}
      <div className="flex justify-end">
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 px-4 py-2 rounded-lg">
          <Gauge className="text-primary h-5 w-5" />
          <div>
            <div className="text-xs font-semibold uppercase text-primary tracking-wider">Current ME RH</div>
            <div className="text-xl font-bold font-mono">
              {currentMeRh.toLocaleString()}
              <span className="text-sm font-normal text-muted-foreground ml-1">hrs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alert config strip */}
      <div className="text-xs text-muted-foreground flex gap-4">
        <span>Overhaul Interval: <strong>{alertConfig.overhaulRh.toLocaleString()} hrs</strong></span>
        <span>Warning at <strong>{alertConfig.warningRh.toLocaleString()} hrs</strong></span>
      </div>

      {/* Active alerts */}
      {alerts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3 flex flex-row items-center gap-2">
            <ShieldAlert className="text-destructive h-5 w-5" />
            <CardTitle className="text-destructive">Active Alerts ({alerts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {alerts.map((alert, i) => (
                <div key={i} className="flex items-center justify-between bg-background border p-3 rounded-md shadow-sm">
                  <div>
                    <div className="font-semibold text-sm">Cyl #{alert.cylinder} · {alert.componentId}</div>
                    <div className="text-xs text-muted-foreground">{alert.type}</div>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={alert.status} label={getStatusLabel(alert.status, alert.isChild ? "life" : "overhaul")} />
                    <div className="text-xs font-mono mt-1 text-muted-foreground">
                      {alert.totalRh.toLocaleString()} / {alert.limit.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Cylinder matrix */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-muted-foreground" />
                {label} Cylinder Matrix
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cylinderStatus.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No cylinders configured for this vessel.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {cylinderStatus.map((cyl) => (
                    <div key={cyl.cylinder} className="border rounded-lg p-3 bg-muted/20 flex flex-col gap-2">
                      <div className="border-b pb-2">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-base">UNIT {cyl.cylinder}</div>
                          <StatusBadge status={cyl.overallAlertStatus} label={getStatusLabel(cyl.overallAlertStatus, "overhaul")} />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">RH after overhaul</span>
                          <span className="font-mono text-[10px] font-medium">
                            {cyl.rhSinceOverhaul.toLocaleString()} of {crownOverhaulRh.toLocaleString()} hrs
                          </span>
                        </div>
                        <div className="text-[9px] uppercase text-muted-foreground tracking-wide text-right">Overhaul Interval</div>
                      </div>

                      {cyl.slots.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-muted-foreground py-3">
                          <AlertCircle className="h-5 w-5 mb-1 opacity-40" />
                          <span className="text-xs">No valve fitted</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {cyl.slots.map((slot) => {
                            const pct = Math.min(100, Math.round((slot.totalRh / slot.limit) * 100));
                            const barColor =
                              slot.alertStatus === "Overdue" ? "bg-destructive" :
                              slot.alertStatus === "Due"     ? "bg-orange-500" :
                              slot.alertStatus === "Warning" ? "bg-yellow-500" :
                              "bg-primary";
                            return (
                              <div key={slot.slotNumber} className="bg-background border rounded p-2">
                                {valveType === "fuel" && (
                                  <div className="text-[9px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">
                                    Slot {slot.slotNumber}
                                  </div>
                                )}
                                <div className="flex items-start justify-between gap-1 mb-1">
                                  <div>
                                    <div className="text-xs font-semibold leading-tight">{slot.componentId}</div>
                                    <div className="text-[10px] text-muted-foreground leading-tight">{slot.componentType} · {slot.condition}</div>
                                  </div>
                                  <StatusBadge status={slot.alertStatus} label={getStatusLabel(slot.alertStatus, "overhaul")} />
                                </div>
                                {(slot.lastOverhaulDate || slot.lastOverhaulRh != null) && (
                                  <div className="text-[10px] text-muted-foreground leading-tight">
                                    Last O/H: {slot.lastOverhaulDate ?? "—"}
                                    {slot.lastOverhaulRh != null && ` at ${slot.lastOverhaulRh.toLocaleString()} hr`}
                                  </div>
                                )}
                                <div className="mt-1.5 space-y-1">
                                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-muted-foreground">{pct}% used</span>
                                    <span className="font-mono text-[10px] font-medium">
                                      {slot.totalRh.toLocaleString()} of {slot.limit.toLocaleString()} hrs
                                    </span>
                                  </div>
                                  <div className="text-[9px] uppercase text-muted-foreground tracking-wide text-right">Overhaul Interval</div>
                                </div>

                                {slot.children.length > 0 && (
                                  <div className="mt-2 pt-2 border-t space-y-1.5">
                                    {slot.children.map((child) => {
                                      const childPct = Math.min(100, Math.round((child.totalRh / child.limit) * 100));
                                      const childBarColor =
                                        child.alertStatus === "Overdue" ? "bg-destructive" :
                                        child.alertStatus === "Due"     ? "bg-orange-500" :
                                        child.alertStatus === "Warning" ? "bg-yellow-500" :
                                        "bg-primary";
                                      return (
                                        <div key={child.componentId} className="pl-2">
                                          <div className="flex items-start justify-between gap-1 mb-0.5">
                                            <div className="flex items-center gap-1 text-muted-foreground">
                                              <CornerDownRight className="h-3 w-3" />
                                              <div>
                                                <div className="text-[11px] font-semibold leading-tight text-foreground">{child.componentId}</div>
                                                <div className="text-[9px] leading-tight">{child.componentType} · {child.condition}</div>
                                              </div>
                                            </div>
                                            <StatusBadge status={child.alertStatus} label={getStatusLabel(child.alertStatus, "life")} />
                                          </div>
                                          {(child.lastOverhaulDate || child.lastOverhaulRh != null) && (
                                            <div className="text-[9px] text-muted-foreground leading-tight mb-0.5 pl-4">
                                              Last O/H: {child.lastOverhaulDate ?? "—"}
                                              {child.lastOverhaulRh != null && ` at ${child.lastOverhaulRh.toLocaleString()} hr`}
                                            </div>
                                          )}
                                          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${childBarColor}`} style={{ width: `${childPct}%` }} />
                                          </div>
                                          <div className="flex items-center justify-between mt-0.5">
                                            <span className="text-[9px] text-muted-foreground">{childPct}% used</span>
                                            <span className="font-mono text-[9px] font-medium">
                                              {child.totalRh.toLocaleString()} of {child.limit.toLocaleString()} hrs
                                            </span>
                                          </div>
                                          <div className="text-[8px] uppercase text-muted-foreground tracking-wide text-right">Expected Life</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Spares sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Box className="h-5 w-5 text-muted-foreground" />
                Spares Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Onboard Spares</h4>
                  <Badge variant="secondary">{spareComponents.length}</Badge>
                </div>
                {spareComponents.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {spareComponents.map((comp) => (
                      <div key={comp.componentId} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                        <div>
                          <div className="font-medium">{comp.componentId}</div>
                          <div className="text-xs text-muted-foreground">{comp.componentType} · {comp.condition}</div>
                        </div>
                        <div className="font-mono text-xs text-right">{(comp.liveRh ?? comp.totalAccumulatedRh).toLocaleString()} hr</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No onboard spares.</p>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Ashore / Reconditioning</h4>
                  <Badge variant="secondary">{ashoreComponents.length}</Badge>
                </div>
                {ashoreComponents.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {ashoreComponents.map((comp) => (
                      <div key={comp.componentId} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                        <div>
                          <div className="font-medium">{comp.componentId}</div>
                          <div className="text-xs text-muted-foreground">{comp.componentType}</div>
                        </div>
                        <div className="font-mono text-xs text-right text-muted-foreground">{comp.currentLocation}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No components ashore.</p>
                )}
              </div>

              <div className="pt-2 border-t space-y-1">
                <Button asChild size="sm" variant="outline" className="w-full text-xs">
                  <Link href="/components">Manage {label}s</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="w-full text-xs">
                  <Link href="/movements">View Movements</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ValveDashboard() {
  const [activeTab, setActiveTab] = useState<ValveType>("fuel");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Valve Dashboard</h1>
        <p className="text-muted-foreground">Fuel and exhaust valve running hours and alert status by cylinder.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ValveType)}>
        <TabsList>
          <TabsTrigger value="fuel" className="flex items-center gap-2">
            <Flame className="h-4 w-4" />
            Fuel Valves
          </TabsTrigger>
          <TabsTrigger value="exhaust" className="flex items-center gap-2">
            <Wind className="h-4 w-4" />
            Exhaust Valves
          </TabsTrigger>
        </TabsList>
        <TabsContent value="fuel" className="mt-4">
          <ValveDashboardPanel valveType="fuel" />
        </TabsContent>
        <TabsContent value="exhaust" className="mt-4">
          <ValveDashboardPanel valveType="exhaust" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
