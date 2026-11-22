import { useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** What is kept and what changes, shown as a short list under the description. */
  details?: ReactNode[];
  confirmLabel: string;
  /** Runs the action. A thrown error is shown in the dialog, which then stays open. */
  onConfirm: () => Promise<unknown> | unknown;
  tone?: "danger" | "default";
  /** Why the action cannot happen right now. Shown instead of letting the server refuse it. */
  blockedReason?: ReactNode;
};

// One confirmation for every remove / deactivate action, instead of window.confirm:
// it says what happens, shows the server's reason when the action is refused, and
// cannot be clicked twice while the request is running.
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  details,
  confirmLabel,
  onConfirm,
  tone = "danger",
  blockedReason,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function change(next: boolean) {
    if (busy) return;
    if (!next) setError("");
    onOpenChange(next);
  }

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      setBusy(false);
      onOpenChange(false);
    } catch (err) {
      setBusy(false);
      setError((err as Error).message || "Something went wrong. Try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent showCloseButton={!busy} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {tone === "danger" && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
                <AlertTriangle className="size-4.5" />
              </span>
            )}
            <div className="grid gap-1.5 pt-0.5">
              <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {details && details.length > 0 && (
          <ul className="grid gap-1.5 rounded-lg bg-secondary/70 px-4 py-3 text-[13px] text-muted-foreground">
            {details.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        )}

        {blockedReason && (
          <div role="note" className="rounded-lg border border-warn/20 bg-warn-bg px-3 py-2.5 text-sm font-medium text-warn">
            {blockedReason}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2.5 text-sm font-medium text-danger">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => change(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={busy || Boolean(blockedReason)}
            className={tone === "danger" ? "bg-danger text-white hover:bg-danger/90" : undefined}
          >
            {busy && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
