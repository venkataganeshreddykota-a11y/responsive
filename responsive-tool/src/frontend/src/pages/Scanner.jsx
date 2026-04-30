import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { TbWorld } from "react-icons/tb";
import { FiSmartphone, FiTablet, FiMonitor, FiClock, FiX } from "react-icons/fi";
import { MdLaptop } from "react-icons/md";
import api from "../api/axios";
import Navbar from "../components/Navbar";

import ScreenshotViewer from "../components/ScreenshotViewer";
import DeviceReport from "../components/DeviceReport";
import StatusBanner from "../components/StatusBanner";
import DeviceSelector from "../components/DeviceSelector";


const POLL_INTERVAL  = 2500;
const POLL_MAX       = 120; // 5 minutes
const HISTORY_KEY    = "rt_url_history";
const HISTORY_LIMIT  = 10;

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

// ── helpers ──────────────────────────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

function pushHistory(url, list) {
  const next = [url, ...list.filter((u) => u !== url)].slice(0, HISTORY_LIMIT);
  saveHistory(next);
  return next;
}

// ── UrlInput ─────────────────────────────────────────────────────────────────
const UrlInput = forwardRef(({ value, onChange, onSubmit, loading, stepLabel }, ref) => {
  const [history, setHistory]     = useState(loadHistory);
  const [open, setOpen]           = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapRef  = useRef(null);
  const inputRef = useRef(null);

  // filtered suggestions
  const suggestions = value.trim()
    ? history.filter((u) => u.toLowerCase().includes(value.toLowerCase()))
    : history;

  // close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      onChange(suggestions[highlighted]);
      setOpen(false);
      setHighlighted(-1);
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
    }
  };

  const pick = (u) => {
    onChange(u);
    setOpen(false);
    setHighlighted(-1);
    inputRef.current?.focus();
  };

  const removeItem = (e, u) => {
    e.stopPropagation();
    const next = history.filter((h) => h !== u);
    setHistory(next);
    saveHistory(next);
  };

  // expose pushHistory so parent can call after scan
  useImperativeHandle(ref, () => ({
    push: (u) => setHistory((prev) => pushHistory(u, prev))
  }), []);

  const step = STEPS[stepLabel] || STEPS[0];

  return (
    <div ref={wrapRef} className="relative flex-1">
      {/* globe icon */}
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-muted pointer-events-none z-10">
        <TbWorld size={15} />
      </span>

      <input
        ref={inputRef}
        type="url"
        placeholder="https://example.com"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlighted(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        required
        aria-label="Website URL"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        autoComplete="off"
        className="w-full rounded-xl border border-surface-border bg-white py-3 pl-10 pr-4 text-sm text-surface-body placeholder-surface-muted shadow-sm outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20"
      />

      {/* dropdown */}
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-surface-border bg-white shadow-glass-hover animate-fade-in"
        >
          {suggestions.map((u, i) => (
            <li
              key={u}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={() => pick(u)}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors ${
                i === highlighted ? "bg-accent-50" : "hover:bg-stone-50"
              }`}
            >
              <FiClock size={12} className="shrink-0 text-surface-muted" />
              <span className="flex-1 truncate text-sm text-surface-body">{u}</span>
              <button
                type="button"
                onMouseDown={(e) => removeItem(e, u)}
                className="rounded p-0.5 text-stone-300 hover:text-red-400 transition-colors"
                aria-label={`Remove ${u} from history`}
              >
                <FiX size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

// ── Scanner ───────────────────────────────────────────────────────────────────
export default function Scanner() {
  const [url, setUrl]             = useState("");
  const [activeUrl, setActiveUrl] = useState("");
  const [loading, setLoading]     = useState(false);
  const [stepIdx, setStepIdx]     = useState(0);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState("");
  const [selectedDevices, setSelectedDevices] = useState(["iphone_14", "ipad_air", "macbook_pro_14", "generic_desktop"]);
  const pollRef    = useRef(null);
  const stepTimer  = useRef(null);
  const urlInputRef = useRef(null);

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
    // push to history
    urlInputRef.current?.push(trimmed);
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

  const toggleDevice = (id) => {
    setSelectedDevices(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const step = STEPS[stepIdx];

  return (
    <div className="flex h-full min-h-screen w-full flex-col bg-surface-bg">
      <Navbar />

      {/* Hero / Action Bar */}
      <div className="sticky top-0 z-40 border-b border-surface-border bg-white/70 px-6 py-5 backdrop-blur-xl transition-all">
        <div className="mx-auto max-w-7xl">
          <form onSubmit={handleScan} className="flex w-full items-center gap-3">
            <UrlInput
              ref={urlInputRef}
              value={url}
              onChange={setUrl}
              stepLabel={stepIdx}
            />
            <DeviceSelector 
              selectedDevices={selectedDevices} 
              onToggle={toggleDevice} 
            />
            <button
              type="submit"
              disabled={loading}
              className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-accent-500 px-8 py-3.5 text-sm font-bold text-white shadow-orange-glow transition-all hover:bg-accent-600 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center gap-3">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span className="animate-pulse">{step.label}…</span>
                </div>
              ) : (
                <>
                  <span>Analyse</span>
                  <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </>
              )}
            </button>
          </form>

          {error && <p role="alert" className="mt-2.5 animate-slide-up text-xs font-medium text-red-500">{error}</p>}

          {loading && (
            <div className="mt-5 animate-fade-in">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-accent-500 shadow-[0_0_12px_rgba(249,115,22,0.5)] transition-all duration-1000 ease-in-out"
                  style={{ width: `${step.pct}%` }} />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex gap-4">
                  {STEPS.map((s, i) => (
                    <div key={s.key} className="flex items-center gap-2">
                      <div className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${i < stepIdx ? "bg-accent-500" : i === stepIdx ? "bg-accent-400 animate-pulse" : "bg-stone-300"}`} />
                      <span className={`text-[11px] font-semibold tracking-wide transition-colors ${i <= stepIdx ? "text-accent-600" : "text-stone-400"}`}>
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
                <span className="text-[11px] font-bold text-accent-600">{step.pct}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden">
          {!loading && !result ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center animate-fade-in">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-accent-100/50 blur-2xl" />
                <div className="relative flex gap-6 text-surface-muted">
                  <FiSmartphone size={48} className="animate-bounce" style={{ animationDelay: '0s', animationDuration: '3s' }} />
                  <FiTablet size={48} className="animate-bounce" style={{ animationDelay: '0.2s', animationDuration: '3.2s' }} />
                  <MdLaptop size={48} className="animate-bounce" style={{ animationDelay: '0.4s', animationDuration: '3.4s' }} />
                  <FiMonitor size={48} className="animate-bounce" style={{ animationDelay: '0.6s', animationDuration: '3.6s' }} />
                </div>
              </div>
              <div className="max-w-md">
                <h2 className="mb-2 text-2xl font-bold tracking-tight text-surface-body">Ready to scan?</h2>
                <p className="text-sm leading-relaxed text-surface-muted">
                  Enter any website URL above and select the devices you want to test. We'll generate high-fidelity screenshots and analyze responsiveness issues in seconds.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin">
              <div className="px-6 py-8">
                {result ? (
                  <StatusBanner
                    verdict={result.verdict}
                    verdictLabel={result.verdict_label}
                    verdictDetail={result.verdict_detail}
                    score={result.score}
                    deviceStatus={result.device_status}
                    url={activeUrl}
                  />
                ) : <SkeletonPanel h="h-32" />}
              </div>

              <div className="px-6 py-2">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-surface-body">Device Screenshots</h3>
                    <p className="text-xs text-surface-muted">Visual validation across your selected breakpoints.</p>
                  </div>
                </div>
                <ScreenshotViewer
                  screenshots={result?.screenshots}
                  deviceStatus={result?.device_status}
                  isLoading={loading}
                  onSaveToDrive={async (deviceKey) => {
                    if (!result?.id) return;
                    try {
                      const { data } = await api.post(`/scanner/scan/${result.id}/drive/`, { device: deviceKey });
                      if (data.success) {
                        alert(`Successfully saved to Google Drive!`);
                        if (data.link) window.open(data.link, '_blank');
                      } else {
                        alert(`Error: ${data.error || 'Failed to save'}`);
                      }
                    } catch (err) {
                      alert(`Failed to save to Google Drive: ${err.response?.data?.error || err.message}`);
                    }
                  }}
                />
              </div>

              <div className="px-6 py-10">
                {result && (
                  <>
                    <div className="mb-6">
                      <h3 className="text-sm font-bold text-surface-body">Optimization Reports</h3>
                      <p className="text-xs text-surface-muted">Automated issue detection and suggested CSS fixes.</p>
                    </div>
                    <DeviceReport
                      issues={result.issues}
                      issueGroups={result.issue_groups}
                      advice={result.resolution_advice}
                      deviceStatus={result.device_status}
                    />
                  </>
                )}
                {loading && (
                  <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                    {[1,2,3,4].map(n => <SkeletonPanel key={n} h="h-[400px]" />)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
