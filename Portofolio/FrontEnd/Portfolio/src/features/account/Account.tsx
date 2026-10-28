import { useEffect, useState } from "react";
import AppShell from "@/shared/components/AppShell";
import { Button } from "@/components/ui/button";
import FormField from "@/shared/components/FormField";
import { apiFetch } from "@/shared/lib/api";

type Company = {
  name?: string;
  email?: string;
  commercial_register?: string;
  phone?: string;
};

export default function Account() {
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
    if (!company?.email) return;
    setBusy(true);
    try {
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: company.email }),
      });
      setResetSent(true);
    } catch {
      setResetSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Account" subtitle="Company profile and security">
      <div className="max-w-[640px] flex flex-col gap-6">
        <section className="bg-white rounded-card p-8">
          <h2 className="text-xl font-bold mb-6">Company details</h2>

          {loadError && (
            <p className="mb-5 px-4 py-3 rounded-ctrl bg-orange-bg text-signal-dark text-sm font-bold">
              {loadError}
            </p>
          )}

          <FormField id="cname" label="COMPANY NAME" value={company?.name ?? ""} readOnly />
          <FormField id="cr" label="COMMERCIAL REGISTER"
            value={company?.commercial_register ?? "â€”"} readOnly />
          <FormField id="cemail" label="EMAIL" value={company?.email ?? ""} readOnly />
          <FormField id="cphone" label="PHONE" value={company?.phone ?? "â€”"} readOnly />

          <p className="text-[13px] text-mute2 font-semibold">
            Editing company details is not available yet.
          </p>
        </section>

        <section className="bg-white rounded-card p-8">
          <h2 className="text-xl font-bold mb-3">Password</h2>

          {resetSent ? (
            <p className="text-[15px] text-muted-foreground-foreground font-semibold leading-relaxed">
              We sent a link to <span className="text-ink">{company?.email}</span>. Open it
              to set a new password.
            </p>
          ) : (
            <>
              <p className="mb-6 text-[15px] text-muted-foreground-foreground font-semibold leading-relaxed">
                We will email you a one-time link to set a new password.
              </p>
              <Button onClick={sendReset} disabled={busy || !company?.email}>
                {busy ? "Sending..." : "Change password"}
              </Button>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}