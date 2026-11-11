import { ApiError } from "@/shared/lib/api";
import type { ClaimInput, ClaimResponse, Heartbeat, IngestResult, PairingInfo, Reading, StoredDevice } from "./types";

const BASE = "/api/v1";
const STORE_KEY = "site14_device";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  } catch {
    throw new ApiError(0, "No connection. Readings are kept on this device and sent when it is back online.", "OFFLINE");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.message || "Something went wrong. Try again.", data?.error?.code, data?.error?.fields);
  }
  return data as T;
}

const deviceHeaders = (d: StoredDevice) => ({ "X-Device-Serial": d.serial_number, "X-Device-Key": d.api_key });

export const lookupPairing = (code: string) => request<PairingInfo>(`/pairing/${encodeURIComponent(code)}`);

export const claimPairing = (code: string, body: ClaimInput) =>
  request<ClaimResponse>(`/pairing/${encodeURIComponent(code)}/claim`, { method: "POST", body: JSON.stringify(body) });

export const sendHeartbeat = (d: StoredDevice, battery: number | null) =>
  request<Heartbeat>("/ingest/heartbeat", { method: "POST", headers: deviceHeaders(d), body: JSON.stringify({ battery_percent: battery }) });

export const sendReadings = (d: StoredDevice, readings: Reading[]) =>
  request<IngestResult>("/ingest/readings", {
    method: "POST",
    headers: deviceHeaders(d),
    body: JSON.stringify({ sent_at: new Date().toISOString(), readings }),
  });

export function loadStoredDevice(): StoredDevice | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as StoredDevice) : null;
  } catch {
    return null;
  }
}

export function saveStoredDevice(device: StoredDevice) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(device));
    return true;
  } catch {
    return false;
  }
}

export function forgetStoredDevice() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    return;
  }
}
