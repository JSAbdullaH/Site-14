import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import FormField from "@/shared/components/FormField";
import { apiFetch } from "@/shared/lib/api";
import { signupSchema, codeSchema } from "@/shared/lib/validation";
import { useFormValidation } from "@/shared/lib/useFormValidation";

export default function Signup() {
  const navigate = useNavigate();

  const [step, setStep] = useState<"details" | "code">("details");
  const [companyName, setCompanyName] = useState("");
  const [cr, setCr] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const details = useFormValidation(signupSchema);
  const codeForm = useFormValidation(codeSchema);

  const values = {
    company_name: companyName,
    commercial_registration: cr || undefined,
    full_name: fullName,
    email,
    password,
  };

  function field(
    name: keyof typeof values,
    value: string,
    setter: (v: string) => void,
  ) {
    return {
      value,
      error: details.errors[name],
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        setter(e.target.value);
        details.handleChange({ ...values, [name]: e.target.value });
      },
      onBlur: () => details.handleBlur(name, values),
    };
  }

  async function register(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    const result = details.validateAll(values);
    if (!result.ok) return;

    setBusy(true);
    try {
      await apiFetch("/auth/register", {
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

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    const result = codeForm.validateAll({ email, code });
    if (!result.ok) return;

    setBusy(true);
    try {
      await apiFetch("/auth/verify-email", {
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

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md rounded-xl border bg-card p-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">
          {step === "details" ? "Create account" : "Confirm your email"}
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">
          {step === "details"
            ? "Set up your company on SITE14"
            : `We sent a confirmation code to ${email}`}
        </p>

        {formError && (
          <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
            {formError}
          </p>
        )}

        {step === "details" ? (
          <form onSubmit={register} noValidate>
            <FormField
              id="company_name"
              label="Company name"
              {...field("company_name", companyName, setCompanyName)}
            />

            <FormField
              id="commercial_registration"
              label="Commercial register"
              hint="Optional"
              {...field("commercial_registration", cr, setCr)}
            />

            <FormField
              id="full_name"
              label="Your full name"
              {...field("full_name", fullName, setFullName)}
            />

            <FormField
              id="email"
              label="Email"
              type="email"
              {...field("email", email, setEmail)}
            />

            <FormField
              id="password"
              label="Password"
              type="password"
              hint="At least 10 characters"
              {...field("password", password, setPassword)}
            />

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating..." : "Create account"}
            </Button>

            <p className="mt-5 text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/signin" className="font-medium text-primary">
                Sign in
              </Link>
            </p>
          </form>
        ) : (
          <form onSubmit={confirm} noValidate>
            <FormField
              id="code"
              label="Confirmation code"
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
              {busy ? "Confirming..." : "Confirm email"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}