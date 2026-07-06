import { useVesselContext } from "@/contexts/VesselContext";
import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge-status";
import { Loader2, ShieldAlert, BellRing } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function Alerts() {
  const { activeVesselId } = useVesselContext();
  
  const { data: dashboard, isLoading } = useGetDashboard(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getGetDashboardQueryKey(activeVesselId ?? 0) }
  });

  if (isLoading || !dashboard) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;

  const { alerts, alertConfig } = dashboard;

  const getAlertProgress = (totalRh: number, limit: number) => {
    return Math.min(100, Math.max(0, (totalRh / limit) * 100));
  };

  const getAlertColor = (status: string) => {
    if (status === "Overdue") return "bg-purple-500";
    if (status === "Due") return "bg-red-500";
    if (status === "Warning") return "bg-yellow-500";
    return "bg-green-500";
  };

  // Group alerts by severity for better reading
  const overdue = alerts.filter(a => a.status === "Overdue");
  const due = alerts.filter(a => a.status === "Due");
  const warnings = alerts.filter(a => a.status === "Warning");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Alerts</h1>
          <p className="text-muted-foreground">Components requiring maintenance based on configured thresholds.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-900/10">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-purple-800 dark:text-purple-400">Overdue</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-300">{overdue.length}</div>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-900/10">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-red-800 dark:text-red-400">Due for Maintenance</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-red-900 dark:text-red-300">{due.length}</div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50/50 dark:bg-yellow-900/10">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-yellow-800 dark:text-yellow-400">Approaching Limit</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-300">{warnings.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Active Alerts List
          </CardTitle>
          <CardDescription>
            Limits based on Overhaul ({alertConfig.crownOverhaulRh}h), Overhaul Warning ({alertConfig.crownWarningRh}h), Dismantling Warning ({alertConfig.dismantlingWarningRh}h).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20 rounded-lg border border-dashed">
              <CheckCircle2 className="h-10 w-10 text-green-500 mb-3 opacity-50" />
              <h3 className="font-semibold">All clear</h3>
              <p className="text-sm text-muted-foreground">No components currently require attention.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {[...overdue, ...due, ...warnings].map((alert, idx) => {
                const percent = getAlertProgress(alert.totalRh, alert.limit);
                const colorClass = getAlertColor(alert.status);
                
                return (
                  <div key={idx} className="flex flex-col md:flex-row md:items-center gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="w-full md:w-1/4 flex-shrink-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-lg">Cyl #{alert.cylinder}</span>
                        <StatusBadge status={alert.status} />
                      </div>
                      <div className="text-sm font-medium">{alert.componentId}</div>
                      <div className="text-xs text-muted-foreground">{alert.type}</div>
                    </div>
                    
                    <div className="flex-1 w-full space-y-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-mono text-muted-foreground">0</span>
                        <span className="font-mono font-medium">{alert.totalRh.toLocaleString()} / {alert.limit.toLocaleString()} hrs</span>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div className={`h-full transition-all ${colorClass}`} style={{ width: `${percent}%` }} />
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {alert.totalRh >= alert.limit ? (
                          <span className="text-destructive font-medium">Exceeded by {(alert.totalRh - alert.limit).toLocaleString()} hrs</span>
                        ) : (
                          <span>{(alert.limit - alert.totalRh).toLocaleString()} hrs remaining</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Ensure CheckCircle2 is imported if I missed it above:
import { CheckCircle2 } from "lucide-react";
