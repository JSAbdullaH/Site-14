import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ShippedKey } from "../types";

type Props = { reference: string | null; keys: ShippedKey[]; onClose: () => void };

export default function ShipKeysDialog({ reference, keys, onClose }: Props) {
  function download() {
    const csv = ["serial_number,device_type,name,api_key", ...keys.map((k) => `${k.serial_number},${k.device_type},"${(k.name ?? "").replace(/"/g, '""')}",${k.api_key}`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reference ?? "order"}-device-keys.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={keys.length > 0} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Load these keys before shipping</DialogTitle>
          <DialogDescription>
            Order {reference} is marked as shipped. Flash each key onto its device so it connects to the customer on first
            power-on. The keys are shown only now.
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
              {keys.map((k) => (
                <tr key={k.serial_number} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{k.serial_number}</td>
                  <td className="break-all px-3 py-2 font-mono text-xs">{k.api_key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={download}>
            <Download />
            Download CSV
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
