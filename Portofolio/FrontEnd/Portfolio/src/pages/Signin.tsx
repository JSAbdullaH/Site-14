import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import Button from "../components/Button";
import Input from "../components/Input";
import { apiFetch } from "../lib/api";
import { saveToken } from "../lib/auth";

type Session = { access_token: string };

export default function Signin() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/home";

  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCredentials(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const session = await apiFetch<Session>("/auth/login/verify", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
      saveToken(session.access_token);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-page flex items-center justify-center px-5">
      <div className="w-full max-w-[480px] bg-white rounded-card p-10">
        <h1 className="text-[32px] font-bold mb-8">
          {step === "credentials" ? "Sign in" : "Check your email"}
        </h1>

        {error && (
          <p className="mb-5 px-4 py-3 rounded-ctrl bg-orange-bg text-signal-dark text-sm font-bold">
            {error}
          </p>
        )}

        {step === "credentials" ? (
          <form onSubmit={sendCredentials}>
            <Input
              id="email"
              label="EMAIL"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="password"
              label="PASSWORD"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in..." : "Continue"}
            </Button>

            <div className="mt-5 flex items-center justify-between text-sm">
              <Link to="/forgot-password" className="font-bold text-muted hover:text-signal">
                Forgot password?
              </Link>
              <Link to="/signup" className="font-bold text-signal">
                Create account
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={sendCode}>
            <p className="mb-6 text-[15px] text-muted font-semibold">
              We sent a sign-in code to <span className="text-ink">{email}</span>
            </p>

            <Input
              id="code"
              label="SIGN-IN CODE"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Verifying..." : "Verify and sign in"}
            </Button>

            <button
              type="button"
              onClick={() => { setStep("credentials"); setCode(""); setError(""); }}
              className="mt-5 text-sm font-bold text-muted hover:text-signal"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </main>
  );
}