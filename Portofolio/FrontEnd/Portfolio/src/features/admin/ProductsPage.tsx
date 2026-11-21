import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import EmptyState from "@/shared/components/EmptyState";
import StatusBadge from "@/shared/components/StatusBadge";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEVICE_TYPE_LABEL } from "@/shared/lib/deviceTypes";
import { formatSar } from "@/shared/lib/money";
import AdminShell from "./components/AdminShell";
import ProductDialog from "./components/ProductDialog";
import { listAdminProducts, updateProduct } from "./api";
import type { AdminProduct } from "./types";

export default function ProductsPage() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setProducts((await listAdminProducts()).data);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(p: AdminProduct) {
    try {
      await updateProduct(p.id, { is_active: !p.is_active });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AdminShell
      title="Products"
      subtitle="The devices companies can buy"
      actions={
        <Button onClick={() => setCreating(true)}>
          <Plus />
          New product
        </Button>
      }
    >
      {error && <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}

      {products === null ? (
        <Skeleton className="h-48 w-full" />
      ) : products.length === 0 ? (
        <EmptyState title="No products yet" description="Add the devices you sell. Companies see them in their marketplace." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-medium">{p.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {p.sku} · {p.serial_prefix}-
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <DeviceIcon type={p.device_type} className="size-4 text-muted-foreground" />
                      {DEVICE_TYPE_LABEL[p.device_type]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatSar(p.price_halalas)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${p.stock === 0 ? "text-danger" : p.stock <= 5 ? "text-warn" : ""}`}>{p.stock}</TableCell>
                  <TableCell>
                    <StatusBadge tone={p.is_active ? "ok" : "neutral"}>{p.is_active ? "Listed" : "Hidden"}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle(p)}>
                      {p.is_active ? "Hide" : "List"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ProductDialog
        key={editing?.id ?? (creating ? "new" : "closed")}
        open={creating || Boolean(editing)}
        product={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={load}
      />
    </AdminShell>
  );
}
