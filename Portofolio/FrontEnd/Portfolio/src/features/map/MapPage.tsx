import { useEffect, useState } from "react";
import { ChevronDown, MapPinned } from "lucide-react";
import AppShell from "@/shared/components/AppShell";
import LiveMap from "./components/LiveMap";
import { GLASS } from "./components/format";
import { getActiveSiteId, setActiveSiteId } from "@/features/sites/api";
import { listSites } from "./api";
import type { SiteOption } from "./types";

export default function MapPage() {
  const [sites, setSites] = useState<SiteOption[] | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSites()
      .then((list) => {
        setSites(list);
        const saved = getActiveSiteId();
        setSiteId(list.find((s) => s.id === saved)?.id ?? list[0]?.id ?? null);
      })
      .catch((err: Error) => {
        setSites([]);
        setError(`Could not load sites: ${err.message}`);
      });
  }, []);

  function choose(id: string) {
    setSiteId(id);
    setActiveSiteId(id);
  }

  const site = sites?.find((s) => s.id === siteId);

  const notice =
    error ??
    (sites === null
      ? "Loading sites…"
      : !siteId
        ? "No site yet. Create a site first, or set VITE_DEMO_SITE_ID in .env.local."
        : null);

  const switcher =
    sites && sites.length > 1 ? (
      <label className={`relative inline-flex h-9 items-center gap-2 rounded-full pr-8 pl-3 text-[13px] font-semibold ${GLASS}`}>
        <MapPinned className="size-4 text-primary" />
        <span className="sr-only">Site</span>
        <select
          value={siteId ?? ""}
          onChange={(e) => choose(e.target.value)}
          className="absolute inset-0 cursor-pointer appearance-none opacity-0"
          aria-label="Site"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_id ? `${s.name} (${s.display_id})` : s.name}
            </option>
          ))}
        </select>
        <span className="max-w-[7.5rem] truncate sm:max-w-[12rem]">{site?.name ?? "Choose a site"}</span>
        <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground" />
      </label>
    ) : null;

  return (
    <AppShell title="Live map" subtitle={site ? site.name : undefined}>
      <LiveMap key={siteId ?? "none"} siteId={siteId} notice={notice} siteSwitcher={switcher} />
    </AppShell>
  );
}
