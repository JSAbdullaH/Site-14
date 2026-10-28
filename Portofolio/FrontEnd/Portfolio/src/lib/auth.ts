const KEY = "site14_access_token";

export function saveToken(token: string) {
  localStorage.setItem(KEY, token);
}

export function getToken(): string | null {
  return localStorage.getItem(KEY);
}

export function clearToken() {
  localStorage.removeItem(KEY);
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

export type Role = "company_admin" | "site_manager";

// Read from the access token's payload, only to decide what to show.
// The API checks the role again on every request.
export function getRole(): Role | null {
  const token = getToken();
  if (!token) return null;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const role = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))).role;
    return role === "company_admin" || role === "site_manager" ? role : null;
  } catch {
    return null;
  }
}

export const isAdmin = () => getRole() === "company_admin";