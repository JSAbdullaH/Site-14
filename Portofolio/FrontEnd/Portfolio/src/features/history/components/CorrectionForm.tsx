import { useState } from "react";
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
import { ApiError } from "@/shared/lib/api";
import { correctionSchema } from "@/shared/lib/validation";
import { useFormValidation } from "@/shared/lib/useFormValidation";
import { addCorrection } from "../api";
import { FIELD_LABELS, formatMinutes, longDate } from "../format";
import type { CorrectableField, DailyRecord } from "../types";

type Props = {
  record: DailyRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

const inputClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

export default function CorrectionForm({ record, open, onOpenChange, onSaved }: Props) {
  const [field, setField] = useState<CorrectableField>("worked_minutes");
  const [clock, setClock] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const form = useFormValidation(correctionSchema);
  const values = { field, clock, hours, minutes, reason };
  const current = record.attendance[field];
  const shown = (v: string | number | null) =>
    v === null || v === "" ? "nothing" : field === "worked_minutes" ? formatMinutes(Number(v)) : String(v);

  function reset() {
    setField("worked_minutes");
    setClock("");
    setHours("");
    setMinutes("");
    setReason("");
    setFormError("");
    setServerErrors({});
    form.reset();
  }

  // Cancel button, X, click outside
  function close() {
    reset();
    onOpenChange(false);
  }

  const valueError = form.errors.clock ?? form.errors.hours ?? serverErrors.corrected_value;

  // Save correction button
  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setServerErrors({});
    const result = form.validateAll(values);
    if (!result.ok) return;

    const correctedValue =
      field === "worked_minutes" ? String(Number(hours || 0) * 60 + Number(minutes || 0)) : clock;

    setBusy(true);
    try {
      await addCorrection(record.employee.id, {
        date: record.date,
        field,
        corrected_value: correctedValue,
        reason: result.data.reason,
      });
      close();
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setServerErrors(err.fields);
      } else {
        setFormError((err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct the record</DialogTitle>
          <DialogDescription>
            {record.employee.full_name}, {longDate(record.date)}. The recorded value stays visible next to
            your correction.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate>
          {formError && (
            <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{formError}</p>
          )}

          <div className="mb-5 grid gap-2">
            <Label htmlFor="correction_field">What to correct</Label>
            {/* What to correct -> setField() */}
            <select
              id="correction_field"
              value={field}
              onChange={(e) => {
                setField(e.target.value as CorrectableField);
                setServerErrors({});
                form.reset();
              }}
              className={inputClass}
            >
              {(["worked_minutes", "first_seen", "last_seen"] as const).map((f) => (
                <option key={f} value={f}>
                  {FIELD_LABELS[f]}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">
              Recorded now: <span className="font-medium text-foreground">{shown(current.value)}</span>
              {current.corrected && <> (originally {shown(current.original)})</>}
            </p>
          </div>

          <div className="mb-5 grid gap-2">
            <Label htmlFor={field === "worked_minutes" ? "correction_hours" : "correction_clock"}>Correct value</Label>
            {field === "worked_minutes" ? (
              <div className="flex items-center gap-2">
                <input
                  id="correction_hours"
                  type="number"
                  min={0}
                  max={24}
                  inputMode="numeric"
                  value={hours}
                  aria-invalid={Boolean(valueError)}
                  onChange={(e) => setHours(e.target.value)}
                  className={`${inputClass} w-20`}
                />
                <span className="text-sm text-muted-foreground">h</span>
                <input
                  id="correction_minutes"
                  type="number"
                  min={0}
                  max={59}
                  inputMode="numeric"
                  value={minutes}
                  aria-invalid={Boolean(valueError)}
                  onChange={(e) => setMinutes(e.target.value)}
                  className={`${inputClass} w-20`}
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
            ) : (
              <input
                id="correction_clock"
                type="time"
                value={clock}
                aria-invalid={Boolean(valueError)}
                onChange={(e) => setClock(e.target.value)}
                className={`${inputClass} w-36`}
              />
            )}
            {valueError && <p className="text-sm font-medium text-destructive">{valueError}</p>}
          </div>

          <div className="mb-5 grid gap-2">
            <Label htmlFor="correction_reason">Reason</Label>
            <textarea
              id="correction_reason"
              rows={3}
              value={reason}
              aria-invalid={Boolean(form.errors.reason ?? serverErrors.reason)}
              onChange={(e) => {
                setReason(e.target.value);
                form.handleChange({ ...values, reason: e.target.value });
              }}
              onBlur={() => form.handleBlur("reason", values)}
              placeholder="For example: device left in the site office, supervisor confirmed exit at 15:10"
              className={`${inputClass} h-auto py-2`}
            />
            {(form.errors.reason ?? serverErrors.reason) && (
              <p className="text-sm font-medium text-destructive">{form.errors.reason ?? serverErrors.reason}</p>
            )}
          </div>

          <DialogFooter>
            {/* Cancel -> close() */}
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            {/* Save correction -> submit() */}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save correction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
