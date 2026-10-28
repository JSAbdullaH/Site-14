import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import { isAdmin } from "../lib/auth";
import { shiftLabel, useSites } from "../lib/sites";

// SITE-47, SITE-48: every project site of the company, running side by side.
export default function Sites() {
  const navigate = useNavigate();
  const { sites, error, activeSite, setActiveSiteId, reload } = useSites();
  const admin = isAdmin();

  // Counts change as people arrive and leave, so refresh on every visit.
  useEffect(() => {
    reload();
  }, [reload]);

  const activeCount = (sites ?? []).filter((s) => s.is_active).length;

  return (
    <AppShell
      title="Sites"
      subtitle={sites ? `${activeCount} active site${activeCount === 1 ? "" : "s"}` : undefined}
    >
      <div className="max-w-[1040px]">
        {admin && (
          <div className="flex justify-end mb-6">
            <Button onClick={() => navigate("/sites/new")}>+ New site</Button>
          </div>
        )}

        {error && (
          <p className="mb-5 px-4 py-3 rounded-ctrl bg-orange-bg text-signal-dark text-sm font-bold">{error}</p>
        )}

        {sites === null ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-card bg-sand animate-pulse" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <section className="bg-white rounded-card p-10 text-center">
            <h2 className="text-xl font-bold mb-2">No sites yet</h2>
            <p className="text-[15px] text-muted font-semibold mb-6">
              A site is one project: its perimeter, its shift, and the workers assigned to it.
              {admin ? " Create one to start recording work against it." : " Ask your administrator to create one."}
            </p>
            {admin && <Button onClick={() => navigate("/sites/new")}>Create a site</Button>}
          </section>
        ) : (
          <div className="bg-white rounded-card overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="text-[11px] font-bold tracking-[0.1em] text-mute2 border-b border-sand2">
                  <th className="px-6 py-4">SITE</th>
                  <th className="px-6 py-4">SHIFT</th>
                  <th className="px-6 py-4 text-right">ASSIGNED</th>
                  <th className="px-6 py-4 text-right">ON SITE NOW</th>
                  <th className="px-6 py-4">STATUS</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => {
                  const current = activeSite?.id === site.id;
                  return (
                    <tr key={site.id} className="border-b border-sand2 last:border-0">
                      <td className="px-6 py-4">
                        {admin ? (
                          <Link to={`/sites/${site.id}`} className="font-bold hover:text-signal">
                            {site.name}
                          </Link>
                        ) : (
                          <span className="font-bold">{site.name}</span>
                        )}
                        {site.client && <span className="block text-[13px] text-muted font-semibold">{site.client}</span>}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold tabular-nums">{shiftLabel(site)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-right tabular-nums">{site.employee_count}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-right tabular-nums">{site.on_site_count}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 h-7 items-center rounded-full text-[12px] font-bold ${
                            site.is_active ? "bg-green-bg text-zone-green" : "bg-sand text-muted"
                          }`}
                        >
                          {site.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {site.is_active &&
                          (current ? (
                            <span className="text-sm font-bold text-mute2">Viewing</span>
                          ) : (
                            <button
                              onClick={() => setActiveSiteId(site.id)}
                              className="text-sm font-bold text-ink hover:text-signal"
                            >
                              View this site
                            </button>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
