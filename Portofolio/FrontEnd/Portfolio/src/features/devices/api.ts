import { apiFetch } from "@/shared/lib/api";
import type {
  Device,
  DeviceWithKey,
  EmployeeOption,
  ListDevicesResponse,
} from "./types";

export function listDevices(params?: {
  status?: "active" | "inactive" | "all";
  assigned?: boolean;
  search?: string;
  page?: number;
}) {
  const query = new URLSearchParams({ limit: "100" });
  if (params?.status) query.set("status", params.status);
  if (params?.assigned !== undefined) query.set("assigned", String(params.assigned));
  if (params?.search) query.set("search", params.search);
  if (params?.page) query.set("page", String(params.page));
  return apiFetch<ListDevicesResponse>(`/devices?${query}`);
}

export const registerDevices = (serials: string[]) =>
  apiFetch<{ created: number; data: DeviceWithKey[] }>("/devices/batch", {
    method: "POST",
    body: JSON.stringify({ serial_numbers: serials }),
  });

export const updateDevice = (
  id: string,
  body: { employee_id?: string | null; is_active?: boolean },
) => apiFetch<Device>(`/devices/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const rotateDeviceKey = (id: string) =>
  apiFetch<DeviceWithKey>(`/devices/${id}/key`, { method: "POST" });

// The workers who can be given a device. Read here rather than from the
// employees feature, so the two features stay independent.
export const listActiveEmployees = (search?: string) =>
  apiFetch<{ data: EmployeeOption[] }>(
    `/employees?status=active&limit=100${search ? `&search=${encodeURIComponent(search)}` : ""}`,
  );
