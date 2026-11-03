import { clearToken, getToken, saveToken, saveUser } from "./auth";

const BASE = "/api/v1";

// Every failed response has the shape { error: { code, message, fields? } }.
export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;

  constructor(
    status: number,
    message: string,
    code = "UNKNOWN",
    fields: Record<string, string> = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const NO_REFRESH = ["/auth/login", "/auth/refresh", "/auth/register"];

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).catch(() => null);

  if (!res || !res.ok) return null;

  const data = await res.json().catch(() => null);
  if (!data?.access_token) return null;

  saveToken(data.access_token);
  if (data.user) saveUser(data.user);
  return data.access_token;
}

function refreshOnce(): Promise<string | null> {
  if (!refreshing) {
    refreshing = refreshAccessToken().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

function send(path: string, options: RequestInit, token: string | null) {
  return fetch(BASE + path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let res = await send(path, options, getToken());

  const canRefresh = !NO_REFRESH.some((p) => path.startsWith(p));

  if (res.status === 401 && canRefresh) {
    const fresh = await refreshOnce();

    if (fresh) {
      res = await send(path, options, fresh);
    } else {
      clearToken();
      if (!window.location.pathname.startsWith("/signin")) {
        window.location.href = "/signin";
      }
      throw new ApiError(401, "Your session has ended. Sign in again.", "UNAUTHENTICATED");
    }
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.message || data?.message || "Something went wrong. Try again.",
      data?.error?.code,
      data?.error?.fields,
    );
  }

  return data as T;
}