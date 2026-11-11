import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import FormField from "@/shared/components/FormField";
import { ApiError } from "@/shared/lib/api";
import { savePlatformSession } from "@/shared/lib/platformAuth";
import { platformLogin } from "./api";

export default function AdminSignin() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await platformLogin(email.trim().toLowerCase(), password);
      savePlatformSession(res.access_token, res.admin);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-ink px-4">
      <form onSubmit={submit} noValidate className="w-full max-w-sm rounded-2xl bg-background p-8 shadow-xl">
        <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Owner console</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">For the SITE14 team only. Company accounts sign in at the main site.</p>

        {error && (
          <p role="alert" className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}

        <FormField id="admin_email" label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <FormField
          id="admin_password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" className="h-10 w-full" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
