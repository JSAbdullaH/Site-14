import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import AppShell from "@/shared/components/AppShell";
import EmptyState from "@/shared/components/EmptyState";
import StatusBadge from "@/shared/components/StatusBadge";
import { isAdmin } from "@/shared/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listSites, setActiveSiteId } from "./api";
import { shiftLabel } from "./types";
import type { SiteSummary } from "./types";

// SITE-47, SITE-48: every project site of the company, running side by side.
export default function SitesPage() {
  const navigate = useNavigate();
  const admin = isAdmin();

  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listSites()
      .then((res) => setSites(res.data))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  function openOnMap(site: SiteSummary) {
    setActiveSiteId(site.id);
    navigate("/home");
  }

  const activeCount = sites.filter((s) => s.is_active).length;

  return (
    <AppShell
      title="Sites & Zones"
      subtitle={
        loading
          ? "Where your crews work"
          : `${activeCount} active site${activeCount === 1 ? "" : "s"}`
      }
    >
      {error && (
        <p className="mb-5 rounded-md bg-warn-bg px-4 py-3 text-sm font-medium text-warn">
          {error}
        </p>
      )}

      {admin && sites.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => navigate("/sites/new")}>
            <Plus />
            New site
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          description={
            admin
              ? "A site is one project: its perimeter, its shift, and the workers assigned to it."
              : "Ask your administrator to create a site."
          }
          action={
            admin ? (
              <Button onClick={() => navigate("/sites/new")}>Create a site</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead className="text-right">Assigned</TableHead>
                <TableHead className="text-right">On site now</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>

            <TableBody>
              {sites.map((site) => (
                <TableRow
                  key={site.id}
                  className={admin ? "cursor-pointer" : undefined}
                  onClick={admin ? () => navigate(`/sites/${site.id}`) : undefined}
                >
                  <TableCell>
                    <span className="font-medium">{site.name}</span>
                    {site.client && (
                      <span className="block text-xs text-muted-foreground">
                        {site.client}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{shiftLabel(site)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {site.employee_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {site.on_site_count}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={site.is_active ? "ok" : "neutral"}>
                      {site.is_active ? "Active" : "Inactive"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {site.is_active && (
                      <Button variant="ghost" size="sm" onClick={() => openOnMap(site)}>
                        Open map
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        Zones are drawn on the live map. Open a site's map to add or edit its zones.
      </p>
    </AppShell>
  );
}
