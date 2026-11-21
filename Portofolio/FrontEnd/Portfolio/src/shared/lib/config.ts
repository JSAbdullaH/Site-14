const apiOrigin = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").trim().replace(/\/+$/, "");

export const API_BASE = `${apiOrigin}/api/v1`;
