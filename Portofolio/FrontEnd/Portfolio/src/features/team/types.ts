export type Role = "company_admin" | "site_manager";

export type User = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;

  is_email_verified?: boolean;
  invitation_pending?: boolean;
  invited_at?: string;
  created_at?: string;
};

export type ListUsersResponse = {
  data: User[];
};

export type InviteUserInput = {
  full_name: string;
  email: string;
  role: Role;
};

export type UserState = "active" | "pending" | "deactivated";

export function userState(user: User): UserState {
  if (user.is_active) return "active";
  if (user.invitation_pending) return "pending";
  return "deactivated";
}