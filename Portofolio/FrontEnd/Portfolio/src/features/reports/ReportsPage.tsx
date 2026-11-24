import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { CheckCircle2, Download, ExternalLink, FileText, FileUp, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import AppShell from "@/shared/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/shared/lib/api";
import { listSites } from "@/features/sites/api";
import { generateReport, verifyReport } from "./api";
import type { GeneratedReport, ReportType, ReportVerification } from "./types";

type SiteOption = { id: string; name: string; display_id?: string };

const REFERENCE = /SITE14-R-\d{8}-[0-9A-F]{8}/i;

const riyadhToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;

const niceDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const periodLabel = (from: string, to: string) => (from === to ? niceDate(from) : `${niceDate(from)} to ${niceDate(to)}`);

type Preset = { id: string; label: string; range: () => { from: string; to: string } };

const PRESETS: Preset[] = [
  { id: "today", label: "Today", range: () => ({ from: riyadhToday(), to: riyadhToday() }) },
  { id: "yesterday", label: "Yesterday", range: () => ({ from: shiftDays(riyadhToday(), -1), to: shiftDays(riyadhToday(), -1) }) },
  { id: "7d", label: "Last 7 days", range: () => ({ from: shiftDays(riyadhToday(), -6), to: riyadhToday() }) },
  { id: "month", label: "This month", range: () => ({ from: `${riyadhToday().slice(0, 7)}-01`, to: riyadhToday() }) },
  {
    id: "last-month",
    label: "Last month",
    range: () => {
      const firstOfThis = `${riyadhToday().slice(0, 7)}-01`;
      const lastOfPrev = shiftDays(firstOfThis, -1);
      return { from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
    },
  },
];

// The register's type follows the period it covers, so a 30-day file is never labelled "daily".
function typeFor(from: string, to: string): ReportType {
  const days = daysBetween(from, to);
  if (days <= 1) return "daily";
  if (days <= 7) return "weekly";
  return "monthly";
}

async function sha256Hex(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function ReportsPage() {
  const today = riyadhToday();
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [sitesError, setSitesError] = useState("");

  const [siteId, setSiteId] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<(GeneratedReport & { site: string; from: string; to: string })[]>([]);

  useEffect(() => {
    listSites(true)
      .then((res) => {
        setSites(res.data.map((s) => ({ id: s.id, name: s.name, display_id: s.display_id })));
        if (res.data.length) setSiteId(res.data[0].id);
      })
      .catch((err) => setSitesError(err instanceof ApiError ? err.message : "Could not load sites."));
  }, []);

  const rangeInvalid = from > to;
  const future = to > today;
  const reportType = typeFor(from, to);
  const days = rangeInvalid ? 0 : daysBetween(from, to);
  const preset = PRESETS.find((p) => {
    const r = p.range();
    return r.from === from && r.to === to;
  });
  const canGenerate = Boolean(siteId) && !rangeInvalid && !future && !busy;
  const siteName = useMemo(() => sites.find((s) => s.id === siteId)?.name ?? "", [sites, siteId]);

  async function handleGenerate() {
    setBusy(true);
    setError("");
    try {
      const report = await generateReport({ siteId, reportType, from, to });
      setIssued((list) => [{ ...report, site: siteName, from, to }, ...list]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate the report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Reports" subtitle="Issue an attendance register and verify one">
      {sitesError && (
        <p className="mb-5 rounded-md bg-warn-bg px-4 py-3 text-sm font-medium text-warn">{sitesError}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-background p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <FileText className="size-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Attendance register</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Every hour comes from recorded device sessions. Each PDF carries a reference number and a fingerprint, so a
                  client can confirm the copy they hold is the one you issued.
                </p>
              </div>
            </div>

            <div className="grid gap-5">
              <div className="grid gap-2">
                <Label htmlFor="rep_site">Site</Label>
                <select
                  id="rep_site"
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="h-10 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {sites.length === 0 && <option value="">No active sites</option>}
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_id ? `${s.name} (${s.display_id})` : s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label>Period</Label>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick periods">
                  {PRESETS.map((p) => {
                    const on = preset?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          const r = p.range();
                          setFrom(r.from);
                          setTo(r.to);
                        }}
                        className={`h-8 rounded-full border px-3 text-[13px] font-medium transition-colors ${
                          on ? "border-transparent bg-ink text-white" : "hover:bg-secondary"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="rep_from" className="text-xs text-muted-foreground">
                      From
                    </Label>
                    <Input id="rep_from" type="date" value={from} max={today} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-invalid={rangeInvalid} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="rep_to" className="text-xs text-muted-foreground">
                      To
                    </Label>
                    <Input id="rep_to" type="date" value={to} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-invalid={rangeInvalid || future} />
                  </div>
                </div>
                {rangeInvalid ? (
                  <p className="text-sm font-medium text-destructive">The start date is after the end date.</p>
                ) : future ? (
                  <p className="text-sm font-medium text-destructive">A register cannot cover days that have not happened yet.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium capitalize text-foreground">{reportType}</span> register · {days} day{days === 1 ? "" : "s"}
                    {to === today && " · today is still in progress, so its hours are provisional"}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <p className="mt-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-5">
              <Button size="lg" onClick={handleGenerate} disabled={!canGenerate}>
                {busy ? <Loader2 className="animate-spin" /> : <FileText />}
                {busy ? "Generating…" : "Generate report"}
              </Button>
              {siteName && !rangeInvalid && !future && (
                <span className="text-sm text-muted-foreground">
                  {siteName} · {periodLabel(from, to)}
                </span>
              )}
            </div>
          </section>

          {issued.length > 0 && (
            <section className="rounded-xl border bg-background">
              <h2 className="border-b px-5 py-3 text-sm font-semibold">Issued now</h2>
              <ul className="divide-y">
                {issued.map((r) => (
                  <IssuedRow key={r.reference} report={r} />
                ))}
              </ul>
            </section>
          )}
        </div>

        <VerifyPanel />
      </div>
    </AppShell>
  );
}

function IssuedRow({ report }: { report: GeneratedReport & { site: string; from: string; to: string } }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const next = URL.createObjectURL(report.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [report.blob]);

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4">
      <CheckCircle2 className="size-5 shrink-0 text-ok" />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-semibold">{report.reference}</p>
        <p className="text-sm text-muted-foreground">
          {report.site} · {periodLabel(report.from, report.to)}
        </p>
      </div>
      <div className="flex w-full gap-2 pl-8 sm:w-auto sm:pl-0">
        <a
          href={url}
          download={report.filename}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Download className="size-4" />
          Download
        </a>
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-secondary"
        >
          <ExternalLink className="size-4" />
          Open
        </a>
      </div>
    </li>
  );
}

type FileCheck = { name: string; matches: boolean } | null;

// A reference alone only proves a report was issued; hashing the PDF in hand proves this file
// is that report, unchanged. The file never leaves the browser.
function VerifyPanel() {
  const [lookup, setLookup] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [checked, setChecked] = useState<ReportVerification | null>(null);
  const [fileCheck, setFileCheck] = useState<FileCheck>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function verify(reference: string, file?: File) {
    const ref = reference.trim().toUpperCase();
    if (!ref) return;
    setChecking(true);
    setCheckError("");
    setChecked(null);
    setFileCheck(null);
    try {
      const found = await verifyReport(ref);
      setChecked(found);
      if (file) setFileCheck({ name: file.name, matches: (await sha256Hex(file)) === found.sha256 });
    } catch (err) {
      setCheckError(err instanceof ApiError ? err.message : "Could not check this reference.");
    } finally {
      setChecking(false);
    }
  }

  async function checkFile(file: File) {
    // The issued file is named after its reference; otherwise use the one typed in.
    const ref = REFERENCE.exec(file.name)?.[0] ?? REFERENCE.exec(lookup)?.[0];
    if (!ref) {
      setCheckError("Type the reference printed at the bottom of the report first, then choose the file again.");
      setChecked(null);
      setFileCheck(null);
      return;
    }
    setLookup(ref.toUpperCase());
    await verify(ref, file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) checkFile(file);
  }

  return (
    <section className="h-fit rounded-xl border bg-background p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <ShieldCheck className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Check a report</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Confirm who issued a register, and that a copy is unchanged.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? "border-primary bg-accent/40" : "hover:bg-secondary/60"
        }`}
      >
        <FileUp className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">Drop the PDF here, or choose it</span>
        <span className="text-xs text-muted-foreground">Checked in your browser. The file is not uploaded.</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) checkFile(file);
        }}
      />

      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or by reference
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="flex gap-2">
        <Input
          aria-label="Reference number"
          placeholder="SITE14-R-20261104-A3F91C08"
          value={lookup}
          onChange={(e) => setLookup(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && verify(lookup)}
          className="font-mono text-[13px]"
        />
        <Button type="button" variant="outline" onClick={() => verify(lookup)} disabled={checking || !lookup.trim()}>
          {checking ? <Loader2 className="animate-spin" /> : "Check"}
        </Button>
      </div>

      {checkError && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2.5 text-sm font-medium text-danger">{checkError}</p>}

      {fileCheck && (
        <div
          className={`mt-4 flex gap-2.5 rounded-lg px-3 py-3 text-sm ${fileCheck.matches ? "bg-ok-bg text-ok" : "bg-danger-bg text-danger"}`}
        >
          {fileCheck.matches ? <ShieldCheck className="mt-px size-4 shrink-0" /> : <ShieldAlert className="mt-px size-4 shrink-0" />}
          <p>
            <span className="font-semibold">{fileCheck.matches ? "Genuine and unchanged." : "This file does not match."}</span>{" "}
            {fileCheck.matches
              ? `${fileCheck.name} is exactly the register that was issued.`
              : `${fileCheck.name} differs from the issued register: it was edited, or it is another report.`}
          </p>
        </div>
      )}

      {checked && (
        <dl className="mt-4 grid gap-2.5 rounded-lg bg-secondary/60 px-4 py-3 text-sm">
          {!fileCheck && (
            <p className="flex items-center gap-1.5 font-medium text-ok">
              <CheckCircle2 className="size-4" />
              This reference was issued
            </p>
          )}
          <Row label="Site" value={checked.site} />
          <Row label="Client" value={checked.client ?? "—"} />
          <Row label="Period" value={periodLabel(checked.period_start, checked.period_end)} />
          <Row label="Type" value={checked.report_type.charAt(0).toUpperCase() + checked.report_type.slice(1)} />
          <Row label="Issued by" value={checked.issued_by} />
          <Row
            label="Issued at"
            value={new Date(checked.issued_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          />
          <div className="grid gap-1 border-t pt-2.5">
            <dt className="text-muted-foreground">Fingerprint (SHA-256)</dt>
            <dd className="font-mono text-[11px] break-all">{checked.sha256}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
