import { Routes, Route, Outlet } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import SiteProvider from "./components/SiteProvider";
import Landing from "./pages/Landing";
import Signin from "./pages/Signin";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import Home from "./pages/Home";
import Account from "./pages/Account";
import ResetPassword from "./pages/ResetPassword";
import Sites from "./pages/Sites";
import SiteEdit from "./pages/SiteEdit";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signin" element={<Signin />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* One SiteProvider for every signed-in screen, so the active site survives navigation. */}
      <Route element={<ProtectedRoute><SiteProvider><Outlet /></SiteProvider></ProtectedRoute>}>
        <Route path="/home" element={<Home />} />
        <Route path="/account" element={<Account />} />
        <Route path="/sites" element={<Sites />} />
        <Route path="/sites/new" element={<SiteEdit />} />
        <Route path="/sites/:id" element={<SiteEdit />} />
      </Route>
    </Routes>
  );
}
