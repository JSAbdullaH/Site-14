import { useEffect, useState } from "react";
import AppShell from "@/shared/components/AppShell";
import FormField from "@/shared/components/FormField";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/lib/api";
import { getUser } from "@/shared/lib/auth";

type Company = {
  id?: string;
  name?: string;
  commercial_registration?: string;
  email?: string;
  phone?: string;
};

const NOT_SET = "Not set";

export default function Account() {
  const user = getUser();

  const [company, setCompany] = useState<Company | null>(null);
  const [loadError, setLoadError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<Company>("/companies/me")
      .then(setCompany)
      .catch((err) => setLoadError((err as Error).message));
  }, []);

  async function sendReset() {
    if (!user?.email) return;
    setBusy(true);
    try {
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: user.email }),
      });
    } finally {
      setResetSent(true);
      setBusy(false);
    }
  }

  return (
    <AppShell title="Account" subtitle="Your profile and company">
      <div className="flex max-w-2xl flex-col gap-6">
        <section className="rounded-xl border bg-card p-8">
          <h2 className="mb-6 text-xl font-semibold">Your account</h2>
          <FormField id="u_name" label="Name" value={user?.full_name ?? NOT_SET} readOnly />
          <FormField id="u_email" label="Email" value={user?.email ?? NOT_SET} readOnly />
          <FormField id="u_role" label="Role" value={user?.role ?? NOT_SET} readOnly />
        </section>

        <section className="rounded-xl border bg-card p-8">
          <h2 className="mb-6 text-xl font-semibold">Company details</h2>

          {loadError && (
            <p className="mb-5 rounded-md bg-warn-bg px-4 py-3 text-sm font-medium text-warn">
              {loadError}
            </p>
          )}

          <FormField id="c_name" label="Company name" value={company?.name ?? NOT_SET} readOnly />
          <FormField
            id="c_cr"
            label="Commercial register"
            value={company?.commercial_registration ?? NOT_SET}
            readOnly
          />
          <FormField id="c_phone" label="Phone" value={company?.phone ?? NOT_SET} readOnly />

          <p className="text-sm text-muted-foreground">
            Editing company details is not available yet.
          </p>
        </section>

        <section className="rounded-xl border bg-card p-8">
          <h2 className="mb-3 text-xl font-semibold">Password</h2>

          {resetSent ? (
            <p className="text-sm text-muted-foreground">
              If an account exists for{" "}
              <span className="font-medium text-foreground">{user?.email}</span>, we sent
              a link to set a new password.
            </p>
          ) : (
            <>
              <p className="mb-6 text-sm text-muted-foreground">
                We will email you a one-time link to set a new password.
              </p>
              <Button onClick={sendReset} disabled={busy || !user?.email}>
                {busy ? "Sending..." : "Change password"}
              </Button>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
