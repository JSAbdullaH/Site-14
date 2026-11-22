import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Copy } from "lucide-react";
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
import { deviceSerial } from "@/shared/lib/validation";
import { assignDevice, listFreeDevices, registerDevice } from "../api";
import type { DeviceOption, Employee } from "../types";

type Mode = "existing" | "new";

type Props = {
  // The tab mounts a fresh dialog per employee (key), so state starts empty.
  employee: Employee;
  onClose: () => void;
  onChanged: () => void;
};

// Give a worker a device: one already registered, or a new serial registered here.
export default function EmployeeDeviceDialog({ employee, onClose, onChanged }: Props) {
  const current = employee.device ?? null;

  const [free, setFree] = useState<DeviceOption[] | null>(null);
  const [mode, setMode] = useState<Mode>("existing");
  const [deviceId, setDeviceId] = useState("");
  const [serial, setSerial] = useState("");
  const [serialError, setSerialError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Set after registering: the key is shown once, then the dialog only closes.
  const [created, setCreated] = useState<{ serial_number: string; api_key: string; notAssigned?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    listFreeDevices()
      .then((res) => {
        setFree(res.data);
        if (!res.data.length) setMode("new");
      })
      .catch((err: Error) => {
        setFree([]);
        setMode("new");
        setError(`Could not load devices: ${err.message}`);
      });
  }, []);

  // One device per worker: the current one is taken back before the new one is given.
  async function giveBack() {
    if (current) await assignDevice(current.id, null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (mode === "existing" && !deviceId) return;
    let cleanSerial = "";
    if (mode === "new") {
      const parsed = deviceSerial.safeParse(serial);
      if (!parsed.success) {
        setSerialError(parsed.error.issues[0].message);
        return;
      }
      cleanSerial = parsed.data;
    }

    setBusy(true);
    try {
      if (mode === "existing") {
        await giveBack();
        await assignDevice(deviceId, employee.id);
        onClose();
      } else {
        // Registered first, so a taken serial is refused before the current device is touched.
        const device = await registerDevice(cleanSerial);
        try {
          await giveBack();
          await assignDevice(device.id, employee.id);
          setCreated(device);
        } catch (err) {
          // The device exists now: its key must still be shown, or it is lost.
          setCreated({ ...device, notAssigned: (err as Error).message });
        }
      }
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.fields.serial_number) setSerialError(err.fields.serial_number);
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function takeBack() {
    if (!current || !window.confirm(`Take ${current.serial_number} back from ${employee.full_name}?`)) return;
    setBusy(true);
    setError("");
    try {
      await giveBack();
      onClose();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.api_key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {created.notAssigned
                  ? `${created.serial_number} is registered`
                  : `${created.serial_number} is now worn by ${employee.full_name}`}
              </DialogTitle>
              <DialogDescription>
                Load this key onto the device. It is shown only this once; if it
                is lost, make a new one on the Devices page.
              </DialogDescription>
            </DialogHeader>

            {created.notAssigned && (
              <p className="rounded-md bg-warn-bg px-4 py-3 text-sm text-warn">
                It was not given to {employee.full_name}: {created.notAssigned} It
                waits, unassigned, on the Devices page.
              </p>
            )}

            <p className="break-all rounded-md border bg-secondary/40 px-3 py-3 font-mono text-sm">
              {created.api_key}
            </p>

            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="outline" onClick={copyKey}>
                <Copy />
                {copied ? "Copied" : "Copy key"}
              </Button>
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{current ? "Change device" : "Add device"}</DialogTitle>
              <DialogDescription>
                {current
                  ? `${employee.full_name} wears ${current.serial_number}. A new device replaces it.`
                  : `Everything the device sends is recorded for ${employee.full_name}.`}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} noValidate>
              {error && (
                <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
                  {error}
                </p>
              )}

              <div className="mb-5 inline-flex rounded-md border p-0.5">
                {(["existing", "new"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={m === "existing" && free !== null && free.length === 0}
                    onClick={() => setMode(m)}
                    className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                      mode === m ? "bg-secondary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "existing" ? "Registered device" : "New device"}
                  </button>
                ))}
              </div>

              {mode === "existing" ? (
                <div className="mb-5 grid gap-2">
                  <Label htmlFor="emp_device">Device</Label>
                  <select
                    id="emp_device"
                    value={deviceId}
                    disabled={free === null}
                    onChange={(e) => setDeviceId(e.target.value)}
                    className="h-9 rounded-md border border-input bg-transparent px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <option value="">{free === null ? "Loading..." : "Choose an unassigned device"}</option>
                    {(free ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.serial_number}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <FormField
                  id="emp_device_serial"
                  label="Serial number"
                  hint="As printed on the device. It is registered and given to this worker."
                  value={serial}
                  error={serialError}
                  className="font-mono"
                  onChange={(e) => {
                    setSerial(e.target.value);
                    setSerialError("");
                  }}
                />
              )}

              {!employee.consent_given_at && (
                <p className="mb-5 rounded-md bg-warn-bg px-4 py-3 text-sm text-warn">
                  {employee.full_name} has not signed the tracking consent form.
                  Nothing the device sends is stored until they do.
                </p>
              )}

              <DialogFooter className={current ? "sm:justify-between" : undefined}>
                {current && (
                  <Button type="button" variant="outline" disabled={busy} onClick={takeBack}>
                    Take back {current.serial_number}
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy || (mode === "existing" ? !deviceId : !serial.trim())}>
                    {busy ? "Saving..." : mode === "new" ? "Register and assign" : current ? "Replace device" : "Assign device"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
