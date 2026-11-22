import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BatteryMedium,
  Crosshair,
  Loader2,
  MapPin,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { ApiError } from "@/shared/lib/api";
import { timeAgo } from "@/shared/lib/deviceTypes";
import PairLayout from "./components/PairLayout";
import { forgetStoredDevice, loadStoredDevice, sendHeartbeat, sendReadings } from "./api";
import { readBattery } from "./detect";
import { DENIED_STEPS, PHASE_TEXT, detectPlatform, getQuickFix } from "./geolocation";
import type { LocationPhase } from "./geolocation";
import { REFUSAL_TEXT } from "./types";
import type { Heartbeat, IngestResult, Reading, RefusalCode } from "./types";

const SAMPLE_MS = 5_000;
const FLUSH_MS = 10_000;
const HEARTBEAT_MS = 30_000;
const MAX_BUFFER = 120;
const PRECISE_TIMEOUTS_BEFORE_FALLBACK = 2;

type WakeLockSentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } };

function whereText(r: IngestResult) {
  if (r.location_status === "off_site") return "Outside your work site. Your position is not recorded.";
  if (r.zone) return `In ${r.zone.name}`;
  return r.out_of_zone ? "Out of your work zone" : "On site";
}

export default function TrackerPage() {
  const [device, setDevice] = useState(() => loadStoredDevice());
  const [status, setStatus] = useState<Heartbeat | null>(null);
  const [refusal, setRefusal] = useState<RefusalCode | null>(null);
  const [fatal, setFatal] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [phase, setPhase] = useState<LocationPhase>("idle");
  const [approximate, setApproximate] = useState(false);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [location, setLocation] = useState<IngestResult | null>(null);
  const [queued, setQueued] = useState(0);
  const [sendError, setSendError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [platform] = useState(detectPlatform);

  const buffer = useRef<Reading[]>([]);
  const batteryLevel = useRef<number | null>(null);
  const lastSample = useRef(0);
  const watchId = useRef<number | null>(null);
  const timeouts = useRef(0);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const sending = useRef(false);

  const tracking = phase === "requesting" || phase === "searching" || phase === "active";

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
      setSendError((e) => (e.startsWith("Cannot reach") ? "" : e));
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
      setSendError("");
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 422)) buffer.current = buffer.current.slice(batch.length);
      handleError(err);
      if (err instanceof ApiError && err.status !== 409) {
        setSendError(
          err.status === 0
            ? "Cannot reach the server. Your positions are kept and sent as soon as it answers."
            : err.status === 429
              ? "Sending too often. The next batch goes out shortly."
              : `The server refused the positions: ${err.message}`,
        );
      }
    } finally {
      sending.current = false;
      setQueued(buffer.current.length);
    }
  }, [device, handleError]);

  const record = useCallback(
    (pos: GeolocationPosition, sendNow: boolean) => {
      setPosition(pos);
      setPhase("active");
      timeouts.current = 0;
      const at = pos.timestamp || Date.now();
      if (at - lastSample.current < SAMPLE_MS) return;
      lastSample.current = at;
      buffer.current = [
        ...buffer.current,
        {
          recorded_at: new Date(Math.min(at, Date.now())).toISOString(),
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          battery_percent: batteryLevel.current,
        },
      ].slice(-MAX_BUFFER);
      setQueued(buffer.current.length);
      if (sendNow) flush();
    },
    [flush],
  );

  const clearWatch = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  };

  const stop = useCallback(() => {
    clearWatch();
    wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
    setPhase("idle");
  }, []);

  const fail = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      clearWatch();
      setPhase("denied");
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      setPhase((p) => (p === "active" ? p : "unavailable"));
    }
  }, []);

  const watch = useCallback(
    (precise: boolean) => {
      const begin = (highAccuracy: boolean) => {
        clearWatch();
        setApproximate(!highAccuracy);
        watchId.current = navigator.geolocation.watchPosition(
          (pos) => record(pos, false),
          (err) => {
            if (err.code === err.TIMEOUT && highAccuracy) {
              timeouts.current += 1;
              if (timeouts.current >= PRECISE_TIMEOUTS_BEFORE_FALLBACK) begin(false);
              return;
            }
            fail(err);
          },
          { enableHighAccuracy: highAccuracy, maximumAge: highAccuracy ? 5_000 : 30_000, timeout: highAccuracy ? 20_000 : 30_000 },
        );
      };
      begin(precise);
    },
    [record, fail],
  );

  const start = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setPhase("unsupported");
      return;
    }
    if (!window.isSecureContext) {
      setPhase("insecure");
      return;
    }
    setPhase("requesting");
    timeouts.current = 0;
    try {
      const quick = await getQuickFix();
      record(quick, true);
    } catch (err) {
      const e = err as GeolocationPositionError;
      if (e.code === e.PERMISSION_DENIED) {
        setPhase("denied");
        return;
      }
      setPhase("searching");
    }
    watch(true);
    try {
      wakeLock.current = (await (navigator as WakeLockNavigator).wakeLock?.request("screen")) ?? null;
    } catch {
      wakeLock.current = null;
    }
  }, [record, watch]);

  useEffect(() => {
    if (!device) return;
    beat();
    const heartbeat = window.setInterval(beat, HEARTBEAT_MS);
    const sender = window.setInterval(flush, FLUSH_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 5_000);
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
        if (p.state === "denied") setPhase("denied");
      })
      .catch(() => undefined);
  }, [device, start]);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    const regain = async () => {
      if (document.visibilityState !== "visible") return;
      flush();
      if (tracking && !wakeLock.current) {
        try {
          wakeLock.current = (await (navigator as WakeLockNavigator).wakeLock?.request("screen")) ?? null;
        } catch {
          wakeLock.current = null;
        }
      }
    };
    document.addEventListener("visibilitychange", regain);
    return () => document.removeEventListener("visibilitychange", regain);
  }, [tracking, flush]);

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
  const blocked = phase === "denied" || phase === "unsupported" || phase === "insecure";
  const fixAge = position && position.timestamp ? Math.max(0, Math.round((now - position.timestamp) / 1000)) : null;

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

      {!fatal && refusal && <p className="mt-4 rounded-xl bg-info-bg p-4 text-sm text-info">{REFUSAL_TEXT[refusal]}</p>}

      {!fatal && (
        <div className="mt-4 rounded-xl border bg-background p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold">
                {(phase === "requesting" || phase === "searching") && <Loader2 className="size-4 animate-spin" />}
                {phase === "active" && <Crosshair className="size-4 text-ok" />}
                {PHASE_TEXT[phase]}
              </p>
              <p className="text-sm text-muted-foreground">
                {phase === "idle" && "Tap Start when you arrive at work."}
                {phase === "requesting" && "Tap Allow when the browser asks for your location."}
                {phase === "searching" && "Go near a window or outside. This can take up to a minute indoors."}
                {phase === "active" && (approximate ? "Using approximate location. Precise GPS was not available." : "Keep this page open while you work.")}
                {phase === "unavailable" && "The phone could not find its position. Check that location services are on, then try again."}
                {phase === "denied" && "The browser is not allowed to read your location yet."}
                {phase === "insecure" && "Open the https link from your administrator."}
                {phase === "unsupported" && "Open this page in Safari or Chrome."}
              </p>
            </div>
            {tracking ? (
              <Button variant="outline" onClick={stop}>
                <Pause />
                Pause
              </Button>
            ) : (
              <Button onClick={start} disabled={phase === "unsupported" || phase === "insecure"}>
                {phase === "idle" ? <Play /> : <RefreshCw />}
                {phase === "idle" ? "Start" : "Try again"}
              </Button>
            )}
          </div>

          {sendError && (
            <p role="status" className="mt-4 flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
              <WifiOff className="mt-0.5 size-4 shrink-0" />
              {sendError}
            </p>
          )}

          {phase === "denied" && (
            <ol className="mt-4 list-decimal space-y-1.5 rounded-lg bg-warn-bg py-3 pr-3 pl-8 text-sm text-warn">
              {DENIED_STEPS[platform].map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}

          {!blocked && (
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Where</dt>
                <dd className={`mt-0.5 flex items-start gap-1.5 font-medium ${location?.out_of_zone ? "text-danger" : ""}`}>
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {location ? whereText(location) : position ? (refusal ? "Position found, but not recorded yet (see above)" : "Position found, sending…") : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Accuracy</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {position ? `± ${Math.round(position.coords.accuracy)} m` : "—"}
                  {fixAge !== null && fixAge > 30 && <span className="block text-xs font-normal text-muted-foreground">fix {fixAge} s old</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Battery</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 font-medium tabular-nums">
                  <BatteryMedium className="size-4 text-muted-foreground" />
                  {battery !== null ? `${battery}%` : "Not available"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Last sent</dt>
                <dd className="mt-0.5 font-medium">
                  {lastSent ? timeAgo(lastSent) : "—"}
                  {queued > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{queued} waiting to send</span>}
                </dd>
              </div>
            </dl>
          )}
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
