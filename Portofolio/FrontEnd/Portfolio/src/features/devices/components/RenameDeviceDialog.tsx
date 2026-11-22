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
import { Button } from "@/components/ui/button";
import FormField from "@/shared/components/FormField";
import { updateDevice } from "../api";
import { displayName } from "../types";
import type { Device } from "../types";

type Props = {
  device: Device | null;
  onClose: () => void;
  onRenamed: () => void;
};

export default function RenameDeviceDialog({ device, onClose, onRenamed }: Props) {
  const [name, setName] = useState(device?.name ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!device) return;
    setBusy(true);
    setError("");
    try {
      await updateDevice(device.id, { name: name.trim() || null });
      onClose();
      onRenamed();
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
          <DialogTitle>Rename {device ? displayName(device) : "device"}</DialogTitle>
          <DialogDescription>A name your team recognises, like "Gate 2 tablet". Leave it empty to use the detected name.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          <FormField
            id="device_name"
            label="Name"
            value={name}
            maxLength={80}
            error={error}
            onChange={(e) => setName(e.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
