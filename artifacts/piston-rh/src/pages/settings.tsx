import { useEffect, useRef, useState } from "react";
import { useVesselContext } from "@/contexts/VesselContext";
import { useAuth } from "@/contexts/AuthContext";
import { UsersManagementCard } from "@/pages/settings-users";
import {
  useGetVessel,
  useUpdateVessel,
  useDeleteVessel,
  useResetVesselData,
  useRecalculateComponentRh,
  useListComponentTypeThresholds,
  useCreateComponentTypeThreshold,
  useUpdateComponentTypeThreshold,
  useDeleteComponentTypeThreshold,
  useListComponents,
  useListValveComponents,
  getGetVesselQueryKey,
  getListVesselsQueryKey,
  getListComponentTypeThresholdsQueryKey,
  getListComponentsQueryKey,
  getListValveComponentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Trash2, AlertTriangle, Save, Plus, Edit, Check, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PRESET_TYPES: { category: string; types: string[] }[] = [
  { category: "Piston", types: ["Piston Crown", "Piston Skirt", "Piston Rod", "Ring No.1", "Ring No.2", "Ring No.3", "Ring No.4"] },
  { category: "Fuel Valve", types: ["Fuel Valve Body", "Nozzle Tip", "Spindle"] },
  { category: "Exhaust Valve", types: ["Exhaust Valve Disc", "Exhaust Valve Seat", "Exhaust Valve Spindle"] },
];

function ComponentTypeThresholdsCard({ vesselId }: { vesselId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ overhaulRh: string; warningRh: string }>({ overhaulRh: "", warningRh: "" });
  const [newRow, setNewRow] = useState({ category: "Piston", componentType: "", overhaulRh: "", warningRh: "" });
  const [quickAddValues, setQuickAddValues] = useState<Record<string, { overhaulRh: string; warningRh: string }>>({});

  const { data: thresholds, isLoading } = useListComponentTypeThresholds(vesselId, {
    query: { enabled: !!vesselId, queryKey: getListComponentTypeThresholdsQueryKey(vesselId) },
  });
  const { data: pistonComps } = useListComponents(vesselId, {
    query: { enabled: !!vesselId, queryKey: getListComponentsQueryKey(vesselId) },
  });
  const { data: fuelComps } = useListValveComponents(vesselId, "fuel", {
    query: { enabled: !!vesselId, queryKey: getListValveComponentsQueryKey(vesselId, "fuel") },
  });
  const { data: exhaustComps } = useListValveComponents(vesselId, "exhaust", {
    query: { enabled: !!vesselId, queryKey: getListValveComponentsQueryKey(vesselId, "exhaust") },
  });
  const createThresh = useCreateComponentTypeThreshold();
  const updateThresh = useUpdateComponentTypeThreshold();
  const deleteThresh = useDeleteComponentTypeThreshold();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListComponentTypeThresholdsQueryKey(vesselId) });

  // Component types actually registered on this vessel that don't have a threshold
  // configured yet — surfaced so the user doesn't have to know/pick the type name
  // from a preset list first.
  const configuredTypes = new Set((thresholds ?? []).map(t => t.componentType));
  const inUseTypes: { category: string; componentType: string }[] = [];
  const seen = new Set<string>();
  for (const c of pistonComps ?? []) {
    if (!configuredTypes.has(c.componentType) && !seen.has(c.componentType)) {
      seen.add(c.componentType);
      inUseTypes.push({ category: "Piston", componentType: c.componentType });
    }
  }
  for (const c of fuelComps ?? []) {
    if (!configuredTypes.has(c.componentType) && !seen.has(c.componentType)) {
      seen.add(c.componentType);
      inUseTypes.push({ category: "Fuel Valve", componentType: c.componentType });
    }
  }
  for (const c of exhaustComps ?? []) {
    if (!configuredTypes.has(c.componentType) && !seen.has(c.componentType)) {
      seen.add(c.componentType);
      inUseTypes.push({ category: "Exhaust Valve", componentType: c.componentType });
    }
  }

  const handleQuickAdd = (category: string, componentType: string) => {
    const vals = quickAddValues[componentType];
    if (!vals?.overhaulRh || !vals?.warningRh) {
      toast({ title: "Enter both values", variant: "destructive" }); return;
    }
    createThresh.mutate(
      { vesselId, data: { category, componentType, overhaulRh: parseInt(vals.overhaulRh), warningRh: parseInt(vals.warningRh) } },
      {
        onSuccess: () => {
          toast({ title: "Threshold saved" });
          invalidate();
          setQuickAddValues(v => { const next = { ...v }; delete next[componentType]; return next; });
        },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleAdd = () => {
    if (!newRow.componentType || !newRow.overhaulRh || !newRow.warningRh) {
      toast({ title: "Fill all fields", variant: "destructive" }); return;
    }
    createThresh.mutate(
      { vesselId, data: { category: newRow.category, componentType: newRow.componentType, overhaulRh: parseInt(newRow.overhaulRh), warningRh: parseInt(newRow.warningRh) } },
      {
        onSuccess: () => { toast({ title: "Threshold saved" }); invalidate(); setAdding(false); setNewRow({ category: "Piston", componentType: "", overhaulRh: "", warningRh: "" }); },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  };

  const startEdit = (t: { id: number; overhaulRh: number; warningRh: number }) => {
    setEditingId(t.id);
    setEditValues({ overhaulRh: String(t.overhaulRh), warningRh: String(t.warningRh) });
  };

  const handleSaveEdit = (id: number) => {
    updateThresh.mutate(
      { vesselId, id, data: { overhaulRh: parseInt(editValues.overhaulRh), warningRh: parseInt(editValues.warningRh) } },
      {
        onSuccess: () => { toast({ title: "Updated" }); invalidate(); setEditingId(null); },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Delete threshold for "${name}"?`)) return;
    deleteThresh.mutate(
      { vesselId, id },
      {
        onSuccess: () => { toast({ title: "Deleted" }); invalidate(); },
        onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  };

  const availableTypes = (category: string) => PRESET_TYPES.find(p => p.category === category)?.types ?? [];
  const existingTypes = new Set((thresholds ?? []).map(t => t.componentType));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Component Type Thresholds</CardTitle>
            <CardDescription className="mt-1">
              Set the expected life (RH) per component type. Takes priority over vessel defaults; individual component overrides take highest priority. Types already registered on this vessel without a threshold are listed automatically below.
            </CardDescription>
          </div>
          {!adding && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Type
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center p-6"><Loader2 className="animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Component Type</TableHead>
                <TableHead className="text-right">Expected Life (RH)</TableHead>
                <TableHead className="text-right">Warning (RH)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adding && (
                <TableRow className="bg-blue-50/60 dark:bg-blue-950/20">
                  <TableCell>
                    <Select value={newRow.category} onValueChange={(v) => setNewRow(r => ({ ...r, category: v, componentType: "" }))}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRESET_TYPES.map(p => <SelectItem key={p.category} value={p.category}>{p.category}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={newRow.componentType} onValueChange={(v) => setNewRow(r => ({ ...r, componentType: v }))}>
                      <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {availableTypes(newRow.category).filter(t => !existingTypes.has(t)).map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                        <SelectItem value="__custom__">Custom…</SelectItem>
                      </SelectContent>
                    </Select>
                    {newRow.componentType === "__custom__" && (
                      <Input className="mt-1 h-7 text-xs" placeholder="Type name" onBlur={(e) => setNewRow(r => ({ ...r, componentType: e.target.value || "__custom__" }))} />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input className="h-8 w-24 text-right ml-auto" type="number" placeholder="e.g. 24000" value={newRow.overhaulRh} onChange={e => setNewRow(r => ({ ...r, overhaulRh: e.target.value }))} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input className="h-8 w-24 text-right ml-auto" type="number" placeholder="e.g. 20000" value={newRow.warningRh} onChange={e => setNewRow(r => ({ ...r, warningRh: e.target.value }))} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={handleAdd} disabled={createThresh.isPending}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAdding(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {inUseTypes.map(({ category, componentType }) => (
                <TableRow key={`quick-${componentType}`} className="bg-amber-50/60 dark:bg-amber-950/20">
                  <TableCell className="text-muted-foreground text-sm">{category}</TableCell>
                  <TableCell className="font-medium">
                    {componentType}
                    <div className="text-[10px] text-muted-foreground font-normal">registered, no Expected Life set</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="h-8 w-24 text-right ml-auto" type="number" placeholder="e.g. 24000"
                      value={quickAddValues[componentType]?.overhaulRh ?? ""}
                      onChange={e => setQuickAddValues(v => ({ ...v, [componentType]: { overhaulRh: e.target.value, warningRh: v[componentType]?.warningRh ?? "" } }))}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="h-8 w-24 text-right ml-auto" type="number" placeholder="e.g. 20000"
                      value={quickAddValues[componentType]?.warningRh ?? ""}
                      onChange={e => setQuickAddValues(v => ({ ...v, [componentType]: { overhaulRh: v[componentType]?.overhaulRh ?? "", warningRh: e.target.value } }))}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleQuickAdd(category, componentType)} disabled={createThresh.isPending}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(thresholds ?? []).length === 0 && !adding && inUseTypes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No type-level thresholds set. Vessel defaults apply to all components.
                  </TableCell>
                </TableRow>
              )}
              {(thresholds ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-muted-foreground text-sm">{t.category}</TableCell>
                  <TableCell className="font-medium">{t.componentType}</TableCell>
                  <TableCell className="text-right">
                    {editingId === t.id ? (
                      <Input className="h-7 w-24 text-right ml-auto" type="number" value={editValues.overhaulRh} onChange={e => setEditValues(v => ({ ...v, overhaulRh: e.target.value }))} />
                    ) : (
                      <span className="font-mono">{t.overhaulRh.toLocaleString()}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingId === t.id ? (
                      <Input className="h-7 w-24 text-right ml-auto" type="number" value={editValues.warningRh} onChange={e => setEditValues(v => ({ ...v, warningRh: e.target.value }))} />
                    ) : (
                      <span className="font-mono">{t.warningRh.toLocaleString()}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingId === t.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleSaveEdit(t.id)} disabled={updateThresh.isPending}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(t)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(t.id, t.componentType)} disabled={deleteThresh.isPending}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const formSchema = z.object({
  vesselName: z.string().min(2),
  imoNumber: z.string().optional(),
  vesselType: z.string().optional(),
  engineMake: z.string().optional(),
  engineModel: z.string().optional(),
  numCylinders: z.coerce.number().min(1).max(14),
  crownOverhaulRh: z.coerce.number().min(0),
  crownWarningRh: z.coerce.number().min(0),
  dismantlingWarningRh: z.coerce.number().min(0),
  fuelValveOverhaulRh: z.coerce.number().min(0),
  fuelValveWarningRh: z.coerce.number().min(0),
  fuelValveSlotsPerCyl: z.coerce.number().min(1).max(6),
  exhaustValveOverhaulRh: z.coerce.number().min(0),
  exhaustValveWarningRh: z.coerce.number().min(0),
});

export default function Settings() {
  const { activeVesselId } = useVesselContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: vessel, isLoading } = useGetVessel(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getGetVesselQueryKey(activeVesselId ?? 0) }
  });

  const updateVessel = useUpdateVessel();
  const deleteVessel = useDeleteVessel();
  const resetData = useResetVesselData();
  const recalcRh = useRecalculateComponentRh();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vesselName: "",
      imoNumber: "",
      vesselType: "",
      engineMake: "",
      engineModel: "",
      numCylinders: 6,
      crownOverhaulRh: 16000,
      crownWarningRh: 15000,
      dismantlingWarningRh: 8000,
      fuelValveOverhaulRh: 4000,
      fuelValveWarningRh: 3500,
      fuelValveSlotsPerCyl: 2,
      exhaustValveOverhaulRh: 8000,
      exhaustValveWarningRh: 7000,
    },
  });

  const initialized = useRef(false);
  useEffect(() => {
    if (vessel && !initialized.current) {
      form.reset({
        vesselName: vessel.vesselName,
        imoNumber: vessel.imoNumber || "",
        vesselType: vessel.vesselType || "",
        engineMake: vessel.engineMake || "",
        engineModel: vessel.engineModel || "",
        numCylinders: vessel.numCylinders,
        crownOverhaulRh: vessel.crownOverhaulRh,
        crownWarningRh: vessel.crownWarningRh,
        dismantlingWarningRh: vessel.dismantlingWarningRh,
        fuelValveOverhaulRh: vessel.fuelValveOverhaulRh ?? 4000,
        fuelValveWarningRh: vessel.fuelValveWarningRh ?? 3500,
        fuelValveSlotsPerCyl: vessel.fuelValveSlotsPerCyl ?? 2,
        exhaustValveOverhaulRh: vessel.exhaustValveOverhaulRh ?? 8000,
        exhaustValveWarningRh: vessel.exhaustValveWarningRh ?? 7000,
      });
      initialized.current = true;
    }
  }, [vessel, form]);

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    updateVessel.mutate(
      { vesselId: activeVesselId!, data },
      {
        onSuccess: () => {
          toast({ title: "Settings saved" });
          queryClient.invalidateQueries({ queryKey: getGetVesselQueryKey(activeVesselId!) });
          queryClient.invalidateQueries({ queryKey: getListVesselsQueryKey() });
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
      }
    );
  };

  const handleRecalculate = () => {
    recalcRh.mutate(
      { vesselId: activeVesselId! },
      {
        onSuccess: (res) => {
          toast({ title: "Recalculation complete", description: `Updated ${res.count} components.` });
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
      }
    );
  };

  const handleResetData = () => {
    const confirmText = prompt("Type 'RESET' to delete all operational data for this vessel (Vessel profile and components remain).");
    if (confirmText !== "RESET") return;
    
    resetData.mutate(
      { vesselId: activeVesselId! },
      {
        onSuccess: () => {
          toast({ title: "Data Reset", description: "Operational data has been cleared." });
          window.location.reload();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
      }
    );
  };

  const handleDeleteVessel = () => {
    const confirmText = prompt(`Type 'DELETE ${vessel?.vesselName}' to permanently delete this vessel and all its data.`);
    if (confirmText !== `DELETE ${vessel?.vesselName}`) return;
    
    deleteVessel.mutate(
      { vesselId: activeVesselId! },
      {
        onSuccess: () => {
          toast({ title: "Vessel Deleted" });
          window.location.reload();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
      }
    );
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vessel Settings</h1>
        <p className="text-muted-foreground">Manage profile, thresholds, and administrative actions.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vessel Profile</CardTitle>
          <CardDescription>Basic information and engine details.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form id="settings-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-2 border-b pb-2">Identity</h3>
                  <FormField control={form.control} name="vesselName" render={({ field }) => (
                    <FormItem><FormLabel>Vessel Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="imoNumber" render={({ field }) => (
                    <FormItem><FormLabel>IMO Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="vesselType" render={({ field }) => (
                    <FormItem><FormLabel>Vessel Type</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="numCylinders" render={({ field }) => (
                    <FormItem><FormLabel>Number of Cylinders</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-2 border-b pb-2">Engine</h3>
                  <FormField control={form.control} name="engineMake" render={({ field }) => (
                    <FormItem><FormLabel>Engine Make</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="engineModel" render={({ field }) => (
                    <FormItem><FormLabel>Engine Model</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-2 border-b pb-2">Unit Default Thresholds</h3>
                  <p className="text-xs text-muted-foreground -mt-2 mb-2">Applied to all piston components unless overridden per-component.</p>
                  <FormField control={form.control} name="crownOverhaulRh" render={({ field }) => (
                    <FormItem><FormLabel>Crown Overhaul Interval (RH)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="crownWarningRh" render={({ field }) => (
                    <FormItem><FormLabel>Crown Warning (RH)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="dismantlingWarningRh" render={({ field }) => (
                    <FormItem><FormLabel>Dismantling Warning (RH)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-2 border-b pb-2">Fuel Valve Default Thresholds</h3>
                  <p className="text-xs text-muted-foreground -mt-2 mb-2">Applied to all fuel valve components unless overridden per-component.</p>
                  <FormField control={form.control} name="fuelValveOverhaulRh" render={({ field }) => (
                    <FormItem><FormLabel>Overhaul Interval (RH)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="fuelValveWarningRh" render={({ field }) => (
                    <FormItem><FormLabel>Warning Threshold (RH)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="fuelValveSlotsPerCyl" render={({ field }) => (
                    <FormItem><FormLabel>Slots per Cylinder</FormLabel><FormControl><Input type="number" min={1} max={6} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-2 border-b pb-2">Exhaust Valve Default Thresholds</h3>
                  <p className="text-xs text-muted-foreground -mt-2 mb-2">Applied to all exhaust valve components unless overridden per-component.</p>
                  <FormField control={form.control} name="exhaustValveOverhaulRh" render={({ field }) => (
                    <FormItem><FormLabel>Overhaul Interval (RH)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="exhaustValveWarningRh" render={({ field }) => (
                    <FormItem><FormLabel>Warning Threshold (RH)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="bg-muted/30 border-t justify-end py-4">
          <Button type="submit" form="settings-form" disabled={updateVessel.isPending}>
            {updateVessel.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Settings
          </Button>
        </CardFooter>
      </Card>

      <ComponentTypeThresholdsCard vesselId={activeVesselId!} />

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Maintenance Actions</CardTitle>
            <CardDescription>Tools for data integrity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="justify-start" onClick={handleRecalculate} disabled={recalcRh.isPending}>
                <RefreshCw className={`mr-2 h-4 w-4 ${recalcRh.isPending ? 'animate-spin' : ''}`} />
                Recalculate Component Live RH
              </Button>
              <p className="text-xs text-muted-foreground">Forces a manual re-sync of all component live RH based on movements and ME RH logs.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-lg text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Danger Zone
            </CardTitle>
            <CardDescription>Destructive actions cannot be undone.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="justify-start text-destructive hover:bg-destructive/10" onClick={handleResetData} disabled={resetData.isPending}>
                <Trash2 className="mr-2 h-4 w-4" /> Reset Operational Data
              </Button>
              <p className="text-xs text-muted-foreground">Clears RH logs, movements, and cylinder assignments.</p>
            </div>
            <Separator />
            <div className="flex flex-col gap-2">
              <Button variant="destructive" className="justify-start" onClick={handleDeleteVessel} disabled={deleteVessel.isPending}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete Vessel Entirely
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {user?.role === "technical_office" && <UsersManagementCard />}
    </div>
  );
}
