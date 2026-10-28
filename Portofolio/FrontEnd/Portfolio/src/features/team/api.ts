import { apiFetch } from "@/shared/lib/api";
import type { InviteUserInput, ListUsersResponse, User } from "./types";

export function listUsers(isActive?: boolean): Promise<ListUsersResponse> {
  const query = isActive === undefined ? "" : `?is_active=${isActive}`;
  return apiFetch<ListUsersResponse>(`/users${query}`);
}

export function inviteUser(input: InviteUserInput): Promise<User> {
  return apiFetch<User>("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resendInvitation(id: string): Promise<void> {
  return apiFetch<void>(`/users/${id}/invitation/resend`, { method: "POST" });
}

export function deactivateUser(id: string): Promise<void> {
  return apiFetch<void>(`/users/${id}`, { method: "DELETE" });
}