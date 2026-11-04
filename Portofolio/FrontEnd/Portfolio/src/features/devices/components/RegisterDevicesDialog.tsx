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
import { registerDevices } from "../api";
import { parseSerials } from "../types";
import type { DeviceWithKey } from "../types";

const MAX_BATCH = 500;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: (devices: DeviceWithKey[]) => void;
};

// One device or a whole box of them: paste the serials, one per line.
export default function RegisterDevicesDialog({ open, onOpenChange, onRegistered }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const { serials, repeated, invalid } = parseSerials(text);
  const tooMany = serials.length > MAX_BATCH;
  const ready = serials.length > 0 && invalid.length === 0 && !tooMany;

  function close() {
    setText("");
    setError("");
    onOpenChange(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      const res = await registerDevices(serials);
      setText("");
      onOpenChange(false);
      onRegistered(res.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.fields.serial_numbers ?? err.message);
      } else {
        setError("Could not register the devices. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register devices</DialogTitle>
          <DialogDescription>
            Paste the serial numbers printed on the devices, one per line. A
            column copied from a spreadsheet works too. Up to {MAX_BATCH} at once.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate>
          {error && (
            <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <div className="mb-3 grid gap-2">
            <Label htmlFor="device_serials">Serial numbers</Label>
            <textarea
              id="device_serials"
              rows={8}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError("");
              }}
              placeholder={"GPS-0001\nGPS-0002\nGPS-0003"}
              spellCheck={false}
              className="rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>

          <div className="mb-6 space-y-1 text-sm">
            <p className="font-medium">
              {serials.length} device{serials.length === 1 ? "" : "s"} to register
            </p>
            {repeated.length > 0 && (
              <p className="text-muted-foreground">
                Listed twice, registered once: {repeated.join(", ")}
              </p>
            )}
            {invalid.length > 0 && (
              <p className="text-danger">
                Fix these first: {invalid.slice(0, 5).map((i) => `"${i.serial}" (${i.message})`).join(", ")}
                {invalid.length > 5 && ` and ${invalid.length - 5} more`}
              </p>
            )}
            {tooMany && <p className="text-danger">Register at most {MAX_BATCH} at once.</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || busy}>
              {busy
                ? "Registering..."
                : `Register ${serials.length || ""} device${serials.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
