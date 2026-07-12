import { Fragment, useState } from "react";
import { useVesselContext } from "@/contexts/VesselContext";
import {
  useListValveComponents,
  useCreateValveComponent,
  useUpdateValveComponent,
  useDeleteValveComponent,
  getListValveComponentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/badge-status";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Pencil, Flame, Wind, CornerDownRight } from "lucide-react";
import { getStatusLabel } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

type ValveType = "fuel" | "exhaust";

const STATUSES = ["Onboard Spare", "In Service", "Landed Ashore", "Under Reconditioning", "Scrapped"];
const CONDITIONS = ["New", "Reconditioned", "Used", "Worn"];

const formSchema = z.object({
  componentId: z.string().min(1, "Required"),
  componentType: z.string().min(1, "Required"),
  condition: z.string().min(1, "Required"),
  currentStatus: z.string().min(1, "Required"),
  currentLocation: z.string().optional(),
  totalAccumulatedRh: z.coerce.number().min(0),
  overhaulRh: z.coerce.number().min(1).optional().nullable(),
  warningRh: z.coerce.number().min(1).optional().nullable(),
  parentComponentId: z.coerce.number().optional().nullable(),
  lastOverhaulDate: z.string().optional(),
  lastOverhaulRh: z.coerce.number().min(0).optional().nullable(),
  remarks: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const editSchema = formSchema.omit({ componentId: true });
type EditValues = z.infer<typeof editSchema>;

export function ValveComponentsPanel({ valveType }: { valveType: ValveType }) {
  const { activeVesselId } = useVesselContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<{ componentId: string } & Partial<FormValues> | null>(null);

  const { data: comps, isLoading } = useListValveComponents(activeVesselId!, valveType, {
    query: { enabled: !!activeVesselId, queryKey: getListValveComponentsQueryKey(activeVesselId ?? 0, valveType) },
  });

  const createComp = useCreateValveComponent();
  const updateComp = useUpdateValveComponent();
  const deleteComp = useDeleteValveComponent();

  const label = valveType === "fuel" ? "Fuel Valve" : "Exhaust Valve";

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListValveComponentsQueryKey(activeVesselId!, valveType) });

  const addForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { componentId: "", componentType: "", condition: "New", currentStatus: "Onboard Spare", currentLocation: "", totalAccumulatedRh: 0, overhaulRh: null, warningRh: null, parentComponentId: null, lastOverhaulDate: "", lastOverhaulRh: null, remarks: "" },
  });

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { componentType: "", condition: "New", currentStatus: "Onboard Spare", currentLocation: "", totalAccumulatedRh: 0, overhaulRh: null, warningRh: null, parentComponentId: null, lastOverhaulDate: "", lastOverhaulRh: null, remarks: "" },
  });

  // A top-level Fuel/Exhaust Valve's own threshold is its "Overhaul Interval";
  // a child (nozzle, spring, etc.) attached to a parent uses "Expected Life" instead.
  const addIsChild = useWatch({ control: addForm.control, name: "parentComponentId" }) != null;
  const editIsChild = useWatch({ control: editForm.control, name: "parentComponentId" }) != null;
  const addThresholdLabel = addIsChild ? "Expected Life (hrs)" : "Overhaul Interval (hrs)";
  const editThresholdLabel = editIsChild ? "Expected Life (hrs)" : "Overhaul Interval (hrs)";

  const onAdd = (data: FormValues) => {
    createComp.mutate(
      { vesselId: activeVesselId!, valveType, data: { componentId: data.componentId, componentType: data.componentType, condition: data.condition, currentStatus: data.currentStatus, currentLocation: data.currentLocation || data.currentStatus, totalAccumulatedRh: data.totalAccumulatedRh, overhaulRh: data.overhaulRh ?? undefined, warningRh: data.warningRh ?? undefined, parentComponentId: data.parentComponentId ?? undefined, lastOverhaulDate: data.lastOverhaulDate || null, lastOverhaulRh: data.lastOverhaulRh ?? null, remarks: data.remarks } },
      {
        onSuccess: () => { toast({ title: `${label} component added` }); invalidate(); setIsAddOpen(false); addForm.reset(); },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const onEdit = (data: EditValues) => {
    if (!editingComp) return;
    updateComp.mutate(
      { vesselId: activeVesselId!, valveType, componentId: editingComp.componentId, data: { componentType: data.componentType, condition: data.condition, currentStatus: data.currentStatus, currentLocation: data.currentLocation, totalAccumulatedRh: data.totalAccumulatedRh, overhaulRh: data.overhaulRh ?? undefined, warningRh: data.warningRh ?? undefined, parentComponentId: data.parentComponentId ?? null, lastOverhaulDate: data.lastOverhaulDate || null, lastOverhaulRh: data.lastOverhaulRh ?? null, remarks: data.remarks } },
      {
        onSuccess: () => { toast({ title: "Component updated" }); invalidate(); setEditingComp(null); },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const onDelete = (componentId: string) => {
    if (!confirm(`Delete component ${componentId}?`)) return;
    deleteComp.mutate(
      { vesselId: activeVesselId!, valveType, componentId },
      {
        onSuccess: () => { toast({ title: "Component deleted" }); invalidate(); },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const openEdit = (comp: NonNullable<typeof comps>[number]) => {
    editForm.reset({ componentType: comp.componentType, condition: comp.condition, currentStatus: comp.currentStatus, currentLocation: comp.currentLocation, totalAccumulatedRh: comp.totalAccumulatedRh, overhaulRh: comp.overhaulRh ?? null, warningRh: comp.warningRh ?? null, parentComponentId: comp.parentComponentId ?? null, lastOverhaulDate: comp.lastOverhaulDate ?? "", lastOverhaulRh: comp.lastOverhaulRh ?? null, remarks: comp.remarks ?? "" });
    setEditingComp({ componentId: comp.componentId });
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;

  const fuelTypes = ["Fuel Injector", "Fuel Valve", "Fuel Nozzle", "Fuel Atomizer"];
  const exhaustTypes = ["Exhaust Valve", "Exhaust Valve Spindle", "Exhaust Valve Seat", "Exhaust Valve Cage"];
  const suggestedTypes = valveType === "fuel" ? fuelTypes : exhaustTypes;

  // Only top-level components (not themselves a child) can be a parent.
  const editingCompId = comps?.find((c) => c.componentId === editingComp?.componentId)?.id;
  const possibleParents = (comps ?? []).filter((c) => c.parentComponentId == null && c.id !== editingCompId);
  const NO_PARENT = "none";

  const topLevelComps = (comps ?? []).filter((c) => c.parentComponentId == null);
  const childrenByParentId = new Map<number, NonNullable<typeof comps>>();
  for (const c of comps ?? []) {
    if (c.parentComponentId != null) {
      const arr = childrenByParentId.get(c.parentComponentId) ?? [];
      arr.push(c);
      childrenByParentId.set(c.parentComponentId, arr);
    }
  }

  return (
    <div className="space-y-4">
      {/* Add dialog */}
      <div className="flex justify-end">
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Add {label}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add {label} Component</DialogTitle>
              <DialogDescription>Register a new {label.toLowerCase()} component for this vessel.</DialogDescription>
            </DialogHeader>
            <Form {...addForm}>
              <form onSubmit={addForm.handleSubmit(onAdd)} className="space-y-4">
                <FormField control={addForm.control} name="componentId" render={({ field }) => (
                  <FormItem><FormLabel>Component ID</FormLabel><FormControl><Input placeholder={valveType === "fuel" ? "e.g. FV-C1-A" : "e.g. EV-C1"} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={addForm.control} name="componentType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Component Type</FormLabel>
                    <FormControl>
                      <Input list={`valve-type-list-${valveType}`} placeholder={suggestedTypes[0]} {...field} />
                    </FormControl>
                    <datalist id={`valve-type-list-${valveType}`}>
                      {suggestedTypes.map((t) => <option key={t} value={t} />)}
                    </datalist>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={addForm.control} name="parentComponentId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Component (optional)</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === NO_PARENT ? null : Number(v))}
                      value={field.value == null ? NO_PARENT : String(field.value)}
                    >
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NO_PARENT}>None — top-level component</SelectItem>
                        {(comps ?? []).filter((c) => c.parentComponentId == null).map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.componentId} ({c.componentType})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      Choose the parent {label.toLowerCase()} if this is a nozzle, spring, or other sub-part — its location, status, and running hours will be inherited from the parent.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={addForm.control} name="condition" render={({ field }) => (
                    <FormItem><FormLabel>Condition</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select><FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={addForm.control} name="currentStatus" render={({ field }) => (
                    <FormItem><FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select><FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={addForm.control} name="totalAccumulatedRh" render={({ field }) => (
                  <FormItem><FormLabel>Accumulated RH (hrs)</FormLabel><FormControl><Input type="number" step="1" min={0} {...field} /></FormControl><FormDescription className="text-xs">Previously accumulated running hours before adding to this record.</FormDescription><FormMessage /></FormItem>
                )} />
                <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Last Overhaul (optional)</p>
                  <p className="text-xs text-muted-foreground">When set, the overhaul-due status counts hours run since this overhaul instead of lifetime hours.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={addForm.control} name="lastOverhaulDate" render={({ field }) => (
                      <FormItem><FormLabel>Overhaul Date</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={addForm.control} name="lastOverhaulRh" render={({ field }) => (
                      <FormItem><FormLabel>Overhauled at RH (hrs)</FormLabel><FormControl>
                        <Input type="number" step="1" min={0} placeholder="Component RH at overhaul" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                      </FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>
                <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Individual Thresholds (optional)</p>
                  <p className="text-xs text-muted-foreground">Override vessel-level defaults for this component only.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={addForm.control} name="overhaulRh" render={({ field }) => (
                      <FormItem><FormLabel>{addThresholdLabel}</FormLabel><FormControl>
                        <Input type="number" step="100" min={1} placeholder="Vessel default" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                      </FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={addForm.control} name="warningRh" render={({ field }) => (
                      <FormItem><FormLabel>Warning Limit (hrs)</FormLabel><FormControl>
                        <Input type="number" step="100" min={1} placeholder="Vessel default" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                      </FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>
                <FormField control={addForm.control} name="remarks" render={({ field }) => (
                  <FormItem><FormLabel>Remarks</FormLabel><FormControl><Textarea placeholder="Optional notes" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setIsAddOpen(false); addForm.reset(); }}>Cancel</Button>
                  <Button type="submit" disabled={createComp.isPending}>{createComp.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editingComp} onOpenChange={(o) => !o && setEditingComp(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Component — {editingComp?.componentId}</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
              <FormField control={editForm.control} name="componentType" render={({ field }) => (
                <FormItem><FormLabel>Component Type</FormLabel>
                  <FormControl><Input list={`valve-edit-type-list-${valveType}`} {...field} /></FormControl>
                  <datalist id={`valve-edit-type-list-${valveType}`}>{suggestedTypes.map((t) => <option key={t} value={t} />)}</datalist>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="parentComponentId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Component (optional)</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === NO_PARENT ? null : Number(v))}
                    value={field.value == null ? NO_PARENT : String(field.value)}
                  >
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value={NO_PARENT}>None — top-level component</SelectItem>
                      {possibleParents.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.componentId} ({c.componentType})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    Choose the parent {label.toLowerCase()} if this is a nozzle, spring, or other sub-part — its location, status, and running hours will be inherited from the parent.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="condition" render={({ field }) => (
                  <FormItem><FormLabel>Condition</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="currentStatus" render={({ field }) => (
                  <FormItem><FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={editForm.control} name="totalAccumulatedRh" render={({ field }) => (
                <FormItem><FormLabel>Total Accumulated RH (hrs)</FormLabel><FormControl><Input type="number" step="1" min={0} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Last Overhaul (optional)</p>
                <p className="text-xs text-muted-foreground">When set, the overhaul-due status counts hours run since this overhaul instead of lifetime hours.</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={editForm.control} name="lastOverhaulDate" render={({ field }) => (
                    <FormItem><FormLabel>Overhaul Date</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={editForm.control} name="lastOverhaulRh" render={({ field }) => (
                    <FormItem><FormLabel>Overhauled at RH (hrs)</FormLabel><FormControl>
                      <Input type="number" step="1" min={0} placeholder="Component RH at overhaul" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                    </FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>
              <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Individual Thresholds (optional)</p>
                <p className="text-xs text-muted-foreground">Override vessel-level defaults for this component only.</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={editForm.control} name="overhaulRh" render={({ field }) => (
                    <FormItem><FormLabel>{editThresholdLabel}</FormLabel><FormControl>
                      <Input type="number" step="100" min={1} placeholder="Vessel default" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                    </FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={editForm.control} name="warningRh" render={({ field }) => (
                    <FormItem><FormLabel>Warning Limit (hrs)</FormLabel><FormControl>
                      <Input type="number" step="100" min={1} placeholder="Vessel default" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                    </FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>
              <FormField control={editForm.control} name="remarks" render={({ field }) => (
                <FormItem><FormLabel>Remarks</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingComp(null)}>Cancel</Button>
                <Button type="submit" disabled={updateComp.isPending}>{updateComp.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[65vh] overflow-y-auto">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Status / Location</TableHead>
                <TableHead>Last O/H Date</TableHead>
                <TableHead className="text-right">Live RH</TableHead>
                <TableHead>Alert</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topLevelComps.length > 0 ? topLevelComps.map((comp) => (
                <Fragment key={comp.componentId}>
                  <TableRow>
                    <TableCell className="font-semibold">{comp.componentId}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{comp.componentType}</TableCell>
                    <TableCell className="text-sm">{comp.condition}</TableCell>
                    <TableCell>
                      <div className="text-sm">{comp.currentStatus}</div>
                      {comp.currentLocation !== comp.currentStatus && (
                        <div className="text-xs text-muted-foreground">{comp.currentLocation}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {comp.lastOverhaulDate ?? "—"}
                      {comp.lastOverhaulRh != null && (
                        <div className="text-xs">at {comp.lastOverhaulRh.toLocaleString()} hr</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {(comp.liveRh ?? comp.totalAccumulatedRh).toLocaleString()}
                      {comp.lastOverhaulRh != null && comp.rhSinceOverhaul != null && (
                        <div className="text-xs text-muted-foreground font-normal">{comp.rhSinceOverhaul.toLocaleString()} since O/H</div>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={comp.alertStatus ?? "OK"} label={getStatusLabel(comp.alertStatus ?? "OK", "overhaul")} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(comp)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(comp.componentId)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {(childrenByParentId.get(comp.id) ?? []).map((child) => (
                    <TableRow key={child.componentId} className="bg-muted/30">
                      <TableCell className="pl-8">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <CornerDownRight className="h-3.5 w-3.5" />
                          <span className="font-semibold text-foreground">{child.componentId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{child.componentType}</TableCell>
                      <TableCell className="text-sm">{child.condition}</TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">Inherited from {comp.componentId}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {child.lastOverhaulDate ?? "—"}
                        {child.lastOverhaulRh != null && (
                          <div className="text-xs">at {child.lastOverhaulRh.toLocaleString()} hr</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {(child.liveRh ?? child.totalAccumulatedRh).toLocaleString()}
                        {child.lastOverhaulRh != null && child.rhSinceOverhaul != null && (
                          <div className="text-xs text-muted-foreground font-normal">{child.rhSinceOverhaul.toLocaleString()} since O/H</div>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={child.alertStatus ?? "OK"} label={getStatusLabel(child.alertStatus ?? "OK", "life")} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(child)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(child.componentId)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              )) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No {label} components yet. Click <strong>Add {label}</strong> to register one.
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

export default function ValveComponents() {
  const [activeTab, setActiveTab] = useState<ValveType>("fuel");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Valve Components</h1>
        <p className="text-muted-foreground">Manage fuel and exhaust valve component inventory and running hours.</p>
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
          <ValveComponentsPanel valveType="fuel" />
        </TabsContent>
        <TabsContent value="exhaust" className="mt-4">
          <ValveComponentsPanel valveType="exhaust" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
