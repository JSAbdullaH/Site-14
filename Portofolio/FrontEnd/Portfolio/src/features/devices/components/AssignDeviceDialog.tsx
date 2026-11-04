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
import { listActiveEmployees, updateDevice } from "../api";
import type { Device, EmployeeOption } from "../types";

type Props = {
  device: Device | null;
  onClose: () => void;
  onAssigned: () => void;
};

export default function AssignDeviceDialog({ device, onClose, onAssigned }: Props) {
  const [employees, setEmployees] = useState<EmployeeOption[] | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // The page mounts a fresh dialog for each device (key), so state starts empty here.
  useEffect(() => {
    if (!device) return;
    listActiveEmployees()
      .then((res) => setEmployees(res.data))
      .catch((err: Error) => {
        setEmployees([]);
        setError(`Could not load employees: ${err.message}`);
      });
  }, [device]);

  // A worker wears one device: those who already have another are not offered.
  const free = (employees ?? []).filter((e) => !e.device || e.device.id === device?.id);
  const chosen = free.find((e) => e.id === employeeId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!device || !employeeId) return;
    setBusy(true);
    setError("");
    try {
      await updateDevice(device.id, { employee_id: employeeId });
      onClose();
      onAssigned();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(device)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign {device?.serial_number}</DialogTitle>
          <DialogDescription>
            Everything this device sends from now on is recorded for the
            employee you choose.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate>
          {error && (
            <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <div className="mb-4 grid gap-2">
            <Label htmlFor="assign_employee">Employee</Label>
            <select
              id="assign_employee"
              value={employeeId}
              disabled={employees === null}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">
                {employees === null
                  ? "Loading..."
                  : free.length
                    ? "Choose an employee"
                    : "Every active employee already wears a device"}
              </option>
              {free.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                  {e.site_name ? ` · ${e.site_name}` : " · no site"}
                </option>
              ))}
            </select>
          </div>

          {chosen && !chosen.consent_given_at && (
            <p className="mb-4 rounded-md bg-warn-bg px-4 py-3 text-sm text-warn">
              {chosen.full_name} has not signed the tracking consent form. The
              device can be assigned, but nothing it sends is stored until they do.
            </p>
          )}
          {chosen && chosen.consent_given_at && !chosen.site_name && (
            <p className="mb-4 rounded-md bg-warn-bg px-4 py-3 text-sm text-warn">
              {chosen.full_name} is not assigned to a site yet. Readings are
              stored once they are.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!employeeId || busy}>
              {busy ? "Assigning..." : "Assign device"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
