import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Copy, Link2, RefreshCw, TimerOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { DEVICE_TYPE_LABEL } from "@/shared/lib/deviceTypes";
import { cancelPairing, createPairing, getPairing, listActiveEmployees } from "../api";
import { deviceDetails, displayName, pairUrl } from "../types";
import type { EmployeeOption, NewPairing, Pairing } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
};

type Step = "setup" | "waiting" | "connected" | "expired";

const POLL_MS = 2000;

function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  if (!until) return 0;
  return Math.max(0, Math.round((Date.parse(until) - now) / 1000));
}

export default function ConnectDeviceDialog({ open, onOpenChange, onConnected }: Props) {
  const [step, setStep] = useState<Step>("setup");
  const [employees, setEmployees] = useState<EmployeeOption[] | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [label, setLabel] = useState("");
  const [pairing, setPairing] = useState<NewPairing | null>(null);
  const [result, setResult] = useState<Pairing | null>(null);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingId = useRef<string | null>(null);

  const remaining = useCountdown(step === "waiting" ? pairing?.expires_at ?? null : null);
  const link = pairing ? pairUrl(pairing.code.replace("-", "")) : "";

  useEffect(() => {
    if (!open) return;
    listActiveEmployees()
      .then((res) => setEmployees(res.data))
      .catch(() => setEmployees([]));
  }, [open]);

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { margin: 1, width: 560, errorCorrectionLevel: "M", color: { dark: "#1A1A1A", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [link]);

  useEffect(() => {
    if (step !== "waiting" || !pairing) return;
    let stopped = false;
    const tick = async () => {
      try {
        const next = await getPairing(pairing.id);
        if (stopped) return;
        if (next.status === "claimed") {
          pendingId.current = null;
          setResult(next);
          setStep("connected");
          onConnected();
        } else if (next.status === "expired" || next.status === "cancelled") {
          pendingId.current = null;
          setStep("expired");
        }
      } catch {
        return;
      }
    };
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [step, pairing, onConnected]);

  useEffect(() => {
    if (step === "waiting" && remaining === 0 && pairing) setStep("expired");
  }, [remaining, step, pairing]);

  function reset() {
    setStep("setup");
    setPairing(null);
    setResult(null);
    setQr("");
    setCopied(false);
    setError("");
    setEmployeeId("");
    setLabel("");
  }

  function close() {
    if (pendingId.current) cancelPairing(pendingId.current).catch(() => undefined);
    pendingId.current = null;
    reset();
    onOpenChange(false);
  }

  async function start(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await createPairing({ employee_id: employeeId || null, label: label.trim() || undefined });
      pendingId.current = created.id;
      setPairing(created);
      setStep("waiting");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const free = (employees ?? []).filter((e) => !e.device);
  const device = result?.device;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        {step === "setup" && (
          <form onSubmit={start} noValidate>
            <DialogHeader>
              <DialogTitle>Connect a device</DialogTitle>
              <DialogDescription>
                Turn a phone, tablet, laptop or watch into a tracker. You get a QR
                code and a link. Open it on the device and it connects to your
                company on its own.
              </DialogDescription>
            </DialogHeader>

            {error && (
              <p className="mt-4 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>
            )}

            <div className="mt-5 grid gap-2">
              <Label htmlFor="pair_employee">Who will carry it</Label>
              <select
                id="pair_employee"
                value={employeeId}
                disabled={employees === null}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">{employees === null ? "Loading..." : "Decide later"}</option>
                {free.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                    {e.site_name ? ` · ${e.site_name}` : " · no site"}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Only employees without a device are listed.</p>
            </div>

            <div className="mt-4 mb-6 grid gap-2">
              <Label htmlFor="pair_label">Device name</Label>
              <Input
                id="pair_label"
                value={label}
                maxLength={80}
                placeholder="Detected automatically"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Creating..." : "Show QR code"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === "waiting" && pairing && (
          <>
            <DialogHeader>
              <DialogTitle>Scan with the device</DialogTitle>
              <DialogDescription>
                Point the device camera at the code, or open the link on it.
                {pairing.employee ? ` It will be given to ${pairing.employee.full_name}.` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 flex flex-col items-center gap-4">
              <div className="rounded-xl border bg-white p-3">
                {qr ? (
                  <img src={qr} alt={`QR code for ${link}`} className="size-56" />
                ) : (
                  <Skeleton className="size-56" />
                )}
              </div>

              <div className="text-center">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Or type this code at</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{pairUrl("").replace(/\/$/, "")}</p>
                <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.2em]">{pairing.code}</p>
              </div>

              <div className="flex w-full items-center gap-2 rounded-md border bg-secondary/50 px-3 py-2">
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{link}</span>
                <Button type="button" size="sm" variant="ghost" onClick={copyLink}>
                  <Copy />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>

              <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                Waiting for the device · expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
              </p>
            </div>

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "expired" && (
          <>
            <DialogHeader>
              <DialogTitle>The code expired</DialogTitle>
              <DialogDescription>No device used it in time. Make a new one to try again.</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-6">
              <TimerOff className="size-12 text-muted-foreground" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Close
              </Button>
              <Button type="button" onClick={() => start()} disabled={busy}>
                <RefreshCw />
                New code
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "connected" && device && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-ok" />
                Device connected
              </DialogTitle>
              <DialogDescription>It is now part of your company and sending from its browser.</DialogDescription>
            </DialogHeader>

            <div className="my-2 flex items-center gap-4 rounded-lg border p-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <DeviceIcon type={device.device_type} className="size-6" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{displayName(device)}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {DEVICE_TYPE_LABEL[device.device_type]}
                  {deviceDetails(device) ? ` · ${deviceDetails(device)}` : ""}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{device.serial_number}</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {device.employee
                ? `Assigned to ${device.employee.full_name}.`
                : "Not assigned yet. Assign it from the device list to start recording shifts."}
            </p>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={reset}>
                Connect another
              </Button>
              <Button type="button" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
