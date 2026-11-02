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
import FormField from "@/shared/components/FormField";
import { inviteSchema } from "@/shared/lib/validation";
import { useFormValidation } from "@/shared/lib/useFormValidation";
import { inviteUser } from "../api";
import type { Role } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
};

export default function InviteDialog({ open, onOpenChange, onInvited }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("site_manager");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const form = useFormValidation(inviteSchema);

  const values = { full_name: fullName, email, role };

  function reset() {
    setFullName("");
    setEmail("");
    setRole("site_manager");
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
      await inviteUser(result.data);
      reset();
      onOpenChange(false);
      onInvited();
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
          <DialogTitle>Invite manager</DialogTitle>
          <DialogDescription>
            They will receive an email to set their own password.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate>
          {formError && (
            <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
              {formError}
            </p>
          )}

          <FormField
            id="invite_full_name"
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
            id="invite_email"
            label="Email"
            type="email"
            value={email}
            error={form.errors.email}
            onChange={(e) => {
              setEmail(e.target.value);
              form.handleChange({ ...values, email: e.target.value });
            }}
            onBlur={() => form.handleBlur("email", values)}
          />

          <div className="mb-5 grid gap-2">
            <Label htmlFor="invite_role">Role</Label>
            <select
              id="invite_role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="site_manager">Site manager</option>
              <option value="company_admin">Company admin</option>
            </select>
          </div>

          <DialogFooter>
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
              {busy ? "Sending..." : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
