import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button";
import Input from "../components/Input";
import { apiFetch } from "../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
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
          {sent ? "Check your email" : "Reset password"}
        </h1>

        {error && (
          <p className="mb-5 px-4 py-3 rounded-ctrl bg-orange-bg text-signal-dark text-sm font-bold">
            {error}
          </p>
        )}

        {sent ? (
          <>
            <p className="text-[15px] text-muted font-semibold leading-relaxed">
              If an account exists for <span className="text-ink">{email}</span>, we sent
              a link to set a new password. The link works once and expires shortly.
            </p>
            <Link to="/signin" className="mt-8 inline-block text-sm font-bold text-signal">
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="mb-6 text-[15px] text-muted font-semibold">
              Enter your email and we will send you a link to set a new password.
            </p>

            <Input id="email" label="EMAIL" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required />

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending..." : "Send reset link"}
            </Button>

            <Link to="/signin" className="mt-5 inline-block text-sm font-bold text-muted hover:text-signal">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}