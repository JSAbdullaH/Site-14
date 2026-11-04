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
import { employeeSchema } from "@/shared/lib/validation";
import { useFormValidation } from "@/shared/lib/useFormValidation";
import { listSites } from "@/features/sites/api";
import { createEmployee } from "../api";

type SiteOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  onImportClick: () => void;
};

export default function AddEmployeeDialog({
  open,
  onOpenChange,
  onCreated,
  onImportClick,
}: Props) {
  const [fullName, setFullName] = useState("");
  const [jobCategory, setJobCategory] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [siteId, setSiteId] = useState("");
  const [consent, setConsent] = useState(false);

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
    if (!open) return;
    listSites(true)
      .then((res) => setSites(res.data))
      .catch(() => setSites([]));
  }, [open]);

  function reset() {
    setFullName("");
    setJobCategory("");
    setEmployeeNumber("");
    setSiteId("");
    setConsent(false);
    setFormError("");
    form.reset();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    const result = form.validateAll(values);
    if (!result.ok) return;

    setBusy(true);
    try {
      await createEmployee(result.data);
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>
            A field worker who wears a tracking device. They do not sign in.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate>
          {formError && (
            <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
              {formError}
            </p>
          )}

          <FormField
            id="emp_full_name"
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
            id="emp_job_category"
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
            id="emp_number"
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
            <Label htmlFor="emp_site">Site</Label>
            <select
              id="emp_site"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Not assigned yet</option>
              {sites.map((s) => (
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
                I confirm this worker signed the location-tracking consent form.
              </span>
              <span className="mt-1 block text-muted-foreground">
                Without it the worker is saved but cannot start a shift, so no
                position is ever recorded.
              </span>
            </span>
          </label>

          <DialogFooter className="sm:justify-between">
            <button
              type="button"
              onClick={() => {
                reset();
                onOpenChange(false);
                onImportClick();
              }}
              className="text-sm font-medium text-muted-foreground hover:text-primary"
            >
              Import from CSV
            </button>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Adding..." : "Add employee"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}