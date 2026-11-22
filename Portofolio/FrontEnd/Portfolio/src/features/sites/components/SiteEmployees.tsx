import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { assignEmployeesToSite, listEmployees, updateEmployee } from "@/features/employees/api";
import type { Employee, ListEmployeesResponse } from "@/features/employees/types";

type Props = {
  siteId: string;
  siteActive: boolean;
  // Called after an assignment changes, so site counts can refresh.
  onChange: () => void;
};

const LIMIT = 100;

const describe = (e: Employee, ...extra: (string | null | undefined)[]) =>
  [e.employee_number, e.job_category, ...extra].filter(Boolean).join(" · ");

// SITE-49: the workers whose hours are attributed to this site.
export default function SiteEmployees({ siteId, siteActive, onChange }: Props) {
  const [assigned, setAssigned] = useState<ListEmployeesResponse | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Employee[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  const loadAssigned = useCallback(async () => {
    try {
      setAssigned(await listEmployees({ siteId, status: "active", limit: LIMIT }));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [siteId]);

  useEffect(() => {
    loadAssigned();
  }, [loadAssigned]);

  // Search as the admin types, keeping only the answer to the latest query.
  useEffect(() => {
    const q = search.trim();
    let stale = false;
    const timer = setTimeout(async () => {
      if (!q) {
        setResults(null);
        return;
      }
      try {
        const res = await listEmployees({ search: q, status: "active", limit: 10 });
        if (!stale) setResults(res.data);
      } catch (err) {
        if (!stale) setError((err as Error).message);
      }
    }, q ? 300 : 0);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [search]);

  async function move(employee: Employee, toSite: string | null) {
    setError("");
    setNotice("");
    setBusyId(employee.id);
    try {
      const updated = await updateEmployee(employee.id, { site_id: toSite });
      setNotice(
        toSite
          ? `${employee.full_name} is now assigned to this site${
              employee.site_name ? ` (moved from ${employee.site_name})` : ""
            }.`
          : `${employee.full_name} is no longer assigned to this site.`,
      );
      setResults((list) => list && list.map((e) => (e.id === updated.id ? updated : e)));
      await loadAssigned();
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function showUnassigned() {
    setSearch("");
    setError("");
    try {
      const res = await listEmployees({ siteId: "none", status: "active", limit: LIMIT });
      setResults(res.data);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function assignSelected() {
    setError("");
    setNotice("");
    setAssigning(true);
    try {
      const { moved } = await assignEmployeesToSite([...selected], siteId);
      setNotice(`${moved} employee${moved === 1 ? "" : "s"} assigned to this site.`);
      setSelected(new Set());
      setResults(null);
      setSearch("");
      await loadAssigned();
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAssigning(false);
    }
  }

  const candidates = (results ?? []).filter((e) => e.site_id !== siteId);
  const allPicked = candidates.length > 0 && candidates.every((e) => selected.has(e.id));

  return (
    <section className="rounded-xl border bg-card p-8">
      <h2 className="mb-1 text-xl font-semibold">Assigned employees</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Their hours are recorded against this site. An employee belongs to one site at a time.
      </p>

      {error && (
        <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-5 rounded-md bg-ok-bg px-4 py-3 text-sm font-medium text-ok" role="status">
          {notice}
        </p>
      )}

      {siteActive ? (
        <div className="mb-6 grid gap-2">
          <Label htmlFor="emp-search">Add an employee</Label>
          <Input
            id="emp-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or employee number"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={showUnassigned}>
              Show unassigned
            </Button>
            {candidates.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelected(allPicked ? new Set() : new Set(candidates.map((e) => e.id)))
                }
              >
                {allPicked ? "Clear selection" : "Select all"}
              </Button>
            )}
            {selected.size > 0 && (
              <Button size="sm" className="ml-auto" onClick={assignSelected} disabled={assigning}>
                {assigning ? "Assigning…" : `Assign selected (${selected.size})`}
              </Button>
            )}
          </div>
          {results !== null && (
            <ul className="divide-y rounded-md border">
              {candidates.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted-foreground">
                  {search.trim()
                    ? `No other active employee matches “${search.trim()}”.`
                    : "Everyone active is already assigned to a site."}
                </li>
              ) : (
                candidates.map((e) => (
                  <li key={e.id} className="flex items-center gap-4 px-4 py-3">
                    <input
                      type="checkbox"
                      className="size-4 accent-signal"
                      checked={selected.has(e.id)}
                      onChange={() => toggle(e.id)}
                      aria-label={`Select ${e.full_name}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.full_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {describe(e, e.site_name ? `on ${e.site_name}` : "not assigned")}
                      </span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => move(e, siteId)} disabled={busyId !== null || assigning}>
                      {e.site_id ? "Move here" : "Assign"}
                    </Button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      ) : (
        <p className="mb-6 text-sm text-muted-foreground">
          Reactivate the site to assign employees to it.
        </p>
      )}

      {assigned === null ? (
        <Skeleton className="h-24 w-full" />
      ) : assigned.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody is assigned to this site yet.</p>
      ) : (
        <>
          <ul className="divide-y">
            {assigned.data.map((e) => (
              <li key={e.id} className="flex items-center gap-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{e.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {describe(e)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => move(e, null)}
                  disabled={busyId !== null}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          {assigned.total > assigned.data.length && (
            <p className="mt-3 text-sm text-muted-foreground">
              Showing {assigned.data.length} of {assigned.total}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
