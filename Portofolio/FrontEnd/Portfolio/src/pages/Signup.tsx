import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import Button from "../components/Button";
import Input from "../components/Input";
import { apiFetch } from "../lib/api";

export default function Signup() {
  const navigate = useNavigate();

  const [step, setStep] = useState<"details" | "code">("details");
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function register(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          company_name: companyName,
          full_name: fullName,
          email,
          password,
        }),
      });
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiFetch("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
      navigate("/signin", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-page flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-[480px] bg-white rounded-card p-10">
        <h1 className="text-[32px] font-bold mb-8">
          {step === "details" ? "Create account" : "Confirm your email"}
        </h1>

        {error && (
          <p className="mb-5 px-4 py-3 rounded-ctrl bg-orange-bg text-signal-dark text-sm font-bold">
            {error}
          </p>
        )}

        {step === "details" ? (
          <form onSubmit={register}>
            <Input id="company" label="COMPANY NAME" value={companyName}
              onChange={(e) => setCompanyName(e.target.value)} required />
            <Input id="name" label="YOUR FULL NAME" value={fullName}
              onChange={(e) => setFullName(e.target.value)} required />
            <Input id="email" label="EMAIL" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required />
            <Input id="password" label="PASSWORD" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating..." : "Create account"}
            </Button>

            <p className="mt-5 text-sm text-muted font-semibold">
              Already have an account?{" "}
              <Link to="/signin" className="font-bold text-signal">Sign in</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={confirm}>
            <p className="mb-6 text-[15px] text-muted font-semibold">
              We sent a confirmation code to <span className="text-ink">{email}</span>
            </p>

            <Input id="code" label="CONFIRMATION CODE" inputMode="numeric" value={code}
              onChange={(e) => setCode(e.target.value)} required />

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Confirming..." : "Confirm email"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}