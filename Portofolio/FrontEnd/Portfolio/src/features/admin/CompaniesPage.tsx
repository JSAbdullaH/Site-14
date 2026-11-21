import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "@/shared/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSar } from "@/shared/lib/money";
import AdminShell from "./components/AdminShell";
import { listCompanies } from "./api";
import type { AdminCompany } from "./types";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<AdminCompany[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      listCompanies({ search: search.trim() || undefined })
        .then((res) => {
          setCompanies(res.data);
          setTotal(res.total);
          setError("");
        })
        .catch((err: Error) => setError(err.message));
    }, search ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [search]);

  return (
    <AdminShell title="Companies" subtitle={`${total} compan${total === 1 ? "y" : "ies"} using SITE14`}>
      {error && <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}
      <Input placeholder="Search companies" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 w-64" />

      {companies === null ? (
        <Skeleton className="h-48 w-full" />
      ) : companies.length === 0 ? (
        <EmptyState title="No companies found" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Team</TableHead>
                <TableHead className="text-right">Sites</TableHead>
                <TableHead className="text-right">Devices</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="font-medium">{c.name}</p>
                    {c.commercial_registration && <p className="text-xs text-muted-foreground">CR {c.commercial_registration}</p>}
                  </TableCell>
                  <TableCell>
                    {c.owner ? (
                      <>
                        <p>{c.owner.full_name}</p>
                        <p className="text-xs text-muted-foreground">{c.owner.email}</p>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.users} users
                    <span className="block text-xs text-muted-foreground">{c.employees} employees</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.sites}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Link to={`/admin/devices?company=${c.id}`} className="hover:underline">
                      {c.devices}
                    </Link>
                    <span className="block text-xs text-ok">{c.devices_online} online</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.orders}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatSar(c.spent_halalas)}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminShell>
  );
}
