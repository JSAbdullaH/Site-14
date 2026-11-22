const KEY = "site14_access_token";
const USER_KEY = "site14_user";

export type Role = "company_admin" | "site_manager";

export type SessionUser = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
};

export function saveToken(token: string) {
  localStorage.setItem(KEY, token);
}

export function getToken(): string | null {
  return localStorage.getItem(KEY);
}

export function clearToken() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

export function saveUser(user: SessionUser) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}

export function getUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

// The role claim in the access token, for sessions started before the user was saved.
function tokenRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))).role ?? null;
  } catch {
    return null;
  }
}

// Only decides what to show; the API checks the role again on every request.
export const isAdmin = () => (getUser()?.role ?? tokenRole()) === "company_admin";
