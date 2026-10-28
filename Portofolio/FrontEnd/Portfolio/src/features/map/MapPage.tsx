import { useEffect, useState } from "react";
import AppShell from "@/shared/components/AppShell";
import LiveMap from "./components/LiveMap";
import { listSites } from "./api";
import type { SiteOption } from "./types";

const SITE_KEY = "site14.activeSite";

function readSaved() {
  try {
    return localStorage.getItem(SITE_KEY);
  } catch {
    return null;
  }
}

export default function MapPage() {
  const [sites, setSites] = useState<SiteOption[] | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSites()
      .then((list) => {
        setSites(list);
        const saved = readSaved();
        setSiteId(list.find((s) => s.id === saved)?.id ?? list[0]?.id ?? null);
      })
      .catch((err: Error) => {
        setSites([]);
        setError(`Could not load sites: ${err.message}`);
      });
  }, []);

  function choose(id: string) {
    setSiteId(id);
    try {
      localStorage.setItem(SITE_KEY, id);
    } catch {
      return;
    }
  }

  const site = sites?.find((s) => s.id === siteId);

  const notice =
    error ??
    (sites === null
      ? "Loading sitesâ€¦"
      : !siteId
        ? "No site yet. Create a site first, or set VITE_DEMO_SITE_ID in .env.local."
        : null);

  return (
    <AppShell title="Live map" subtitle={site ? site.name : undefined}>
      <div className="flex h-full flex-col gap-4">
        {sites && sites.length > 1 && (
          <select
            value={siteId ?? ""}
            onChange={(e) => choose(e.target.value)}
            className="h-9 self-start rounded-md border border-input bg-transparent px-3 text-sm font-medium outline-none focus-visible:border-ring"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        <LiveMap key={siteId ?? "none"} siteId={siteId} notice={notice} />
      </div>
    </AppShell>
  );
}