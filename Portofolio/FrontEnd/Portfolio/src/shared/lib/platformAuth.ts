const KEY = "site14_platform_token";
const ADMIN_KEY = "site14_platform_admin";

export type PlatformAdmin = {
  id: string;
  full_name: string;
  email: string;
  last_login_at: string | null;
  created_at: string;
};

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function savePlatformSession(token: string, admin: PlatformAdmin) {
  try {
    localStorage.setItem(KEY, token);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  } catch {
    return;
  }
}

export function clearPlatformSession() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(ADMIN_KEY);
  } catch {
    return;
  }
}

export const getPlatformToken = () => read(KEY);

export function getPlatformAdmin(): PlatformAdmin | null {
  const raw = read(ADMIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformAdmin;
  } catch {
    return null;
  }
}

export function hasPlatformSession() {
  const token = getPlatformToken();
  if (!token) return false;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
