import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import AppShell from "@/shared/components/AppShell";
import EmptyState from "@/shared/components/EmptyState";
import StatusBadge from "@/shared/components/StatusBadge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listEmployees } from "@/features/employees/api";
import type { Employee } from "@/features/employees/types";
import { initials } from "@/features/map/components/format";
import DailyRecordView from "./components/DailyRecordView";
import CorrectionForm from "./components/CorrectionForm";
import MovementTimeline from "./components/MovementTimeline";
import PathReplay from "./components/PathReplay";
import { getDailyRecord, getHistory } from "./api";
import { longDate, shiftDay, todayInRiyadh } from "./format";
import type { DailyRecord, MovementHistory } from "./types";

const fieldClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const TABS = ["record", "movement", "replay"] as const;
type Tab = (typeof TABS)[number];

type Loaded = { key: string; record: DailyRecord; movement: MovementHistory };

export default function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const employeeId = params.get("employee") ?? "";
  const today = todayInRiyadh();
  const date = params.get("date") ?? today;
  const tab: Tab = TABS.find((t) => t === params.get("tab")) ?? "record";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [listError, setListError] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [version, setVersion] = useState(0);

  // Removed employees are listed too: their days stay readable after they leave.
  useEffect(() => {
    listEmployees({ status: "all", limit: 100 })
      .then((res) => setEmployees(res.data))
      .catch((err) => setListError((err as Error).message));
  }, []);

  const key = `${employeeId}|${date}`;

  useEffect(() => {
    if (!employeeId) return;
    let current = true;
    setError("");
    Promise.all([getDailyRecord(employeeId, date), getHistory(employeeId, date)])
      .then(([record, movement]) => current && setLoaded({ key: `${employeeId}|${date}`, record, movement }))
      .catch((err) => {
        if (!current) return;
        setLoaded(null);
        setError((err as Error).message);
      });
    return () => {
      current = false;
    };
  }, [employeeId, date, version]);

  // Data for another worker or day is never shown under this one's name while the new day loads.
  const view = loaded && loaded.key === key ? loaded : null;
  const loading = Boolean(employeeId) && !view && !error;

  const { active, removed } = useMemo(
    () => ({
      active: employees.filter((e) => e.status === "active"),
      removed: employees.filter((e) => e.status !== "active"),
    }),
    [employees],
  );
  const chosen = employees.find((e) => e.id === employeeId);

  function choose(next: { employee?: string; date?: string; tab?: string }) {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined) continue;
      if (v) merged.set(k, v);
      else merged.delete(k);
    }
    setParams(merged, { replace: true });
  }

  const record = view?.record;

  return (
    <AppShell title="History" subtitle="A worker's day: attendance, time per zone, alerts and corrections">
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border bg-background p-4">
        <div className="grid min-w-0 flex-1 gap-1.5 sm:flex-none">
          <Label htmlFor="history_employee">Employee</Label>
          <select
            id="history_employee"
            value={employeeId}
            onChange={(e) => choose({ employee: e.target.value })}
            className={`${fieldClass} w-full sm:w-72`}
          >
            <option value="">Choose an employee</option>
            {/* Linked from elsewhere, but not in the first 100: keep it selectable. */}
            {employeeId && !chosen && record && <option value={employeeId}>{record.employee.full_name}</option>}
            <optgroup label="Active">
              {active.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                  {e.employee_number ? ` (${e.employee_number})` : ""}
                </option>
              ))}
            </optgroup>
            {removed.length > 0 && (
              <optgroup label="Removed">
                {removed.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                    {e.employee_number ? ` (${e.employee_number})` : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="history_date">Day</Label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => choose({ date: shiftDay(date, -1) })}
              aria-label="Previous day"
              className="inline-flex size-9 items-center justify-center rounded-md border border-input hover:bg-secondary"
            >
              <ChevronLeft className="size-4" />
            </button>
            <input
              id="history_date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && choose({ date: e.target.value <= today ? e.target.value : today })}
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => choose({ date: shiftDay(date, 1) })}
              disabled={date >= today}
              aria-label="Next day"
              className="inline-flex size-9 items-center justify-center rounded-md border border-input hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
            {date !== today && (
              <button
                type="button"
                onClick={() => choose({ date: "" })}
                className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-primary hover:bg-secondary"
              >
                <CalendarDays className="size-4" />
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      {listError && (
        <p className="mb-5 rounded-md bg-warn-bg px-4 py-3 text-sm font-medium text-warn">
          Could not load the employee list: {listError}
        </p>
      )}
      {error && <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}

      {!employeeId ? (
        <EmptyState
          title="Choose an employee"
          description="Pick a worker and a day to see their record, their movements and any corrections."
        />
      ) : loading ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      ) : view && record ? (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
              {initials(record.employee.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-tight">
                {record.employee.full_name}
                {chosen && chosen.status !== "active" && <StatusBadge tone="neutral">Removed</StatusBadge>}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {record.employee.job_category}
                {record.employee.employee_number ? ` · #${record.employee.employee_number}` : ""} · {longDate(record.date)}
              </p>
            </div>
            <Link
              to="/reports"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-secondary"
            >
              <FileText className="size-4" />
              Issue a report
            </Link>
          </div>

          <Tabs value={tab} onValueChange={(v) => choose({ tab: v === "record" ? "" : (v as Tab) })}>
            <TabsList className="mb-5">
              <TabsTrigger value="record">Daily record</TabsTrigger>
              <TabsTrigger value="movement">
                Movement
                {view.movement.sessions.length > 0 && (
                  <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{view.movement.sessions.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="replay">Replay</TabsTrigger>
            </TabsList>
            <TabsContent value="record">
              <DailyRecordView record={record} onCorrect={() => setCorrecting(true)} />
            </TabsContent>
            <TabsContent value="movement">
              <MovementTimeline history={view.movement} />
            </TabsContent>
            <TabsContent value="replay">
              {tab === "replay" && <PathReplay history={view.movement} />}
            </TabsContent>
          </Tabs>
          <CorrectionForm
            record={record}
            open={correcting}
            onOpenChange={setCorrecting}
            onSaved={() => setVersion((v) => v + 1)}
          />
        </>
      ) : !error ? (
        <EmptyState title="Nothing to show" description="Pick another employee or day." />
      ) : null}
    </AppShell>
  );
}
