import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import Navbar from "../components/Navbar";

const STATUS_BADGE = {
  pending:   "badge-info",
  running:   "badge-warning",
  completed: "badge-success",
  failed:    "badge-error",
};

export default function Dashboard() {
  const [urls, setUrls]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/scanner/urls/")
      .then(({ data }) => setUrls(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <Navbar />
      <main className="dashboard-main">
        <div className="dashboard-hero">
          <h1>Welcome to Responsive Tool</h1>
          <p>Check how any website looks across mobile, tablet, laptop, and desktop.</p>
          <Link to="/scanner" className="btn-primary btn-lg">🔍 Start a New Scan</Link>
        </div>
        <section className="scan-history">
          <h2>Scan History</h2>
          {loading && <p className="muted">Loading…</p>}
          {!loading && urls.length === 0 && (
            <div className="empty-state small">
              <p>No scans yet. <Link to="/scanner">Run your first scan →</Link></p>
            </div>
          )}
          <div className="history-list">
            {urls.map((item) => (
              <div key={item.id} className="history-card">
                <div className="history-url">
                  <span className="url-icon">🌐</span>
                  <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a>
                </div>
                <span className="history-date">{new Date(item.created_at).toLocaleString()}</span>
                <div className="history-reports">
                  {item.reports.length === 0 && <span className="badge badge-info">No reports yet</span>}
                  {item.reports.map((r) => (
                    <div key={r.id} className="report-row">
                      <span className={`badge ${STATUS_BADGE[r.status] || "badge-info"}`}>{r.status}</span>
                      {r.score !== null && <span className="report-score">Score: {Math.round(r.score)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
