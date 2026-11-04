import { useEffect, useMemo, useState } from "react";
import { Download, FileText, ShieldCheck } from "lucide-react";
import AppShell from "@/shared/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/shared/lib/api";
import { listSites } from "@/features/sites/api";
import { generateReport, verifyReport } from "./api";
import type { GeneratedReport, ReportType, ReportVerification } from "./types";

type SiteOption = { id: string; name: string };

const riyadhToday = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00+03:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
};

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;

function rangeFor(type: ReportType) {
  const today = riyadhToday();
  if (type === "weekly") return { from: shiftDays(today, -6), to: today };
  if (type === "monthly") return { from: monthStart(today), to: today };
  return { from: today, to: today };
}

export default function ReportsPage() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [sitesError, setSitesError] = useState("");

  const [siteId, setSiteId] = useState("");
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [from, setFrom] = useState(riyadhToday());
  const [to, setTo] = useState(riyadhToday());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GeneratedReport | null>(null);

  const [lookup, setLookup] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [checked, setChecked] = useState<ReportVerification | null>(null);

  useEffect(() => {
    listSites(true)
      .then((res) => {
        setSites(res.data.map((s) => ({ id: s.id, name: s.name })));
        if (res.data.length) setSiteId(res.data[0].id);
      })
      .catch((err) =>
        setSitesError(err instanceof ApiError ? err.message : "Could not load sites."),
      );
  }, []);

  function pickType(next: ReportType) {
    setReportType(next);
    const range = rangeFor(next);
    setFrom(range.from);
    setTo(range.to);
  }

  const rangeInvalid = from > to;
  const canGenerate = Boolean(siteId) && !rangeInvalid && !busy;

  const siteName = useMemo(
    () => sites.find((s) => s.id === siteId)?.name ?? "",
    [sites, siteId],
  );

  async function handleGenerate() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await generateReport({ siteId, reportType, from, to }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate the report.");
    } finally {
      setBusy(false);
    }
  }

  function save(report: GeneratedReport) {
    const url = URL.createObjectURL(report.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = report.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function preview(report: GeneratedReport) {
    window.open(URL.createObjectURL(report.blob), "_blank", "noopener");
  }

  async function handleVerify() {
    const ref = lookup.trim();
    if (!ref) return;
    setChecking(true);
    setCheckError("");
    setChecked(null);
    try {
      setChecked(await verifyReport(ref));
    } catch (err) {
      setCheckError(
        err instanceof ApiError ? err.message : "Could not check this reference.",
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <AppShell title="Reports" subtitle="Issue an attendance register and verify one">
      {sitesError && (
        <p className="mb-5 rounded-md bg-warn-bg px-4 py-3 text-sm font-medium text-warn">
          {sitesError}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-lg border p-5">
          <h2 className="mb-1 text-sm font-medium">Attendance register</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Every hour on the register comes from recorded device sessions. Each file
            carries a reference number and a fingerprint, so a client can confirm the
            copy they hold is the one you issued.
          </p>

          <div className="mb-5 grid gap-2">
            <Label htmlFor="rep_site">Site</Label>
            <select
              id="rep_site"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {sites.length === 0 && <option value="">No active sites</option>}
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-5 grid gap-2">
            <Label>Period</Label>
            <div className="flex gap-2">
              {(["daily", "weekly", "monthly"] as ReportType[]).map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={reportType === t ? "default" : "outline"}
                  onClick={() => pickType(t)}
                  className="capitalize"
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="rep_from">From</Label>
              <Input
                id="rep_from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-invalid={rangeInvalid}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rep_to">To</Label>
              <Input
                id="rep_to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-invalid={rangeInvalid}
              />
            </div>
          </div>

          {rangeInvalid && (
            <p className="mb-4 text-sm font-medium text-destructive">
              The start date is after the end date.
            </p>
          )}

          {error && (
            <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <Button onClick={handleGenerate} disabled={!canGenerate}>
            <FileText />
            {busy ? "Generating..." : "Generate report"}
          </Button>

          {result && (
            <div className="mt-5 rounded-md border bg-ok-bg/40 p-4">
              <p className="text-sm font-medium text-ok">Report issued</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {siteName} &middot; {from === to ? from : `${from} to ${to}`}
              </p>
              <p className="mt-2 font-mono text-sm">{result.reference}</p>

              <div className="mt-4 flex gap-2">
                <Button type="button" onClick={() => save(result)}>
                  <Download />
                  Download
                </Button>
                <Button type="button" variant="outline" onClick={() => preview(result)}>
                  Open
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border p-5">
          <h2 className="mb-1 text-sm font-medium">Check a reference</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Shows who issued a report, when, and for which period.
          </p>

          <div className="grid gap-2">
            <Label htmlFor="rep_ref">Reference number</Label>
            <Input
              id="rep_ref"
              placeholder="SITE14-R-20261104-A3F91C08"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={handleVerify}
            disabled={checking || !lookup.trim()}
          >
            <ShieldCheck />
            {checking ? "Checking..." : "Check"}
          </Button>

          {checkError && (
            <p className="mt-4 text-sm font-medium text-destructive">{checkError}</p>
          )}

          {checked && (
            <dl className="mt-5 grid gap-2 text-sm">
              <Row label="Site" value={checked.site} />
              <Row label="Client" value={checked.client ?? "\u2014"} />
              <Row
                label="Period"
                value={
                  checked.period_start === checked.period_end
                    ? checked.period_start
                    : `${checked.period_start} to ${checked.period_end}`
                }
              />
              <Row label="Issued by" value={checked.issued_by} />
              <Row label="Issued at" value={checked.issued_at.slice(0, 16).replace("T", " ")} />
              <div className="mt-1 grid gap-1">
                <dt className="text-muted-foreground">Fingerprint</dt>
                <dd className="font-mono text-xs break-all">{checked.sha256}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
