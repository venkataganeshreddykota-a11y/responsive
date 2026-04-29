import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TbWorld } from "react-icons/tb";
import { FiSearch } from "react-icons/fi";
import { HiOutlineMagnifyingGlass } from "react-icons/hi2";
import api from "../api/axios";
import Navbar from "../components/Navbar";

// Status pill styles — light, system-standard palette
const STATUS_STYLE = {
  pending:   { pill: "bg-stone-100 text-stone-500 border-stone-200",       dot: "bg-stone-400"   },
  running:   { pill: "bg-amber-50 text-amber-600 border-amber-200",        dot: "bg-amber-400"   },
  completed: { pill: "bg-emerald-50 text-emerald-700 border-emerald-200",  dot: "bg-emerald-500" },
  failed:    { pill: "bg-red-50 text-red-600 border-red-200",              dot: "bg-red-400"     },
};

function ScoreBadge({ score }) {
  if (score === null || score === undefined) return null;
  const s = Math.round(score);
  const color = s >= 80
    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : s >= 50
    ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-red-600 bg-red-50 border-red-200";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${color}`}>
      {s}
    </span>
  );
}

function StatusPill({ status }) {
  const cfg = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${cfg.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {status}
    </span>
  );
}

function HistoryRow({ item }) {
  return (
    <div className="glass glass-hover flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3.5 shadow-glass transition-all">
      {/* Icon + URL */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-500">
          <TbWorld size={16} />
        </span>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-sm font-medium text-surface-body no-underline hover:text-accent-600 transition-colors"
        >
          {item.url}
        </a>
      </div>

      {/* Date */}
      <span className="shrink-0 text-xs text-surface-muted tabular-nums">
        {new Date(item.created_at).toLocaleString()}
      </span>

      {/* Reports */}
      <div className="flex flex-wrap items-center gap-2">
        {item.reports.length === 0 && (
          <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-xs text-stone-400">
            No reports
          </span>
        )}
        {item.reports.map((r) => (
          <div key={r.id} className="flex items-center gap-1.5">
            <StatusPill status={r.status} />
            <ScoreBadge score={r.score} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return <div className="shimmer h-[58px] rounded-2xl" />;
}

export default function Dashboard() {
  const [urls, setUrls]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/scanner/urls/")
      .then(({ data }) => setUrls(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-surface-bg">
      <Navbar />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">

        {/* Hero card — frosted glass */}
        <div className="glass mb-8 overflow-hidden rounded-3xl shadow-glass">
          <div className="p-8">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent-500">
              Responsiveness Analyzer
            </p>
            <h1 className="mb-2 text-2xl font-bold text-surface-body sm:text-3xl">
              Welcome to Responsive Tool
            </h1>
            <p className="mb-6 max-w-md text-sm leading-relaxed text-surface-label">
              Check how any website looks across mobile, tablet, laptop, and desktop
              with real Playwright screenshots and automated issue detection.
            </p>
            <Link
              to="/scanner"
              className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white no-underline shadow-orange-glow transition hover:bg-accent-600 active:scale-95"
            >
              <HiOutlineMagnifyingGlass size={15} />
              Start a New Scan
            </Link>
          </div>
        </div>

        {/* Scan History */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-surface-body">Scan History</h2>
            {urls.length > 0 && (
              <span className="rounded-full border border-surface-border bg-white px-2.5 py-0.5 text-xs text-surface-muted">
                {urls.length} scan{urls.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {loading && (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((n) => <SkeletonRow key={n} />)}
            </div>
          )}

          {!loading && urls.length === 0 && (
            <div className="glass flex flex-col items-center justify-center gap-3 rounded-2xl py-14 shadow-glass">
              <HiOutlineMagnifyingGlass size={32} className="opacity-30 text-surface-muted" />
              <p className="text-sm text-surface-muted">No scans yet.</p>
              <Link
                to="/scanner"
                className="text-sm font-medium text-accent-500 no-underline hover:text-accent-600 transition-colors"
              >
                Run your first scan →
              </Link>
            </div>
          )}

          {!loading && urls.length > 0 && (
            <div className="flex flex-col gap-2">
              {urls.map((item) => <HistoryRow key={item.id} item={item} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
