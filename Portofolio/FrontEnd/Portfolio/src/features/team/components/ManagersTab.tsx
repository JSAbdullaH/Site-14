import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import EmptyState from "@/shared/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import TeamTable from "./TeamTable";
import InviteDialog from "./InviteDialog";
import { listUsers, resendInvitation, deactivateUser } from "../api";
import type { User } from "../types";

export default function ManagersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await listUsers();
      setUsers(res.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, query]);

  async function handleResend(user: User) {
    try {
      await resendInvitation(user.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeactivate(user: User) {
    try {
      await deactivateUser(user.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Managers sign in to SITE14 and run sites. They are invited by email.
      </p>

      {error && (
        <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="mb-4 flex items-center justify-between gap-4">
        <Input
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={() => setInviteOpen(true)}>
          <Plus />
          Invite manager
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={query ? "No matching managers" : "No managers yet"}
          description={
            query
              ? "Try a different name or email."
              : "Invite a manager so they can sign in and run a site."
          }
          action={
            !query ? (
              <Button onClick={() => setInviteOpen(true)}>Invite manager</Button>
            ) : undefined
          }
        />
      ) : (
        <TeamTable
          users={filtered}
          onOpen={() => {}}
          onResend={handleResend}
          onDeactivate={handleDeactivate}
        />
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={load}
      />
    </>
  );
}
