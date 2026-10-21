import { useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import Button from "../components/Button";
import Input from "../components/Input";
import { apiFetch } from "../lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      navigate("/signin", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-page flex items-center justify-center px-5">
        <div className="w-full max-w-[480px] bg-white rounded-card p-10">
          <h1 className="text-[32px] font-bold mb-4">Link not valid</h1>
          <p className="text-[15px] text-muted font-semibold leading-relaxed">
            This page needs the link from your email. Ask for a new one and try again.
          </p>
          <Link to="/forgot-password" className="mt-8 inline-block text-sm font-bold text-signal">
            Send a new link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page flex items-center justify-center px-5">
      <div className="w-full max-w-[480px] bg-white rounded-card p-10">
        <h1 className="text-[32px] font-bold mb-8">Set a new password</h1>

        {error && (
          <p className="mb-5 px-4 py-3 rounded-ctrl bg-orange-bg text-signal-dark text-sm font-bold">
            {error}
          </p>
        )}

        <form onSubmit={submit}>
          <Input id="password" label="NEW PASSWORD" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} required />
          <Input id="confirm" label="CONFIRM NEW PASSWORD" type="password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} required />

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving..." : "Save password"}
          </Button>

          <Link to="/signin" className="mt-5 inline-block text-sm font-bold text-muted hover:text-signal">
            Back to sign in
          </Link>
        </form>
      </div>
    </main>
  );
}