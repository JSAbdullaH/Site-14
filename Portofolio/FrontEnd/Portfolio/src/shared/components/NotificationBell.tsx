import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellOff, BellRing, CheckCheck, LogIn, LogOut, MapPinOff, MapPinned, WifiOff, Wifi } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { describeEvent, sinceLabel } from "@/shared/lib/presence";
import type { PresenceEvent, PresenceEventType } from "@/shared/lib/presence";
import { desktopAlertsEnabled, disableDesktopAlerts, enableDesktopAlerts } from "@/shared/lib/useAlertFeed";

const ICON: Record<PresenceEventType, { icon: LucideIcon; className: string }> = {
  zone_exit: { icon: MapPinOff, className: "bg-danger-bg text-danger" },
  zone_enter: { icon: MapPinned, className: "bg-ok-bg text-ok" },
  site_enter: { icon: LogIn, className: "bg-info-bg text-info" },
  site_exit: { icon: LogOut, className: "bg-secondary text-muted-foreground" },
  device_offline: { icon: WifiOff, className: "bg-warn-bg text-warn" },
  device_online: { icon: Wifi, className: "bg-ok-bg text-ok" },
};

type Props = {
  events: PresenceEvent[];
  unread: number;
  capped: boolean;
  onOpen: () => void;
};

export default function NotificationBell({ events, unread, capped, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(desktopAlertsEnabled);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      setUnreadIds(new Set(events.slice(0, unread).map((e) => e.id)));
      if (unread > 0) onOpen();
    }
    setOpen(!open);
  }

  async function toggleDesktop() {
    if (desktop) {
      disableDesktopAlerts();
      setDesktop(false);
    } else {
      setDesktop(await enableDesktopAlerts());
    }
  }

  const label = unread ? `Notifications, ${unread}${capped ? "+" : ""} unread` : "Notifications";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={toggle}
        className="relative inline-flex size-10 items-center justify-center rounded-full hover:bg-secondary"
      >
        {unread ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white tabular-nums">
            {unread}
            {capped ? "+" : ""}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-12 right-0 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-semibold">Notifications</p>
            <button
              type="button"
              onClick={toggleDesktop}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              title="Show a system notification when this tab is in the background"
            >
              {desktop ? <BellRing className="size-3.5" /> : <BellOff className="size-3.5" />}
              Desktop alerts {desktop ? "on" : "off"}
            </button>
          </div>

          {events.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No activity yet. You are told here when someone leaves or enters a zone, or their device goes offline.
            </p>
          ) : (
            <ul className="max-h-[26rem] divide-y overflow-y-auto">
              {events.map((e) => {
                const { icon: Icon, className } = ICON[e.type];
                const { title, detail } = describeEvent(e);
                const fresh = unreadIds.has(e.id);
                return (
                  <li key={e.id} className={`flex gap-3 px-4 py-3 ${fresh ? "bg-accent/40" : ""}`}>
                    <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${className}`}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{title}</p>
                      <p className="truncate text-xs text-muted-foreground">{detail}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {sinceLabel(e.occurred_at)}
                        {e.alert && e.type === "zone_exit" && (e.alert.resolved ? " · back in zone" : " · still out of zone")}
                      </p>
                    </div>
                    {fresh && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="New" />}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-center justify-between border-t px-4 py-2.5 text-sm">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCheck className="size-3.5" />
              All marked as read
            </span>
            <Link to="/alerts" className="font-medium text-signal hover:underline" onClick={() => setOpen(false)}>
              Open alerts
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
