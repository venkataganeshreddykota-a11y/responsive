import { Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "../features/dashboard/pages/Dashboard";
import Scanner from "../features/scanner/pages/Scanner";
import History from "../features/history/pages/History";

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
