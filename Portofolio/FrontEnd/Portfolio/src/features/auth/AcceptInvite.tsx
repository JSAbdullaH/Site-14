import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import FormField from "@/shared/components/FormField";
import { apiFetch } from "@/shared/lib/api";
import { saveToken, saveUser } from "@/shared/lib/auth";
import type { SessionUser } from "@/shared/lib/auth";
import { newPassword } from "@/shared/lib/validation";
import { z } from "zod";
import { useFormValidation } from "@/shared/lib/useFormValidation";

type Invitation = {
  full_name: string;
  email: string;
  role: "company_admin" | "site_manager";
  company_name: string;
};

type Session = { access_token: string; user: SessionUser };

const acceptSchema = z.object({ password: newPassword });

const ROLE_LABEL = { company_admin: "company admin", site_manager: "site manager" } as const;

// The link in the invitation email: /invite/<token>. The invited person picks a
// password here and is signed in straight away.
export default function AcceptInvite() {
  const { token = "" } = useParams();
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [invalid, setInvalid] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const form = useFormValidation(acceptSchema);

  useEffect(() => {
    apiFetch<Invitation>(`/invitations/${encodeURIComponent(token)}`)
      .then(setInvitation)
      .catch((err: Error) => setInvalid(err.message));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setConfirmError("");

    const result = form.validateAll({ password });
    const mismatch = password !== confirm;
    if (mismatch) setConfirmError("The two passwords do not match");
    if (!result.ok || mismatch) return;

    setBusy(true);
    try {
      const session = await apiFetch<Session>(`/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: JSON.stringify(result.data),
      });
      saveToken(session.access_token);
      saveUser(session.user);
      navigate("/home", { replace: true });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-md rounded-xl border bg-card p-8">
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Invitation not valid</h1>
          <p className="text-sm text-muted-foreground">
            {invalid}. Ask your company admin to send the invitation again.
          </p>
          <Link to="/signin" className="mt-8 inline-block text-sm font-medium text-primary">
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-md rounded-xl border bg-card p-8">
        {!invitation ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-semibold tracking-tight">
              Join {invitation.company_name}
            </h1>
            <p className="mb-8 text-sm text-muted-foreground">
              Hello {invitation.full_name}, you were invited as a{" "}
              {ROLE_LABEL[invitation.role]}. Choose a password to finish setting
              up your account.
            </p>

            {formError && (
              <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
                {formError}
              </p>
            )}

            <form onSubmit={submit} noValidate>
              <FormField id="invite_email" label="Email" value={invitation.email} readOnly disabled />

              <FormField
                id="password"
                label="Password"
                type="password"
                autoComplete="new-password"
                hint="At least 10 characters"
                value={password}
                error={form.errors.password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  form.handleChange({ password: e.target.value });
                }}
                onBlur={() => form.handleBlur("password", { password })}
              />

              <FormField
                id="confirm"
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                error={confirmError}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  if (confirmError) setConfirmError("");
                }}
              />

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Setting up..." : "Create account and sign in"}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
