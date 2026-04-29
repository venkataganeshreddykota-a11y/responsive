import { useState, useRef, useEffect } from "react";
import { TbWorld } from "react-icons/tb";
import { FiSmartphone, FiTablet, FiMonitor } from "react-icons/fi";
import { MdLaptop } from "react-icons/md";
import api from "../api/axios";
import Navbar from "../components/Navbar";
import StatusBanner from "../components/StatusBanner";
import ScreenshotViewer from "../components/ScreenshotViewer";
import ResolutionAdvisor from "../components/ResolutionAdvisor";
import IssuePanel from "../components/IssuePanel";

const POLL_INTERVAL = 2500;
const POLL_MAX      = 48;

const STEPS = [
  { key: "pending",  label: "Queued",               pct: 5  },
  { key: "running",  label: "Fetching page",         pct: 20 },
  { key: "running2", label: "Static analysis",       pct: 45 },
  { key: "running3", label: "Capturing screenshots", pct: 70 },
  { key: "running4", label: "Detecting issues",      pct: 90 },
];

function SkeletonPanel({ h = "h-48" }) {
  return <div className={`shimmer rounded-2xl ${h}`} />;
}

export default function Scanner() {
  const [url, setUrl]             = useState("");
  const [activeUrl, setActiveUrl] = useState("");
  const [loading, setLoading]     = useState(false);
  const [stepIdx, setStepIdx]     = useState(0);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState("");
  const pollRef   = useRef(null);
  const stepTimer = useRef(null);

  useEffect(() => () => stopAll(), []);

  const stopAll = () => {
    clearInterval(pollRef.current);
    clearInterval(stepTimer.current);
  };

  const startStepTimer = () => {
    let idx = 0;
    setStepIdx(0);
    stepTimer.current = setInterval(() => {
      idx = Math.min(idx + 1, STEPS.length - 1);
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
        else if (data.status === "failed") { stopAll(); setError(data.raw_result?.error || "Scan failed."); setLoading(false); }
        if (attempts >= POLL_MAX) { stopAll(); setError("Scan timed out. Please try again."); setLoading(false); }
      } catch { stopAll(); setError("Connection lost. Please try again."); setLoading(false); }
    }, POLL_INTERVAL);
  };

  const handleScan = async (e) => {
    e.preventDefault();
    stopAll(); setError(""); setResult(null);
    const trimmed = url.trim();
    setLoading(true); setActiveUrl(trimmed); startStepTimer();
    try {
      const { data } = await api.post("/scanner/scan/", { url: trimmed });
      pollStatus(data.report_id);
    } catch (err) {
      stopAll(); setError(err.response?.data?.url?.[0] || "Failed to start scan."); setLoading(false);
    }
  };

  const step = STEPS[stepIdx];

  return (
    <div className="min-h-screen bg-surface-bg">
      <Navbar />

      {/* Narrow container for hero + status + bottom panels */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">

        {/* Hero */}
        <div className="mb-8 text-center">
          <h1 className="mb-1.5 text-2xl font-bold tracking-tight text-surface-body sm:text-3xl">
            Check Website Responsiveness
          </h1>
          <p className="mb-6 text-sm text-surface-muted">
            Real Playwright screenshots at 375 · 768 · 1280 · 1440px with automated issue detection.
          </p>

          <form onSubmit={handleScan} className="mx-auto flex max-w-2xl gap-2.5">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-muted">
                <TbWorld size={15} />
              </span>
              <input
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                aria-label="Website URL"
                className="w-full rounded-xl border border-surface-border bg-white py-3 pl-10 pr-4 text-sm text-surface-body placeholder-surface-muted shadow-sm outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-accent-500 px-6 py-3 text-sm font-semibold text-white shadow-orange-glow transition hover:bg-accent-600 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin-slow rounded-full border-2 border-white/30 border-t-white" />
                  {step.label}…
                </>
              ) : "Analyse"}
            </button>
          </form>

          {error && <p role="alert" className="mt-3 text-xs text-red-500">{error}</p>}

          {loading && (
            <div className="mx-auto mt-4 max-w-2xl">
              <div className="h-1 overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-accent-500 transition-all duration-700"
                  style={{ width: `${step.pct}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between">
                {STEPS.map((s, i) => (
                  <span key={s.key} className={`text-xs transition-colors ${i <= stepIdx ? "text-accent-600 font-medium" : "text-stone-300"}`}>
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        {(loading || result) && (
          <div className="flex flex-col gap-5">
            {result ? (
              <StatusBanner verdict={result.verdict} verdictLabel={result.verdict_label}
                verdictDetail={result.verdict_detail} score={result.score}
                deviceStatus={result.device_status} url={activeUrl} />
            ) : <SkeletonPanel h="h-28" />}
          </div>
        )}
      </main>

      {/* Screenshots — full viewport width, no max-w constraint */}
      {(loading || result) && (
        <div className="px-4 sm:px-6">
          <p className="mx-auto mb-2 max-w-5xl text-xs font-semibold uppercase tracking-widest text-surface-muted">
            Screenshots by Device
          </p>
          <ScreenshotViewer screenshots={result?.screenshots}
            deviceStatus={result?.device_status} isLoading={loading} />
        </div>
      )}

      {/* Bottom panels — back to narrow container */}
      <main className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
        {(loading || result) && (
          <div className="mt-5 flex flex-col gap-5">
            {result && (
              <div className="grid gap-5 lg:grid-cols-2">
                <ResolutionAdvisor advice={result.resolution_advice} />
                <IssuePanel issueGroups={result.issue_groups} issues={result.issues} />
              </div>
            )}
            {loading && (
              <div className="grid gap-5 lg:grid-cols-2">
                <SkeletonPanel /><SkeletonPanel />
              </div>
            )}
          </div>
        )}

        {!loading && !result && (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <div className="flex gap-5 opacity-30 text-surface-muted">
              <FiSmartphone size={32} /><FiTablet size={32} /><MdLaptop size={32} /><FiMonitor size={32} />
            </div>
            <p className="text-sm text-surface-muted">Enter a URL above to get a full responsiveness report.</p>
          </div>
        )}
      </main>
    </div>
  );
}
