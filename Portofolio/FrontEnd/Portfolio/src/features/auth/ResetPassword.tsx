import { useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import FormField from "@/shared/components/FormField";
import { apiFetch } from "@/shared/lib/api";
import { resetPasswordSchema } from "@/shared/lib/validation";
import { useFormValidation } from "@/shared/lib/useFormValidation";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const form = useFormValidation(resetPasswordSchema);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setConfirmError("");

    const result = form.validateAll({ token, password });
    const mismatch = password !== confirm;

    if (mismatch) setConfirmError("The two passwords do not match");
    if (!result.ok || mismatch) return;

    setBusy(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(result.data),
      });
      navigate("/signin", { replace: true });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-md rounded-xl border bg-card p-8">
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">
            Link not valid
          </h1>
          <p className="text-sm text-muted-foreground">
            This page needs the link from your email. Ask for a new one.
          </p>
          <Link
            to="/forgot-password"
            className="mt-8 inline-block text-sm font-medium text-primary"
          >
            Send a new link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-md rounded-xl border bg-card p-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">
          Set a new password
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Choose a password you have not used before.
        </p>

        {formError && (
          <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
            {formError}
          </p>
        )}

        <form onSubmit={submit} noValidate>
          <FormField
            id="password"
            label="New password"
            type="password"
            hint="At least 10 characters"
            value={password}
            error={form.errors.password}
            onChange={(e) => {
              setPassword(e.target.value);
              form.handleChange({ token, password: e.target.value });
            }}
            onBlur={() => form.handleBlur("password", { token, password })}
          />

          <FormField
            id="confirm"
            label="Confirm new password"
            type="password"
            value={confirm}
            error={confirmError}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (confirmError) setConfirmError("");
            }}
          />

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving..." : "Save password"}
          </Button>

          <Link
            to="/signin"
            className="mt-5 inline-block text-sm font-medium text-muted-foreground hover:text-primary"
          >
            Back to sign in
          </Link>
        </form>
      </div>
    </main>
  );
}