import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import FormField from "@/shared/components/FormField";
import { apiFetch } from "@/shared/lib/api";
import { emailOnlySchema } from "@/shared/lib/validation";
import { useFormValidation } from "@/shared/lib/useFormValidation";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const form = useFormValidation(emailOnlySchema);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    const result = form.validateAll({ email });
    if (!result.ok) return;

    setBusy(true);
    try {
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(result.data),
      });
      setSent(true);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-md rounded-xl border bg-card p-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">
          {sent ? "Check your email" : "Reset password"}
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          {sent
            ? "The link works once and expires shortly."
            : "We will send you a link to set a new password."}
        </p>

        {formError && (
          <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
            {formError}
          </p>
        )}

        {sent ? (
          <>
            <p className="text-sm text-muted-foreground">
              If an account exists for{" "}
              <span className="font-medium text-foreground">{email}</span>, the
              link is on its way.
            </p>
            <Link
              to="/signin"
              className="mt-8 inline-block text-sm font-medium text-primary"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <FormField
              id="email"
              label="Email"
              type="email"
              value={email}
              error={form.errors.email}
              onChange={(e) => {
                setEmail(e.target.value);
                form.handleChange({ email: e.target.value });
              }}
              onBlur={() => form.handleBlur("email", { email })}
            />

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending..." : "Send reset link"}
            </Button>

            <Link
              to="/signin"
              className="mt-5 inline-block text-sm font-medium text-muted-foreground hover:text-primary"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}