import { useCallback, useEffect, useState } from "react";
import AppShell from "@/shared/components/AppShell";
import EmptyState from "@/shared/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PresenceEvent } from "@/shared/lib/presence";
import AlertList from "./components/AlertList";
import ActivityLog from "./components/ActivityLog";
import { acknowledgeAlert, listActivity, listAlerts } from "./api";
import { ALERT_LABEL } from "./types";
import type { Alert, AlertType } from "./types";

const REFRESH_MS = 10_000;

const ACTIVITY_FILTERS = [
  { value: "", label: "Everything" },
  { value: "zone_exit,zone_enter", label: "Zones" },
  { value: "site_enter,site_exit", label: "Arrivals and departures" },
  { value: "device_offline,device_online", label: "Devices" },
];

export default function AlertsPage() {
  const [tab, setTab] = useState("open");
  const [type, setType] = useState<AlertType | undefined>();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [activity, setActivity] = useState<PresenceEvent[] | null>(null);
  const [activityType, setActivityType] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      if (tab === "activity") setActivity((await listActivity(activityType || undefined)).data);
      else setAlerts((await listAlerts({ status: tab === "open" ? "open" : "resolved", type })).data);
      setNow(Date.now());
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tab, type, activityType]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, [load]);

  async function acknowledge(a: Alert) {
    setBusy(a.id);
    try {
      const updated = await acknowledgeAlert(a.id);
      setAlerts((list) => list?.map((x) => (x.id === a.id ? updated : x)) ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const openCount = tab === "open" && alerts ? alerts.length : null;

  return (
    <AppShell
      title="Alerts"
      subtitle={openCount === null ? "Who is out of zone, offline or over their limits" : `${openCount} open alert${openCount === 1 ? "" : "s"}`}
    >
      {error && <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setAlerts(null);
          setActivity(null);
          setTab(String(v));
        }}
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
            <TabsTrigger value="activity">Activity log</TabsTrigger>
          </TabsList>

          {tab === "activity" ? (
            <select
              aria-label="Show"
              value={activityType}
              onChange={(e) => {
                setActivity(null);
                setActivityType(e.target.value);
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {ACTIVITY_FILTERS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              aria-label="Alert type"
              value={type ?? ""}
              onChange={(e) => {
                setAlerts(null);
                setType((e.target.value || undefined) as AlertType | undefined);
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">All alert types</option>
              {(Object.keys(ALERT_LABEL) as AlertType[]).map((t) => (
                <option key={t} value={t}>
                  {ALERT_LABEL[t]}
                </option>
              ))}
            </select>
          )}
        </div>

        {(["open", "resolved"] as const).map((value) => (
          <TabsContent key={value} value={value}>
            {alerts === null ? (
              <Skeleton className="h-40 w-full" />
            ) : alerts.length === 0 ? (
              <EmptyState
                title={value === "open" ? "All clear" : "No resolved alerts"}
                description={value === "open" ? "Everyone on site is where they should be." : undefined}
              />
            ) : (
              <AlertList alerts={alerts} now={now} busy={busy} onAcknowledge={acknowledge} />
            )}
          </TabsContent>
        ))}

        <TabsContent value="activity">
          {activity === null ? (
            <Skeleton className="h-40 w-full" />
          ) : activity.length === 0 ? (
            <EmptyState title="No activity yet" description="Arrivals, departures and zone changes appear here as devices report them." />
          ) : (
            <ActivityLog events={activity} />
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
