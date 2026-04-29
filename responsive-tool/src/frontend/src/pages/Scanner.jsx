import { useState, useRef, useEffect } from "react";
import api from "../api/axios";
import Navbar from "../components/Navbar";

import ScreenshotViewer from "../components/ScreenshotViewer";
import ResolutionAdvisor from "../components/ResolutionAdvisor";
import IssuePanel from "../components/IssuePanel";
import DeviceSelector from "../components/DeviceSelector";

const POLL_INTERVAL = 2500;
const POLL_MAX      = 48;

const SCAN_STEPS = [
  { key: "pending",  label: "Queued…",                  pct: 5  },
  { key: "running",  label: "Fetching page…",           pct: 20 },
  { key: "running2", label: "Running static analysis…", pct: 45 },
  { key: "running3", label: "Capturing screenshots…",   pct: 70 },
  { key: "running4", label: "Detecting layout issues…", pct: 90 },
];

export default function Scanner() {
  const [url, setUrl]             = useState("");
  const [activeUrl, setActiveUrl] = useState("");
  const [loading, setLoading]     = useState(false);
  const [stepIdx, setStepIdx]     = useState(0);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState("");
  const [selectedDevices, setSelectedDevices] = useState(["iphone_12_pro", "ipad_mini", "macbook_air"]);
  const pollRef   = useRef(null);
  const stepTimer = useRef(null);

  useEffect(() => () => stopAll(), []);

  const stopAll = () => {
    if (pollRef.current)   { clearInterval(pollRef.current);   pollRef.current   = null; }
    if (stepTimer.current) { clearInterval(stepTimer.current); stepTimer.current = null; }
  };

  const startStepTimer = () => {
    let idx = 0;
    setStepIdx(0);
    stepTimer.current = setInterval(() => {
      idx = Math.min(idx + 1, SCAN_STEPS.length - 1);
      setStepIdx(idx);
    }, 4000);
  };

  const pollStatus = (reportId) => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const { data } = await api.get(`/scanner/scan/${reportId}/status/`);
        if (data.status === "completed") { stopAll(); setResult(data); setLoading(false); }
        else if (data.status === "failed") { stopAll(); setError(data.raw_result?.error || "Scan failed on the server."); setLoading(false); }
        if (attempts >= POLL_MAX) { stopAll(); setError("Scan timed out. Please try again."); setLoading(false); }
      } catch { stopAll(); setError("Lost connection while polling. Please try again."); setLoading(false); }
    }, POLL_INTERVAL);
  };

  const handleScan = async (e) => {
    e.preventDefault();
    stopAll(); setError(""); setResult(null);
    const trimmed = url.trim();
    setLoading(true); setActiveUrl(trimmed); startStepTimer();
    try {
      const { data } = await api.post("/scanner/scan/", { 
        url: trimmed,
        devices: selectedDevices 
      });
      pollStatus(data.report_id);
    } catch (err) {
      stopAll(); setError(err.response?.data?.url?.[0] || "Failed to start scan."); setLoading(false);
    }
  };

  const step = SCAN_STEPS[stepIdx];

  return (
    <div className="page">
      <Navbar />
      <main className="scanner-main">
        <section className="search-section">
          <h1 className="search-title">Check Website Responsiveness</h1>
          <p className="search-subtitle">
            Real Playwright screenshots at 375px · 768px · 1280px · 1440px with automated issue detection.
          </p>
          <form className="search-bar" onSubmit={handleScan}>
            <div className="search-input-wrap">
              <span className="search-icon">🔍</span>
              <input type="url" className="search-input" placeholder="https://example.com"
                value={url} onChange={(e) => setUrl(e.target.value)} required aria-label="Website URL" />
            </div>
            <button type="submit" className="btn-primary btn-lg" disabled={loading}>
              {loading ? <><span className="spinner-sm" /> {step.label}</> : "Check Responsiveness"}
            </button>
          </form>

          {!loading && !result && (
            <DeviceSelector 
              selectedDevices={selectedDevices} 
              onToggle={(id) => setSelectedDevices(prev => 
                prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
              )} 
            />
          )}

          {error && <p className="error" role="alert">{error}</p>}
          {loading && (
            <div className="scan-progress" role="progressbar" aria-valuenow={step.pct} aria-valuemax={100}>
              <div className="scan-progress-bar" style={{ width: `${step.pct}%` }} />
              <div className="scan-progress-steps">
                {SCAN_STEPS.map((s, i) => (
                  <span key={s.key} className={`scan-step ${i <= stepIdx ? "scan-step--done" : ""}`}>{s.label}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        {(loading || result) && (
          <div className="results-section">
            <div className="results-block">
              <h2 className="section-title">Screenshots by Device</h2>
              <ScreenshotViewer screenshots={result?.screenshots} deviceStatus={result?.device_status} isLoading={loading} />
            </div>
            {result && (
              <div className="analysis-grid">
                <ResolutionAdvisor advice={result.resolution_advice} />
                <IssuePanel issueGroups={result.issue_groups} issues={result.issues} title="Detected Issues" />
              </div>
            )}
            {loading && (
              <div className="analysis-grid">
                <div className="panel-skeleton" />
                <div className="panel-skeleton" />
              </div>
            )}
          </div>
        )}

        {!loading && !result && (
          <div className="empty-state">
            <div className="empty-devices">
              <span>📱</span><span>📟</span><span>💻</span><span>🖥️</span>
            </div>
            <p>Enter a URL above to get a full responsiveness report.</p>
          </div>
        )}
      </main>
    </div>
  );
}
