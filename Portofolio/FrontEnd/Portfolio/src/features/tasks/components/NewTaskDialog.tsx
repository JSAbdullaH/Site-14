import { useEffect, useState } from "react";
import type { FormEvent } from "react";
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
import FormField from "@/shared/components/FormField";
import { ApiError } from "@/shared/lib/api";
import { listEmployees } from "@/features/employees/api";
import type { Employee } from "@/features/employees/types";
import { createTask } from "../api";
import { todayInRiyadh } from "../types";

type SiteOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  sites: SiteOption[];
  defaultSiteId?: string;
  defaultEmployeeId?: string;
};

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

export default function NewTaskDialog({
  open,
  onOpenChange,
  onCreated,
  sites,
  defaultSiteId,
  defaultEmployeeId,
}: Props) {
  const [title, setTitle] = useState("");
  const [siteId, setSiteId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [scheduledFor, setScheduledFor] = useState(todayInRiyadh());

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSiteId(defaultSiteId ?? sites[0]?.id ?? "");
    setEmployeeId(defaultEmployeeId ?? "");
  }, [open, defaultSiteId, defaultEmployeeId, sites]);

  useEffect(() => {
    if (!open || !siteId) {
      setEmployees([]);
      return;
    }
    listEmployees({ siteId, status: "active", limit: 100 })
      .then((res) => setEmployees(res.data))
      .catch(() => setEmployees([]));
  }, [open, siteId]);

  function reset() {
    setTitle("");
    setEmployeeId("");
    setScheduledFor(todayInRiyadh());
    setErrors({});
    setFormError("");
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function validate() {
    const next: Record<string, string> = {};
    if (title.trim().length < 2) next.title = "Enter a task title";
    if (title.trim().length > 150) next.title = "Use at most 150 characters";
    if (!siteId) next.site_id = "Choose a site";
    if (!employeeId) next.employee_id = "Choose an employee";
    if (!scheduledFor) next.scheduled_for = "Choose a day";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;

    setBusy(true);
    try {
      await createTask({
        title: title.trim(),
        employee_id: employeeId,
        site_id: siteId,
        scheduled_for: scheduledFor,
      });
      close();
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Give a worker a piece of work for a day.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate>
          {formError && (
            <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
              {formError}
            </p>
          )}

          <FormField
            id="task_title"
            label="Task"
            placeholder="Pour the second floor slab"
            value={title}
            maxLength={150}
            error={errors.title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="mb-5 grid gap-2">
            <Label htmlFor="task_site">Site</Label>
            <select
              id="task_site"
              value={siteId}
              aria-invalid={Boolean(errors.site_id)}
              onChange={(e) => {
                setSiteId(e.target.value);
                setEmployeeId("");
              }}
              className={selectClass}
            >
              <option value="">Choose a site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.site_id && <p className="text-sm font-medium text-destructive">{errors.site_id}</p>}
          </div>

          <div className="mb-5 grid gap-2">
            <Label htmlFor="task_employee">Employee</Label>
            <select
              id="task_employee"
              value={employeeId}
              disabled={!siteId}
              aria-invalid={Boolean(errors.employee_id)}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={selectClass}
            >
              <option value="">
                {siteId && employees.length === 0 ? "No active workers on this site" : "Choose an employee"}
              </option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name}
                </option>
              ))}
            </select>
            {errors.employee_id && (
              <p className="text-sm font-medium text-destructive">{errors.employee_id}</p>
            )}
          </div>

          <FormField
            id="task_day"
            label="Day"
            type="date"
            value={scheduledFor}
            error={errors.scheduled_for}
            onChange={(e) => setScheduledFor(e.target.value)}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating..." : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
