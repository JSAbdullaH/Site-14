import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "@/shared/components/AppShell";
import EmptyState from "@/shared/components/EmptyState";
import StatusBadge from "@/shared/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listSites } from "./api";
import type { Site } from "./types";

const SITE_KEY = "site14.activeSite";

function formatDate(iso?: string) {
  if (!iso) return "â€”";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SitesPage() {
  const navigate = useNavigate();

  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listSites()
      .then((res) => setSites(res.data))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  function openOnMap(site: Site) {
    try {
      localStorage.setItem(SITE_KEY, site.id);
    } catch {
      // ignore
    }
    navigate("/home");
  }

  return (
    <AppShell title="Sites & Zones" subtitle="Where your crews work">
      {error && (
        <p className="mb-5 rounded-md bg-warn-bg px-4 py-3 text-sm font-medium text-warn">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          description="Sites define the area a crew works in. Zones are drawn inside a site, on the live map."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {sites.map((site) => (
                <TableRow
                  key={site.id}
                  className="cursor-pointer"
                  onClick={() => openOnMap(site)}
                >
                  <TableCell className="font-medium">{site.name}</TableCell>
                  <TableCell>
                    <StatusBadge tone={site.is_active ? "ok" : "neutral"}>
                      {site.is_active ? "Active" : "Inactive"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(site.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        Zones are drawn on the live map. Open a site to add or edit its zones.
      </p>
    </AppShell>
  );
}