import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Building2, CheckCircle2, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { DEVICE_TYPE_LABEL } from "@/shared/lib/deviceTypes";
import type { DeviceType } from "@/shared/lib/deviceTypes";
import { ApiError } from "@/shared/lib/api";
import PairLayout from "./components/PairLayout";
import { claimPairing, forgetStoredDevice, loadStoredDevice, lookupPairing, saveStoredDevice } from "./api";
import { detectThisDevice } from "./detect";
import type { DetectedDevice, PairingInfo } from "./types";

const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
const pretty = (code: string) => (code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

export default function PairPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [stored, setStored] = useState(() => loadStoredDevice());
  const [code, setCode] = useState(() => clean(params.code ?? ""));
  const [info, setInfo] = useState<PairingInfo | null>(null);
  const [detected, setDetected] = useState<DetectedDevice | null>(null);
  const [deviceType, setDeviceType] = useState<DeviceType | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    detectThisDevice().then((d) => {
      setDetected(d);
      setDeviceType(d.guess);
    });
  }, []);

  async function check(value: string) {
    setBusy(true);
    setError("");
    try {
      setInfo(await lookupPairing(value));
    } catch (err) {
      setInfo(null);
      setError(err instanceof ApiError ? err.message : "Could not check the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const initial = clean(params.code ?? "");
    if (initial.length === 8 && !stored) check(initial);
  }, [params.code, stored]);

  function submitCode(e: FormEvent) {
    e.preventDefault();
    if (code.length === 8) check(code);
    else setError("Enter the 8-character code shown on the screen.");
  }

  async function connect() {
    if (!detected || !deviceType) return;
    setBusy(true);
    setError("");
    try {
      const fresh = await detectThisDevice();
      const res = await claimPairing(code, {
        device_type: deviceType,
        name: name.trim() || undefined,
        model: fresh.model,
        platform_version: fresh.platform_version,
        touch_points: fresh.touch_points,
        has_battery: deviceType === "laptop" ? true : fresh.has_battery,
        battery_percent: fresh.battery_percent,
      });
      const saved = saveStoredDevice({
        serial_number: res.serial_number,
        api_key: res.api_key,
        company_name: res.company_name,
        name: res.device.name || DEVICE_TYPE_LABEL[res.device.device_type],
        device_type: res.device.device_type,
      });
      if (!saved) {
        setError("This browser blocks storage, so it cannot stay connected. Turn off private browsing and try again.");
        return;
      }
      navigate("/tracker", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not connect. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (stored) {
    return (
      <PairLayout>
        <div className="rounded-xl border bg-background p-6 text-center">
          <CheckCircle2 className="mx-auto size-10 text-ok" />
          <h1 className="mt-3 text-xl font-semibold">Already connected</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This {DEVICE_TYPE_LABEL[stored.device_type].toLowerCase()} is connected to {stored.company_name} as{" "}
            <span className="font-mono">{stored.serial_number}</span>.
          </p>
          <div className="mt-6 grid gap-2">
            <Link
              to="/tracker"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground"
            >
              Open tracker
            </Link>
            <Button
              variant="ghost"
              onClick={() => {
                if (!window.confirm("Disconnect this device? It stops sending its location. Your company can connect it again later.")) return;
                forgetStoredDevice();
                setStored(null);
              }}
            >
              Connect to a different company
            </Button>
          </div>
        </div>
      </PairLayout>
    );
  }

  return (
    <PairLayout>
      <h1 className="text-2xl font-semibold tracking-tight">Connect this device</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your company uses SITE14 to record time on site. Once connected, this device shares its location while you are at work.
      </p>

      {error && (
        <p role="alert" className="mt-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {!info ? (
        <form onSubmit={submitCode} className="mt-6 rounded-xl border bg-background p-5" noValidate>
          <Label htmlFor="pair_code">Pairing code</Label>
          <Input
            id="pair_code"
            value={pretty(code)}
            onChange={(e) => {
              setCode(clean(e.target.value));
              setError("");
            }}
            placeholder="XXXX-XXXX"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            className="mt-2 h-12 text-center font-mono text-2xl tracking-[0.2em]"
          />
          <p className="mt-2 text-xs text-muted-foreground">Shown next to the QR code on your manager's screen.</p>
          <Button type="submit" className="mt-5 h-10 w-full" disabled={busy || code.length !== 8}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Continue
          </Button>
        </form>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border bg-background p-5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Connecting to</p>
            <p className="mt-2 flex items-center gap-2 text-lg font-semibold">
              <Building2 className="size-5 text-muted-foreground" />
              {info.company_name}
            </p>
            {info.employee && (
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <UserRound className="size-4" />
                Carried by {info.employee.full_name}
              </p>
            )}
          </div>

          <div className="rounded-xl border bg-background p-5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Detected device</p>
            {!detected || !deviceType ? (
              <Skeleton className="mt-3 h-14 w-full" />
            ) : (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <DeviceIcon type={deviceType} className="size-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{DEVICE_TYPE_LABEL[deviceType]}</p>
                    <p className="truncate text-sm text-muted-foreground">{detected.summary || "Browser device"}</p>
                  </div>
                </div>

                {detected.choices.length > 1 && (
                  <fieldset className="mt-4">
                    <legend className="mb-2 text-sm font-medium">Is this right?</legend>
                    <div className="flex flex-wrap gap-2">
                      {detected.choices.map((t) => (
                        <button
                          key={t}
                          type="button"
                          aria-pressed={deviceType === t}
                          onClick={() => setDeviceType(t)}
                          className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${
                            deviceType === t ? "border-primary bg-accent text-accent-foreground" : "hover:bg-secondary"
                          }`}
                        >
                          <DeviceIcon type={t} className="size-4" />
                          {DEVICE_TYPE_LABEL[t]}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}

                {!info.label && (
                  <div className="mt-4 grid gap-2">
                    <Label htmlFor="device_name">Name (optional)</Label>
                    <Input
                      id="device_name"
                      value={name}
                      maxLength={80}
                      placeholder="For example: Ahmed's phone"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {!window.isSecureContext && (
            <p className="rounded-md bg-warn-bg px-4 py-3 text-sm text-warn">
              This page is not on a secure (https) address, so the browser will not share the location. Ask your administrator for the https link.
            </p>
          )}

          <Button className="h-11 w-full" onClick={connect} disabled={busy || !detected}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Connect device
          </Button>
          <button
            type="button"
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setInfo(null);
              setCode("");
              navigate("/pair", { replace: true });
            }}
          >
            Use a different code
          </button>
        </div>
      )}
    </PairLayout>
  );
}
