import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "@/shared/components/AppShell";
import EmptyState from "@/shared/components/EmptyState";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listEmployees } from "@/features/employees/api";
import type { Employee } from "@/features/employees/types";
import DailyRecordView from "./components/DailyRecordView";
import CorrectionForm from "./components/CorrectionForm";
import MovementTimeline from "./components/MovementTimeline";
import { getDailyRecord, getHistory } from "./api";
import { longDate, todayInRiyadh } from "./format";
import type { DailyRecord, MovementHistory } from "./types";

const fieldClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const employeeId = params.get("employee") ?? "";
  const date = params.get("date") ?? todayInRiyadh();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [record, setRecord] = useState<DailyRecord | null>(null);
  const [movement, setMovement] = useState<MovementHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    listEmployees({ limit: 100 })
      .then((res) => setEmployees(res.data))
      .catch((err) => setError((err as Error).message));
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    let current = true;
    setLoading(true);
    setError("");
    Promise.all([getDailyRecord(employeeId, date), getHistory(employeeId, date)])
      .then(([day, moves]) => {
        if (!current) return;
        setRecord(day);
        setMovement(moves);
      })
      .catch((err) => {
        if (!current) return;
        setRecord(null);
        setMovement(null);
        setError((err as Error).message);
      })
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [employeeId, date, version]);

  // Employee dropdown + Day input
  function choose(next: { employee?: string; date?: string }) {
    const merged = new URLSearchParams(params);
    if (next.employee !== undefined) merged.set("employee", next.employee);
    if (next.date !== undefined) merged.set("date", next.date);
    setParams(merged, { replace: true });
  }

  return (
    <AppShell title="History" subtitle="A worker's day: attendance, time per zone, alerts and corrections">
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="grid gap-2">
          <Label htmlFor="history_employee">Employee</Label>
          {/* Employee dropdown -> choose() */}
          <select
            id="history_employee"
            value={employeeId}
            onChange={(e) => choose({ employee: e.target.value })}
            className={`${fieldClass} min-w-64`}
          >
            <option value="">Choose an employee</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
                {e.employee_number ? ` (${e.employee_number})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="history_date">Day</Label>
          {/* Day input -> choose() */}
          <input
            id="history_date"
            type="date"
            value={date}
            max={todayInRiyadh()}
            onChange={(e) => e.target.value && choose({ date: e.target.value })}
            className={fieldClass}
          />
        </div>
      </div>

      {error && (
        <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>
      )}

      {!employeeId ? (
        <EmptyState
          title="Choose an employee"
          description="Pick a worker and a day to see their record, their movements and any corrections."
        />
      ) : loading && !record ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : record ? (
        <>
          <h2 className="mb-4 text-lg font-semibold">
            {record.employee.full_name}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{longDate(record.date)}</span>
          </h2>
          <Tabs defaultValue="record">
            <TabsList className="mb-5">
              <TabsTrigger value="record">Daily record</TabsTrigger>
              <TabsTrigger value="movement">Movement</TabsTrigger>
            </TabsList>
            <TabsContent value="record">
              <DailyRecordView record={record} onCorrect={() => setCorrecting(true)} />
            </TabsContent>
            <TabsContent value="movement">
              {movement && <MovementTimeline history={movement} />}
            </TabsContent>
          </Tabs>
          <CorrectionForm
            record={record}
            open={correcting}
            onOpenChange={setCorrecting}
            onSaved={() => setVersion((v) => v + 1)}
          />
        </>
      ) : null}
    </AppShell>
  );
}
