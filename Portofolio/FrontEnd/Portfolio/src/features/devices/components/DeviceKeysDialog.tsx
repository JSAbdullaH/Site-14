import { useState } from "react";
import { Copy, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { keysCsv } from "../types";
import type { DeviceWithKey } from "../types";

type Props = {
  devices: DeviceWithKey[];
  onClose: () => void;
};

// Keys are shown once. The server keeps only a hash, so a lost key means a new one.
export default function DeviceKeysDialog({ devices, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const open = devices.length > 0;
  const csv = keysCsv(devices);

  function download() {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `device-keys-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {devices.length === 1 ? "Device key" : `Keys for ${devices.length} devices`}
          </DialogTitle>
          <DialogDescription>
            Load each key onto its device. This is the only time the keys are
            shown: download them now and keep the file somewhere safe.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Serial</th>
                <th className="px-3 py-2 font-medium">Key</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{d.serial_number}</td>
                  <td className="break-all px-3 py-2 font-mono text-xs">{d.api_key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={download}>
              <Download />
              Download CSV
            </Button>
            <Button type="button" variant="outline" onClick={copy}>
              <Copy />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
