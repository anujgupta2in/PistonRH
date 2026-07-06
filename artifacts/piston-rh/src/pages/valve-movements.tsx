import { useState } from "react";
import { useVesselContext } from "@/contexts/VesselContext";
import {
  useListValveComponents,
  useListValveMovements,
  useRecordValveMovement,
  useDeleteValveMovement,
  getListValveMovementsQueryKey,
  getGetValveDashboardQueryKey,
  getListValveComponentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Flame, Wind } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type ValveType = "fuel" | "exhaust";

const todayIso = format(new Date(), "yyyy-MM-dd");

const ACTIONS = ["Fit", "Remove", "Land Ashore", "Receive Onboard", "Scrap"];

const formSchema = z.object({
  movementDate: z.string().min(1, "Required"),
  meRh: z.coerce.number().min(0),
  componentId: z.string().min(1, "Required"),
  action: z.string().min(1, "Required"),
  fromLocation: z.string().min(1, "Required"),
  toLocation: z.string().min(1, "Required"),
  slotNumber: z.coerce.number().min(1).optional(),
  remarks: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function locationOptions(action: string, numCylinders: number, valveType: ValveType, slotsPerCyl: number): string[] {
  const spare = ["Onboard Spare"];
  const ashore = ["Landed Ashore", "Shore Workshop"];
  const scrap = ["Scrapped"];
  const cylinders: string[] = [];
  for (let c = 1; c <= numCylinders; c++) {
    if (valveType === "fuel") {
      for (let s = 1; s <= slotsPerCyl; s++) {
        cylinders.push(`Cyl ${c} Slot ${s}`);
      }
    } else {
      cylinders.push(`Cyl ${c}`);
    }
  }
  if (action === "Fit") return cylinders;
  if (action === "Remove") return [...spare, ...ashore];
  if (action === "Land Ashore") return ashore;
  if (action === "Receive Onboard") return spare;
  if (action === "Scrap") return scrap;
  return [...spare, ...ashore, ...cylinders, ...scrap];
}

function fromLocationOptions(action: string, numCylinders: number, valveType: ValveType, slotsPerCyl: number): string[] {
  const spare = ["Onboard Spare"];
  const ashore = ["Landed Ashore", "Shore Workshop"];
  const cylinders: string[] = [];
  for (let c = 1; c <= numCylinders; c++) {
    if (valveType === "fuel") {
      for (let s = 1; s <= slotsPerCyl; s++) {
        cylinders.push(`Cyl ${c} Slot ${s}`);
      }
    } else {
      cylinders.push(`Cyl ${c}`);
    }
  }
  if (action === "Fit") return [...spare, ...ashore];
  if (action === "Remove") return cylinders;
  if (action === "Land Ashore") return [...spare, ...cylinders];
  if (action === "Receive Onboard") return ashore;
  if (action === "Scrap") return [...spare, ...cylinders, ...ashore];
  return [...spare, ...ashore, ...cylinders];
}

function actionColor(action: string) {
  const map: Record<string, string> = {
    Fit: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    Remove: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    "Land Ashore": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    "Receive Onboard": "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
    Scrap: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  return map[action] ?? "bg-gray-100 text-gray-800";
}

export function ValveMovementsPanel({ valveType }: { valveType: ValveType }) {
  const { activeVesselId } = useVesselContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const { data: movements, isLoading } = useListValveMovements(activeVesselId!, valveType, {
    query: { enabled: !!activeVesselId, queryKey: getListValveMovementsQueryKey(activeVesselId ?? 0, valveType) },
  });

  const { data: comps } = useListValveComponents(activeVesselId!, valveType, {
    query: { enabled: !!activeVesselId, queryKey: getListValveComponentsQueryKey(activeVesselId ?? 0, valveType) },
  });

  const recordMov = useRecordValveMovement();
  const deleteMov = useDeleteValveMovement();

  const label = valveType === "fuel" ? "Fuel Valve" : "Exhaust Valve";

  // Derive vessel info from components
  const numCylinders = 6; // default; in a real impl we'd read from vessel context
  const slotsPerCyl = valveType === "fuel" ? 2 : 1;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { movementDate: todayIso, meRh: 0, componentId: "", action: "Fit", fromLocation: "Onboard Spare", toLocation: "", remarks: "" },
  });

  const watchAction = form.watch("action");
  const watchComponent = form.watch("componentId");

  // Auto-fill fromLocation based on selected component and action
  const selectedComp = comps?.find((c) => c.componentId === watchComponent);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListValveMovementsQueryKey(activeVesselId!, valveType) });
    queryClient.invalidateQueries({ queryKey: getListValveComponentsQueryKey(activeVesselId!, valveType) });
    queryClient.invalidateQueries({ queryKey: getGetValveDashboardQueryKey(activeVesselId!, valveType) });
  };

  const onSubmit = (data: FormValues) => {
    recordMov.mutate(
      { vesselId: activeVesselId!, valveType, data: { movementDate: data.movementDate, meRh: data.meRh, componentId: data.componentId, fromLocation: data.fromLocation, toLocation: data.toLocation, action: data.action, slotNumber: data.slotNumber, remarks: data.remarks } },
      {
        onSuccess: () => { toast({ title: "Movement recorded" }); invalidate(); setIsOpen(false); form.reset({ movementDate: todayIso, meRh: data.meRh, componentId: "", action: "Fit", fromLocation: "Onboard Spare", toLocation: "" }); },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const onDelete = (id: number) => {
    if (!confirm("Delete this movement entry?")) return;
    deleteMov.mutate(
      { vesselId: activeVesselId!, valveType, movementId: id },
      {
        onSuccess: () => { toast({ title: "Movement deleted" }); invalidate(); },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;

  const toOpts = locationOptions(watchAction, numCylinders, valveType, slotsPerCyl);
  const fromOpts = fromLocationOptions(watchAction, numCylinders, valveType, slotsPerCyl);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Record Movement</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Record {label} Movement</DialogTitle>
              <DialogDescription>Log a Fit, Remove, or status change for a {label.toLowerCase()} component.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="movementDate" render={({ field }) => (
                    <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} max={todayIso} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="meRh" render={({ field }) => (
                    <FormItem><FormLabel>ME RH at Event</FormLabel><FormControl><Input type="number" step="1" min={0} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="action" render={({ field }) => (
                  <FormItem><FormLabel>Action</FormLabel>
                    <Select onValueChange={(v) => { field.onChange(v); form.setValue("toLocation", ""); form.setValue("fromLocation", selectedComp?.currentLocation ?? "Onboard Spare"); }} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="componentId" render={({ field }) => (
                  <FormItem><FormLabel>Component</FormLabel>
                    <Select onValueChange={(v) => { field.onChange(v); const c = comps?.find((x) => x.componentId === v); if (c) form.setValue("fromLocation", c.currentLocation ?? "Onboard Spare"); }} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select component" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {comps?.filter((c) => c.currentStatus !== "Scrapped").map((c) => (
                          <SelectItem key={c.componentId} value={c.componentId}>
                            {c.componentId} — {c.currentStatus}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="fromLocation" render={({ field }) => (
                  <FormItem><FormLabel>From Location</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                      <SelectContent>{fromOpts.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="toLocation" render={({ field }) => (
                  <FormItem><FormLabel>To Location</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                      <SelectContent>{toOpts.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                    {watchAction === "Fit" && valveType === "fuel" && (
                      <FormDescription className="text-xs">For fuel valves, the slot is encoded in the location (e.g. "Cyl 1 Slot 1").</FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="remarks" render={({ field }) => (
                  <FormItem><FormLabel>Remarks</FormLabel><FormControl><Textarea placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={recordMov.isPending}>{recordMov.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Component</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">ME RH</TableHead>
                <TableHead className="text-right">RH Added</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="text-right">Del</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements && movements.length > 0 ? movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm whitespace-nowrap">{m.movementDate}</TableCell>
                  <TableCell className="font-semibold text-sm">{m.componentId}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actionColor(m.action)}`}>{m.action}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.fromLocation}</TableCell>
                  <TableCell className="text-sm">{m.toLocation}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{m.meRh.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">
                    {m.rhAdded > 0 ? <span className="text-primary">+{m.rhAdded.toLocaleString()}</span> : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">{m.remarks || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(m.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    No {label} movements recorded yet.
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

export default function ValveMovements() {
  const [activeTab, setActiveTab] = useState<ValveType>("fuel");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Valve Movements</h1>
        <p className="text-muted-foreground">Record fit, remove, and status changes for fuel and exhaust valve components.</p>
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
          <ValveMovementsPanel valveType="fuel" />
        </TabsContent>
        <TabsContent value="exhaust" className="mt-4">
          <ValveMovementsPanel valveType="exhaust" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
