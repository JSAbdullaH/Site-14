import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Employee = {
  id: string;
  full_name: string;
  employee_number: string | null;
  job_category: string;
  site_id: string | null;
  site_name: string | null;
  status: "active" | "inactive";
};

type Page = { data: Employee[]; total: number };

type Props = {
  siteId: string;
  siteActive: boolean;
  // Called after an assignment changes, so site counts can refresh.
  onChange: () => void;
};

const LIMIT = 100;

// SITE-49: the workers whose hours are attributed to this site.
export default function SiteEmployees({ siteId, siteActive, onChange }: Props) {
  const [assigned, setAssigned] = useState<Page | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Employee[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAssigned = useCallback(async () => {
    try {
      setAssigned(await apiFetch<Page>(`/employees?site_id=${siteId}&status=active&limit=${LIMIT}`));
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
    if (!q) {
      setResults(null);
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<Page>(`/employees?search=${encodeURIComponent(q)}&status=active&limit=10`);
        if (!stale) setResults(res.data);
      } catch (err) {
        if (!stale) setError((err as Error).message);
      }
    }, 300);
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
      const updated = await apiFetch<Employee>(`/employees/${employee.id}`, {
        method: "PATCH",
        body: JSON.stringify({ site_id: toSite }),
      });
      setNotice(
        toSite
          ? `${employee.full_name} is now assigned to this site${employee.site_name ? ` (moved from ${employee.site_name})` : ""}.`
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

  const candidates = (results ?? []).filter((e) => e.site_id !== siteId);

  return (
    <section className="bg-white rounded-card p-8">
      <h2 className="text-xl font-bold mb-1">Assigned employees</h2>
      <p className="mb-6 text-[13px] text-muted font-semibold">
        Their hours are recorded against this site. An employee belongs to one site at a time.
      </p>

      {error && (
        <p className="mb-5 px-4 py-3 rounded-ctrl bg-orange-bg text-signal-dark text-sm font-bold">{error}</p>
      )}
      {notice && (
        <p className="mb-5 px-4 py-3 rounded-ctrl bg-green-bg text-zone-green text-sm font-bold" role="status">
          {notice}
        </p>
      )}

      {siteActive ? (
        <div className="mb-6">
          <label htmlFor="emp-search" className="block mb-2.5 text-[11px] font-bold tracking-[0.1em] text-mute2">
            ADD AN EMPLOYEE
          </label>
          <input
            id="emp-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or employee number"
            className="w-full h-12 px-5 rounded-ctrl bg-sand text-ink text-[15px] font-semibold border border-transparent outline-none placeholder:text-mute2 focus:border-signal"
          />
          {results !== null && (
            <ul className="mt-2 rounded-ctrl border border-sand2 divide-y divide-sand2">
              {candidates.length === 0 ? (
                <li className="px-5 py-3 text-sm font-semibold text-mute2">
                  No other active employee matches “{search.trim()}”.
                </li>
              ) : (
                candidates.map((e) => (
                  <li key={e.id} className="px-5 py-3 flex items-center gap-4">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold truncate">{e.full_name}</span>
                      <span className="block text-[12px] text-mute2 font-semibold truncate">
                        {[e.employee_number, e.job_category, e.site_name ? `on ${e.site_name}` : "not assigned"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <button
                      onClick={() => move(e, siteId)}
                      disabled={busyId !== null}
                      className="shrink-0 h-10 px-4 rounded-ctrl bg-ink text-white text-sm font-bold hover:bg-signal disabled:opacity-55"
                    >
                      {e.site_id ? "Move here" : "Assign"}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      ) : (
        <p className="mb-6 text-sm font-semibold text-mute2">Reactivate the site to assign employees to it.</p>
      )}

      {assigned === null ? (
        <div className="h-24 rounded-ctrl bg-sand animate-pulse" />
      ) : assigned.data.length === 0 ? (
        <p className="text-sm font-semibold text-mute2">Nobody is assigned to this site yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-sand2">
            {assigned.data.map((e) => (
              <li key={e.id} className="py-3 flex items-center gap-4">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold truncate">{e.full_name}</span>
                  <span className="block text-[12px] text-mute2 font-semibold truncate">
                    {[e.employee_number, e.job_category].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button
                  onClick={() => move(e, null)}
                  disabled={busyId !== null}
                  className="shrink-0 h-10 px-4 rounded-ctrl text-sm font-bold text-muted hover:bg-sand hover:text-signal disabled:opacity-55"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {assigned.total > assigned.data.length && (
            <p className="mt-3 text-[13px] font-semibold text-mute2">
              Showing {assigned.data.length} of {assigned.total}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
