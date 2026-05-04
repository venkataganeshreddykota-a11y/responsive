import { Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Scanner from "./pages/Scanner";
import History from "./pages/History";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/scanner"   element={<Scanner />} />
      <Route path="/history"   element={<History />} />
      <Route path="*"          element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
