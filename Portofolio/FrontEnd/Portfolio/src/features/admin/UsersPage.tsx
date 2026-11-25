import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal, ShieldCheck } from "lucide-react";
import EmptyState from "@/shared/components/EmptyState";
import ConfirmDialog from "@/shared/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getPlatformAdmin } from "@/shared/lib/platformAuth";
import AdminShell from "./components/AdminShell";
import { listPlatformUsers, updatePlatformUser } from "./api";
import type { PlatformUser } from "./types";

type Change = { user: PlatformUser; body: Parameters<typeof updatePlatformUser>[1] };

const ROLE = { company_admin: "Company admin", site_manager: "Site manager" } as const;

function describe({ user: u, body }: Change) {
  if (body.is_platform_admin === true)
    return {
      title: `Give ${u.full_name} owner-portal access?`,
      description: "They can open this portal with their company account and manage every company on SITE14.",
      confirmLabel: "Give access",
    };
  if (body.is_platform_admin === false)
    return {
      title: `Take owner-portal access from ${u.full_name}?`,
      description: "They are signed out of this portal at once. Their company account keeps working.",
      confirmLabel: "Take access away",
    };
  if (body.is_active === false)
    return {
      title: `Deactivate ${u.full_name}?`,
      description: `They are signed out everywhere and can no longer sign in to ${u.company.name}.`,
      details: u.is_platform_admin ? ["They also lose owner-portal access."] : undefined,
      confirmLabel: "Deactivate",
    };
  if (body.is_active === true)
    return { title: `Reactivate ${u.full_name}?`, description: "They can sign in again.", confirmLabel: "Reactivate", tone: "default" as const };
  const role = body.role ? ROLE[body.role] : "";
  return {
    title: `Make ${u.full_name} ${role.toLowerCase()}?`,
    description: "They are signed out so the new role applies the next time they sign in.",
    confirmLabel: `Make ${role.toLowerCase()}`,
    tone: "default" as const,
  };
}

export default function UsersPage() {
  const me = getPlatformAdmin();
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [staffOnly, setStaffOnly] = useState(false);
  const [error, setError] = useState("");
  const [change, setChange] = useState<Change | null>(null);

  const load = useCallback(
    () =>
      listPlatformUsers({ search: search.trim() || undefined, platform_admin: staffOnly ? true : undefined })
        .then((res) => {
          setUsers(res.data);
          setTotal(res.total);
          setError("");
        })
        .catch((err: Error) => setError(err.message)),
    [search, staffOnly],
  );

  useEffect(() => {
    const t = window.setTimeout(load, search ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [load, search]);

  const confirm = change ? describe(change) : null;

  return (
    <AdminShell title="Users" subtitle={`${total} user${total === 1 ? "" : "s"} across every company`}>
      {error && <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input placeholder="Search name, email or company" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={staffOnly} onChange={(e) => setStaffOnly(e.target.checked)} />
          Only owner-portal access
        </label>
      </div>

      {users === null ? (
        <Skeleton className="h-48 w-full" />
      ) : users.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const self = me?.kind === "user" && me.id === u.id;
                return (
                  <TableRow key={u.id} className={u.is_active || u.invitation_pending ? "" : "opacity-60"}>
                    <TableCell>
                      <p className="flex items-center gap-1.5 font-medium">
                        {u.full_name}
                        {u.is_platform_admin && (
                          <span title="Owner-portal access" className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                            <ShieldCheck className="size-3" />
                            SITE14
                          </span>
                        )}
                        {self && <span className="text-xs text-muted-foreground">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell>{u.company.name}</TableCell>
                    <TableCell>{ROLE[u.role]}</TableCell>
                    <TableCell>
                      {u.invitation_pending ? (
                        <span className="text-warn">Invited</span>
                      ) : u.is_active ? (
                        <span className="text-ok">Active</span>
                      ) : (
                        <span className="text-muted-foreground">Deactivated</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {!u.invitation_pending && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Actions for ${u.full_name}`}
                            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-secondary"
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {u.is_active && !u.is_platform_admin && (
                              <DropdownMenuItem onClick={() => setChange({ user: u, body: { is_platform_admin: true } })}>
                                Give owner-portal access
                              </DropdownMenuItem>
                            )}
                            {u.is_platform_admin && !self && (
                              <DropdownMenuItem onClick={() => setChange({ user: u, body: { is_platform_admin: false } })}>
                                Take owner-portal access away
                              </DropdownMenuItem>
                            )}
                            {u.is_active && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setChange({ user: u, body: { role: u.role === "company_admin" ? "site_manager" : "company_admin" } })
                                }
                              >
                                {u.role === "company_admin" ? "Make site manager" : "Make company admin"}
                              </DropdownMenuItem>
                            )}
                            {!self && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant={u.is_active ? "destructive" : "default"}
                                  onClick={() => setChange({ user: u, body: { is_active: !u.is_active } })}
                                >
                                  {u.is_active ? "Deactivate" : "Reactivate"}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {change && confirm && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setChange(null)}
          {...confirm}
          onConfirm={async () => {
            await updatePlatformUser(change.user.id, change.body);
            setChange(null);
            await load();
          }}
        />
      )}
    </AdminShell>
  );
}
