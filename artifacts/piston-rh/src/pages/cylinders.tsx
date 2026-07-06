import { useState } from "react";
import { useVesselContext } from "@/contexts/VesselContext";
import {
  useListCylinders,
  useUpdateCylinder,
  useListComponents,
  useCreateComponent,
  useUpdateComponent,
  useRecordMovement,
  useListMonthlyRh,
  useListValveComponents,
  useCreateValveComponent,
  useRecordValveMovement,
  useGetVessel,
  getListCylindersQueryKey,
  getListComponentsQueryKey,
  getGetDashboardQueryKey,
  getListMonthlyRhQueryKey,
  getListMovementsQueryKey,
  getListValveComponentsQueryKey,
  getGetValveDashboardQueryKey,
  getGetVesselQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Form, FormControl, FormField, FormItem, FormLabel,
  FormMessage, FormDescription,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Settings2, Wrench, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Constants ────────────────────────────────────────────────────────────────
const PISTON_TYPES = [
  "Piston Crown", "Piston Skirt", "Piston Rod",
  "Ring No.1", "Ring No.2", "Ring No.3", "Ring No.4",
];
const FUEL_VALVE_TYPES = ["Fuel Injector", "Fuel Valve", "Injection Pump"];
const EXHAUST_VALVE_TYPES = ["Exhaust Valve", "Exhaust Valve Spindle", "Exhaust Valve Seat"];
const CONDITIONS = ["New", "Original", "Reconditioned"];
const TODAY = new Date().toISOString().split("T")[0];

// ─── Schemas ──────────────────────────────────────────────────────────────────
const baselineSchema = z.object({
  lastOverhaulRh: z.coerce.number().nullable().optional(),
  lastDismantlingRh: z.coerce.number().nullable().optional(),
});

const newPistonSchema = z.object({
  componentId: z.string().min(1, "Component ID is required"),
  componentType: z.string().min(1, "Type is required"),
  condition: z.string().min(1, "Condition is required"),
  fittedAtMeRh: z.coerce.number().min(0).default(0),
  totalAccumulatedRh: z.coerce.number().min(0).default(0),
  remarks: z.string().optional(),
});

const assignPistonSchema = z.object({
  componentId: z.string().min(1, "Select a component"),
  fittedAtMeRh: z.coerce.number().min(0).default(0),
});

const newValveSchema = z.object({
  componentId: z.string().min(1, "Component ID is required"),
  componentType: z.string().min(1, "Type is required"),
  condition: z.string().min(1, "Condition is required"),
  totalAccumulatedRh: z.coerce.number().min(0).default(0),
  remarks: z.string().optional(),
});

const assignValveSchema = z.object({
  componentId: z.string().min(1, "Select a component"),
  meRh: z.coerce.number().min(0).default(0),
});

// ─── Types ────────────────────────────────────────────────────────────────────
type CylinderData = {
  id: number;
  cylinderNumber: number;
  lastOverhaulRh: number | null;
  lastDismantlingRh: number | null;
};
type ComponentData = {
  componentId: string;
  componentType: string;
  condition: string;
  currentStatus: string;
  currentLocation: string;
  totalAccumulatedRh: number;
  fittedAtMeRh?: number | null;
};
type ValveComponentData = {
  id: number;
  componentId: string;
  valveType: string;
  componentType: string;
  condition: string;
  currentStatus: string;
  currentLocation: string;
  totalAccumulatedRh: number;
  fittedAtMeRh?: number | null;
  liveRh: number;
  parentComponentId?: number | null;
};

// ─── Pistons Tab ──────────────────────────────────────────────────────────────
function PistonsTab() {
  const { activeVesselId } = useVesselContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [baselineDialogCyl, setBaselineDialogCyl] = useState<CylinderData | null>(null);
  const [fitDialogCylNum, setFitDialogCylNum] = useState<number | null>(null);

  const { data: cylinders, isLoading: cylLoading } = useListCylinders(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getListCylindersQueryKey(activeVesselId ?? 0) },
  });
  const { data: allComponents, isLoading: compLoading } = useListComponents(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getListComponentsQueryKey(activeVesselId ?? 0) },
  });
  const { data: monthlyLogs } = useListMonthlyRh(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getListMonthlyRhQueryKey(activeVesselId ?? 0) },
  });

  const updateCylinder = useUpdateCylinder();
  const createComponent = useCreateComponent();
  const updateComponent = useUpdateComponent();
  const recordMovement = useRecordMovement();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListCylindersQueryKey(activeVesselId!) });
    queryClient.invalidateQueries({ queryKey: getListComponentsQueryKey(activeVesselId!) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(activeVesselId!) });
    queryClient.invalidateQueries({ queryKey: getListMovementsQueryKey(activeVesselId!) });
  };

  const latestMeRh = monthlyLogs && monthlyLogs.length > 0 ? monthlyLogs[0].meTotalRh : 0;

  // Best-effort audit log entry alongside the direct component/cylinder update above —
  // fitting/removing here can also be used to backfill historical (pre-current) RH data,
  // which the movements endpoint rejects, so a failure here must never block the actual
  // component state change that already succeeded.
  const logMovement = (params: {
    componentId: string;
    fromLocation: string;
    toLocation: string;
    action: "Fit" | "Remove";
    meRh: number;
  }) => {
    recordMovement.mutate(
      {
        vesselId: activeVesselId!,
        data: { movementDate: TODAY, ...params },
      },
      { onError: () => {} },
    );
  };

  const fittedInCyl = (cylNum: number): ComponentData[] =>
    (allComponents ?? []).filter(
      (c) => c.currentStatus === "In Service" && c.currentLocation === `Cyl ${cylNum}`
    );

  // All components available to assign — includes spares AND in-service (for reassignment)
  const assignableComponents = (allComponents ?? []).filter(
    (c) => c.currentStatus !== "Scrapped"
  );

  // Baseline form
  const baselineForm = useForm<z.infer<typeof baselineSchema>>({ resolver: zodResolver(baselineSchema) });

  const openBaseline = (cyl: CylinderData) => {
    baselineForm.reset({
      lastOverhaulRh: cyl.lastOverhaulRh ?? undefined,
      lastDismantlingRh: cyl.lastDismantlingRh ?? undefined,
    });
    setBaselineDialogCyl(cyl);
  };

  const submitBaseline = (data: z.infer<typeof baselineSchema>) => {
    if (!baselineDialogCyl) return;
    updateCylinder.mutate(
      {
        vesselId: activeVesselId!,
        cylinderNumber: baselineDialogCyl.cylinderNumber,
        data: { lastOverhaulRh: data.lastOverhaulRh ?? null, lastDismantlingRh: data.lastDismantlingRh ?? null },
      },
      {
        onSuccess: () => {
          toast({ title: `Cylinder ${baselineDialogCyl.cylinderNumber} baselines saved` });
          invalidate();
          setBaselineDialogCyl(null);
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  // New piston form
  const newCompForm = useForm<z.infer<typeof newPistonSchema>>({
    resolver: zodResolver(newPistonSchema),
    defaultValues: { componentId: "", componentType: "Piston Crown", condition: "New", fittedAtMeRh: 0, totalAccumulatedRh: 0, remarks: "" },
  });

  const submitNewComponent = (data: z.infer<typeof newPistonSchema>) => {
    if (fitDialogCylNum === null) return;
    createComponent.mutate(
      {
        vesselId: activeVesselId!,
        data: {
          componentId: data.componentId,
          componentType: data.componentType,
          condition: data.condition,
          currentStatus: "In Service",
          currentLocation: `Cyl ${fitDialogCylNum}`,
          fittedAtMeRh: data.fittedAtMeRh,
          totalAccumulatedRh: data.totalAccumulatedRh,
          remarks: data.remarks || undefined,
        },
      },
      {
        onSuccess: () => {
          logMovement({
            componentId: data.componentId,
            fromLocation: "Onboard Spare",
            toLocation: `Cyl ${fitDialogCylNum}`,
            action: "Fit",
            meRh: data.fittedAtMeRh,
          });
          toast({ title: `${data.componentType} fitted to Cyl ${fitDialogCylNum}` });
          invalidate();
          setFitDialogCylNum(null);
          newCompForm.reset();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  // Assign existing component form
  const assignForm = useForm<z.infer<typeof assignPistonSchema>>({
    resolver: zodResolver(assignPistonSchema),
    defaultValues: { componentId: "", fittedAtMeRh: 0 },
  });

  const submitAssignComponent = (data: z.infer<typeof assignPistonSchema>) => {
    if (fitDialogCylNum === null) return;
    const selectedComp = assignableComponents.find((c) => c.componentId === data.componentId);
    updateComponent.mutate(
      {
        vesselId: activeVesselId!,
        componentId: data.componentId,
        data: {
          currentStatus: "In Service",
          currentLocation: `Cyl ${fitDialogCylNum}`,
          fittedAtMeRh: data.fittedAtMeRh,
        },
      },
      {
        onSuccess: () => {
          logMovement({
            componentId: data.componentId,
            fromLocation: selectedComp?.currentLocation ?? "Onboard Spare",
            toLocation: `Cyl ${fitDialogCylNum}`,
            action: "Fit",
            meRh: data.fittedAtMeRh,
          });
          toast({ title: `Component fitted to Cyl ${fitDialogCylNum}` });
          invalidate();
          setFitDialogCylNum(null);
          assignForm.reset();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  // Remove component from cylinder
  const handleRemove = (comp: ComponentData) => {
    if (!confirm(`Remove ${comp.componentId} from ${comp.currentLocation}? It will be moved to Onboard Spare.`)) return;
    const rhAdded = comp.fittedAtMeRh != null ? Math.max(0, latestMeRh - comp.fittedAtMeRh) : 0;
    const newTotal = comp.totalAccumulatedRh + rhAdded;
    updateComponent.mutate(
      {
        vesselId: activeVesselId!,
        componentId: comp.componentId,
        data: { currentStatus: "Onboard Spare", currentLocation: "Onboard Spare", fittedAtMeRh: null, totalAccumulatedRh: newTotal },
      },
      {
        onSuccess: () => {
          logMovement({
            componentId: comp.componentId,
            fromLocation: comp.currentLocation,
            toLocation: "Onboard Spare",
            action: "Remove",
            meRh: latestMeRh,
          });
          toast({ title: `${comp.componentId} moved to Onboard Spare`, description: rhAdded > 0 ? `+${rhAdded.toLocaleString()} hrs accumulated` : undefined });
          invalidate();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  if (cylLoading || compLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        Configure fitted piston components and baseline RH for each cylinder.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(cylinders ?? []).map((cyl) => {
          const fitted = fittedInCyl(cyl.cylinderNumber);
          return (
            <Card key={cyl.id} className="flex flex-col">
              <CardHeader className="pb-3 border-b flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xl font-bold">Cylinder {cyl.cylinderNumber}</CardTitle>
                <Button
                  variant="ghost" size="sm"
                  className="h-8 gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => openBaseline(cyl as CylinderData)}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Baselines
                </Button>
              </CardHeader>
              <CardContent className="flex-1 pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div><span className="font-medium">Last O/H:</span>{" "}{cyl.lastOverhaulRh != null ? `${cyl.lastOverhaulRh.toLocaleString()} hr` : "—"}</div>
                  <div><span className="font-medium">Last Dis.:</span>{" "}{cyl.lastDismantlingRh != null ? `${cyl.lastDismantlingRh.toLocaleString()} hr` : "—"}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Fitted Components</div>
                  {fitted.length === 0 ? (
                    <div className="text-sm text-muted-foreground italic py-2">No components fitted</div>
                  ) : (
                    fitted.map((comp) => (
                      <div key={comp.componentId} className="flex items-center justify-between bg-muted/40 border rounded-md px-3 py-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm leading-tight">{comp.componentId}</div>
                          <div className="text-xs text-muted-foreground">{comp.componentType} · {comp.condition}</div>
                          <div className="text-xs font-mono text-muted-foreground">Fitted at {comp.fittedAtMeRh?.toLocaleString() ?? 0} hr</div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10" onClick={() => handleRemove(comp)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => { setFitDialogCylNum(cyl.cylinderNumber); newCompForm.reset(); assignForm.reset(); }}>
                  <Plus className="h-3.5 w-3.5" />
                  Fit Component to Cyl {cyl.cylinderNumber}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Baseline dialog */}
      <Dialog open={!!baselineDialogCyl} onOpenChange={(o) => !o && setBaselineDialogCyl(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cylinder {baselineDialogCyl?.cylinderNumber} — Baselines</DialogTitle>
            <DialogDescription>Set the ME RH at which the last overhaul and dismantling were performed.</DialogDescription>
          </DialogHeader>
          <Form {...baselineForm}>
            <form onSubmit={baselineForm.handleSubmit(submitBaseline)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={baselineForm.control} name="lastOverhaulRh" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Overhaul at ME RH</FormLabel>
                    <FormControl><Input type="number" placeholder="e.g. 40000" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={baselineForm.control} name="lastDismantlingRh" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Dismantling at ME RH</FormLabel>
                    <FormControl><Input type="number" placeholder="e.g. 36000" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setBaselineDialogCyl(null)}>Cancel</Button>
                <Button type="submit" disabled={updateCylinder.isPending}>
                  {updateCylinder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Baselines
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Fit component dialog */}
      <Dialog open={fitDialogCylNum !== null} onOpenChange={(o) => !o && setFitDialogCylNum(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Fit Piston Component — Cylinder {fitDialogCylNum}
            </DialogTitle>
            <DialogDescription>
              Create a new component or assign any existing component (spare or in-service) to this cylinder.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="new">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="new">Create New</TabsTrigger>
              <TabsTrigger value="assign" disabled={assignableComponents.length === 0}>
                Assign Existing ({assignableComponents.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new">
              <Form {...newCompForm}>
                <form onSubmit={newCompForm.handleSubmit(submitNewComponent)} className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={newCompForm.control} name="componentId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Component ID</FormLabel>
                        <FormControl><Input placeholder="e.g. C1, S1" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={newCompForm.control} name="componentType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <FormControl><Input list="piston-types" placeholder="e.g. Piston Crown" {...field} /></FormControl>
                        <datalist id="piston-types">{PISTON_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={newCompForm.control} name="condition" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Condition</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={newCompForm.control} name="fittedAtMeRh" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fitted at ME RH</FormLabel>
                        <FormControl><Input type="number" min={0} {...field} /></FormControl>
                        <FormDescription className="text-xs">ME hrs when fitted (0 = from start)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={newCompForm.control} name="totalAccumulatedRh" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Prior Accumulated RH</FormLabel>
                        <FormControl><Input type="number" min={0} {...field} /></FormControl>
                        <FormDescription className="text-xs">Hours from previous fittings. Leave 0 if new.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setFitDialogCylNum(null)}>Cancel</Button>
                    <Button type="submit" disabled={createComponent.isPending}>
                      {createComponent.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create &amp; Fit
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="assign">
              <Form {...assignForm}>
                <form onSubmit={assignForm.handleSubmit(submitAssignComponent)} className="space-y-4 pt-2">
                  <FormField control={assignForm.control} name="componentId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Component</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Choose a component…" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {assignableComponents.map((c) => (
                            <SelectItem key={c.componentId} value={c.componentId}>
                              {c.componentId} — {c.componentType} ({c.condition})
                              {c.currentStatus === "In Service" && ` · currently ${c.currentLocation}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">Includes spares and currently in-service components.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={assignForm.control} name="fittedAtMeRh" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fitted at ME RH</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} /></FormControl>
                      <FormDescription className="text-xs">ME hrs when this component is being fitted</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setFitDialogCylNum(null)}>Cancel</Button>
                    <Button type="submit" disabled={updateComponent.isPending}>
                      {updateComponent.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Fit to Cylinder
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Valve Cylinders Tab ──────────────────────────────────────────────────────
function ValveTab({ valveType }: { valveType: "fuel" | "exhaust" }) {
  const { activeVesselId } = useVesselContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fitDialog, setFitDialog] = useState<{ cylNum: number; slotNum: number } | null>(null);

  const { data: vessel } = useGetVessel(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getGetVesselQueryKey(activeVesselId ?? 0) },
  });
  // Use cylinders list as fallback for numCylinders (always in cache)
  const { data: cylinders } = useListCylinders(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getListCylindersQueryKey(activeVesselId ?? 0) },
  });
  const { data: valveComps, isLoading } = useListValveComponents(activeVesselId!, valveType, {
    query: { enabled: !!activeVesselId, queryKey: getListValveComponentsQueryKey(activeVesselId ?? 0, valveType) },
  });
  const { data: monthlyLogs } = useListMonthlyRh(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getListMonthlyRhQueryKey(activeVesselId ?? 0) },
  });

  const recordMovement = useRecordValveMovement();
  const createValveComp = useCreateValveComponent();

  // Fall back to cylinders list length (always cached) if vessel hasn't loaded yet
  const numCylinders = vessel?.numCylinders ?? cylinders?.length ?? 0;
  const slotsPerCyl = valveType === "fuel" ? (vessel?.fuelValveSlotsPerCyl ?? 3) : 1;
  const latestMeRh = monthlyLogs && monthlyLogs.length > 0 ? monthlyLogs[0].meTotalRh : 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListValveComponentsQueryKey(activeVesselId!, valveType) });
    queryClient.invalidateQueries({ queryKey: getGetValveDashboardQueryKey(activeVesselId!, valveType) });
  };

  // A cylinder slot always holds the main valve body — never a child sub-part
  // (nozzle, spring, spindle, seat), which is only ever attached via the Parent
  // Component relationship on the Components page, not fitted into its own slot.
  const primaryValveType = valveType === "fuel" ? "Fuel Valve" : "Exhaust Valve";

  const fittedAt = (cylNum: number, slotNum: number): ValveComponentData | undefined => {
    const loc = valveType === "fuel" ? `Cyl ${cylNum} Slot ${slotNum}` : `Cyl ${cylNum}`;
    return (valveComps ?? []).find(
      (c) => c.currentStatus === "In Service" && c.currentLocation === loc && c.componentType === primaryValveType && c.parentComponentId == null
    ) as ValveComponentData | undefined;
  };

  // All valve components not scrapped — spares + in service (for reassignment)
  const assignable = (valveComps ?? []).filter(
    (c) => c.currentStatus !== "Scrapped" && c.componentType === primaryValveType && c.parentComponentId == null
  ) as ValveComponentData[];

  // ── Remove fitted valve component ─────────────────────────────────────────
  const handleRemove = (comp: ValveComponentData, slotNum: number) => {
    if (!confirm(`Remove ${comp.componentId} from ${comp.currentLocation}? It will be moved to Onboard Spare.`)) return;
    recordMovement.mutate(
      {
        vesselId: activeVesselId!,
        valveType,
        data: {
          movementDate: TODAY,
          meRh: latestMeRh,
          componentId: comp.componentId,
          fromLocation: comp.currentLocation,
          toLocation: "Onboard Spare",
          action: "Remove",
          slotNumber: slotNum,
        },
      },
      {
        onSuccess: () => {
          toast({ title: `${comp.componentId} removed from ${comp.currentLocation}` });
          invalidate();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  // ── Assign existing valve component form ──────────────────────────────────
  const assignForm = useForm<z.infer<typeof assignValveSchema>>({
    resolver: zodResolver(assignValveSchema),
    defaultValues: { componentId: "", meRh: latestMeRh },
  });

  const submitAssign = (data: z.infer<typeof assignValveSchema>) => {
    if (!fitDialog) return;
    const toLocation = valveType === "fuel"
      ? `Cyl ${fitDialog.cylNum} Slot ${fitDialog.slotNum}`
      : `Cyl ${fitDialog.cylNum}`;
    const selectedComp = assignable.find((c) => c.componentId === data.componentId);
    recordMovement.mutate(
      {
        vesselId: activeVesselId!,
        valveType,
        data: {
          movementDate: TODAY,
          meRh: data.meRh,
          componentId: data.componentId,
          fromLocation: selectedComp?.currentLocation ?? "Onboard Spare",
          toLocation,
          action: "Fit",
          slotNumber: fitDialog.slotNum,
        },
      },
      {
        onSuccess: () => {
          toast({ title: `${data.componentId} fitted to ${toLocation}` });
          invalidate();
          setFitDialog(null);
          assignForm.reset();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  // ── Create new valve component form ───────────────────────────────────────
  const newValveForm = useForm<z.infer<typeof newValveSchema>>({
    resolver: zodResolver(newValveSchema),
    defaultValues: {
      componentId: "",
      componentType: valveType === "fuel" ? "Fuel Injector" : "Exhaust Valve",
      condition: "New",
      totalAccumulatedRh: 0,
      remarks: "",
    },
  });

  const submitNewValve = async (data: z.infer<typeof newValveSchema>) => {
    if (!fitDialog) return;
    const toLocation = valveType === "fuel"
      ? `Cyl ${fitDialog.cylNum} Slot ${fitDialog.slotNum}`
      : `Cyl ${fitDialog.cylNum}`;

    createValveComp.mutate(
      {
        vesselId: activeVesselId!,
        valveType,
        data: {
          componentId: data.componentId,
          componentType: data.componentType,
          condition: data.condition,
          currentStatus: "Onboard Spare",
          currentLocation: "Onboard Spare",
          totalAccumulatedRh: data.totalAccumulatedRh,
          remarks: data.remarks || undefined,
        },
      },
      {
        onSuccess: () => {
          recordMovement.mutate(
            {
              vesselId: activeVesselId!,
              valveType,
              data: {
                movementDate: TODAY,
                meRh: latestMeRh,
                componentId: data.componentId,
                fromLocation: "Onboard Spare",
                toLocation,
                action: "Fit",
                slotNumber: fitDialog.slotNum,
              },
            },
            {
              onSuccess: () => {
                toast({ title: `${data.componentId} created and fitted to ${toLocation}` });
                invalidate();
                setFitDialog(null);
                newValveForm.reset();
              },
              onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
            }
          );
        },
        onError: (err: any) => toast({ title: "Error creating component", description: err.message, variant: "destructive" }),
      }
    );
  };

  const typeOptions = valveType === "fuel" ? FUEL_VALVE_TYPES : EXHAUST_VALVE_TYPES;
  const datalistId = valveType === "fuel" ? "fuel-valve-types" : "exhaust-valve-types";

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        {valveType === "fuel"
          ? `Configure fitted fuel valve components. Each cylinder has ${slotsPerCyl} slot${slotsPerCyl !== 1 ? "s" : ""}.`
          : "Configure fitted exhaust valve components. Each cylinder has one exhaust valve slot."}
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: numCylinders }, (_, i) => i + 1).map((cylNum) => (
          <Card key={cylNum} className="flex flex-col">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-xl font-bold">Cylinder {cylNum}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 pt-3 space-y-2">
              {Array.from({ length: slotsPerCyl }, (_, j) => j + 1).map((slotNum) => {
                const comp = fittedAt(cylNum, slotNum);
                return (
                  <div key={slotNum} className="space-y-1">
                    {slotsPerCyl > 1 && (
                      <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                        Slot {slotNum}
                      </div>
                    )}
                    {comp ? (
                      <div className="flex items-center justify-between bg-muted/40 border rounded-md px-3 py-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm leading-tight">{comp.componentId}</div>
                          <div className="text-xs text-muted-foreground">{comp.componentType} · {comp.condition}</div>
                          <div className="text-xs font-mono text-muted-foreground">
                            {comp.liveRh?.toLocaleString() ?? 0} hr live RH
                          </div>
                        </div>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 shrink-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemove(comp, slotNum)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-muted-foreground/30 px-3 py-2 text-xs text-muted-foreground italic text-center">
                        Empty slot
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
            <CardFooter className="pt-0 pb-3 px-4">
              {(() => {
                const firstEmptySlot = Array.from({ length: slotsPerCyl }, (_, j) => j + 1).find(
                  (slotNum) => !fittedAt(cylNum, slotNum)
                );
                return firstEmptySlot != null ? (
                  <Button
                    variant="outline" size="sm"
                    className="w-full gap-1.5 border-dashed"
                    onClick={() => {
                      setFitDialog({ cylNum, slotNum: firstEmptySlot });
                      newValveForm.reset();
                      assignForm.reset({ componentId: "", meRh: latestMeRh });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {valveType === "fuel" ? `Fit Valve to Cyl ${cylNum}` : `Fit Valve to Cyl ${cylNum}`}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground w-full text-center">
                    All slots filled — remove a component to fit a new one
                  </p>
                );
              })()}
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Fit valve dialog */}
      <Dialog open={!!fitDialog} onOpenChange={(o) => !o && setFitDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Fit {valveType === "fuel" ? "Fuel Valve" : "Exhaust Valve"}
              {fitDialog && ` — Cyl ${fitDialog.cylNum}${valveType === "fuel" ? ` Slot ${fitDialog.slotNum}` : ""}`}
            </DialogTitle>
            <DialogDescription>
              Create a new component or assign an existing one (spare or in-service) to this slot.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="new">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="new">Create New</TabsTrigger>
              <TabsTrigger value="assign" disabled={assignable.length === 0}>
                Assign Existing ({assignable.length})
              </TabsTrigger>
            </TabsList>

            {/* Create new */}
            <TabsContent value="new">
              <Form {...newValveForm}>
                <form onSubmit={newValveForm.handleSubmit(submitNewValve)} className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={newValveForm.control} name="componentId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Component ID</FormLabel>
                        <FormControl><Input placeholder={valveType === "fuel" ? "e.g. FV1-1" : "e.g. EV1"} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={newValveForm.control} name="componentType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <FormControl><Input list={datalistId} placeholder={typeOptions[0]} {...field} /></FormControl>
                        <datalist id={datalistId}>{typeOptions.map((t) => <option key={t} value={t} />)}</datalist>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={newValveForm.control} name="condition" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Condition</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={newValveForm.control} name="totalAccumulatedRh" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prior Accum. RH</FormLabel>
                        <FormControl><Input type="number" min={0} {...field} /></FormControl>
                        <FormDescription className="text-xs">Hours from previous fittings (0 if new)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setFitDialog(null)}>Cancel</Button>
                    <Button type="submit" disabled={createValveComp.isPending || recordMovement.isPending}>
                      {(createValveComp.isPending || recordMovement.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create &amp; Fit
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </TabsContent>

            {/* Assign existing */}
            <TabsContent value="assign">
              <Form {...assignForm}>
                <form onSubmit={assignForm.handleSubmit(submitAssign)} className="space-y-4 pt-2">
                  <FormField control={assignForm.control} name="componentId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Component</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Choose a component…" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {assignable.map((c) => (
                            <SelectItem key={c.componentId} value={c.componentId}>
                              {c.componentId} — {c.componentType} ({c.condition})
                              {c.currentStatus === "In Service" && ` · ${c.currentLocation}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">Includes spares and currently in-service components.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={assignForm.control} name="meRh" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current ME RH at Fitting</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} /></FormControl>
                      <FormDescription className="text-xs">ME total hours when fitted (used for RH tracking)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setFitDialog(null)}>Cancel</Button>
                    <Button type="submit" disabled={recordMovement.isPending}>
                      {recordMovement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Fit to Slot
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Cylinders() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cylinder Configuration</h1>
        <p className="text-muted-foreground">
          Manage fitted components and baselines for pistons, fuel valves, and exhaust valves.
        </p>
      </div>

      <Tabs defaultValue="pistons">
        <TabsList>
          <TabsTrigger value="pistons">🔧 Pistons</TabsTrigger>
          <TabsTrigger value="fuel">🔥 Fuel Valves</TabsTrigger>
          <TabsTrigger value="exhaust">💨 Exhaust Valves</TabsTrigger>
        </TabsList>
        <TabsContent value="pistons" className="mt-4">
          <PistonsTab />
        </TabsContent>
        <TabsContent value="fuel" className="mt-4">
          <ValveTab valveType="fuel" />
        </TabsContent>
        <TabsContent value="exhaust" className="mt-4">
          <ValveTab valveType="exhaust" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
