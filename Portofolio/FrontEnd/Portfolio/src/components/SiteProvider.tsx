import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiFetch } from "../lib/api";
import { SiteContext } from "../lib/sites";
import type { SiteSummary } from "../lib/sites";

const KEY = "site14_active_site";

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function store(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // remembering the choice is a convenience only
  }
}

// SITE-50: the active site for the whole dashboard, remembered between visits.
export default function SiteProvider({ children }: { children: ReactNode }) {
  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [error, setError] = useState("");
  const [chosenId, setChosenId] = useState<string | null>(readStored);

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: SiteSummary[] }>("/sites");
      setSites(res.data);
      setError("");
    } catch (err) {
      setError((err as Error).message);
      setSites((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setActiveSiteId = useCallback((id: string) => {
    setChosenId(id);
    store(id);
  }, []);

  // The remembered site, unless it was deactivated; then the first active one.
  const activeSite = useMemo(() => {
    const active = (sites ?? []).filter((s) => s.is_active);
    return active.find((s) => s.id === chosenId) ?? active[0] ?? null;
  }, [sites, chosenId]);

  const value = useMemo(
    () => ({ sites, error, activeSite, setActiveSiteId, reload }),
    [sites, error, activeSite, setActiveSiteId, reload],
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}
