import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/shared/lib/api";
import { clearToken, getUser } from "@/shared/lib/auth";

type Props = { onSignedOut: () => void };

export default function SignedInNotice({ onSignedOut }: Props) {
  const user = getUser();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    clearToken();
    setBusy(false);
    onSignedOut();
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">You're already signed in</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        {user ? (
          <>
            This browser is signed in as <span className="font-medium text-foreground">{user.email}</span>. Sign out first to use
            a different account or create a new one.
          </>
        ) : (
          "This browser is still signed in. Sign out first to use a different account or create a new one."
        )}
      </p>
      <div className="flex flex-col gap-3">
        <Link to="/home" className={buttonVariants({ size: "lg", className: "w-full" })}>
          Go to dashboard
        </Link>
        <Button variant="outline" size="lg" className="w-full" onClick={signOut} disabled={busy}>
          {busy ? "Signing out..." : "Sign out"}
        </Button>
      </div>
    </div>
  );
}
