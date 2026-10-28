import { Navigate, useLocation } from "react-router-dom";
import { isLoggedIn } from "@/shared/lib/auth";
import type { ReactNode } from "react";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();

  if (!isLoggedIn()) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}