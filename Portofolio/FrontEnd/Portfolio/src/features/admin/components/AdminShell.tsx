import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Building2, Cpu, LayoutDashboard, LogOut, Package, ShoppingCart } from "lucide-react";
import { clearPlatformSession, getPlatformAdmin } from "@/shared/lib/platformAuth";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/companies", label: "Companies", icon: Building2 },
  { to: "/admin/devices", label: "All devices", icon: Cpu },
];

type Props = { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode };

export default function AdminShell({ title, subtitle, actions, children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const admin = getPlatformAdmin();

  function signOut() {
    clearPlatformSession();
    navigate("/admin/signin", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col bg-ink px-3 py-6 text-white">
        <div className="mb-8 px-3">
          <p className="text-lg font-semibold tracking-tight">SITE14</p>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-white/50 uppercase">Owner console</p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? location.pathname === to : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                  active ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-white/10 px-3 pt-4">
          <p className="truncate text-sm font-medium">{admin?.full_name ?? "Owner"}</p>
          <p className="truncate text-xs text-white/50">{admin?.email}</p>
          <button
            type="button"
            onClick={signOut}
            className="mt-3 inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-20 shrink-0 flex-wrap items-center gap-4 border-b px-8 py-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {subtitle && <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </header>
        <main className="min-w-0 flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
