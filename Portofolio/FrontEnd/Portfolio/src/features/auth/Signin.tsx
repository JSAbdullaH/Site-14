import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import FormField from "@/shared/components/FormField";
import { ApiError, apiFetch } from "@/shared/lib/api";
import { saveToken, saveUser, isLoggedIn } from "@/shared/lib/auth";
import type { SessionUser } from "@/shared/lib/auth";
import {
  emailOnlySchema,
  signinSchema,
  signupSchema,
  codeSchema,
} from "@/shared/lib/validation";
import { useFormValidation } from "@/shared/lib/useFormValidation";
import SignedInNotice from "@/shared/components/SignedInNotice";
import PixelShowcase from "./components/PixelShowcase";

type Session = { access_token: string; user: SessionUser };
type CheckEmail = { exists: boolean; invitation_pending: boolean };
type Registered = Partial<Session> & { verification_required: boolean };

// email      -> the only field until we know whether the account exists
// password   -> existing account
// register   -> new email: the rest of the sign-up fields
// login-code -> the sign-in code emailed after the password
// verify     -> the confirmation code emailed after registering
// invited    -> invited user who has not set a password yet
type Step = "email" | "password" | "register" | "login-code" | "verify" | "invited";

const TITLES: Record<Step, [string, string]> = {
  email: ["Sign in or create an account", "Enter your email to continue"],
  password: ["Welcome back", "Enter your password"],
  register: ["Create your account", "Set up your company on SITE14"],
  "login-code": ["Check your email", "We sent you a sign-in code"],
  verify: ["Confirm your email", "We sent you a confirmation code"],
  invited: ["You have an invitation", "Your account is waiting for you"],
};

export default function Signin() {
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname ||
    "/home";

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [cr, setCr] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // A session already in this browser must be ended first, or it would carry on past this form.
  const [signedIn, setSignedIn] = useState(isLoggedIn);

  const emailForm = useFormValidation(emailOnlySchema);
  const passwordForm = useFormValidation(signinSchema);
  const registerForm = useFormValidation(signupSchema);
  const codeForm = useFormValidation(codeSchema);

  const registerValues = {
    company_name: companyName,
    commercial_registration: cr || undefined,
    full_name: fullName,
    email,
    password,
  };

  function goTo(next: Step) {
    setFormError("");
    setNotice("");
    setCode("");
    codeForm.reset();
    setStep(next);
  }

  function startOver() {
    setPassword("");
    passwordForm.reset();
    registerForm.reset();
    goTo("email");
  }

  function finish(session: Session, to: string) {
    saveToken(session.access_token);
    saveUser(session.user);
    navigate(to, { replace: true });
  }

  // Runs a request with the busy flag and shows its error message on failure.
  async function run(work: () => Promise<void>) {
    setFormError("");
    setBusy(true);
    try {
      await work();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const post = <T,>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

  // ---------- Step 1: email ----------
  function checkEmail(e: FormEvent) {
    e.preventDefault();
    const result = emailForm.validateAll({ email });
    if (!result.ok) return;

    run(async () => {
      const res = await post<CheckEmail>("/auth/check-email", result.data);
      setEmail(result.data.email);
      if (res.invitation_pending) goTo("invited");
      else goTo(res.exists ? "password" : "register");
    });
  }

  // ---------- Step 2a: existing account ----------
  async function requestLoginCode() {
    try {
      await post("/auth/login", { email, password });
      goTo("login-code");
    } catch (err) {
      // Registered but never confirmed: send a fresh confirmation code instead.
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        await post("/auth/verify-email/resend", { email });
        goTo("verify");
        setNotice("Confirm your email first. We sent you a new code.");
        return;
      }
      throw err;
    }
  }

  function signIn(e: FormEvent) {
    e.preventDefault();
    const result = passwordForm.validateAll({ email, password });
    if (!result.ok) return;
    run(requestLoginCode);
  }

  function sendLoginCode(e: FormEvent) {
    e.preventDefault();
    const result = codeForm.validateAll({ email, code });
    if (!result.ok) return;

    run(async () => {
      finish(await post<Session>("/auth/login/verify", result.data), from);
    });
  }

  // ---------- Step 2b: new account ----------
  function register(e: FormEvent) {
    e.preventDefault();
    const result = registerForm.validateAll(registerValues);
    if (!result.ok) return;

    run(async () => {
      const res = await post<Registered>("/auth/register", result.data);
      if (res.access_token && res.user) {
        finish({ access_token: res.access_token, user: res.user }, "/home");
      } else if (res.verification_required) {
        goTo("verify");
      } else {
        // The email was taken in the meantime.
        goTo("password");
        setNotice("This email already has an account. Sign in instead.");
      }
    });
  }

  function confirmEmail(e: FormEvent) {
    e.preventDefault();
    const result = codeForm.validateAll({ email, code });
    if (!result.ok) return;

    run(async () => {
      const res = await post<Partial<Session>>("/auth/verify-email", result.data);
      if (res.access_token && res.user) {
        finish({ access_token: res.access_token, user: res.user }, "/home");
      } else {
        goTo("password");
        setNotice("Email confirmed. Sign in to continue.");
      }
    });
  }

  function resendCode() {
    run(async () => {
      if (step === "verify") await post("/auth/verify-email/resend", { email });
      else await requestLoginCode();
      setNotice("If a new code can be sent, it is on its way.");
    });
  }

  function registerField(
    name: keyof typeof registerValues,
    value: string,
    setter: (v: string) => void,
  ) {
    return {
      value,
      error: registerForm.errors[name],
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        setter(e.target.value);
        registerForm.handleChange({ ...registerValues, [name]: e.target.value });
      },
      onBlur: () => registerForm.handleBlur(name, registerValues),
    };
  }

  const [title, subtitle] = TITLES[step];
  const isCodeStep = step === "login-code" || step === "verify";

  return (
    <main className="grid min-h-screen bg-[#23211D] lg:grid-cols-2 dark:bg-[#161514]">
      <div className="relative flex items-center justify-center bg-[#E8E6E1] px-6 py-12 dark:bg-[#23211D] md:px-16 lg:order-2 lg:my-3 lg:mr-3 lg:rounded-2xl">
        <Link
          to="/"
          aria-label="Back to home"
          title="Back to home"
          className="absolute top-5 left-5 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="w-full max-w-md [&_[data-slot=button]]:h-12 [&_[data-slot=button]]:text-base [&_input]:h-12 [&_input]:px-4 [&_input]:text-base">
          {signedIn ? (
            <SignedInNotice onSignedOut={() => setSignedIn(false)} />
          ) : (
            <>
              <h1 className="mb-2 text-3xl font-semibold tracking-tight">{title}</h1>
              <p className="mb-8 text-sm text-muted-foreground">{subtitle}</p>

              {step !== "email" && (
                <div className="mb-6 flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm">
                  <span className="truncate font-medium">{email}</span>
                  <button
                    type="button"
                    onClick={startOver}
                    className="shrink-0 font-medium text-primary hover:underline"
                  >
                    Change
                  </button>
                </div>
              )}

              {formError && (
                <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
                  {formError}
                </p>
              )}
              {notice && !formError && (
                <p className="mb-5 rounded-md bg-muted px-4 py-3 text-sm font-medium">
                  {notice}
                </p>
              )}

              {step === "email" && (
                <form onSubmit={checkEmail} noValidate>
                  <FormField
                    id="email"
                    label="Email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    error={emailForm.errors.email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      emailForm.handleChange({ email: e.target.value });
                    }}
                    onBlur={() => emailForm.handleBlur("email", { email })}
                  />

                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Checking..." : "Continue"}
                  </Button>
                </form>
              )}

              {step === "password" && (
                <form onSubmit={signIn} noValidate>
                  <FormField
                    id="password"
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    error={passwordForm.errors.password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      passwordForm.handleChange({ email, password: e.target.value });
                    }}
                    onBlur={() => passwordForm.handleBlur("password", { email, password })}
                  />

                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Signing in..." : "Sign in"}
                  </Button>

                  <div className="mt-5 text-sm">
                    <Link
                      to="/forgot-password"
                      className="font-medium text-muted-foreground hover:text-primary"
                    >
                      Forgot password?
                    </Link>
                  </div>
                </form>
              )}

              {step === "register" && (
                <form onSubmit={register} noValidate>
                  <p className="mb-5 text-sm text-muted-foreground">
                    No account uses this email yet. Fill in the details below to create one.
                  </p>

                  <FormField
                    id="company_name"
                    label="Company name"
                    autoFocus
                    {...registerField("company_name", companyName, setCompanyName)}
                  />

                  <FormField
                    id="commercial_registration"
                    label="Commercial register"
                    hint="Optional"
                    {...registerField("commercial_registration", cr, setCr)}
                  />

                  <FormField
                    id="full_name"
                    label="Your full name"
                    autoComplete="name"
                    {...registerField("full_name", fullName, setFullName)}
                  />

                  <FormField
                    id="password"
                    label="Password"
                    type="password"
                    autoComplete="new-password"
                    hint="At least 10 characters"
                    {...registerField("password", password, setPassword)}
                  />

                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Creating..." : "Create account"}
                  </Button>
                </form>
              )}

              {isCodeStep && (
                <form onSubmit={step === "verify" ? confirmEmail : sendLoginCode} noValidate>
                  <FormField
                    id="code"
                    label={step === "verify" ? "Confirmation code" : "Sign-in code"}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    value={code}
                    error={codeForm.errors.code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      codeForm.handleChange({ email, code: e.target.value });
                    }}
                    onBlur={() => codeForm.handleBlur("code", { email, code })}
                  />

                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Verifying..." : "Continue"}
                  </Button>

                  <button
                    type="button"
                    onClick={resendCode}
                    disabled={busy}
                    className="mt-5 text-sm font-medium text-muted-foreground hover:text-primary"
                  >
                    Send a new code
                  </button>
                </form>
              )}

              {step === "invited" && (
                <p className="text-sm text-muted-foreground">
                  Your company invited you to SITE14. Open the invitation link in your
                  email to set your password, then sign in here.
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <section className="hidden items-center justify-center p-10 lg:order-1 lg:flex">
        <PixelShowcase />
      </section>
    </main>
  );
}
