import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { hasPlatformSession } from "@/shared/lib/platformAuth";

export default function AdminRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!hasPlatformSession()) return <Navigate to="/admin/signin" state={{ from: location }} replace />;
  return <>{children}</>;
}
