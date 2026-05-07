import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import { TbWorld } from "react-icons/tb";
import { FiSmartphone, FiTablet, FiMonitor, FiClock, FiX } from "react-icons/fi";
import { MdLaptop } from "react-icons/md";
import api from "../api/axios";
import Navbar from "../components/Navbar";
import ScreenshotViewer from "../components/ScreenshotViewer";
import DeviceReport from "../components/DeviceReport";
import { loadJsonArray, saveJson } from "../utils/storage";

const POLL_INTERVAL  = 2500;
const POLL_MAX       = 48;
const HISTORY_KEY    = "rt_url_history";
const HISTORY_LIMIT  = 10;

const STEPS = [
  { key: "pending",  label: "Live view queued",      pct: 5  },
  { key: "running",  label: "Opening live page",     pct: 20 },
  { key: "running2", label: "Preparing devices",     pct: 45 },
  { key: "running3", label: "Loading live previews", pct: 70 },
  { key: "running4", label: "Checking live layout",  pct: 90 },
];

function SkeletonPanel({ h = "h-48" }) {
  return <div className={`shimmer rounded-lg ${h}`} />;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function loadHistory() {
  return loadJsonArray(HISTORY_KEY).filter((value) => typeof value === "string");
}

function saveHistory(list) {
  saveJson(HISTORY_KEY, list);
}

function pushHistory(url, list) {
  const next = [url, ...list.filter((u) => u !== url)].slice(0, HISTORY_LIMIT);
  saveHistory(next);
  return next;
}

// ── UrlInput ─────────────────────────────────────────────────────────────────
const UrlInput = forwardRef(function UrlInput({ value, onChange, onSubmit, loading, stepLabel }, _ref) {
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
  UrlInput._push = useCallback((u) => {
    setHistory((prev) => pushHistory(u, prev));
  }, []);

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
        className="w-full rounded-lg border border-surface-border bg-white py-3 pl-10 pr-4 text-sm text-surface-body placeholder-surface-muted shadow-sm outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20"
      />

      {/* dropdown */}
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-lg border border-surface-border bg-white shadow-glass-hover animate-fade-in"
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
  const [activeLiveDevice, setActiveLiveDevice] = useState(null);
  const [issueDetailsOpen, setIssueDetailsOpen] = useState(false);
  const pollRef    = useRef(null);
  const stepTimer  = useRef(null);
  const urlInputRef = useRef(null);
  const issuesSectionRef = useRef(null);

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
    stopAll(); setError(""); setResult(null); setActiveLiveDevice(null); setIssueDetailsOpen(false);
    const trimmed = url.trim();
    setLoading(true); setActiveUrl(trimmed); startStepTimer();
    // push to history
    UrlInput._push?.(trimmed);
    try {
      const { data } = await api.post("/scanner/scan/", { url: trimmed });
      pollStatus(data.report_id);
    } catch (err) {
      const data = err.response?.data;
      stopAll();
      setError(data?.url?.[0] || data?.detail || "Failed to start scan.");
      setLoading(false);
    }
  };

  const scrollToIssues = useCallback(() => {
    window.setTimeout(() => {
      issuesSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }, []);

  const toggleIssueDetails = useCallback(() => {
    setIssueDetailsOpen((open) => {
      const next = !open;
      if (next) scrollToIssues();
      return next;
    });
  }, [scrollToIssues]);

  const step = STEPS[stepIdx];

  return (
    <div className="flex h-full min-h-screen w-full flex-col bg-surface-bg">
      <Navbar />

      {/* Search bar row */}
      <div className="border-b border-surface-border bg-white/70 px-4 py-4 sm:px-6">
        <form onSubmit={handleScan} className="flex w-full flex-col gap-2.5 sm:flex-row">
          <UrlInput
            ref={urlInputRef}
            value={url}
            onChange={setUrl}
            stepLabel={stepIdx}
          />
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent-500 px-6 py-3 text-sm font-semibold text-white shadow-orange-glow transition hover:bg-accent-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin-slow rounded-full border-2 border-white/30 border-t-white" />
                {step.label}...
              </>
            ) : "Analyze"}
          </button>
        </form>

        {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}

        {loading && (
          <div className="mt-3">
            {/* progress bar */}
            <div className="relative h-1.5 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full bg-accent-500 transition-all duration-700 ease-in-out"
                style={{ width: `${step.pct}%` }}
              />
              {/* shimmer sweep */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer-bar"
                style={{ width: `${step.pct}%` }}
              />
            </div>

            {/* step labels */}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:justify-between">
              {STEPS.map((s, i) => {
                const isActive = i === stepIdx;
                const isDone   = i < stepIdx;
                return (
                  <span
                    key={s.key}
                    className={`flex items-center gap-1 text-xs transition-all duration-500 ${
                      isActive ? "text-accent-600 font-semibold scale-105 origin-left" :
                      isDone   ? "text-accent-400 font-medium" :
                                 "text-stone-300"
                    }`}
                  >
                    {isActive && (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-500 animate-pulse" />
                    )}
                    {isDone && (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-400" />
                    )}
                    {s.label}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!loading && !result ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex gap-5 opacity-20 text-surface-muted">
              <FiSmartphone size={40} /><FiTablet size={40} /><MdLaptop size={40} /><FiMonitor size={40} />
            </div>
            <p className="text-sm text-surface-muted">Enter a URL above to get a full responsiveness report.</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin">
            <div className="px-4 pt-5 sm:px-6">
              <p className="section-label mb-2">
                Live View by Device
              </p>
              <ScreenshotViewer
                screenshots={result?.screenshots}
                deviceStatus={result?.device_status}
                issues={result?.issues}
                issueGroups={result?.issue_groups}
                advice={result?.resolution_advice}
                isLoading={loading}
                activeUrl={activeUrl}
                onLiveDeviceChange={setActiveLiveDevice}
                issueDetailsOpen={issueDetailsOpen}
                onToggleIssueDetails={toggleIssueDetails}
              />
            </div>

            <div ref={issuesSectionRef} className="scroll-mt-4 px-4 py-5 sm:px-6">
              {result && (
                <>
                  <p className="section-label mb-3">
                    Issues &amp; Fixes by Device
                  </p>
                  <DeviceReport
                    issues={result.issues}
                    issueGroups={result.issue_groups}
                    advice={result.resolution_advice}
                    deviceStatus={result.device_status}
                    selectedDevice={activeLiveDevice}
                    detailsExpanded={issueDetailsOpen}
                    onToggleDetails={toggleIssueDetails}
                  />
                </>
              )}
              {loading && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[1,2,3,4].map(n => <SkeletonPanel key={n} h="h-64" />)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
