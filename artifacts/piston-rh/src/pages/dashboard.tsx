import { useState } from "react";
import { useVesselContext } from "@/contexts/VesselContext";
import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge-status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Gauge, Settings, ShieldAlert, Box, Flame, Wind } from "lucide-react";
import { Loader2 } from "lucide-react";
import { ValveDashboardPanel } from "./valve-dashboard";
import { getStatusLabel } from "@/lib/utils";

function PistonDashboardPanel() {
  const { activeVesselId } = useVesselContext();
  const { data: dashboard, isLoading } = useGetDashboard(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getGetDashboardQueryKey(activeVesselId ?? 0) }
  });

  if (isLoading || !dashboard) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { currentMeRh, cylinderStatus, alerts, spareComponents, ashoreComponents, alertConfig } = dashboard;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="flex items-center gap-4 bg-primary/10 border border-primary/20 px-4 py-2 rounded-lg">
          <Gauge className="text-primary h-5 w-5" />
          <div>
            <div className="text-xs font-semibold uppercase text-primary tracking-wider">Current ME RH</div>
            <div className="text-xl font-bold font-mono">
              {currentMeRh.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">hrs</span>
            </div>
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3 flex flex-row items-center gap-2">
            <ShieldAlert className="text-destructive h-5 w-5" />
            <div className="space-y-1">
              <CardTitle className="text-destructive">Active Alerts ({alerts.length})</CardTitle>
            </div>
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
                    <StatusBadge status={alert.status} label={getStatusLabel(alert.status, "life")} />
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
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                Cylinder Matrix
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                          {cyl.rhSinceOverhaul.toLocaleString()} of {alertConfig.crownOverhaulRh.toLocaleString()} hrs
                        </span>
                      </div>
                      <div className="text-[9px] uppercase text-muted-foreground tracking-wide text-right">Overhaul Interval</div>
                    </div>

                    {cyl.components.length === 0 ? (
                      <div className="flex flex-col items-center justify-center text-muted-foreground py-3">
                        <AlertCircle className="h-5 w-5 mb-1 opacity-40" />
                        <span className="text-xs">Empty</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {cyl.components.map((comp) => {
                          const pct = Math.min(100, Math.round((comp.totalRh / comp.limit) * 100));
                          const barColor =
                            comp.alertStatus === "Overdue" ? "bg-destructive" :
                            comp.alertStatus === "Due"     ? "bg-orange-500" :
                            comp.alertStatus === "Warning" ? "bg-yellow-500" :
                            "bg-primary";
                          return (
                            <div key={comp.componentId} className="bg-background border rounded p-2">
                              <div className="flex items-start justify-between gap-1 mb-1">
                                <div>
                                  <div className="text-xs font-semibold leading-tight">{comp.componentId}</div>
                                  <div className="text-[10px] text-muted-foreground leading-tight">{comp.componentType} · {comp.condition}</div>
                                </div>
                                <StatusBadge status={comp.alertStatus} label={getStatusLabel(comp.alertStatus, "life")} />
                              </div>
                              <div className="mt-1.5 space-y-1">
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground">{pct}% used</span>
                                  <span className="font-mono text-[10px] font-medium">
                                    {comp.totalRh.toLocaleString()} of {comp.limit.toLocaleString()} hrs
                                  </span>
                                </div>
                                <div className="text-[9px] uppercase text-muted-foreground tracking-wide text-right">Expected Life</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

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
                    {spareComponents.map(comp => (
                      <div key={comp.componentId} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                        <div>
                          <div className="font-medium">{comp.componentId}</div>
                          <div className="text-xs text-muted-foreground">{comp.componentType} · {comp.condition}</div>
                        </div>
                        <div className="font-mono text-xs text-right">
                          {(comp.liveRh ?? comp.totalAccumulatedRh).toLocaleString()} hr
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">No onboard spares.</div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Ashore / Reconditioning</h4>
                  <Badge variant="secondary">{ashoreComponents.length}</Badge>
                </div>
                {ashoreComponents.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {ashoreComponents.map(comp => (
                      <div key={comp.componentId} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                        <div>
                          <div className="font-medium">{comp.componentId}</div>
                          <div className="text-xs text-muted-foreground">{comp.componentType}</div>
                        </div>
                        <div className="font-mono text-xs text-right text-muted-foreground">
                          {comp.currentLocation}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">No components ashore.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("pistons");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Vessel overview and active alerts.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pistons" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Pistons
          </TabsTrigger>
          <TabsTrigger value="fuel" className="flex items-center gap-2">
            <Flame className="h-4 w-4" />
            Fuel Valves
          </TabsTrigger>
          <TabsTrigger value="exhaust" className="flex items-center gap-2">
            <Wind className="h-4 w-4" />
            Exhaust Valves
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pistons" className="mt-4">
          <PistonDashboardPanel />
        </TabsContent>
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
