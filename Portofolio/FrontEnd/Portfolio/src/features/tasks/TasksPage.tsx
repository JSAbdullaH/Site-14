import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import AppShell from "@/shared/components/AppShell";
import EmptyState from "@/shared/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getActiveSiteId, listSites } from "@/features/sites/api";
import type { SiteSummary } from "@/features/sites/types";
import { listEmployees } from "@/features/employees/api";
import type { Employee } from "@/features/employees/types";
import { listTasks } from "./api";
import { STATUS_LABEL } from "./types";
import type { Task, TaskStatus } from "./types";
import NewTaskDialog from "./components/NewTaskDialog";
import TaskStatusSelect from "./components/TaskStatusSelect";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// SITE-42, SITE-43, SITE-44: give workers tasks, move them along, and see one worker's tasks.
export default function TasksPage() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteId, setSiteId] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [day, setDay] = useState("");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    listSites(true)
      .then((res) => {
        setSites(res.data);
        const saved = getActiveSiteId();
        setSiteId(res.data.find((s) => s.id === saved)?.id ?? res.data[0]?.id ?? "");
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setEmployeeId("");
    if (!siteId) {
      setEmployees([]);
      return;
    }
    listEmployees({ siteId, status: "active", limit: 100 })
      .then((res) => setEmployees(res.data))
      .catch(() => setEmployees([]));
  }, [siteId]);

  const load = useCallback(() => {
    if (!siteId) {
      setTasks([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError("");
    listTasks({
      siteId,
      employeeId: employeeId || undefined,
      status: status || undefined,
      scheduledFor: day || undefined,
    })
      .then((res) => {
        setTasks(res.data);
        setTotal(res.total);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [siteId, employeeId, status, day]);

  useEffect(() => {
    load();
  }, [load]);

  function replace(task: Task) {
    if (status && task.status !== status) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setTotal((n) => n - 1);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
  }

  const employee = employees.find((e) => e.id === employeeId);
  const openCount = tasks.filter((t) => t.status !== "done").length;
  const filtered = Boolean(employeeId || status || day);

  return (
    <AppShell
      title={employee ? `${employee.full_name}'s tasks` : "Tasks"}
      subtitle={siteId ? `${total} task${total === 1 ? "" : "s"}, ${openCount} open` : "Work given to your crews"}
    >
      {error && (
        <p className="mb-5 rounded-md bg-warn-bg px-4 py-3 text-sm font-medium text-warn">{error}</p>
      )}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="tasks_site">Site</Label>
          <select
            id="tasks_site"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className={selectClass}
          >
            {sites.length === 0 && <option value="">No active sites</option>}
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="tasks_employee">Employee</Label>
          <select
            id="tasks_employee"
            value={employeeId}
            disabled={!siteId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className={selectClass}
          >
            <option value="">All employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="tasks_status">Status</Label>
          <select
            id="tasks_status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus | "")}
            className={selectClass}
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="tasks_day">Day</Label>
          <input
            id="tasks_day"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className={selectClass}
          />
        </div>

        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setEmployeeId("");
              setStatus("");
              setDay("");
            }}
          >
            Clear filters
          </Button>
        )}

        <div className="ml-auto">
          <Button onClick={() => setDialogOpen(true)} disabled={!siteId}>
            <Plus />
            New task
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !siteId ? (
        <EmptyState
          title="No active sites"
          description="Tasks belong to a site. Create a site and assign workers to it first."
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          title={filtered ? "No tasks match these filters" : "No tasks yet"}
          description={
            filtered
              ? "Try another employee, status or day."
              : "Give a worker a piece of work for a day, then move it along as it is done."
          }
          action={
            filtered ? undefined : <Button onClick={() => setDialogOpen(true)}>Create a task</Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Day</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Given by</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">{task.title}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setEmployeeId(task.employee.id)}
                      className="text-left hover:text-primary hover:underline"
                      title={`Show all tasks for ${task.employee.full_name}`}
                    >
                      {task.employee.full_name}
                    </button>
                  </TableCell>
                  <TableCell className="tabular-nums">{dayLabel(task.scheduled_for)}</TableCell>
                  <TableCell>
                    <TaskStatusSelect task={task} onChanged={replace} onError={setError} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{task.created_by.full_name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <NewTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={load}
        sites={sites}
        defaultSiteId={siteId || undefined}
        defaultEmployeeId={employeeId || undefined}
      />
    </AppShell>
  );
}
