import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
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
import type { Employee } from "../types";

type Props = {
  employees: Employee[];
  // Only an admin edits employees or hands out devices.
  canEdit?: boolean;
  onEdit?: (employee: Employee) => void;
  onDevice?: (employee: Employee) => void;
};

export default function EmployeeTable({ employees, canEdit = false, onEdit, onDevice }: Props) {
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
            {canEdit && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>

        <TableBody>
          {employees.map((e) => (
            <TableRow key={e.id}>
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
                {e.device ? (
                  <span className="font-mono text-xs">{e.device.serial_number}</span>
                ) : canEdit && e.status === "active" ? (
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
                <StatusBadge tone={e.status === "active" ? "ok" : "neutral"}>
                  {e.status === "active" ? "Active" : "Inactive"}
                </StatusBadge>
              </TableCell>

              {canEdit && (
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-md hover:bg-secondary">
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit?.(e)}>
                        Edit details and site
                      </DropdownMenuItem>
                      {e.status === "active" && (
                        <DropdownMenuItem onClick={() => onDevice?.(e)}>
                          {e.device ? "Change device" : "Add device"}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
