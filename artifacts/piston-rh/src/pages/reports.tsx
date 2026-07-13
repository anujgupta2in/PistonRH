import { useVesselContext } from "@/contexts/VesselContext";
import {
  useGetDashboard,
  useListMonthlyRh,
  useListComponents,
  useListMovements,
  useListValveComponents,
  useListValveMovements,
  useGetValveDashboard,
  getGetDashboardQueryKey,
  getListMonthlyRhQueryKey,
  getListComponentsQueryKey,
  getListMovementsQueryKey,
  getListValveComponentsQueryKey,
  getListValveMovementsQueryKey,
  getGetValveDashboardQueryKey,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/badge-status";
import { format, parseISO } from "date-fns";
import { Loader2, Printer, Download, CornerDownRight } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { getStatusLabel } from "@/lib/utils";
import * as XLSX from "xlsx";
import { useGetVessel, getGetVesselQueryKey } from "@workspace/api-client-react";

// Never let one malformed date (e.g. from a bad import) crash the whole page
function safeFormatDate(iso: string, fmt: string): string {
  const d = parseISO(iso);
  return isNaN(d.getTime()) ? iso : format(d, fmt);
}

function ValveCylinderStatusCard({ title, description, data }: {
  title: string;
  description: string;
  data: { cylinderStatus: { cylinder: number; slots: { slotNumber: number; componentId: string; componentType: string; condition: string; totalRh: number; limit: number; alertStatus: string; children: { componentId: string; componentType: string; condition: string; totalRh: number; limit: number; alertStatus: string }[] }[] }[] } | undefined;
}) {
  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>UNIT</TableHead>
              <TableHead>Component</TableHead>
              <TableHead>Type / Condition</TableHead>
              <TableHead className="text-right">Total RHs</TableHead>
              <TableHead className="text-right">Threshold</TableHead>
              <TableHead className="text-right">Life left</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.cylinderStatus.map(cyl =>
              cyl.slots.length === 0 ? (
                <TableRow key={cyl.cylinder}>
                  <TableCell className="font-bold">{cyl.cylinder}</TableCell>
                  <TableCell className="text-muted-foreground italic" colSpan={5}>Empty</TableCell>
                  <TableCell />
                </TableRow>
              ) : (
                cyl.slots.map((slot, si) => (
                  <Fragment key={`${cyl.cylinder}-${slot.componentId}`}>
                    <TableRow>
                      {si === 0 && (
                        <TableCell className="font-bold align-top" rowSpan={cyl.slots.length + cyl.slots.reduce((n, s) => n + s.children.length, 0)}>
                          {cyl.cylinder}
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{slot.componentId}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {slot.componentType} ({slot.condition})
                      </TableCell>
                      <TableCell className="text-right font-mono">{slot.totalRh.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">
                        {slot.limit.toLocaleString()}
                        <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Overhaul Interval</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{(slot.limit - slot.totalRh).toLocaleString()}</TableCell>
                      <TableCell>
                        <StatusBadge status={slot.alertStatus} label={getStatusLabel(slot.alertStatus, "overhaul")} />
                      </TableCell>
                    </TableRow>
                    {slot.children.map((child) => (
                      <TableRow key={`${cyl.cylinder}-${slot.componentId}-${child.componentId}`} className="bg-muted/30">
                        <TableCell className="font-medium pl-8">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <CornerDownRight className="h-3.5 w-3.5" />
                            <span className="text-foreground">{child.componentId}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {child.componentType} ({child.condition})
                        </TableCell>
                        <TableCell className="text-right font-mono">{child.totalRh.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">
                          {child.limit.toLocaleString()}
                          <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Expected Life</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{(child.limit - child.totalRh).toLocaleString()}</TableCell>
                        <TableCell>
                          <StatusBadge status={child.alertStatus} label={getStatusLabel(child.alertStatus, "life")} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))
              )
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const { activeVesselId } = useVesselContext();

  const { data: vessel } = useGetVessel(activeVesselId!, { query: { enabled: !!activeVesselId, queryKey: getGetVesselQueryKey(activeVesselId ?? 0) } });
  const { data: dashboard, isLoading: dashLoading } = useGetDashboard(activeVesselId!, { query: { enabled: !!activeVesselId, queryKey: getGetDashboardQueryKey(activeVesselId ?? 0) } });
  const { data: rhLogs, isLoading: rhLoading } = useListMonthlyRh(activeVesselId!, { query: { enabled: !!activeVesselId, queryKey: getListMonthlyRhQueryKey(activeVesselId ?? 0) } });
  const { data: components, isLoading: compLoading } = useListComponents(activeVesselId!, { query: { enabled: !!activeVesselId, queryKey: getListComponentsQueryKey(activeVesselId ?? 0) } });
  const { data: movements, isLoading: movLoading } = useListMovements(activeVesselId!, { query: { enabled: !!activeVesselId, queryKey: getListMovementsQueryKey(activeVesselId ?? 0) } });
  const { data: fuelComps, isLoading: fuelCompLoading } = useListValveComponents(activeVesselId!, "fuel", { query: { enabled: !!activeVesselId, queryKey: getListValveComponentsQueryKey(activeVesselId ?? 0, "fuel") } });
  const { data: exhaustComps, isLoading: exhaustCompLoading } = useListValveComponents(activeVesselId!, "exhaust", { query: { enabled: !!activeVesselId, queryKey: getListValveComponentsQueryKey(activeVesselId ?? 0, "exhaust") } });
  const { data: fuelMovs, isLoading: fuelMovLoading } = useListValveMovements(activeVesselId!, "fuel", { query: { enabled: !!activeVesselId, queryKey: getListValveMovementsQueryKey(activeVesselId ?? 0, "fuel") } });
  const { data: exhaustMovs, isLoading: exhaustMovLoading } = useListValveMovements(activeVesselId!, "exhaust", { query: { enabled: !!activeVesselId, queryKey: getListValveMovementsQueryKey(activeVesselId ?? 0, "exhaust") } });
  const { data: fuelDashboard, isLoading: fuelDashLoading } = useGetValveDashboard(activeVesselId!, "fuel", { query: { enabled: !!activeVesselId, queryKey: getGetValveDashboardQueryKey(activeVesselId ?? 0, "fuel") } });
  const { data: exhaustDashboard, isLoading: exhaustDashLoading } = useGetValveDashboard(activeVesselId!, "exhaust", { query: { enabled: !!activeVesselId, queryKey: getGetValveDashboardQueryKey(activeVesselId ?? 0, "exhaust") } });

  const isLoading = dashLoading || rhLoading || compLoading || movLoading || fuelCompLoading || exhaustCompLoading || fuelMovLoading || exhaustMovLoading || fuelDashLoading || exhaustDashLoading;

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;

  const pistonSpares = components?.filter(c => c.currentStatus !== "In Service") ?? [];
  const fuelSpares = fuelComps?.filter(c => c.currentStatus !== "In Service") ?? [];
  const exhaustSpares = exhaustComps?.filter(c => c.currentStatus !== "In Service") ?? [];

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const addSheet = (name: string, rows: Record<string, unknown>[], widths: number[]) => {
      const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Note: "No data" }]);
      ws["!cols"] = widths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    // Cylinder Status (pistons)
    addSheet("Cylinder Status", (dashboard?.cylinderStatus ?? []).flatMap(cyl =>
      cyl.components.map(comp => ({
        Unit: cyl.cylinder,
        "Component ID": comp.componentId,
        Type: comp.componentType,
        Condition: comp.condition,
        "Total RH": comp.totalRh,
        "Expected Life (hrs)": comp.limit,
        "Life Left (hrs)": comp.limit - comp.totalRh,
        Status: getStatusLabel(comp.alertStatus, "life"),
      }))
    ), [6, 16, 18, 12, 10, 16, 14, 14]);

    // Fuel / Exhaust valve status incl. children and overhaul info
    const valveRows = (data: typeof fuelDashboard) => (data?.cylinderStatus ?? []).flatMap(cyl =>
      cyl.slots.flatMap(slot => [
        {
          Unit: cyl.cylinder,
          Slot: slot.slotNumber,
          "Component ID": slot.componentId,
          Type: slot.componentType,
          Condition: slot.condition,
          "RH Since O/H": slot.totalRh,
          "Threshold (hrs)": slot.limit,
          "Life Left (hrs)": slot.limit - slot.totalRh,
          "Last O/H Date": slot.lastOverhaulDate ?? "",
          "Last O/H ME RH": slot.lastOverhaulRh ?? "",
          Status: getStatusLabel(slot.alertStatus, "overhaul"),
        },
        ...slot.children.map(child => ({
          Unit: cyl.cylinder,
          Slot: "",
          "Component ID": `  > ${child.componentId}`,
          Type: child.componentType,
          Condition: child.condition,
          "RH Since O/H": child.totalRh,
          "Threshold (hrs)": child.limit,
          "Life Left (hrs)": child.limit - child.totalRh,
          "Last O/H Date": child.lastOverhaulDate ?? "",
          "Last O/H ME RH": child.lastOverhaulRh ?? "",
          Status: getStatusLabel(child.alertStatus, "life"),
        })),
      ])
    );
    addSheet("Fuel Valves", valveRows(fuelDashboard), [6, 6, 18, 22, 12, 13, 14, 14, 13, 14, 14]);
    addSheet("Exhaust Valves", valveRows(exhaustDashboard), [6, 6, 18, 22, 12, 13, 14, 14, 13, 14, 14]);

    // Monthly RH history
    addSheet("Monthly RH", (rhLogs ?? []).map(log => ({
      Date: log.logDate,
      "ME Total RH": log.meTotalRh,
      "Since Last (+hrs)": log.monthlyRh,
      Remarks: log.remarks ?? "",
    })), [12, 12, 16, 40]);

    // Spares inventory (all categories)
    addSheet("Spares", [
      ...pistonSpares.map(c => ({ Category: "Piston", "Component ID": c.componentId, Type: c.componentType, Condition: c.condition, Status: c.currentStatus, Location: c.currentLocation ?? "", "Accumulated RH": c.totalAccumulatedRh })),
      ...fuelSpares.map(c => ({ Category: "Fuel Valve", "Component ID": c.componentId, Type: c.componentType, Condition: c.condition, Status: c.currentStatus, Location: c.currentLocation ?? "", "Accumulated RH": c.totalAccumulatedRh })),
      ...exhaustSpares.map(c => ({ Category: "Exhaust Valve", "Component ID": c.componentId, Type: c.componentType, Condition: c.condition, Status: c.currentStatus, Location: c.currentLocation ?? "", "Accumulated RH": c.totalAccumulatedRh })),
    ], [14, 16, 24, 12, 20, 20, 14]);

    // Movement history (all categories)
    addSheet("Movements", [
      ...(movements ?? []).map(m => ({ Category: "Piston", Date: m.movementDate, Action: m.action, "Component ID": m.componentId, From: m.fromLocation, To: m.toLocation, "ME RH": m.meRh, "RH Added": m.rhAdded ?? "" })),
      ...(fuelMovs ?? []).map(m => ({ Category: "Fuel Valve", Date: m.movementDate, Action: m.action, "Component ID": m.componentId, From: m.fromLocation, To: m.toLocation, "ME RH": m.meRh, "RH Added": m.rhAdded })),
      ...(exhaustMovs ?? []).map(m => ({ Category: "Exhaust Valve", Date: m.movementDate, Action: m.action, "Component ID": m.componentId, From: m.fromLocation, To: m.toLocation, "ME RH": m.meRh, "RH Added": m.rhAdded })),
    ], [14, 12, 12, 16, 20, 20, 10, 10]);

    const vesselTag = (vessel?.vesselName ?? "vessel").replace(/[^A-Za-z0-9]+/g, "_");
    XLSX.writeFile(wb, `PistonRH_Report_${vesselTag}_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">View and export operational data.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print View
          </Button>
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" /> Export Excel
          </Button>
        </div>
      </div>

      <Tabs defaultValue="cylinder" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:w-[600px] bg-muted/50 p-1 rounded-lg">
          <TabsTrigger value="cylinder">Cylinder Status</TabsTrigger>
          <TabsTrigger value="monthly">Monthly RH</TabsTrigger>
          <TabsTrigger value="spares">Spares</TabsTrigger>
          <TabsTrigger value="movements">History</TabsTrigger>
        </TabsList>

        <TabsContent value="cylinder" className="mt-6 space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle>Cylinder Status Report</CardTitle>
              <CardDescription>Current running hours for all fitted piston components.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>UNIT</TableHead>
                    <TableHead>Component</TableHead>
                    <TableHead>Type / Condition</TableHead>
                    <TableHead className="text-right">Total RHs</TableHead>
                    <TableHead className="text-right">Expected Life</TableHead>
                    <TableHead className="text-right">Life left</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard?.cylinderStatus.map(cyl =>
                    cyl.components.length === 0 ? (
                      <TableRow key={cyl.cylinder}>
                        <TableCell className="font-bold">{cyl.cylinder}</TableCell>
                        <TableCell className="text-muted-foreground italic" colSpan={5}>Empty</TableCell>
                        <TableCell />
                      </TableRow>
                    ) : (
                      cyl.components.map((comp, ci) => (
                        <TableRow key={`${cyl.cylinder}-${comp.componentId}`}>
                          {ci === 0 && (
                            <TableCell className="font-bold align-top" rowSpan={cyl.components.length}>
                              {cyl.cylinder}
                            </TableCell>
                          )}
                          <TableCell className="font-medium">{comp.componentId}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {comp.componentType} ({comp.condition})
                          </TableCell>
                          <TableCell className="text-right font-mono">{comp.totalRh.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{comp.limit.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{(comp.limit - comp.totalRh).toLocaleString()}</TableCell>
                          <TableCell>
                            <StatusBadge status={comp.alertStatus} label={getStatusLabel(comp.alertStatus, "life")} />
                          </TableCell>
                        </TableRow>
                      ))
                    )
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <ValveCylinderStatusCard
            title="Fuel Valve Cylinder Status"
            description="Current running hours for all fitted fuel valves, including nested nozzles/springs."
            data={fuelDashboard}
          />

          <ValveCylinderStatusCard
            title="Exhaust Valve Cylinder Status"
            description="Current running hours for all fitted exhaust valves, including nested sub-components."
            data={exhaustDashboard}
          />
        </TabsContent>

        <TabsContent value="monthly" className="mt-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle>Monthly RH Summary</CardTitle>
              <CardDescription>Main engine running hour history.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">ME Total RH</TableHead>
                    <TableHead className="text-right">Diff (+)</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rhLogs?.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        {safeFormatDate(log.logDate, 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell className="text-right font-mono">{log.meTotalRh.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-primary font-bold">
                        {log.monthlyRh > 0 ? `+${log.monthlyRh.toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{log.remarks || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="spares" className="mt-6 space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle>Piston Spares Inventory</CardTitle>
              <CardDescription>Piston components not currently fitted to an engine.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Accumulated RH</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pistonSpares.length > 0 ? pistonSpares.map(comp => (
                    <TableRow key={comp.componentId}>
                      <TableCell className="font-bold">{comp.componentId}</TableCell>
                      <TableCell>{comp.componentType}</TableCell>
                      <TableCell>{comp.condition}</TableCell>
                      <TableCell>{comp.currentStatus}</TableCell>
                      <TableCell className="text-muted-foreground">{comp.currentLocation || "-"}</TableCell>
                      <TableCell className="text-right font-mono">{comp.totalAccumulatedRh.toLocaleString()}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-16 text-center text-muted-foreground text-sm">No piston spares.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="flex items-center gap-2">
                Fuel Valve Spares Inventory
                <Badge variant="secondary">{fuelSpares.length}</Badge>
              </CardTitle>
              <CardDescription>Fuel valve components not currently in service.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Accumulated RH</TableHead>
                    <TableHead>Alert</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fuelSpares.length > 0 ? fuelSpares.map(comp => (
                    <TableRow key={comp.componentId}>
                      <TableCell className="font-bold">{comp.componentId}</TableCell>
                      <TableCell>{comp.componentType}</TableCell>
                      <TableCell>{comp.condition}</TableCell>
                      <TableCell>{comp.currentStatus}</TableCell>
                      <TableCell className="text-muted-foreground">{comp.currentLocation || "-"}</TableCell>
                      <TableCell className="text-right font-mono">{comp.totalAccumulatedRh.toLocaleString()}</TableCell>
                      <TableCell><StatusBadge status={comp.alertStatus ?? "OK"} /></TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-16 text-center text-muted-foreground text-sm">No fuel valve spares.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="flex items-center gap-2">
                Exhaust Valve Spares Inventory
                <Badge variant="secondary">{exhaustSpares.length}</Badge>
              </CardTitle>
              <CardDescription>Exhaust valve components not currently in service.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Accumulated RH</TableHead>
                    <TableHead>Alert</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exhaustSpares.length > 0 ? exhaustSpares.map(comp => (
                    <TableRow key={comp.componentId}>
                      <TableCell className="font-bold">{comp.componentId}</TableCell>
                      <TableCell>{comp.componentType}</TableCell>
                      <TableCell>{comp.condition}</TableCell>
                      <TableCell>{comp.currentStatus}</TableCell>
                      <TableCell className="text-muted-foreground">{comp.currentLocation || "-"}</TableCell>
                      <TableCell className="text-right font-mono">{comp.totalAccumulatedRh.toLocaleString()}</TableCell>
                      <TableCell><StatusBadge status={comp.alertStatus ?? "OK"} /></TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-16 text-center text-muted-foreground text-sm">No exhaust valve spares.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="mt-6 space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle>Piston Movement History</CardTitle>
              <CardDescription>Chronological log of piston component rotations.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Component</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead className="text-right">ME RH</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements && movements.length > 0 ? movements.map(mov => (
                    <TableRow key={mov.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {safeFormatDate(mov.movementDate, 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>
                        <span className="bg-muted px-2 py-1 rounded text-xs">{mov.action}</span>
                      </TableCell>
                      <TableCell className="font-bold">{mov.componentId}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {mov.fromLocation} → {mov.toLocation}
                      </TableCell>
                      <TableCell className="text-right font-mono">{mov.meRh.toLocaleString()}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-16 text-center text-muted-foreground text-sm">No piston movements recorded.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle>Fuel Valve Movement History</CardTitle>
              <CardDescription>Chronological log of fuel valve component movements.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Component</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead className="text-right">ME RH</TableHead>
                    <TableHead className="text-right">RH Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fuelMovs && fuelMovs.length > 0 ? fuelMovs.map(mov => (
                    <TableRow key={mov.id}>
                      <TableCell className="font-medium whitespace-nowrap">{mov.movementDate}</TableCell>
                      <TableCell>
                        <span className="bg-muted px-2 py-1 rounded text-xs">{mov.action}</span>
                      </TableCell>
                      <TableCell className="font-bold">{mov.componentId}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {mov.fromLocation} → {mov.toLocation}
                      </TableCell>
                      <TableCell className="text-right font-mono">{mov.meRh.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-primary">
                        {mov.rhAdded > 0 ? `+${mov.rhAdded.toLocaleString()}` : "—"}
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-16 text-center text-muted-foreground text-sm">No fuel valve movements recorded.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle>Exhaust Valve Movement History</CardTitle>
              <CardDescription>Chronological log of exhaust valve component movements.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Component</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead className="text-right">ME RH</TableHead>
                    <TableHead className="text-right">RH Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exhaustMovs && exhaustMovs.length > 0 ? exhaustMovs.map(mov => (
                    <TableRow key={mov.id}>
                      <TableCell className="font-medium whitespace-nowrap">{mov.movementDate}</TableCell>
                      <TableCell>
                        <span className="bg-muted px-2 py-1 rounded text-xs">{mov.action}</span>
                      </TableCell>
                      <TableCell className="font-bold">{mov.componentId}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {mov.fromLocation} → {mov.toLocation}
                      </TableCell>
                      <TableCell className="text-right font-mono">{mov.meRh.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-primary">
                        {mov.rhAdded > 0 ? `+${mov.rhAdded.toLocaleString()}` : "—"}
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-16 text-center text-muted-foreground text-sm">No exhaust valve movements recorded.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
