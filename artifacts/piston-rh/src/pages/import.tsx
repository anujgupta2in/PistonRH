import { useState, useRef } from "react";
import { useVesselContext } from "@/contexts/VesselContext";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle,
  Loader2, ChevronRight, SkipForward, Plus, Download, AlertTriangle,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedComponent {
  componentId: string;
  componentType: string;
  condition: string;
  currentStatus: string;
  totalAccumulatedRh: number;
  fittedInCylinder: string;
  fittedAtMeRh: number | null;
  remarks: string;
}

interface PreviewData {
  vesselInfo: Record<string, string>;
  summary: { pistons: number; fuelValves: number; exhaustValves: number };
  pistons: ParsedComponent[];
  fuelValves: ParsedComponent[];
  exhaustValves: ParsedComponent[];
  conflicts: {
    pistons: string[];
    fuelValves: string[];
    exhaustValves: string[];
  };
}

interface ImportResult {
  success: boolean;
  message: string;
  results: {
    pistonCreated: number;
    pistonSkipped: number;
    pistonOverwritten: number;
    fuelCreated: number;
    fuelSkipped: number;
    fuelOverwritten: number;
    exhaustCreated: number;
    exhaustSkipped: number;
    exhaustOverwritten: number;
    monthlyRhCreated: boolean;
    vesselUpdated: boolean;
  };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    "In Service":             "bg-green-100 text-green-800",
    "Onboard Spare":          "bg-blue-100 text-blue-800",
    "Landed Ashore":          "bg-orange-100 text-orange-800",
    "Under Reconditioning":   "bg-purple-100 text-purple-800",
    "Scrapped":               "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

// ─── Component preview table with conflict/overwrite UI ───────────────────────

function ComponentTable({
  rows,
  conflictIds,
  overwriteIds,
  onToggleOverwrite,
  isFuel,
}: {
  rows: ParsedComponent[];
  conflictIds: Set<string>;
  overwriteIds: Set<string>;
  onToggleOverwrite: (id: string) => void;
  isFuel?: boolean;
}) {
  const hasConflicts = rows.some((r) => conflictIds.has(r.componentId));

  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-2">No components in this sheet.</p>;

  return (
    <div className="overflow-x-auto rounded border text-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            {hasConflicts && <TableHead className="w-[90px]">Status</TableHead>}
            <TableHead>ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Condition</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Accum. RH</TableHead>
            <TableHead>{isFuel ? "Cylinder Slot" : "Cylinder"}</TableHead>
            <TableHead className="text-right">Fitted At ME RH</TableHead>
            {hasConflicts && <TableHead className="text-center w-[100px]">Overwrite?</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const isConflict = conflictIds.has(r.componentId);
            const willOverwrite = overwriteIds.has(r.componentId);
            return (
              <TableRow
                key={i}
                className={
                  isConflict
                    ? willOverwrite
                      ? "bg-amber-50 border-l-2 border-l-amber-400"
                      : "bg-red-50/50 border-l-2 border-l-red-300 opacity-70"
                    : i % 2 === 0
                    ? "bg-muted/20"
                    : ""
                }
              >
                {hasConflicts && (
                  <TableCell>
                    {isConflict ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px] gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Exists
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-[10px]">
                        New
                      </Badge>
                    )}
                  </TableCell>
                )}
                <TableCell className="font-mono font-medium">{r.componentId}</TableCell>
                <TableCell>{r.componentType}</TableCell>
                <TableCell>{r.condition}</TableCell>
                <TableCell><StatusBadge status={r.currentStatus} /></TableCell>
                <TableCell className="text-right">{r.totalAccumulatedRh.toLocaleString()}</TableCell>
                <TableCell className="text-muted-foreground">{r.fittedInCylinder || "—"}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {r.fittedAtMeRh != null ? r.fittedAtMeRh.toLocaleString() : "—"}
                </TableCell>
                {hasConflicts && (
                  <TableCell className="text-center">
                    {isConflict ? (
                      <Checkbox
                        checked={willOverwrite}
                        onCheckedChange={() => onToggleOverwrite(r.componentId)}
                        aria-label={`Overwrite ${r.componentId}`}
                      />
                    ) : null}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Conflict summary ─────────────────────────────────────────────────────────

function ConflictSummary({
  conflicts,
  overwriteIds,
  onSelectAll,
  onSelectNone,
}: {
  conflicts: { pistons: string[]; fuelValves: string[]; exhaustValves: string[] };
  overwriteIds: { pistons: Set<string>; fuelValves: Set<string>; exhaustValves: Set<string> };
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  const total = conflicts.pistons.length + conflicts.fuelValves.length + conflicts.exhaustValves.length;
  const selected =
    overwriteIds.pistons.size + overwriteIds.fuelValves.size + overwriteIds.exhaustValves.size;
  if (total === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {total} component{total !== 1 ? "s" : ""} already exist in this vessel
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Check the <strong>Overwrite?</strong> box next to each one you want to replace with the file data.
              Unchecked items will be skipped.
              {selected > 0 && ` Currently ${selected} selected for overwrite.`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={onSelectAll}>
            Overwrite All
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={onSelectNone}>
            Skip All
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {conflicts.pistons.length > 0 && (
          <span className="rounded bg-blue-100 text-blue-800 px-2 py-0.5">
            Pistons: {overwriteIds.pistons.size}/{conflicts.pistons.length} to overwrite
          </span>
        )}
        {conflicts.fuelValves.length > 0 && (
          <span className="rounded bg-orange-100 text-orange-800 px-2 py-0.5">
            Fuel Valves: {overwriteIds.fuelValves.size}/{conflicts.fuelValves.length} to overwrite
          </span>
        )}
        {conflicts.exhaustValves.length > 0 && (
          <span className="rounded bg-green-100 text-green-800 px-2 py-0.5">
            Exhaust Valves: {overwriteIds.exhaustValves.size}/{conflicts.exhaustValves.length} to overwrite
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const { activeVesselId } = useVesselContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fileRef  = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [parsing, setParsing]     = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview]     = useState<PreviewData | null>(null);
  const [result, setResult]       = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Overwrite selections per component type
  const [overwriteIds, setOverwriteIds] = useState<{
    pistons: Set<string>;
    fuelValves: Set<string>;
    exhaustValves: Set<string>;
  }>({ pistons: new Set(), fuelValves: new Set(), exhaustValves: new Set() });

  function pickFile(f: File) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setParseError(null);
    setOverwriteIds({ pistons: new Set(), fuelValves: new Set(), exhaustValves: new Set() });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  async function handlePreview() {
    if (!file || !activeVesselId) return;
    setParsing(true);
    setParseError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch(`/api/vessels/${activeVesselId}/import/preview`, { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Parse failed");
      const preview = data as PreviewData;
      setPreview(preview);
      // Default: no overwrites selected
      setOverwriteIds({ pistons: new Set(), fuelValves: new Set(), exhaustValves: new Set() });
    } catch (err: unknown) {
      setParseError((err as Error).message);
    } finally {
      setParsing(false);
    }
  }

  function toggleOverwrite(category: "pistons" | "fuelValves" | "exhaustValves", id: string) {
    setOverwriteIds((prev) => {
      const next = new Set(prev[category]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [category]: next };
    });
  }

  function selectAllOverwrites() {
    if (!preview) return;
    setOverwriteIds({
      pistons:      new Set(preview.conflicts.pistons),
      fuelValves:   new Set(preview.conflicts.fuelValves),
      exhaustValves: new Set(preview.conflicts.exhaustValves),
    });
  }

  function selectNoneOverwrites() {
    setOverwriteIds({ pistons: new Set(), fuelValves: new Set(), exhaustValves: new Set() });
  }

  async function handleImport() {
    if (!file || !activeVesselId) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("overwriteIds", JSON.stringify({
        pistons:      Array.from(overwriteIds.pistons),
        fuelValves:   Array.from(overwriteIds.fuelValves),
        exhaustValves: Array.from(overwriteIds.exhaustValves),
      }));
      const resp = await fetch(`/api/vessels/${activeVesselId}/import`, { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Import failed");
      setResult(data as ImportResult);
      queryClient.invalidateQueries();
      toast({ title: "Import complete", description: data.message });
    } catch (err: unknown) {
      toast({ title: "Import failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  const safeConflicts = preview?.conflicts ?? { pistons: [], fuelValves: [], exhaustValves: [] };

  const conflictIds = {
    pistons:      new Set(safeConflicts.pistons),
    fuelValves:   new Set(safeConflicts.fuelValves),
    exhaustValves: new Set(safeConflicts.exhaustValves),
  };

  const totalConflicts = safeConflicts.pistons.length + safeConflicts.fuelValves.length + safeConflicts.exhaustValves.length;

  // ─── Step 1: upload area ──────────────────────────────────────────────────
  const uploadCard = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          Step 1 — Select Import File
        </CardTitle>
        <CardDescription>
          Upload the completed ME Components RH Records Excel template (.xlsx). Download the template below if you haven't filled it in yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors cursor-pointer
            ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
          />
          <FileSpreadsheet className={`h-12 w-12 ${file ? "text-primary" : "text-muted-foreground/50"}`} />
          {file ? (
            <>
              <p className="font-semibold text-primary">{file.name}</p>
              <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB — click to change</p>
            </>
          ) : (
            <>
              <p className="font-medium">Drop your Excel file here</p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
            </>
          )}
        </div>
        {parseError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {parseError}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t bg-muted/30 py-3">
        <a
          href="/PistonRH_Import_Template.xlsx"
          download
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Download className="h-4 w-4" />
          Download template
        </a>
        <Button onClick={handlePreview} disabled={!file || parsing}>
          {parsing
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Parsing…</>
            : <><ChevronRight className="mr-2 h-4 w-4" />Preview File</>
          }
        </Button>
      </CardFooter>
    </Card>
  );

  // ─── Step 2: preview ──────────────────────────────────────────────────────
  const previewCard = preview && !result && (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Step 2 — Review &amp; Confirm
        </CardTitle>
        <CardDescription>
          Review the parsed data below. Components that already exist are highlighted — check the box to overwrite them, or leave unchecked to skip.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Vessel info summary */}
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Vessel Info from File</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(preview.vesselInfo)
              .filter(([k]) => !k.toLowerCase().includes("threshold") && !k.toLowerCase().includes("interval") && !k.toLowerCase().includes("warning") && !k.toLowerCase().includes("slot") && !k.toLowerCase().includes("dismantling"))
              .slice(0, 9)
              .map(([k, v]) => (
                <div key={k} className="rounded-md border bg-muted/20 p-2">
                  <p className="text-xs text-muted-foreground">{k.replace(" *","")}</p>
                  <p className="font-medium text-sm truncate">{v}</p>
                </div>
              ))}
          </div>
        </div>

        {/* Count badges */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg border px-4 py-2 bg-blue-50">
            <span className="text-2xl font-bold text-blue-700">{preview.summary.pistons}</span>
            <span className="text-sm text-blue-600">Piston Components</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border px-4 py-2 bg-orange-50">
            <span className="text-2xl font-bold text-orange-700">{preview.summary.fuelValves}</span>
            <span className="text-sm text-orange-600">Fuel Valves</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border px-4 py-2 bg-green-50">
            <span className="text-2xl font-bold text-green-700">{preview.summary.exhaustValves}</span>
            <span className="text-sm text-green-600">Exhaust Valves</span>
          </div>
        </div>

        {/* Conflict summary + overwrite controls */}
        {totalConflicts > 0 && (
          <ConflictSummary
            conflicts={preview.conflicts}
            overwriteIds={overwriteIds}
            onSelectAll={selectAllOverwrites}
            onSelectNone={selectNoneOverwrites}
          />
        )}

        <Separator />

        {/* Piston preview */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Piston</Badge>
            {preview.pistons.length} component{preview.pistons.length !== 1 ? "s" : ""}
            {preview.conflicts.pistons.length > 0 && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {preview.conflicts.pistons.length} existing
              </span>
            )}
          </h3>
          <ComponentTable
            rows={preview.pistons}
            conflictIds={conflictIds.pistons}
            overwriteIds={overwriteIds.pistons}
            onToggleOverwrite={(id) => toggleOverwrite("pistons", id)}
          />
        </div>

        <Separator />

        {/* Fuel valve preview */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Fuel Valve</Badge>
            {preview.fuelValves.length} component{preview.fuelValves.length !== 1 ? "s" : ""}
            {preview.conflicts.fuelValves.length > 0 && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {preview.conflicts.fuelValves.length} existing
              </span>
            )}
          </h3>
          <ComponentTable
            rows={preview.fuelValves}
            conflictIds={conflictIds.fuelValves}
            overwriteIds={overwriteIds.fuelValves}
            onToggleOverwrite={(id) => toggleOverwrite("fuelValves", id)}
            isFuel
          />
        </div>

        <Separator />

        {/* Exhaust valve preview */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Exhaust Valve</Badge>
            {preview.exhaustValves.length} component{preview.exhaustValves.length !== 1 ? "s" : ""}
            {preview.conflicts.exhaustValves.length > 0 && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {preview.conflicts.exhaustValves.length} existing
              </span>
            )}
          </h3>
          <ComponentTable
            rows={preview.exhaustValves}
            conflictIds={conflictIds.exhaustValves}
            overwriteIds={overwriteIds.exhaustValves}
            onToggleOverwrite={(id) => toggleOverwrite("exhaustValves", id)}
          />
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t bg-muted/30 py-3">
        <p className="text-xs text-muted-foreground">
          {totalConflicts > 0
            ? `${totalConflicts} conflict${totalConflicts !== 1 ? "s" : ""} detected — check the rows you want to overwrite.`
            : "No conflicts — all components are new."}
        </p>
        <Button onClick={handleImport} disabled={importing}>
          {importing
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing…</>
            : <><Plus className="mr-2 h-4 w-4" />Confirm Import</>
          }
        </Button>
      </CardFooter>
    </Card>
  );

  // ─── Step 3: result ───────────────────────────────────────────────────────
  const resultCard = result && (
    <Card className="border-green-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-700">
          <CheckCircle2 className="h-6 w-6" />
          Import Complete
        </CardTitle>
        <CardDescription>{result.message}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Piston Components", created: result.results.pistonCreated, skipped: result.results.pistonSkipped, overwritten: result.results.pistonOverwritten, color: "blue" },
            { label: "Fuel Valves", created: result.results.fuelCreated, skipped: result.results.fuelSkipped, overwritten: result.results.fuelOverwritten, color: "orange" },
            { label: "Exhaust Valves", created: result.results.exhaustCreated, skipped: result.results.exhaustSkipped, overwritten: result.results.exhaustOverwritten, color: "green" },
          ].map(({ label, created, skipped, overwritten, color }) => (
            <div key={label} className={`rounded-lg border p-3 bg-${color}-50`}>
              <p className={`text-xs text-${color}-600 mb-1`}>{label}</p>
              <p className={`text-xl font-bold text-${color}-700`}>{created} <span className="text-sm font-normal">created</span></p>
              {overwritten > 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3" />{overwritten} overwritten
                </p>
              )}
              {skipped > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <SkipForward className="h-3 w-3" />{skipped} skipped
                </p>
              )}
            </div>
          ))}
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">ME Running Hours</p>
            <p className="font-medium text-sm">{result.results.monthlyRhCreated ? "✓ Initial entry created" : "Skipped (already exists)"}</p>
          </div>
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">Vessel Settings</p>
            <p className="font-medium text-sm">{result.results.vesselUpdated ? "✓ Thresholds updated" : "No changes"}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t bg-muted/30 py-3">
        <Button variant="outline" onClick={() => { setFile(null); setPreview(null); setResult(null); }}>
          Import Another File
        </Button>
      </CardFooter>
    </Card>
  );

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import Initial Setup</h1>
        <p className="text-muted-foreground mt-1">
          Load all vessel components from the Excel template in one step.
        </p>
      </div>

      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>This import adds to the <strong>currently active vessel</strong>. Existing components will be shown in the preview — you choose which ones to overwrite.</span>
      </div>

      {uploadCard}
      {previewCard}
      {resultCard}
    </div>
  );
}
