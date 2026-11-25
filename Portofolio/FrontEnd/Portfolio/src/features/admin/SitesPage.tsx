import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/shared/components/EmptyState";
import ConfirmDialog from "@/shared/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AdminShell from "./components/AdminShell";
import { listPlatformSites, updatePlatformSite } from "./api";
import type { PlatformSite } from "./types";

type Status = "all" | "active" | "inactive";

export default function SitesPage() {
  const [sites, setSites] = useState<PlatformSite[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState<PlatformSite | null>(null);

  const load = useCallback(
    () =>
      listPlatformSites({ search: search.trim() || undefined, status })
        .then((res) => {
          setSites(res.data);
          setTotal(res.total);
          setError("");
        })
        .catch((err: Error) => setError(err.message)),
    [search, status],
  );

  useEffect(() => {
    const t = window.setTimeout(load, search ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [load, search]);

  // The server refuses too; saying it here avoids a dialog that can only fail.
  const blocked = (s: PlatformSite) =>
    s.on_site_count
      ? `${s.on_site_count} worker${s.on_site_count === 1 ? " is" : "s are"} on this site right now.`
      : s.employee_count
        ? `${s.employee_count} employee${s.employee_count === 1 ? " is" : "s are"} still assigned to it. The company must move them first.`
        : undefined;

  return (
    <AdminShell title="Sites" subtitle={`${total} site${total === 1 ? "" : "s"} across every company`}>
      {error && <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input placeholder="Search site, client or company" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" />
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Status">
          {(["all", "active", "inactive"] as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={`h-8 rounded px-3 text-sm capitalize ${status === s ? "bg-secondary font-medium" : "text-muted-foreground"}`}
            >
              {s === "inactive" ? "Deactivated" : s}
            </button>
          ))}
        </div>
      </div>

      {sites === null ? (
        <Skeleton className="h-48 w-full" />
      ) : sites.length === 0 ? (
        <EmptyState title="No sites found" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead>On site now</TableHead>
                <TableHead>Zones</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((s) => (
                <TableRow key={s.id} className={s.is_active ? "" : "opacity-60"}>
                  <TableCell>
                    <p className="font-medium">{s.name}</p>
                    {s.client && <p className="text-xs text-muted-foreground">{s.client}</p>}
                  </TableCell>
                  <TableCell>{s.company.name}</TableCell>
                  <TableCell className="tabular-nums">
                    {s.shift_start}–{s.shift_end}
                  </TableCell>
                  <TableCell className="tabular-nums">{s.employee_count}</TableCell>
                  <TableCell className="tabular-nums">{s.on_site_count}</TableCell>
                  <TableCell className="tabular-nums">{s.zone_count}</TableCell>
                  <TableCell>{s.is_active ? <span className="text-ok">Active</span> : <span className="text-muted-foreground">Deactivated</span>}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setToggling(s)}>
                      {s.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {toggling && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setToggling(null)}
          title={`${toggling.is_active ? "Deactivate" : "Reactivate"} ${toggling.name}?`}
          description={
            toggling.is_active
              ? `${toggling.company.name} can no longer assign people to it. Its hours, tasks and reports stay.`
              : `${toggling.company.name} can assign people to it again.`
          }
          confirmLabel={toggling.is_active ? "Deactivate site" : "Reactivate site"}
          tone={toggling.is_active ? "danger" : "default"}
          blockedReason={toggling.is_active ? blocked(toggling) : undefined}
          onConfirm={async () => {
            await updatePlatformSite(toggling.id, { is_active: !toggling.is_active });
            setToggling(null);
            await load();
          }}
        />
      )}
    </AdminShell>
  );
}
