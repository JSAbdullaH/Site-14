import { useEffect, useRef, useState } from "react";
import { Check, Download, Pencil, Trash2, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/shared/lib/api";
import { listSites } from "@/features/sites/api";
import {
  downloadImportTemplate,
  previewImport,
  commitImport,
} from "../api";
import type {
  ImportPreviewResponse,
  ImportCommitResponse,
  ImportInvalidRow,
  ImportDuplicateRow,
  ImportedEmployee,
} from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

// A row the admin can still change before importing. `origin` is its row number in
// the file they chose, so the numbers they see never move when rows are edited.
type WorkRow = {
  origin: number;
  full_name: string;
  employee_number: string;
  job_category: string;
  site_name: string;
};

const MAX_BYTES = 1024 * 1024;
const HEADER = ["full_name", "employee_number", "job_category", "site_name"] as const;

const cell = (v: string) => (/[",\r\n]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function toCsvFile(rows: WorkRow[], name: string) {
  const lines = [HEADER.join(","), ...rows.map((r) => HEADER.map((h) => cell(r[h])).join(","))];
  return new File([`${lines.join("\n")}\n`], name, { type: "text/csv" });
}

// The list of added workers with the IDs they got. Sent again, the rows with a
// worker_id are recognised as already on file and skipped.
const LIST_HEADER = ["worker_id", "full_name", "employee_number", "job_category", "site_name"] as const;

function downloadList(employees: ImportedEmployee[]) {
  const lines = [
    LIST_HEADER.join(","),
    ...employees.map((e) => LIST_HEADER.map((h) => cell(e[h] ?? "")).join(",")),
  ];
  const url = URL.createObjectURL(new Blob([`${lines.join("\n")}\n`], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "imported-employees.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function draftError(d: WorkRow) {
  if (d.full_name.trim().length < 2) return "Enter the full name";
  if (d.job_category.trim().length < 2) return "Enter a job category";
  if (d.employee_number.trim().length > 30) return "Use at most 30 characters for the number";
  return "";
}

export default function ImportCsvDialog({ open, onOpenChange, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = useState<ImportCommitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Set on the first edit or removal. From then on the import sends a file built from
  // these rows, and the server checks it again after every change.
  const [rows, setRows] = useState<WorkRow[] | null>(null);
  const [edited, setEdited] = useState<File | null>(null);
  const [leftOut, setLeftOut] = useState<{ invalid: ImportInvalidRow[]; duplicates: ImportDuplicateRow[] }>({
    invalid: [],
    duplicates: [],
  });
  const [editing, setEditing] = useState<WorkRow | null>(null);
  const [editError, setEditError] = useState("");
  const [sites, setSites] = useState<{ id: string; name: string; display_id?: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    listSites(true)
      .then((res) => setSites(res.data))
      .catch(() => setSites([]));
  }, [open]);

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError("");
    setBusy(false);
    setRows(null);
    setEdited(null);
    setLeftOut({ invalid: [], duplicates: [] });
    setEditing(null);
    setEditError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleTemplate() {
    setError("");
    try {
      const blob = await downloadImportTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "employees-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not download the template.");
    }
  }

  async function handleFile(picked: File | null) {
    reset();
    setFile(picked);
    if (!picked) return;

    if (!picked.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a .csv file.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError("The file is larger than 1 MB.");
      return;
    }

    setBusy(true);
    try {
      setPreview(await previewImport(picked));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not read the file.");
    } finally {
      setBusy(false);
    }
  }

  // The rows as they stand: the admin's edited list, or the file's ready rows.
  const workRows: WorkRow[] =
    rows ??
    (preview?.valid_rows ?? []).map((r) => ({
      origin: r.row,
      full_name: r.full_name,
      employee_number: r.employee_number ?? "",
      job_category: r.job_category,
      site_name: r.site_name ?? "",
    }));

  // Builds a file from `next`, checks it on the server, and shows the answer with the
  // row numbers of the original file.
  async function applyRows(next: WorkRow[]) {
    if (!file || !preview) return;
    if (rows === null) {
      setLeftOut({ invalid: preview.invalid_rows, duplicates: preview.duplicates });
    }
    setRows(next);
    setError("");

    if (next.length === 0) {
      setEdited(null);
      setPreview({ total_rows: 0, valid_rows: [], invalid_rows: [], duplicates: [], unchecked_rows: [] });
      return;
    }

    const built = toCsvFile(next, file.name);
    const origin = (row: number) => next[row - 2]?.origin ?? row;
    setBusy(true);
    try {
      const res = await previewImport(built);
      setEdited(built);
      setPreview({
        total_rows: res.total_rows,
        valid_rows: res.valid_rows.map((r) => ({ ...r, row: origin(r.row) })),
        invalid_rows: res.invalid_rows.map((r) => ({ ...r, row: origin(r.row) })),
        duplicates: res.duplicates.map((r) => ({ ...r, row: origin(r.row) })),
        unchecked_rows: res.unchecked_rows.map((r) => ({ ...r, row: origin(r.row) })),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not check the changes.");
    } finally {
      setBusy(false);
    }
  }

  function remove(origin: number) {
    if (editing?.origin === origin) setEditing(null);
    void applyRows(workRows.filter((r) => r.origin !== origin));
  }

  function saveEdit() {
    if (!editing) return;
    const message = draftError(editing);
    if (message) {
      setEditError(message);
      return;
    }
    const saved = {
      ...editing,
      full_name: editing.full_name.trim(),
      employee_number: editing.employee_number.trim(),
      job_category: editing.job_category.trim().toLowerCase(),
    };
    setEditing(null);
    setEditError("");
    void applyRows(workRows.map((r) => (r.origin === saved.origin ? saved : r)));
  }

  async function handleImport() {
    const upload = edited ?? file;
    if (!upload) return;
    setBusy(true);
    setError("");
    try {
      const res = await commitImport(upload);
      const origin = (row: number) => (rows ? rows[row - 2]?.origin ?? row : row);
      setResult({
        ...res,
        skipped: [...leftOut.duplicates, ...res.skipped.map((r) => ({ ...r, row: origin(r.row) }))],
        errors: [...leftOut.invalid, ...res.errors.map((r) => ({ ...r, row: origin(r.row) }))],
      });
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The import failed.");
    } finally {
      setBusy(false);
    }
  }

  const readyCount = preview?.valid_rows.length ?? 0;
  const invalid = [...leftOut.invalid, ...(preview?.invalid_rows ?? [])].sort((a, b) => a.row - b.row);
  const duplicates = [...leftOut.duplicates, ...(preview?.duplicates ?? [])].sort((a, b) => a.row - b.row);
  const totalRows = (preview?.total_rows ?? 0) + leftOut.invalid.length + leftOut.duplicates.length;

  // Why a row in the table will not be imported, if it will not.
  const problem = (origin: number) =>
    preview?.invalid_rows.find((r) => r.row === origin)?.reason ??
    preview?.duplicates.find((r) => r.row === origin)?.reason ??
    null;

  const expectedId = (origin: number) =>
    preview?.valid_rows.find((r) => r.row === origin)?.expected_worker_id ?? null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import employees from CSV</DialogTitle>
          <DialogDescription>
            Up to 1000 rows. Required columns are full_name and job_category. Each new worker gets an ID from the
            system.
          </DialogDescription>
        </DialogHeader>

        {/* ---------- step 3: finished ---------- */}
        {result ? (
          <div className="space-y-4 py-2">
            <p className="rounded-md bg-ok-bg px-4 py-3 text-sm font-medium text-ok">
              {result.created} employee{result.created === 1 ? "" : "s"} added.
            </p>

            {result.employees.length > 0 && (
              <div className="space-y-2">
                <div className="max-h-60 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Worker ID</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Job</th>
                        <th className="px-3 py-2 font-medium">Site</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.employees.map((e) => (
                        <tr key={e.worker_id} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{e.worker_id}</td>
                          <td className="px-3 py-2">{e.full_name}</td>
                          <td className="px-3 py-2">{e.job_category}</td>
                          <td className="px-3 py-2">{e.site_name || "Unassigned"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button variant="outline" type="button" onClick={() => downloadList(result.employees)}>
                  <Download />
                  Download the list with IDs
                </Button>
              </div>
            )}

            {result.skipped.length > 0 && (
              <Summary
                title={`${result.skipped.length} skipped as duplicates`}
                rows={result.skipped.map((d) => `Row ${d.row}: ${d.reason}`)}
              />
            )}

            {result.errors.length > 0 && (
              <Summary
                title={`${result.errors.length} rejected`}
                rows={result.errors.map((e) => `Row ${e.row}: ${e.reason}`)}
              />
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* ---------- step 1: pick a file ---------- */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Button variant="outline" type="button" onClick={handleTemplate}>
                  <Download />
                  Download template
                </Button>

                <Button
                  variant="outline"
                  type="button"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload />
                  Choose file
                </Button>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />

              {file && (
                <p className="truncate text-sm text-muted-foreground">
                  {file.name}
                  {rows && " (edited)"}
                </p>
              )}
            </div>

            {busy && !preview && (
              <p className="text-sm text-muted-foreground">Reading the file...</p>
            )}

            {/* ---------- step 2: preview ---------- */}
            {preview && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border px-4 py-3 text-sm">
                  <span><strong>{totalRows}</strong> rows</span>
                  <span className="text-ok"><strong>{readyCount}</strong> ready</span>
                  <span className="text-warn">
                    <strong>{duplicates.length}</strong> duplicates
                  </span>
                  <span className="text-destructive">
                    <strong>{invalid.length}</strong> rejected
                  </span>
                  {busy && <span className="text-muted-foreground">Checking...</span>}
                </div>

                {workRows.length > 0 && (
                  <div className="max-h-72 overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium">Row</th>
                          <th className="px-3 py-2 font-medium" title="The ID each worker will get. Final after the import.">
                            Worker ID
                          </th>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Company no.</th>
                          <th className="px-3 py-2 font-medium">Job</th>
                          <th className="px-3 py-2 font-medium">Site</th>
                          <th className="px-3 py-2 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workRows.map((r) =>
                          editing?.origin === r.origin ? (
                            <tr key={r.origin} className="border-t bg-muted/40 align-top">
                              <td className="px-3 py-2 text-muted-foreground">{r.origin}</td>
                              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-muted-foreground">
                                {expectedId(r.origin) ?? "—"}
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  aria-label="Full name"
                                  value={editing.full_name}
                                  onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                                  autoFocus
                                />
                                {editError && <p className="mt-1 text-xs text-destructive">{editError}</p>}
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  aria-label="Company number"
                                  value={editing.employee_number}
                                  placeholder="Optional"
                                  onChange={(e) => setEditing({ ...editing, employee_number: e.target.value })}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  aria-label="Job category"
                                  value={editing.job_category}
                                  onChange={(e) => setEditing({ ...editing, job_category: e.target.value })}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <select
                                  aria-label="Site"
                                  value={editing.site_name}
                                  onChange={(e) => setEditing({ ...editing, site_name: e.target.value })}
                                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                  <option value="">Unassigned</option>
                                  {editing.site_name && !sites.some((s) => s.name === editing.site_name) && (
                                    <option value={editing.site_name}>{editing.site_name}</option>
                                  )}
                                  {sites.map((s) => (
                                    <option key={s.id} value={s.name}>
                                      {s.display_id ? `${s.name} (${s.display_id})` : s.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex justify-end gap-1">
                                  <Button size="icon-sm" variant="ghost" aria-label="Save row" onClick={saveEdit}>
                                    <Check />
                                  </Button>
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label="Cancel editing"
                                    onClick={() => {
                                      setEditing(null);
                                      setEditError("");
                                    }}
                                  >
                                    <X />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={r.origin} className="border-t">
                              <td className="px-3 py-2 text-muted-foreground">{r.origin}</td>
                              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-muted-foreground">
                                {expectedId(r.origin) ?? "—"}
                              </td>
                              <td className="px-3 py-2">
                                {r.full_name}
                                {problem(r.origin) && (
                                  <p className="text-xs text-destructive">Will not be imported: {problem(r.origin)}</p>
                                )}
                              </td>
                              <td className="px-3 py-2">{r.employee_number || "—"}</td>
                              <td className="px-3 py-2">{r.job_category}</td>
                              <td className="px-3 py-2">{r.site_name || "Unassigned"}</td>
                              <td className="px-2 py-1.5">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`Edit row ${r.origin}`}
                                    disabled={busy}
                                    onClick={() => {
                                      setEditing(r);
                                      setEditError("");
                                    }}
                                  >
                                    <Pencil />
                                  </Button>
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-label={`Remove row ${r.origin}`}
                                    disabled={busy}
                                    onClick={() => remove(r.origin)}
                                  >
                                    <Trash2 />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {rows && workRows.length === 0 && (
                  <p className="text-sm text-muted-foreground">Every row was removed. Choose the file again to start over.</p>
                )}

                {invalid.length > 0 && (
                  <Summary
                    title={`${invalid.length} rows will be rejected`}
                    rows={invalid.map((e) => `Row ${e.row}: ${e.reason}`)}
                  />
                )}

                {duplicates.length > 0 && (
                  <Summary
                    title={`${duplicates.length} rows will be skipped`}
                    rows={duplicates.map((d) => `Row ${d.row}: ${d.reason}`)}
                  />
                )}

                {preview.unchecked_rows.length > 0 && (
                  <div role="note" className="rounded-md border border-warn/20 bg-warn-bg px-4 py-3 text-sm text-warn">
                    <p className="font-medium">
                      {preview.unchecked_rows.length} row{preview.unchecked_rows.length === 1 ? " has" : "s have"} no
                      company number and no worker ID, so {preview.unchecked_rows.length === 1 ? "it" : "they"} cannot
                      be checked for duplicates.
                    </p>
                    {preview.unchecked_rows.some((u) => u.warning) && (
                      <ul className="mt-2 space-y-1">
                        {preview.unchecked_rows
                          .filter((u) => u.warning)
                          .map((u) => (
                            <li key={u.row}>
                              Row {u.row}, {u.full_name}: {u.warning}
                            </li>
                          ))}
                      </ul>
                    )}
                    <p className="mt-2 text-xs">
                      Use the pencil to add a company number, or the bin to leave a row out. A file downloaded after an
                      import keeps the worker IDs, so sending it again skips the workers already on file.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <DialogFooter>
          {result ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="outline" type="button" onClick={close}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={busy || readyCount === 0 || editing !== null}>
                <Upload />
                {busy ? "Working..." : `Import ${readyCount} employee${readyCount === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ title, rows }: { title: string; rows: string[] }) {
  return (
    <details className="rounded-md border px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-muted-foreground">
        {rows.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </details>
  );
}
