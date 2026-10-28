import StatusBadge from "@/shared/components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Employee } from "../types";

type Props = { employees: Employee[] };

export default function EmployeeTable({ employees }: Props) {
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
          </TableRow>
        </TableHeader>

        <TableBody>
          {employees.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-medium">{e.full_name}</TableCell>

              <TableCell className="text-muted-foreground">
                {e.job_category}
              </TableCell>

              <TableCell className="text-muted-foreground">
                {e.site_name ?? "Unassigned"}
              </TableCell>

              <TableCell>
                {e.device ? (
                  <span className="font-mono text-xs">{e.device.serial_number}</span>
                ) : (
                  <StatusBadge tone="warn">No device</StatusBadge>
                )}
              </TableCell>

              <TableCell>
                <StatusBadge tone={e.status === "active" ? "ok" : "neutral"}>
                  {e.status === "active" ? "Active" : "Inactive"}
                </StatusBadge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
