import { useState, useEffect } from "react";
import { useVesselContext } from "@/contexts/VesselContext";
import {
  useListComponents,
  useCreateComponent,
  useUpdateComponent,
  useDeleteComponent,
  useListCylinders,
  getListComponentsQueryKey,
  getListCylindersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Edit, AlertTriangle, Wrench, Flame, Wind } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge-status";
import { Badge } from "@/components/ui/badge";
import { ValveComponentsPanel } from "./valve-components";
import { getStatusLabel } from "@/lib/utils";

function RhProgressBar({ liveRh, effectiveOverhaulRh, alertStatus }: { liveRh: number; effectiveOverhaulRh: number; alertStatus: string }) {
  const pct = Math.min(100, effectiveOverhaulRh > 0 ? Math.round((liveRh / effectiveOverhaulRh) * 100) : 0);
  const color =
    alertStatus === "Overdue" ? "bg-red-500" :
    alertStatus === "Due" ? "bg-orange-500" :
    alertStatus === "Warning" ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="w-full bg-muted rounded-full h-1.5 mt-1 min-w-[60px]">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const componentTypes = [
  "Piston Crown", "Piston Skirt", "Piston Rod",
  "Ring No.1", "Ring No.2", "Ring No.3", "Ring No.4",
];
const conditions = ["New", "Original", "Reconditioned"];
const statuses = ["In Service", "Onboard Spare", "Landed Ashore", "Under Reconditioning", "Scrapped"];

const STATUS_LOCATION_DEFAULTS: Record<string, string> = {
  "Onboard Spare": "Onboard Spare",
  "Engine Room Spares": "Engine Room Spares",
  "Landed Ashore": "Ashore",
  "Under Reconditioning": "Ashore / Workshop",
  "Scrapped": "Scrapped",
};

const formSchema = z.object({
  componentId: z.string().min(1, "Required"),
  componentType: z.string().min(1, "Required"),
  condition: z.string().min(1, "Required"),
  currentStatus: z.string().min(1, "Required"),
  currentLocation: z.string().min(1, "Required"),
  totalAccumulatedRh: z.coerce.number().min(0).default(0),
  fittedAtMeRh: z.coerce.number().optional().nullable(),
  overhaulRh: z.coerce.number().min(1).optional().nullable(),
  warningRh: z.coerce.number().min(1).optional().nullable(),
  remarks: z.string().optional(),
});

function isCylLocation(loc: string) {
  return /^Cyl \d+$/.test(loc.trim());
}

function ComponentForm({
  form,
  cylinders,
  onSubmit,
  isPending,
  editingId,
  onCancel,
}: {
  form: ReturnType<typeof useForm<z.infer<typeof formSchema>>>;
  cylinders: { cylinderNumber: number }[];
  onSubmit: (data: z.infer<typeof formSchema>) => void;
  isPending: boolean;
  editingId: string | null;
  onCancel: () => void;
}) {
  const currentStatus = useWatch({ control: form.control, name: "currentStatus" });
  const isInService = currentStatus === "In Service";

  useEffect(() => {
    if (!isInService) {
      const def = STATUS_LOCATION_DEFAULTS[currentStatus];
      if (def) form.setValue("currentLocation", def);
      form.setValue("fittedAtMeRh", null);
    } else {
      const current = form.getValues("currentLocation");
      if (!isCylLocation(current) && cylinders.length > 0) {
        form.setValue("currentLocation", `Cyl ${cylinders[0].cylinderNumber}`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStatus]);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <FormField
        control={form.control}
        name="componentId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Component ID / Serial No</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            {editingId && <FormDescription className="text-xs">Renaming updates cylinder assignments and movement history automatically.</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="componentType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <FormControl>
                <Input list="comp-type-list" placeholder="e.g. Piston Crown" {...field} />
              </FormControl>
              <datalist id="comp-type-list">
                {componentTypes.map(t => <option key={t} value={t} />)}
              </datalist>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="condition"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Condition</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {conditions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="currentStatus"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {statuses.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {isInService ? (
          <FormField
            control={form.control}
            name="currentLocation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cylinder Unit</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select cylinder" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {cylinders.map(c => (
                      <SelectItem key={c.cylinderNumber} value={`Cyl ${c.cylinderNumber}`}>
                        Cylinder {c.cylinderNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription className="text-xs">In-Service components must be assigned to a cylinder.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <FormField
            control={form.control}
            name="currentLocation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="totalAccumulatedRh"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Total Accumulated RH (hrs)</FormLabel>
              <FormControl><Input type="number" min={0} {...field} /></FormControl>
              <FormDescription className="text-xs">
                {isInService
                  ? "Hours from all previous fittings (before this one). Live RH = this + hours since fitting."
                  : "Total running hours accumulated by this component across all fittings."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {isInService && (
          <FormField
            control={form.control}
            name="fittedAtMeRh"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fitted at ME RH</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    {...field}
                    value={field.value == null ? "" : field.value}
                    onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                  />
                </FormControl>
                <FormDescription className="text-xs">ME hours when this component was fitted.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>

      <div className="border rounded-md p-3 space-y-3 bg-muted/20">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Individual Thresholds (optional)</p>
        <p className="text-xs text-muted-foreground">Override the vessel-level defaults for this component only.</p>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="overhaulRh"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expected Life (hrs)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="100"
                    min={1}
                    placeholder="Vessel default"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="warningRh"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Warning Limit (hrs)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="100"
                    min={1}
                    placeholder="Vessel default"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      <FormField
        control={form.control}
        name="remarks"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Remarks</FormLabel>
            <FormControl>
              <textarea
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Optional notes about this component"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <DialogFooter className="pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Component
        </Button>
      </DialogFooter>
    </form>
  );
}

function PistonComponentsPanel() {
  const { activeVesselId } = useVesselContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: components, isLoading } = useListComponents(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getListComponentsQueryKey(activeVesselId ?? 0) },
  });

  const { data: cylinders } = useListCylinders(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getListCylindersQueryKey(activeVesselId ?? 0) },
  });

  const createComp = useCreateComponent();
  const updateComp = useUpdateComponent();
  const deleteComp = useDeleteComponent();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      componentId: "",
      componentType: "Piston Crown",
      condition: "New",
      currentStatus: "Onboard Spare",
      currentLocation: "Onboard Spare",
      totalAccumulatedRh: 0,
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    if (editingId) {
      updateComp.mutate(
        { vesselId: activeVesselId!, componentId: editingId, data },
        {
          onSuccess: () => {
            toast({ title: "Component updated" });
            queryClient.invalidateQueries({ queryKey: getListComponentsQueryKey(activeVesselId!) });
            setIsEditOpen(false);
            setEditingId(null);
          },
          onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
        }
      );
    } else {
      createComp.mutate(
        { vesselId: activeVesselId!, data },
        {
          onSuccess: () => {
            toast({ title: "Component created" });
            queryClient.invalidateQueries({ queryKey: getListComponentsQueryKey(activeVesselId!) });
            setIsAddOpen(false);
            form.reset();
          },
          onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
        }
      );
    }
  };

  const openEdit = (comp: any) => {
    form.reset({
      componentId: comp.componentId,
      componentType: comp.componentType,
      condition: comp.condition,
      currentStatus: comp.currentStatus,
      currentLocation: comp.currentLocation || "",
      totalAccumulatedRh: comp.totalAccumulatedRh,
      fittedAtMeRh: comp.fittedAtMeRh,
      overhaulRh: comp.overhaulRh ?? null,
      warningRh: comp.warningRh ?? null,
      remarks: comp.remarks || "",
    });
    setEditingId(comp.componentId);
    setIsEditOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm(`Delete component ${id}? This cannot be undone.`)) return;
    deleteComp.mutate(
      { vesselId: activeVesselId!, componentId: id },
      {
        onSuccess: () => {
          toast({ title: "Component deleted" });
          queryClient.invalidateQueries({ queryKey: getListComponentsQueryKey(activeVesselId!) });
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const orphaned = (components ?? []).filter(
    (c) => c.currentStatus === "In Service" && !isCylLocation(c.currentLocation ?? "")
  );

  const cylList = cylinders ?? [];

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog
          open={isAddOpen}
          onOpenChange={(open) => {
            if (open) {
              form.reset({
                componentId: "", componentType: "Piston Crown", condition: "New",
                currentStatus: "Onboard Spare", currentLocation: "Onboard Spare",
                totalAccumulatedRh: 0,
              });
              setEditingId(null);
            }
            setIsAddOpen(open);
          }}
        >
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Component</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register Component</DialogTitle>
              <DialogDescription>Add a new component to the vessel inventory.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <ComponentForm
                form={form}
                cylinders={cylList}
                onSubmit={onSubmit}
                isPending={createComp.isPending}
                editingId={null}
                onCancel={() => setIsAddOpen(false)}
              />
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Component</DialogTitle>
            <DialogDescription>Update component details.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <ComponentForm
              form={form}
              cylinders={cylList}
              onSubmit={onSubmit}
              isPending={updateComp.isPending}
              editingId={editingId}
              onCancel={() => { setIsEditOpen(false); setEditingId(null); }}
            />
          </Form>
        </DialogContent>
      </Dialog>

      {orphaned.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-600 dark:text-yellow-500 shrink-0" />
          <div>
            <p className="font-semibold text-yellow-800 dark:text-yellow-300">
              {orphaned.length} In-Service {orphaned.length === 1 ? "component" : "components"} not assigned to a cylinder
            </p>
            <p className="text-yellow-700 dark:text-yellow-400 mt-0.5">
              {orphaned.map(c => c.componentId).join(", ")} — edit {orphaned.length === 1 ? "it" : "them"} to assign to a cylinder unit, or use the Cylinders page to fit directly.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[65vh] overflow-y-auto">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Component ID</TableHead>
                <TableHead>Type &amp; Condition</TableHead>
                <TableHead>Status &amp; Location</TableHead>
                <TableHead className="text-right">Live RH</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {components && components.length > 0 ? (
                components.map((comp) => {
                  const isOrphaned =
                    comp.currentStatus === "In Service" && !isCylLocation(comp.currentLocation ?? "");
                  return (
                    <TableRow key={comp.componentId} className={isOrphaned ? "bg-yellow-50/60 dark:bg-yellow-950/20" : undefined}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold">{comp.componentId}</span>
                          {isOrphaned && (
                            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" aria-label="Not assigned to a cylinder" />
                          )}
                        </div>
                        {comp.alertStatus && comp.currentStatus === "In Service" && (
                          <StatusBadge status={comp.alertStatus} label={getStatusLabel(comp.alertStatus, "life")} className="mt-1" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{comp.componentType}</div>
                        <div className="text-xs text-muted-foreground">{comp.condition}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`mb-1 ${comp.currentStatus === "In Service" ? "border-primary text-primary" : ""}`}
                        >
                          {comp.currentStatus}
                        </Badge>
                        <div className="text-xs text-muted-foreground">{comp.currentLocation || "—"}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-mono font-bold text-primary">
                          {comp.liveRh?.toLocaleString() ?? comp.totalAccumulatedRh.toLocaleString()}
                        </div>
                        {comp.effectiveOverhaulRh != null && (
                          <>
                            <div className="text-xs text-muted-foreground mb-1">
                              / {comp.effectiveOverhaulRh.toLocaleString()} hr
                              {comp.overhaulRh != null && <span className="ml-1 text-blue-500">(custom)</span>}
                              <div className="text-[9px] uppercase tracking-wide">Expected Life</div>
                            </div>
                            <RhProgressBar
                              liveRh={comp.liveRh ?? comp.totalAccumulatedRh}
                              effectiveOverhaulRh={comp.effectiveOverhaulRh}
                              alertStatus={comp.alertStatus ?? "OK"}
                            />
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(comp)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(comp.componentId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No components found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Components() {
  const [activeTab, setActiveTab] = useState("pistons");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Components Master</h1>
        <p className="text-muted-foreground">Manage all components across the vessel.</p>
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
          <PistonComponentsPanel />
        </TabsContent>
        <TabsContent value="fuel" className="mt-4">
          <ValveComponentsPanel valveType="fuel" />
        </TabsContent>
        <TabsContent value="exhaust" className="mt-4">
          <ValveComponentsPanel valveType="exhaust" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
