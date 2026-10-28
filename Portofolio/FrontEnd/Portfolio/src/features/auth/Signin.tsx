import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import FormField from "@/shared/components/FormField";
import { apiFetch } from "@/shared/lib/api";
import { saveToken, saveUser } from "@/shared/lib/auth";
import type { SessionUser } from "@/shared/lib/auth";
import { signinSchema, codeSchema } from "@/shared/lib/validation";
import { useFormValidation } from "@/shared/lib/useFormValidation";

type Session = { access_token: string; user: SessionUser };

export default function Signin() {
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname ||
    "/home";

  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const credentials = useFormValidation(signinSchema);
  const codeForm = useFormValidation(codeSchema);

  async function sendCredentials(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    const result = credentials.validateAll({ email, password });
    if (!result.ok) return;

    setBusy(true);
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(result.data),
      });
      setStep("code");
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    const result = codeForm.validateAll({ email, code });
    if (!result.ok) return;

    setBusy(true);
    try {
      const session = await apiFetch<Session>("/auth/login/verify", {
        method: "POST",
        body: JSON.stringify(result.data),
      });
      saveToken(session.access_token);
      saveUser(session.user);
      navigate(from, { replace: true });
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
          {step === "credentials" ? "Sign in" : "Check your email"}
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          {step === "credentials"
            ? "Use your SITE14 account"
            : `We sent a sign-in code to ${email}`}
        </p>

        {formError && (
          <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
            {formError}
          </p>
        )}

        {step === "credentials" ? (
          <form onSubmit={sendCredentials} noValidate>
            <FormField
              id="email"
              label="Email"
              type="email"
              value={email}
              error={credentials.errors.email}
              onChange={(e) => {
                setEmail(e.target.value);
                credentials.handleChange({ email: e.target.value, password });
              }}
              onBlur={() => credentials.handleBlur("email", { email, password })}
            />

            <FormField
              id="password"
              label="Password"
              type="password"
              value={password}
              error={credentials.errors.password}
              onChange={(e) => {
                setPassword(e.target.value);
                credentials.handleChange({ email, password: e.target.value });
              }}
              onBlur={() =>
                credentials.handleBlur("password", { email, password })
              }
            />

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in..." : "Continue"}
            </Button>

            <div className="mt-5 flex items-center justify-between text-sm">
              <Link
                to="/forgot-password"
                className="font-medium text-muted-foreground hover:text-primary"
              >
                Forgot password?
              </Link>
              <Link to="/signup" className="font-medium text-primary">
                Create account
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={sendCode} noValidate>
            <FormField
              id="code"
              label="Sign-in code"
              inputMode="numeric"
              value={code}
              error={codeForm.errors.code}
              onChange={(e) => {
                setCode(e.target.value);
                codeForm.handleChange({ email, code: e.target.value });
              }}
              onBlur={() => codeForm.handleBlur("code", { email, code })}
            />

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Verifying..." : "Verify and sign in"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setCode("");
                codeForm.reset();
                setFormError("");
              }}
              className="mt-5 text-sm font-medium text-muted-foreground hover:text-primary"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </main>
  );
}