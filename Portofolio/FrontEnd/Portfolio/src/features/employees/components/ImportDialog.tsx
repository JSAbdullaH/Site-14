import { useState } from "react";
import { Download, FileUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { commitImport, downloadTemplate, previewImport } from "../api";
import type { ColumnMap, ImportField, ImportPreview, ImportResult } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

type Step = "choose" | "preview" | "done";

const FIELDS: { key: ImportField; label: string; required: boolean }[] = [
  { key: "full_name", label: "Full name", required: true },
  { key: "job_category", label: "Job category", required: true },
  { key: "employee_number", label: "Employee number", required: false },
  { key: "site_name", label: "Site name", required: false },
];

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells.filter(Boolean);
}

async function readHeader(file: File) {
  const text = await file.slice(0, 64 * 1024).text();
  const first = text.replace(/^﻿/, "").split(/\r?\n/)[0] ?? "";
  return splitCsvLine(first);
}

export default function ImportDialog({ open, onOpenChange, onImported }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columns, setColumns] = useState<Record<ImportField, string>>({
    full_name: "",
    job_category: "",
    employee_number: "",
    site_name: "",
  });
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setStep("choose");
    setFile(null);
    setHeaders([]);
    setColumns({ full_name: "", job_category: "", employee_number: "", site_name: "" });
    setPreview(null);
    setResult(null);
    setError("");
  }

  function close() {
    if (step === "done") onImported();
    reset();
    onOpenChange(false);
  }

  // Choose file: read the header row and match columns with the same name
  async function choose(next: File | null) {
    setError("");
    setPreview(null);
    setFile(next);
    if (!next) {
      setHeaders([]);
      return;
    }
    const found = await readHeader(next);
    setHeaders(found);
    const byName = new Map(found.map((h) => [h.toLowerCase(), h]));
    setColumns({
      full_name: byName.get("full_name") ?? "",
      job_category: byName.get("job_category") ?? "",
      employee_number: byName.get("employee_number") ?? "",
      site_name: byName.get("site_name") ?? "",
    });
  }

  function columnMap(): ColumnMap {
    const map: ColumnMap = {};
    for (const f of FIELDS) {
      if (columns[f.key] && columns[f.key] !== f.key) map[f.key] = columns[f.key];
    }
    return map;
  }

  async function getTemplate() {
    setError("");
    try {
      const blob = await downloadTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "employees-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Preview button
  async function check() {
    if (!file) return;
    const missing = FIELDS.filter((f) => f.required && !columns[f.key]).map((f) => f.label);
    if (missing.length) {
      setError(`Choose the column for: ${missing.join(", ")}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setPreview(await previewImport(file, columnMap()));
      setStep("preview");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Import button
  async function confirm() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setResult(await commitImport(file, columnMap()));
      setStep("done");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const problems = preview ? preview.invalid_rows.length + preview.duplicates.length : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import employees from CSV</DialogTitle>
          <DialogDescription>
            {step === "choose" && "Upload your list, check the preview, then confirm. Nothing is saved before you confirm."}
            {step === "preview" && "Nothing has been saved yet. Check the rows below, then confirm."}
            {step === "done" && "The import is finished."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>
        )}

        {step === "choose" && (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-secondary/40 p-4">
              <span className="text-muted-foreground">
                Columns: full_name, job_category, employee_number, site_name
              </span>
              {/* Download template -> getTemplate() */}
              <Button type="button" variant="outline" size="sm" onClick={getTemplate}>
                <Download />
                Download template
              </Button>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="import_file">CSV file</Label>
              {/* file input -> choose() */}
              <input
                id="import_file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => choose(e.target.files?.[0] ?? null)}
                className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
            </div>

            {headers.length > 0 && (
              <div className="grid gap-3">
                <p className="font-medium">Match your columns</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <div key={f.key} className="grid gap-1.5">
                      <Label htmlFor={`col_${f.key}`}>
                        {f.label}
                        {!f.required && <span className="font-normal text-muted-foreground"> (optional)</span>}
                      </Label>
                      <select
                        id={`col_${f.key}`}
                        value={columns[f.key]}
                        onChange={(e) => setColumns({ ...columns, [f.key]: e.target.value })}
                        className={selectClass}
                      >
                        <option value="">{f.required ? "Choose a column" : "Not in my file"}</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === "preview" && preview && (
          <div className="grid gap-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Ready to import</p>
                <p className="text-xl font-semibold text-ok">{preview.valid_rows.length}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">With errors</p>
                <p className="text-xl font-semibold text-danger">{preview.invalid_rows.length}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Duplicates</p>
                <p className="text-xl font-semibold text-warn">{preview.duplicates.length}</p>
              </div>
            </div>

            {problems > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border">
                <p className="border-b bg-secondary/40 px-3 py-2 font-medium">
                  These rows will not be imported
                </p>
                <ul className="divide-y">
                  {[...preview.invalid_rows, ...preview.duplicates]
                    .sort((a, b) => a.row - b.row)
                    .map((r) => (
                      <li key={r.row} className="flex gap-3 px-3 py-2">
                        <span className="w-14 shrink-0 tabular-nums text-muted-foreground">Row {r.row}</span>
                        <span>{r.reason}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {preview.valid_rows.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-md border">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Number</th>
                      <th className="px-3 py-2 font-medium">Job</th>
                      <th className="px-3 py-2 font-medium">Site</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.valid_rows.map((r) => (
                      <tr key={r.row} className="border-b last:border-0">
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.row}</td>
                        <td className="px-3 py-1.5">{r.full_name}</td>
                        <td className="px-3 py-1.5">{r.employee_number ?? "-"}</td>
                        <td className="px-3 py-1.5">{r.job_category}</td>
                        <td className="px-3 py-1.5">{r.site_name ?? "Not assigned"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-muted-foreground">
              Imported workers have no tracking consent recorded yet, so they cannot start a shift until it is given.
            </p>
          </div>
        )}

        {step === "done" && result && (
          <div className="grid gap-2">
            <p className="text-base font-medium">
              {result.created} {result.created === 1 ? "employee" : "employees"} added.
            </p>
            {result.skipped.length + result.errors.length > 0 && (
              <p className="text-muted-foreground">
                {result.skipped.length + result.errors.length} rows were skipped.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "choose" && (
            <>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              {/* Preview -> check() */}
              <Button type="button" onClick={check} disabled={!file || busy}>
                <FileUp />
                {busy ? "Checking..." : "Preview"}
              </Button>
            </>
          )}
          {step === "preview" && preview && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("choose")} disabled={busy}>
                Back
              </Button>
              {/* Import -> confirm() */}
              <Button type="button" onClick={confirm} disabled={busy || preview.valid_rows.length === 0}>
                {busy ? "Importing..." : `Import ${preview.valid_rows.length} employees`}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button type="button" onClick={close}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
