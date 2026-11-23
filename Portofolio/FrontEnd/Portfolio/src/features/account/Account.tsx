import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";
import { Building2, KeyRound, Lock, ShieldCheck, UserRound } from "lucide-react";
import AppShell from "@/shared/components/AppShell";
import FormField from "@/shared/components/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/shared/lib/api";
import { ROLE_DESCRIPTION, getUser, isAdmin, roleLabel, saveUser } from "@/shared/lib/auth";
import type { Role, SessionUser } from "@/shared/lib/auth";

type Me = SessionUser & { created_at?: string };

type Company = {
  id: string;
  name: string;
  commercial_registration: string | null;
  created_at?: string;
};

const sinceText = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long" }) : null;

function initials(name?: string) {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const fieldError = (err: unknown, field: string) => (err instanceof ApiError ? err.fields?.[field] : undefined);

// A value people can see but not change here, marked with a lock.
function LockedField({ id, label, value, hint }: { id: string; label: string; value: string; hint: string }) {
  return (
    <div className="mb-5 grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          readOnly
          aria-readonly="true"
          aria-describedby={`${id}_hint`}
          className="cursor-default bg-muted/50 pr-9 text-muted-foreground"
        />
        <Lock className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      </div>
      <p id={`${id}_hint`} className="text-sm text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

function RoleBadge({ role }: { role?: Role | string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
      <ShieldCheck className="size-4" aria-hidden />
      {roleLabel(role)}
    </span>
  );
}

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-start gap-3 border-b px-6 py-5">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="px-6 pt-6 pb-1">{children}</div>
    </section>
  );
}

function SaveBar({ dirty, busy, onReset }: { dirty: boolean; busy: boolean; onReset: () => void }) {
  return (
    <div className="-mx-6 mt-1 flex items-center justify-end gap-2 border-t bg-muted/30 px-6 py-3">
      {dirty && (
        <Button type="button" variant="ghost" onClick={onReset} disabled={busy}>
          Discard
        </Button>
      )}
      <Button type="submit" disabled={!dirty || busy}>
        {busy ? "Saving..." : "Save changes"}
      </Button>
    </div>
  );
}

export default function Account() {
  const admin = isAdmin();
  const [me, setMe] = useState<Me | null>(() => getUser());
  const [name, setName] = useState(() => getUser()?.full_name ?? "");
  const [nameError, setNameError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [company, setCompany] = useState<Company | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [cr, setCr] = useState("");
  const [companyErrors, setCompanyErrors] = useState<{ name?: string; cr?: string }>({});
  const [loadError, setLoadError] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  const [resetSent, setResetSent] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    apiFetch<Me>("/users/me")
      .then((fresh) => {
        setMe(fresh);
        setName(fresh.full_name);
        saveUser({ id: fresh.id, full_name: fresh.full_name, email: fresh.email, role: fresh.role });
      })
      .catch(() => undefined);
    apiFetch<Company>("/companies/me")
      .then((c) => {
        setCompany(c);
        setCompanyName(c.name);
        setCr(c.commercial_registration ?? "");
      })
      .catch((err) => setLoadError((err as Error).message));
  }, []);

  const profileDirty = Boolean(me) && name.trim() !== me?.full_name;
  const companyDirty =
    Boolean(company) && (companyName.trim() !== company?.name || cr.trim() !== (company?.commercial_registration ?? ""));

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameError("Name needs at least 2 characters");
      return;
    }
    setSavingProfile(true);
    setNameError("");
    try {
      const updated = await apiFetch<Me>("/users/me", { method: "PATCH", body: JSON.stringify({ full_name: trimmed }) });
      setMe(updated);
      setName(updated.full_name);
      saveUser({ id: updated.id, full_name: updated.full_name, email: updated.email, role: updated.role });
      toast.success("Your name is updated");
    } catch (err) {
      setNameError(fieldError(err, "full_name") ?? (err as Error).message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveCompany(e: FormEvent) {
    e.preventDefault();
    if (!company) return;
    const body: Record<string, string | null> = {};
    if (companyName.trim() !== company.name) body.name = companyName.trim();
    if (cr.trim() !== (company.commercial_registration ?? "")) body.commercial_registration = cr.trim() || null;
    if (typeof body.name === "string" && body.name.length < 2) {
      setCompanyErrors({ name: "Company name needs at least 2 characters" });
      return;
    }
    setSavingCompany(true);
    setCompanyErrors({});
    try {
      const updated = await apiFetch<Company>("/companies/me", { method: "PATCH", body: JSON.stringify(body) });
      setCompany(updated);
      setCompanyName(updated.name);
      setCr(updated.commercial_registration ?? "");
      toast.success("Company details are updated");
    } catch (err) {
      const nameErr = fieldError(err, "name");
      const crErr = fieldError(err, "commercial_registration");
      setCompanyErrors(nameErr || crErr ? { name: nameErr, cr: crErr } : { name: (err as Error).message });
    } finally {
      setSavingCompany(false);
    }
  }

  async function sendReset() {
    if (!me?.email) return;
    setSendingReset(true);
    try {
      await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: me.email }) });
    } finally {
      setResetSent(true);
      setSendingReset(false);
    }
  }

  const memberSince = sinceText(me?.created_at);

  return (
    <AppShell title="Account" subtitle="Your profile and company">
      <div className="flex max-w-3xl flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-6 sm:flex-row sm:items-center">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
            {initials(me?.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-semibold">{me?.full_name ?? "Your account"}</p>
            <p className="truncate text-sm text-muted-foreground">{me?.email}</p>
            {(company || memberSince) && (
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {company?.name}
                {company && memberSince ? " · " : ""}
                {memberSince ? `Member since ${memberSince}` : ""}
              </p>
            )}
          </div>
          <div className="sm:self-start">
            <RoleBadge role={me?.role} />
          </div>
        </section>

        <Section icon={<UserRound className="size-5" />} title="Your profile" description="How you appear to your team.">
          <form onSubmit={saveProfile} noValidate>
            <FormField
              id="u_name"
              label="Full name"
              value={name}
              maxLength={120}
              autoComplete="name"
              onChange={(e) => {
                setName(e.target.value);
                setNameError("");
              }}
              error={nameError}
            />
            <LockedField id="u_email" label="Email" value={me?.email ?? ""} hint="You sign in with this email, so it cannot be changed here." />
            <LockedField
              id="u_role"
              label="Role"
              value={roleLabel(me?.role)}
              hint={`${me?.role ? `${ROLE_DESCRIPTION[me.role] ?? ""} ` : ""}Roles are set by a company admin and cannot be changed here.`}
            />
            <SaveBar dirty={profileDirty} busy={savingProfile} onReset={() => { setName(me?.full_name ?? ""); setNameError(""); }} />
          </form>
        </Section>

        <Section
          icon={<Building2 className="size-5" />}
          title="Company details"
          description={admin ? "Shown on reports and invitations." : "Only a company admin can change these."}
        >
          {loadError && <p className="mb-5 rounded-md bg-warn-bg px-4 py-3 text-sm font-medium text-warn">{loadError}</p>}

          {!company && !loadError ? (
            <div className="grid gap-5 pb-5">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : company && admin ? (
            <form onSubmit={saveCompany} noValidate>
              <FormField
                id="c_name"
                label="Company name"
                value={companyName}
                maxLength={150}
                autoComplete="organization"
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  setCompanyErrors((x) => ({ ...x, name: undefined }));
                }}
                error={companyErrors.name}
              />
              <FormField
                id="c_cr"
                label="Commercial register"
                value={cr}
                maxLength={50}
                placeholder="Not set"
                inputMode="numeric"
                onChange={(e) => {
                  setCr(e.target.value);
                  setCompanyErrors((x) => ({ ...x, cr: undefined }));
                }}
                error={companyErrors.cr}
                hint="Optional. Leave empty to remove it."
              />
              <SaveBar
                dirty={companyDirty}
                busy={savingCompany}
                onReset={() => {
                  setCompanyName(company.name);
                  setCr(company.commercial_registration ?? "");
                  setCompanyErrors({});
                }}
              />
            </form>
          ) : company ? (
            <>
              <LockedField id="c_name" label="Company name" value={company.name} hint="Ask a company admin to change it." />
              <LockedField
                id="c_cr"
                label="Commercial register"
                value={company.commercial_registration ?? "Not set"}
                hint="Ask a company admin to change it."
              />
            </>
          ) : null}
        </Section>

        <Section icon={<KeyRound className="size-5" />} title="Password" description="We email you a one-time link to set a new one.">
          <div className="pb-5">
            {resetSent ? (
              <p className="rounded-md bg-ok-bg px-4 py-3 text-sm text-ok">
                If an account exists for <span className="font-medium">{me?.email}</span>, we sent a link to set a new password.
              </p>
            ) : (
              <Button onClick={sendReset} disabled={sendingReset || !me?.email} variant="outline">
                {sendingReset ? "Sending..." : "Send password link"}
              </Button>
            )}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
