import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BatteryMedium, MapPin, Pause, Play, Radio, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { ApiError } from "@/shared/lib/api";
import { timeAgo } from "@/shared/lib/deviceTypes";
import PairLayout from "./components/PairLayout";
import { forgetStoredDevice, loadStoredDevice, sendHeartbeat, sendReadings } from "./api";
import { readBattery } from "./detect";
import { REFUSAL_TEXT } from "./types";
import type { Heartbeat, IngestResult, Reading, RefusalCode } from "./types";

const SAMPLE_MS = 5_000;
const FLUSH_MS = 10_000;
const HEARTBEAT_MS = 30_000;
const MAX_BUFFER = 120;

type WakeLockSentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } };

function whereText(r: IngestResult) {
  if (r.location_status === "off_site") return "Off site. Location is not recorded.";
  if (r.zone) return `In ${r.zone.name}`;
  return r.out_of_zone ? "Out of your work zone" : "On site";
}

export default function TrackerPage() {
  const [device, setDevice] = useState(() => loadStoredDevice());
  const [status, setStatus] = useState<Heartbeat | null>(null);
  const [refusal, setRefusal] = useState<RefusalCode | null>(null);
  const [fatal, setFatal] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [tracking, setTracking] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [position, setPosition] = useState<GeolocationCoordinates | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [location, setLocation] = useState<IngestResult | null>(null);
  const [queued, setQueued] = useState(0);
  const [, setTick] = useState(0);

  const buffer = useRef<Reading[]>([]);
  const batteryLevel = useRef<number | null>(null);
  const lastSample = useRef(0);
  const watchId = useRef<number | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const sending = useRef(false);

  const handleError = useCallback((err: unknown) => {
    if (!(err instanceof ApiError)) return;
    if (err.code === "DEVICE_UNAUTHENTICATED") setFatal("This device was removed by your company. Connect it again to keep tracking.");
    else if (err.code === "DEVICE_INACTIVE") setFatal("Your company deactivated this device.");
    else if (err.code === "DEVICE_UNASSIGNED" || err.code === "NO_CONSENT" || err.code === "NO_SITE") setRefusal(err.code);
  }, []);

  const beat = useCallback(async () => {
    if (!device) return;
    const b = await readBattery();
    const level = b ? Math.round(b.level * 100) : null;
    setBattery(level);
    batteryLevel.current = level;
    try {
      const res = await sendHeartbeat(device, level);
      setStatus(res);
      setRefusal(res.reason);
      setFatal("");
    } catch (err) {
      handleError(err);
    }
  }, [device, handleError]);

  const flush = useCallback(async () => {
    if (!device || sending.current || buffer.current.length === 0) return;
    sending.current = true;
    const batch = buffer.current.slice(0, MAX_BUFFER);
    try {
      const res = await sendReadings(device, batch);
      buffer.current = buffer.current.slice(batch.length);
      setLastSent(new Date().toISOString());
      setLocation(res);
      setRefusal(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 422)) buffer.current = buffer.current.slice(batch.length);
      handleError(err);
    } finally {
      sending.current = false;
      setQueued(buffer.current.length);
    }
  }, [device, handleError]);

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
    setTracking(false);
  }, []);

  const start = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setGeoError("This browser cannot share its location.");
      return;
    }
    if (!window.isSecureContext) {
      setGeoError("Location needs a secure (https) address. Open the https link from your administrator.");
      return;
    }
    setGeoError("");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition(pos.coords);
        if (pos.timestamp - lastSample.current < SAMPLE_MS) return;
        lastSample.current = pos.timestamp;
        buffer.current = [
          ...buffer.current,
          {
            recorded_at: new Date(pos.timestamp).toISOString(),
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            battery_percent: batteryLevel.current,
          },
        ].slice(-MAX_BUFFER);
        setQueued(buffer.current.length);
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location access is blocked. Allow location for this site in the browser settings."
            : "Could not read the location. Move to an open area and try again.",
        );
        if (err.code === err.PERMISSION_DENIED) stop();
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    setTracking(true);
    try {
      wakeLock.current = (await (navigator as WakeLockNavigator).wakeLock?.request("screen")) ?? null;
    } catch {
      wakeLock.current = null;
    }
  }, [stop]);

  useEffect(() => {
    if (!device) return;
    beat();
    const heartbeat = window.setInterval(beat, HEARTBEAT_MS);
    const sender = window.setInterval(flush, FLUSH_MS);
    const clock = window.setInterval(() => setTick((t) => t + 1), 5_000);
    const up = () => {
      setOnline(true);
      flush();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(sender);
      window.clearInterval(clock);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [device, beat, flush]);

  useEffect(() => {
    if (!device || !navigator.permissions) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") start();
      })
      .catch(() => undefined);
  }, [device, start]);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    const regain = async () => {
      if (document.visibilityState === "visible" && tracking && !wakeLock.current) {
        try {
          wakeLock.current = (await (navigator as WakeLockNavigator).wakeLock?.request("screen")) ?? null;
        } catch {
          wakeLock.current = null;
        }
      }
    };
    document.addEventListener("visibilitychange", regain);
    return () => document.removeEventListener("visibilitychange", regain);
  }, [tracking]);

  if (!device) {
    return (
      <PairLayout>
        <div className="rounded-xl border bg-background p-6 text-center">
          <Radio className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-3 text-xl font-semibold">Not connected</h1>
          <p className="mt-1 text-sm text-muted-foreground">Scan the QR code from your company, or enter its pairing code.</p>
          <Link
            to="/pair"
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground"
          >
            Enter pairing code
          </Link>
        </div>
      </PairLayout>
    );
  }

  const disconnect = () => {
    if (!window.confirm("Disconnect this device? It stops sending its location.")) return;
    stop();
    forgetStoredDevice();
    setDevice(null);
  };

  const healthy = !fatal && online;

  return (
    <PairLayout>
      <div className="rounded-xl border bg-background p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <DeviceIcon type={device.device_type} className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{status?.device.name || device.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {device.company_name} · <span className="font-mono">{device.serial_number}</span>
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
              healthy ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"
            }`}
          >
            {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
            {fatal ? "Stopped" : online ? "Connected" : "Offline"}
          </span>
        </div>

        {status?.wearer && (
          <p className="mt-4 flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-ok" />
            Carried by <span className="font-medium">{status.wearer.full_name}</span>
            {status.site ? ` · ${status.site.name}` : ""}
          </p>
        )}
      </div>

      {fatal && (
        <div role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" />
            {fatal}
          </p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => {
              stop();
              forgetStoredDevice();
              setDevice(null);
            }}
          >
            Connect again
          </Button>
        </div>
      )}

      {!fatal && refusal && (
        <p className="mt-4 rounded-xl bg-info-bg p-4 text-sm text-info">{REFUSAL_TEXT[refusal]}</p>
      )}

      {!fatal && (
        <div className="mt-4 rounded-xl border bg-background p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{tracking ? "Sharing location" : "Location paused"}</p>
              <p className="text-sm text-muted-foreground">
                {tracking ? "Keep this page open while you work." : "Start when you arrive at work."}
              </p>
            </div>
            {tracking ? (
              <Button variant="outline" onClick={stop}>
                <Pause />
                Pause
              </Button>
            ) : (
              <Button onClick={start}>
                <Play />
                Start
              </Button>
            )}
          </div>

          {geoError && <p className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">{geoError}</p>}

          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Where</dt>
              <dd className={`mt-0.5 flex items-start gap-1.5 font-medium ${location?.out_of_zone ? "text-danger" : ""}`}>
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {location ? whereText(location) : position ? "Locating..." : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Accuracy</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{position ? `± ${Math.round(position.accuracy)} m` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Battery</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium tabular-nums">
                <BatteryMedium className="size-4 text-muted-foreground" />
                {battery !== null ? `${battery}%` : "Not available"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last sent</dt>
              <dd className="mt-0.5 font-medium">
                {lastSent ? timeAgo(lastSent) : "—"}
                {queued > 0 && <span className="block text-xs font-normal text-muted-foreground">{queued} waiting to send</span>}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Your location is recorded only inside your work site, during work. Outside the site, nothing is stored.
      </p>
      <button type="button" onClick={disconnect} className="mt-3 text-center text-sm text-muted-foreground hover:text-destructive">
        Disconnect this device
      </button>
    </PairLayout>
  );
}
