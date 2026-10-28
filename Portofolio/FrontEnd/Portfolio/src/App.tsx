import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "@/shared/components/ProtectedRoute";
import Landing from "@/features/landing/Landing";
import Signin from "@/features/auth/Signin";
import Signup from "@/features/auth/Signup";
import ForgotPassword from "@/features/auth/ForgotPassword";
import ResetPassword from "@/features/auth/ResetPassword";
import Account from "@/features/account/Account";
import TeamPage from "@/features/team/TeamPage";
import MapPage from "@/features/map/MapPage";
import SitesPage from "@/features/sites/SitesPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signin" element={<Signin />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/home" element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
      <Route path="/sites" element={<ProtectedRoute><SitesPage /></ProtectedRoute>} />
      <Route path="/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
    </Routes>
  );
}