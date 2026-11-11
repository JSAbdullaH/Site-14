import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/shared/components/ProtectedRoute";
import Landing from "@/features/landing/Landing";
import Signin from "@/features/auth/Signin";
import Signup from "@/features/auth/Signup";
import ForgotPassword from "@/features/auth/ForgotPassword";
import ResetPassword from "@/features/auth/ResetPassword";
import AcceptInvite from "@/features/auth/AcceptInvite";
import Account from "@/features/account/Account";
import TeamPage from "@/features/team/TeamPage";
import MapPage from "@/features/map/MapPage";
import SitesPage from "@/features/sites/SitesPage";
import SiteEditPage from "@/features/sites/SiteEditPage";
import ReportsPage from "@/features/reports/ReportsPage";
import TasksPage from "@/features/tasks/TasksPage";
import HistoryPage from "@/features/history/HistoryPage";
import DevicesPage from "@/features/devices/DevicesPage";
import MarketplacePage from "@/features/marketplace/MarketplacePage";
import AlertsPage from "@/features/alerts/AlertsPage";
import PairPage from "@/features/pair/PairPage";
import TrackerPage from "@/features/pair/TrackerPage";
import AdminRoute from "@/features/admin/components/AdminRoute";
import AdminSignin from "@/features/admin/AdminSignin";
import OverviewPage from "@/features/admin/OverviewPage";
import OrdersPage from "@/features/admin/OrdersPage";
import ProductsPage from "@/features/admin/ProductsPage";
import CompaniesPage from "@/features/admin/CompaniesPage";
import AllDevicesPage from "@/features/admin/AllDevicesPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signin" element={<Signin />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/pair" element={<PairPage />} />
      <Route path="/pair/:code" element={<PairPage />} />
      <Route path="/tracker" element={<TrackerPage />} />

      <Route path="/home" element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
      <Route path="/sites" element={<ProtectedRoute><SitesPage /></ProtectedRoute>} />
      <Route path="/sites/new" element={<ProtectedRoute><SiteEditPage /></ProtectedRoute>} />
      <Route path="/sites/:id" element={<ProtectedRoute><SiteEditPage /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><TasksPage /></ProtectedRoute>} />
      <Route path="/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
      <Route path="/devices" element={<ProtectedRoute><DevicesPage /></ProtectedRoute>} />
      <Route path="/alerts" element={<ProtectedRoute><AlertsPage /></ProtectedRoute>} />
      <Route path="/marketplace" element={<ProtectedRoute><MarketplacePage /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />

      <Route path="/admin/signin" element={<AdminSignin />} />
      <Route path="/admin" element={<AdminRoute><OverviewPage /></AdminRoute>} />
      <Route path="/admin/orders" element={<AdminRoute><OrdersPage /></AdminRoute>} />
      <Route path="/admin/products" element={<AdminRoute><ProductsPage /></AdminRoute>} />
      <Route path="/admin/companies" element={<AdminRoute><CompaniesPage /></AdminRoute>} />
      <Route path="/admin/devices" element={<AdminRoute><AllDevicesPage /></AdminRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}