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
import { employeeSchema } from "@/shared/lib/validation";
import { useFormValidation } from "@/shared/lib/useFormValidation";
import { listSites } from "@/features/sites/api";
import { updateEmployee } from "../api";
import type { Employee, UpdateEmployeeInput } from "../types";

type SiteOption = { id: string; name: string };

type Props = {
  // The tab mounts a fresh dialog per employee (key), so the fields start from it.
  employee: Employee;
  onClose: () => void;
  onSaved: () => void;
};

export default function EditEmployeeDialog({ employee, onClose, onSaved }: Props) {
  const [fullName, setFullName] = useState(employee.full_name);
  const [jobCategory, setJobCategory] = useState(employee.job_category);
  const [employeeNumber, setEmployeeNumber] = useState(employee.employee_number ?? "");
  const [siteId, setSiteId] = useState(employee.site_id ?? "");
  const [consent, setConsent] = useState(Boolean(employee.consent_given_at));

  const [sites, setSites] = useState<SiteOption[]>([]);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const form = useFormValidation(employeeSchema);

  const values = {
    full_name: fullName,
    job_category: jobCategory,
    employee_number: employeeNumber,
    site_id: siteId,
    consent,
  };

  useEffect(() => {
    listSites(true)
      .then((res) => setSites(res.data))
      .catch(() => setSites([]));
  }, []);

  // The current site stays choosable even if it was deactivated since.
  const siteOptions =
    employee.site_id && !sites.some((s) => s.id === employee.site_id)
      ? [{ id: employee.site_id, name: employee.site_name ?? "Current site" }, ...sites]
      : sites;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    const result = form.validateAll(values);
    if (!result.ok) return;
    const v = result.data;

    const changes: UpdateEmployeeInput = {};
    if (v.full_name !== employee.full_name) changes.full_name = v.full_name;
    if (v.job_category !== employee.job_category) changes.job_category = v.job_category;
    if ((v.employee_number ?? null) !== (employee.employee_number ?? null)) changes.employee_number = v.employee_number ?? null;
    if ((v.site_id ?? null) !== (employee.site_id ?? null)) changes.site_id = v.site_id ?? null;
    if (consent !== Boolean(employee.consent_given_at)) changes.consent = consent;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    setBusy(true);
    try {
      await updateEmployee(employee.id, changes);
      onClose();
      onSaved();
    } catch (err) {
      const fields = err instanceof ApiError ? err.fields : {};
      setFormError(fields.employee_number ?? fields.site_id ?? (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {employee.full_name}</DialogTitle>
          <DialogDescription>
            Moving a worker to another site sends their hours there from now on.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate>
          {formError && (
            <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
              {formError}
            </p>
          )}

          <FormField
            id="edit_full_name"
            label="Full name"
            value={fullName}
            error={form.errors.full_name}
            onChange={(e) => {
              setFullName(e.target.value);
              form.handleChange({ ...values, full_name: e.target.value });
            }}
            onBlur={() => form.handleBlur("full_name", values)}
          />

          <FormField
            id="edit_job_category"
            label="Job category"
            hint="Sets the daily hour limit for this worker"
            value={jobCategory}
            error={form.errors.job_category}
            onChange={(e) => {
              setJobCategory(e.target.value);
              form.handleChange({ ...values, job_category: e.target.value });
            }}
            onBlur={() => form.handleBlur("job_category", values)}
          />

          <FormField
            id="edit_number"
            label="Employee number"
            hint="Optional, must be unique in your company"
            value={employeeNumber}
            error={form.errors.employee_number}
            onChange={(e) => {
              setEmployeeNumber(e.target.value);
              form.handleChange({ ...values, employee_number: e.target.value });
            }}
            onBlur={() => form.handleBlur("employee_number", values)}
          />

          <div className="mb-5 grid gap-2">
            <Label htmlFor="edit_site">Site</Label>
            <select
              id="edit_site"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Not assigned</option>
              {siteOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <label className="mb-6 flex items-start gap-3 rounded-md border bg-secondary/40 p-4 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              <span className="font-medium">
                This worker signed the location-tracking consent form.
              </span>
              <span className="mt-1 block text-muted-foreground">
                Without it, nothing their device sends is stored. Consent cannot
                be withdrawn while they are on site.
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
