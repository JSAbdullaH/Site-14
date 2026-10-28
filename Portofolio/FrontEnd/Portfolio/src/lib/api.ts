import { getToken } from "./auth";

const BASE = "/api/v1";

// Every failed response has the shape { error: { code, message, fields? } }.
export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(BASE + path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const error = data?.error;
    throw new ApiError(
      res.status,
      error?.code || "UNKNOWN",
      error?.message || data?.message || "Something went wrong. Try again.",
      error?.fields,
    );
  }

  return data as T;
}
