import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/shared/lib/api";
import {
  downloadImportTemplate,
  previewImport,
  commitImport,
} from "../api";
import type {
  ImportPreviewResponse,
  ImportCommitResponse,
} from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

const MAX_BYTES = 1024 * 1024;

export default function ImportCsvDialog({ open, onOpenChange, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [result, setResult] = useState<ImportCommitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError("");
    setBusy(false);
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
    setError("");
    setPreview(null);
    setResult(null);
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

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const res = await commitImport(file);
      setResult(res);
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The import failed.");
    } finally {
      setBusy(false);
    }
  }

  const readyCount = preview?.valid_rows.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import employees from CSV</DialogTitle>
          <DialogDescription>
            Up to 1000 rows. Required columns are full_name and job_category.
          </DialogDescription>
        </DialogHeader>

        {/* ---------- step 3: finished ---------- */}
        {result ? (
          <div className="space-y-4 py-2">
            <p className="rounded-md bg-ok-bg px-4 py-3 text-sm font-medium text-ok">
              {result.created} employee{result.created === 1 ? "" : "s"} added.
            </p>

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
                  <span><strong>{preview.total_rows}</strong> rows</span>
                  <span className="text-ok"><strong>{readyCount}</strong> ready</span>
                  <span className="text-warn">
                    <strong>{preview.duplicates.length}</strong> duplicates
                  </span>
                  <span className="text-destructive">
                    <strong>{preview.invalid_rows.length}</strong> rejected
                  </span>
                </div>

                {readyCount > 0 && (
                  <div className="max-h-56 overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium">Row</th>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Number</th>
                          <th className="px-3 py-2 font-medium">Job</th>
                          <th className="px-3 py-2 font-medium">Site</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.valid_rows.map((r) => (
                          <tr key={r.row} className="border-t">
                            <td className="px-3 py-2 text-muted-foreground">{r.row}</td>
                            <td className="px-3 py-2">{r.full_name}</td>
                            <td className="px-3 py-2">{r.employee_number ?? "—"}</td>
                            <td className="px-3 py-2">{r.job_category}</td>
                            <td className="px-3 py-2">{r.site_name ?? "Unassigned"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {preview.invalid_rows.length > 0 && (
                  <Summary
                    title={`${preview.invalid_rows.length} rows will be rejected`}
                    rows={preview.invalid_rows.map((e) => `Row ${e.row}: ${e.reason}`)}
                  />
                )}

                {preview.duplicates.length > 0 && (
                  <Summary
                    title={`${preview.duplicates.length} rows will be skipped`}
                    rows={preview.duplicates.map((d) => `Row ${d.row}: ${d.reason}`)}
                  />
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
              <Button onClick={handleImport} disabled={busy || readyCount === 0}>
                <Upload />
                {busy ? "Importing..." : `Import ${readyCount} employee${readyCount === 1 ? "" : "s"}`}
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