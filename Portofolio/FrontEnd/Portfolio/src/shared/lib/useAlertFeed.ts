import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "./api";
import { describeEvent } from "./presence";
import type { AlertSummary, NotificationsResponse, PresenceEvent, PresenceEventType } from "./presence";

const POLL_MS = 10_000;
const CURSOR_KEY = "site14_feed_cursor";
const DESKTOP_KEY = "site14_desktop_alerts";

const TOASTED: PresenceEventType[] = ["zone_exit", "zone_enter", "device_offline", "device_online"];

function readCursor() {
  try {
    return sessionStorage.getItem(CURSOR_KEY);
  } catch {
    return null;
  }
}

function writeCursor(value: string) {
  try {
    sessionStorage.setItem(CURSOR_KEY, value);
  } catch {
    return;
  }
}

export function desktopAlertsEnabled() {
  try {
    return localStorage.getItem(DESKTOP_KEY) === "on" && "Notification" in window && Notification.permission === "granted";
  } catch {
    return false;
  }
}

export async function enableDesktopAlerts() {
  if (!("Notification" in window)) return false;
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  try {
    localStorage.setItem(DESKTOP_KEY, permission === "granted" ? "on" : "off");
  } catch {
    return permission === "granted";
  }
  return permission === "granted";
}

export function disableDesktopAlerts() {
  try {
    localStorage.setItem(DESKTOP_KEY, "off");
  } catch {
    return;
  }
}

function announce(events: PresenceEvent[]) {
  const fresh = events.filter((e) => TOASTED.includes(e.type)).slice(0, 5).reverse();
  for (const e of fresh) {
    const { title, detail } = describeEvent(e);
    if (e.type === "zone_exit") toast.error(title, { description: detail, duration: 10_000 });
    else if (e.type === "device_offline") toast.warning(title, { description: detail, duration: 8_000 });
    else toast.success(title, { description: detail });
    if (desktopAlertsEnabled() && document.visibilityState !== "visible") {
      try {
        new Notification(title, { body: detail, tag: e.id });
      } catch {
        continue;
      }
    }
  }
}

export function useAlertFeed() {
  const [events, setEvents] = useState<PresenceEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [capped, setCapped] = useState(false);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const cursor = useRef<string | null>(readCursor());

  const poll = useCallback(async () => {
    try {
      const [feed, alerts] = await Promise.all([
        apiFetch<NotificationsResponse>("/notifications?limit=30"),
        apiFetch<AlertSummary>("/alerts/summary"),
      ]);
      const newest = feed.data[0]?.created_at ?? feed.server_time;
      if (cursor.current) {
        const since = Date.parse(cursor.current);
        announce(feed.data.filter((e) => Date.parse(e.created_at) > since));
      }
      if (!cursor.current || Date.parse(newest) > Date.parse(cursor.current)) {
        cursor.current = newest;
        writeCursor(newest);
      }
      setEvents(feed.data);
      setUnread(feed.unread_count);
      setCapped(feed.unread_capped);
      setSummary(alerts);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    const wake = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [poll]);

  const markRead = useCallback(async () => {
    setUnread(0);
    setCapped(false);
    try {
      await apiFetch("/notifications/read", { method: "POST", body: JSON.stringify({}) });
    } catch {
      poll();
    }
  }, [poll]);

  return { events, unread, capped, summary, loaded, markRead, refresh: poll };
}
