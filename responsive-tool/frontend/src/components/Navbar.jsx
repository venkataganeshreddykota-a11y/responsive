import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <Link to="/dashboard" className="navbar-brand">
        <span className="navbar-logo">⚡</span>
        Responsive Tool
      </Link>
      <div className="navbar-links">
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/scanner">Scanner</Link>
      </div>
      <div className="navbar-user">
        <span>{user?.email}</span>
        <button className="btn-ghost" onClick={handleLogout}>Logout</button>
      </div>
    </nav>
  );
}
