import { API_BASE } from "@/shared/lib/config";
import { ApiError } from "./api";
import { clearPlatformSession, getPlatformToken } from "./platformAuth";

const BASE = `${API_BASE}/platform`;

export async function platformFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getPlatformToken();
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && !path.startsWith("/auth/")) {
    clearPlatformSession();
    if (!window.location.pathname.startsWith("/admin/signin")) window.location.href = "/admin/signin";
    throw new ApiError(401, "Your session has ended. Sign in again.", "UNAUTHENTICATED");
  }
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.message || "Something went wrong. Try again.",
      data?.error?.code,
      data?.error?.fields,
    );
  }
  return data as T;
}
