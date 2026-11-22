import { apiFetch } from "@/shared/lib/api";
import type { DeviceType } from "@/shared/lib/deviceTypes";
import type {
  Device,
  DeviceFilter,
  DeviceSummary,
  DeviceWithKey,
  EmployeeOption,
  ListDevicesResponse,
  NewPairing,
  Pairing,
} from "./types";

export function listDevices(params: { filter: DeviceFilter; type?: DeviceType; search?: string }) {
  const query = new URLSearchParams({ limit: "100" });
  query.set("status", params.filter === "inactive" ? "inactive" : "active");
  if (params.filter === "unassigned") query.set("assigned", "false");
  if (params.filter === "online" || params.filter === "offline" || params.filter === "never") query.set("health", params.filter);
  if (params.type) query.set("type", params.type);
  if (params.search) query.set("search", params.search);
  return apiFetch<ListDevicesResponse>(`/devices?${query}`);
}

export const getDeviceSummary = () => apiFetch<DeviceSummary>("/devices/summary");

export const registerDevices = (serials: string[], deviceType: DeviceType) =>
  apiFetch<{ created: number; data: DeviceWithKey[] }>("/devices/batch", {
    method: "POST",
    body: JSON.stringify({ serial_numbers: serials, device_type: deviceType }),
  });

export const updateDevice = (
  id: string,
  body: { employee_id?: string | null; is_active?: boolean; name?: string | null; device_type?: DeviceType },
) => apiFetch<Device>(`/devices/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const removeDevice = (id: string) => apiFetch<void>(`/devices/${id}`, { method: "DELETE" });

export const rotateDeviceKey = (id: string) =>
  apiFetch<DeviceWithKey>(`/devices/${id}/key`, { method: "POST" });

export const createPairing = (body: { employee_id?: string | null; label?: string }) =>
  apiFetch<NewPairing>("/devices/pairings", { method: "POST", body: JSON.stringify(body) });

export const getPairing = (id: string) => apiFetch<Pairing>(`/devices/pairings/${id}`);

export const cancelPairing = (id: string) => apiFetch<void>(`/devices/pairings/${id}`, { method: "DELETE" });

export const listActiveEmployees = (search?: string) =>
  apiFetch<{ data: EmployeeOption[] }>(
    `/employees?status=active&limit=100${search ? `&search=${encodeURIComponent(search)}` : ""}`,
  );
