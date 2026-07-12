import { useState } from "react";
import { useVesselContext } from "@/contexts/VesselContext";
import {
  useListMonthlyRh,
  useAddMonthlyRh,
  useUpdateMonthlyRhEntry,
  useDeleteMonthlyRhEntry,
  getListMonthlyRhQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, CalendarDays, Info, Pencil } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const todayIso = format(new Date(), "yyyy-MM-dd");

// Never let one malformed date (e.g. from a bad import) crash the whole page
function safeFormatDate(iso: string, fmt: string): string {
  const d = parseISO(iso);
  return isNaN(d.getTime()) ? iso : format(d, fmt);
}

const formSchema = z.object({
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a valid date"),
  meTotalRh: z.coerce.number().min(0),
  remarks: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function RhEntryForm({
  form,
  onSubmit,
  isPending,
  onCancel,
  mode,
  latestMeRh,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  onSubmit: (data: FormValues) => void;
  isPending: boolean;
  onCancel: () => void;
  mode: "add" | "edit";
  latestMeRh: number | null;
}) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="logDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date of Reading</FormLabel>
              <FormControl>
                <Input type="date" {...field} max={todayIso} />
              </FormControl>
              <FormDescription className="text-xs">Date on which the ME running-hour counter was read</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="meTotalRh"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ME Total Running Hours</FormLabel>
              <FormControl>
                <Input type="number" step="1" min={0} {...field} />
              </FormControl>
              <FormDescription>
                {mode === "add" && latestMeRh !== null
                  ? `Cumulative counter reading — must be ≥ ${latestMeRh.toLocaleString()} hrs`
                  : "Cumulative hours shown on the ME running-hour counter"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="remarks"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Remarks</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional — e.g. port stay, dry dock, end of month" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "add" ? "Save Entry" : "Update Entry"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default function MonthlyRh() {
  const { activeVesselId } = useVesselContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<{ id: number; logDate: string; meTotalRh: number; remarks?: string | null } | null>(null);

  const { data: logs, isLoading } = useListMonthlyRh(activeVesselId!, {
    query: { enabled: !!activeVesselId, queryKey: getListMonthlyRhQueryKey(activeVesselId ?? 0) },
  });

  const addLog = useAddMonthlyRh();
  const updateLog = useUpdateMonthlyRhEntry();
  const deleteLog = useDeleteMonthlyRhEntry();

  const latestMeRh = logs && logs.length > 0 ? logs[0].meTotalRh : null;
  const isFirstEntry = !logs || logs.length === 0;

  const addForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { logDate: todayIso, meTotalRh: latestMeRh ?? 0, remarks: "" },
  });

  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { logDate: todayIso, meTotalRh: 0, remarks: "" },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListMonthlyRhQueryKey(activeVesselId!) });

  const onAdd = (data: FormValues) => {
    addLog.mutate(
      { vesselId: activeVesselId!, data: { logDate: data.logDate, meTotalRh: data.meTotalRh, remarks: data.remarks } },
      {
        onSuccess: () => {
          toast({ title: "Entry added", description: "RH entry has been recorded." });
          invalidate();
          setIsAddOpen(false);
          addForm.reset({ logDate: todayIso, meTotalRh: data.meTotalRh, remarks: "" });
        },
        onError: (err: any) =>
          toast({ title: "Error", description: err.message || "Failed to add entry", variant: "destructive" }),
      }
    );
  };

  const onEdit = (data: FormValues) => {
    if (!editingEntry) return;
    updateLog.mutate(
      {
        vesselId: activeVesselId!,
        entryId: editingEntry.id,
        data: { logDate: data.logDate, meTotalRh: data.meTotalRh, remarks: data.remarks },
      },
      {
        onSuccess: () => {
          toast({ title: "Entry updated" });
          invalidate();
          setEditingEntry(null);
        },
        onError: (err: any) =>
          toast({ title: "Error", description: err.message || "Failed to update entry", variant: "destructive" }),
      }
    );
  };

  const openEdit = (log: { id: number; logDate: string; meTotalRh: number; remarks?: string | null }) => {
    editForm.reset({
      logDate: log.logDate,
      meTotalRh: log.meTotalRh,
      remarks: log.remarks ?? "",
    });
    setEditingEntry(log);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this RH entry?")) return;
    deleteLog.mutate(
      { vesselId: activeVesselId!, entryId: id },
      {
        onSuccess: () => { toast({ title: "Entry deleted" }); invalidate(); },
        onError: (err: any) =>
          toast({ title: "Error", description: err.message || "Failed to delete entry", variant: "destructive" }),
      }
    );
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ME Running Hours Log</h1>
          <p className="text-muted-foreground">Record main engine cumulative running hours with the exact date of the reading.</p>
        </div>

        {/* Add dialog */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Entry
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add ME Running Hours Entry</DialogTitle>
              <DialogDescription>
                Enter the <strong>total cumulative hours</strong> shown on the Main Engine running-hour counter and the date of the reading.
              </DialogDescription>
            </DialogHeader>

            {latestMeRh !== null ? (
              <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-700 dark:text-blue-400 text-sm">
                  Last logged ME RH: <strong>{latestMeRh.toLocaleString()} hrs</strong>. Enter a value <strong>higher</strong> than this.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 dark:text-amber-300 text-sm">First entry</AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-400 text-xs">
                  This is the first RH entry. All components currently fitted to cylinders will automatically use this as their running-hour baseline.
                </AlertDescription>
              </Alert>
            )}

            <RhEntryForm
              form={addForm}
              onSubmit={onAdd}
              isPending={addLog.isPending}
              onCancel={() => setIsAddOpen(false)}
              mode="add"
              latestMeRh={latestMeRh}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Getting-started hint */}
      {isFirstEntry && (
        <Alert className="bg-muted/40 border-muted-foreground/20">
          <Info className="h-4 w-4" />
          <AlertTitle className="text-sm font-semibold">Getting started</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground mt-1">
            Add your first ME running-hour entry. Once saved, the system calculates live running hours for all components fitted to cylinders.
          </AlertDescription>
        </Alert>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editingEntry} onOpenChange={(o) => !o && setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit RH Entry</DialogTitle>
            <DialogDescription>Update the date, ME total running hours, or remarks for this entry.</DialogDescription>
          </DialogHeader>
          <RhEntryForm
            form={editForm}
            onSubmit={onEdit}
            isPending={updateLog.isPending}
            onCancel={() => setEditingEntry(null)}
            mode="edit"
            latestMeRh={null}
          />
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">ME Total RH</TableHead>
                <TableHead className="text-right">Since Last (+hrs)</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs && logs.length > 0 ? (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        {safeFormatDate(log.logDate, "dd MMM yyyy")}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">{log.meTotalRh.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-primary font-bold">
                      {log.monthlyRh > 0 ? `+${log.monthlyRh.toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                      {log.remarks || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(log)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(log.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No RH entries yet. Click <strong>Add Entry</strong> to log the first reading.
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
