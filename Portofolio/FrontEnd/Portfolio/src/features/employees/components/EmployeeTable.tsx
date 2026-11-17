import { Link, useNavigate } from "react-router-dom";
import { History, MoreHorizontal, Pencil, Smartphone, UserMinus } from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Employee } from "../types";

type Props = {
  employees: Employee[];
  // Only an admin edits employees or hands out devices.
  canEdit?: boolean;
  onEdit?: (employee: Employee) => void;
  onDevice?: (employee: Employee) => void;
  onRemove?: (employee: Employee) => void;
};

export default function EmployeeTable({ employees, canEdit = false, onEdit, onDevice, onRemove }: Props) {
  const navigate = useNavigate();
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Job</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>Status</TableHead>
            {canEdit && <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>}
          </TableRow>
        </TableHeader>

        <TableBody>
          {employees.map((e) => {
            const active = e.status === "active";
            return (
            <TableRow key={e.id} className={active ? undefined : "text-muted-foreground"}>
              <TableCell className="font-medium">
                {/* name -> History page */}
                <Link to={`/history?employee=${e.id}`} className="hover:text-signal hover:underline">
                  {e.full_name}
                </Link>
              </TableCell>

              <TableCell className="text-muted-foreground">
                {e.job_category}
              </TableCell>

              <TableCell className="text-muted-foreground">
                {e.site_name ?? "Unassigned"}
              </TableCell>

              <TableCell>
                {!active ? (
                  <span className="text-muted-foreground">&mdash;</span>
                ) : e.device ? (
                  <span className="font-mono text-xs">{e.device.serial_number}</span>
                ) : canEdit ? (
                  <button
                    type="button"
                    onClick={() => onDevice?.(e)}
                    className="text-sm font-medium text-signal hover:underline"
                  >
                    Add device
                  </button>
                ) : (
                  <StatusBadge tone="warn">No device</StatusBadge>
                )}
              </TableCell>

              <TableCell>
                <StatusBadge tone={active ? "ok" : "neutral"}>{active ? "Active" : "Removed"}</StatusBadge>
              </TableCell>

              {canEdit && (
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-md hover:bg-secondary">
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end" className="min-w-52">
                      {active && (
                        <>
                          <DropdownMenuItem onClick={() => onEdit?.(e)}>
                            <Pencil />
                            Edit details and site
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDevice?.(e)}>
                            <Smartphone />
                            {e.device ? "Change device" : "Add device"}
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem onClick={() => navigate(`/history?employee=${e.id}`)}>
                        <History />
                        View history
                      </DropdownMenuItem>
                      {active && onRemove && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => onRemove(e)}>
                            <UserMinus />
                            Remove employee
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
