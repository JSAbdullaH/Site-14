import { Link } from "react-router-dom";
import { isAdmin } from "../lib/auth";
import { useSites } from "../lib/sites";

// SITE-50: switch the active site without signing out.
export default function SiteSelector() {
  const { sites, activeSite, setActiveSiteId } = useSites();

  if (sites === null) {
    return <span className="inline-block h-10 w-48 rounded-ctrl bg-sand animate-pulse" aria-label="Loading sites" />;
  }

  const active = sites.filter((s) => s.is_active);
  if (!activeSite) {
    return isAdmin() ? (
      <Link to="/sites/new" className="h-10 px-4 inline-flex items-center rounded-ctrl bg-sand text-sm font-bold hover:text-signal">
        + Create your first site
      </Link>
    ) : (
      <span className="text-sm font-semibold text-mute2">No active site</span>
    );
  }

  return (
    <label className="flex items-center gap-3">
      <span className="text-[11px] font-bold tracking-[0.1em] text-mute2">SITE</span>
      <select
        value={activeSite.id}
        onChange={(e) => setActiveSiteId(e.target.value)}
        className="h-10 max-w-64 pl-4 pr-8 rounded-ctrl bg-sand text-ink text-sm font-bold border border-transparent outline-none focus:border-signal cursor-pointer"
      >
        {active.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
    </label>
  );
}
