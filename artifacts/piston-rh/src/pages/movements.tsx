import { useState, useEffect } from "react";
import { useVesselContext } from "@/contexts/VesselContext";
import {
  useListMovements,
  useRecordMovement,
  useDeleteMovement,
  getListMovementsQueryKey,
  useListComponents,
  useGetVessel,
  useGetDashboard,
  getGetDashboardQueryKey,
  getListComponentsQueryKey,
  getGetVesselQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, ArrowRight, Info, Wrench, Flame, Wind } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ValveMovementsPanel } from "./valve-movements";

const ACTION_TYPES = ["Fit", "Remove", "Rotate", "Land Ashore", "Receive Onboard", "Scrap"];

const SHORE_LOCATIONS = ["Onboard Spare", "Engine Room Spares", "Landed Ashore", "Under Reconditioning", "Scrapped"];

const ACTION_LOCATIONS: Record<string, { from: "cyl" | "store" | "fixed"; to: "cyl" | "store" | "fixed" }> = {
  "Fit":             { from: "store", to: "cyl" },
  "Remove":          { from: "cyl",   to: "store" },
  "Rotate":          { from: "cyl",   to: "cyl" },
  "Land Ashore":     { from: "cyl",   to: "store" },
  "Receive Onboard": { from: "store", to: "store" },
  "Scrap":           { from: "store", to: "fixed" },
};

const formSchema = z.object({
  movementDate: z.string().min(1, "Date is required"),
  meRh: z.coerce.number().min(0, "ME RH is required"),
  componentId: z.string().min(1, "Component is required"),
  action: z.string().min(1, "Action is required"),
  fromLocation: z.string().min(1, "From location is required"),
  toLocation: z.string().min(1, "To location is required"),
  remarks: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function LocationSelect({
  kind,
  numCylinders,
  value,
  onChange,
  label,
  excludeCyl,
}: {
  kind: "cyl" | "store" | "fixed";
  numCylinders: number;
  value: string;
  onChange: (v: string) => void;
  label: string;
  excludeCyl?: string;
}) {
  if (kind === "fixed") {
    return (
      <div>
        <label className="text-sm font-medium">{label}</label>
        <div className="mt-1.5 h-10 px-3 flex items-center rounded-md border bg-muted text-muted-foreground text-sm">
          Scrapped
        </div>
      </div>
    );
  }

  const options =
    kind === "cyl"
      ? Array.from({ length: numCylinders }, (_, i) => `Cyl ${i + 1}`).filter((c) => c !== excludeCyl)
      : SHORE_LOCATIONS;

  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1.5">
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PistonMovementsPanel() {
  const { activeVesselId } = useVesselContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: movements, isLoading } = useListMovements(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getListMovementsQueryKey(activeVesselId ?? 0) },
  });
  const { data: allComponents } = useListComponents(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getListComponentsQueryKey(activeVesselId ?? 0) },
  });
  const { data: vessel } = useGetVessel(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getGetVesselQueryKey(activeVesselId ?? 0) },
  });

  const numCylinders = vessel?.numCylinders ?? 6;

  const recordMovement = useRecordMovement();
  const deleteMovement = useDeleteMovement();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      movementDate: new Date().toISOString().split("T")[0],
      meRh: 0,
      componentId: "",
      action: "Fit",
      fromLocation: "Onboard Spare",
      toLocation: "Cyl 1",
      remarks: "",
    },
  });

  const watchAction = form.watch("action");
  const watchFrom = form.watch("fromLocation");

  useEffect(() => {
    const locs = ACTION_LOCATIONS[watchAction];
    if (!locs) return;
    form.setValue("fromLocation", locs.from === "cyl" ? "Cyl 1" : locs.from === "fixed" ? "Scrapped" : "Onboard Spare");
    form.setValue("toLocation", locs.to === "cyl" ? "Cyl 1" : locs.to === "fixed" ? "Scrapped" : "Onboard Spare");
  }, [watchAction]);

  const watchComponent = form.watch("componentId");
  useEffect(() => {
    if (watchAction === "Remove" || watchAction === "Rotate" || watchAction === "Land Ashore") {
      const comp = allComponents?.find((c) => c.componentId === watchComponent);
      if (comp?.currentLocation) {
        form.setValue("fromLocation", comp.currentLocation);
      }
    }
  }, [watchComponent, watchAction]);

  const locs = ACTION_LOCATIONS[watchAction] ?? { from: "store", to: "store" };

  const onSubmit = (data: FormValues) => {
    const toLocation = data.action === "Scrap" ? "Scrapped" : data.toLocation;
    recordMovement.mutate(
      {
        vesselId: activeVesselId!,
        data: { ...data, toLocation, movementDate: new Date(data.movementDate).toISOString() },
      },
      {
        onSuccess: () => {
          toast({ title: "Movement recorded" });
          queryClient.invalidateQueries({ queryKey: getListMovementsQueryKey(activeVesselId!) });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(activeVesselId!) });
          queryClient.invalidateQueries({ queryKey: getListComponentsQueryKey(activeVesselId!) });
          setIsAddOpen(false);
          form.reset();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this movement record?")) return;
    deleteMovement.mutate(
      { vesselId: activeVesselId!, movementId: id },
      {
        onSuccess: () => {
          toast({ title: "Movement deleted" });
          queryClient.invalidateQueries({ queryKey: getListMovementsQueryKey(activeVesselId!) });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(activeVesselId!) });
          queryClient.invalidateQueries({ queryKey: getListComponentsQueryKey(activeVesselId!) });
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (open) form.reset(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Record Movement</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Record Component Movement</DialogTitle>
              <DialogDescription>
                Log a transfer or state change. To fit multiple components to one cylinder (e.g. Crown + Skirt), record a separate <strong>Fit</strong> movement for each component.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="movementDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="meRh"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ME Total RH at Movement</FormLabel>
                        <FormControl><Input type="number" min={0} step={1} {...field} /></FormControl>
                        <FormDescription className="text-xs">Cumulative engine hours at time of this job</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="action"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Action</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {ACTION_TYPES.map((a) => (
                              <SelectItem key={a} value={a}>{a}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="componentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Component</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select component" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {allComponents?.map((c) => (
                              <SelectItem key={c.componentId} value={c.componentId}>
                                {c.componentId} — {c.componentType} ({c.condition})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fromLocation"
                    render={({ field }) => (
                      <FormItem>
                        <LocationSelect
                          kind={locs.from}
                          numCylinders={numCylinders}
                          value={field.value}
                          onChange={field.onChange}
                          label="From Location"
                          excludeCyl={locs.to === "cyl" ? form.watch("toLocation") : undefined}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="toLocation"
                    render={({ field }) => (
                      <FormItem>
                        <LocationSelect
                          kind={locs.to}
                          numCylinders={numCylinders}
                          value={field.value}
                          onChange={field.onChange}
                          label="To Location (Cylinder)"
                          excludeCyl={locs.from === "cyl" ? form.watch("fromLocation") : undefined}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {watchAction === "Fit" && (
                  <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-800 dark:text-blue-300 text-sm">Fitting multiple components?</AlertTitle>
                    <AlertDescription className="text-blue-700 dark:text-blue-400 text-xs">
                      Select the same cylinder in "To Location" for each component. Record one Fit movement per component (e.g. Crown first, then Skirt).
                    </AlertDescription>
                  </Alert>
                )}

                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remarks</FormLabel>
                      <FormControl><Textarea placeholder="Optional remarks" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={recordMovement.isPending}>
                    {recordMovement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Record Movement
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Alert className="bg-muted/40 border-muted-foreground/20">
        <Info className="h-4 w-4" />
        <AlertTitle className="text-sm font-semibold">Workflow Guide</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground mt-1 space-y-1">
          <p><strong>Fit</strong> — installs a component into a cylinder.</p>
          <p><strong>Remove</strong> — takes a component out of a cylinder; accumulates its running hours.</p>
          <p><strong>Rotate</strong> — moves a component from one cylinder to another.</p>
          <p><strong>Land Ashore / Receive Onboard</strong> — tracks components sent off-vessel or returned.</p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>ME RH</TableHead>
                <TableHead>Component</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Transfer</TableHead>
                <TableHead className="text-right">RH Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements && movements.length > 0 ? (
                movements.map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {format(new Date(mov.movementDate), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="font-mono">{mov.meRh.toLocaleString()}</TableCell>
                    <TableCell className="font-bold">{mov.componentId}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground border">
                        {mov.action}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="truncate max-w-[120px]" title={mov.fromLocation}>{mov.fromLocation}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[120px]" title={mov.toLocation}>{mov.toLocation}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium text-primary">
                      {mov.rhAdded > 0 ? `+${mov.rhAdded.toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(mov.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No movements recorded yet. Click <strong>Record Movement</strong> to start.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Movements() {
  const [activeTab, setActiveTab] = useState("pistons");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Movement Log</h1>
        <p className="text-muted-foreground">Record component fitting, removal, and transfers.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pistons" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
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
          <PistonMovementsPanel />
        </TabsContent>
        <TabsContent value="fuel" className="mt-4">
          <ValveMovementsPanel valveType="fuel" />
        </TabsContent>
        <TabsContent value="exhaust" className="mt-4">
          <ValveMovementsPanel valveType="exhaust" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
