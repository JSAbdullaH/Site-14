import { MoreHorizontal } from "lucide-react";
import type { User } from "../types";
import { userState } from "../types";
import StatusBadge from "@/shared/components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_LABEL = {
  company_admin: "Company admin",
  site_manager: "Site manager",
} as const;

const STATE_TONE = {
  active: "ok",
  pending: "warn",
  deactivated: "neutral",
} as const;

const STATE_LABEL = {
  active: "Active",
  pending: "Pending invitation",
  deactivated: "Deactivated",
} as const;

type Props = {
  users: User[];
  onOpen: (user: User) => void;
  onResend: (user: User) => void;
  onDeactivate: (user: User) => void;
};

export default function TeamTable({
  users,
  onOpen,
  onResend,
  onDeactivate,
}: Props) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {users.map((user) => {
            const state = userState(user);

            return (
              <TableRow
                key={user.id}
                className="cursor-pointer"
                onClick={() => onOpen(user)}
              >
                <TableCell className="font-medium">{user.full_name}</TableCell>

                <TableCell className="text-muted-foreground">
                  {user.email}
                </TableCell>

                <TableCell>{ROLE_LABEL[user.role]}</TableCell>

                <TableCell>
                  <StatusBadge tone={STATE_TONE[state]}>
                    {STATE_LABEL[state]}
                  </StatusBadge>
                </TableCell>

                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-md hover:bg-secondary">
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end">
                      {state === "pending" && (
                        <DropdownMenuItem onClick={() => onResend(user)}>
                          Resend invitation
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onDeactivate(user)}
                      >
                        Deactivate
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}