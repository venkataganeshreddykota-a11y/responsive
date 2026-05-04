import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineExclamationTriangle,
  HiOutlineClock,
  HiOutlineMagnifyingGlass,
  HiOutlineArrowPath,
} from "react-icons/hi2";
import { TbWorld } from "react-icons/tb";
import api from "../api/axios";
import Navbar from "../components/Navbar";

const VERDICT_CFG = {
  good:      { icon: HiOutlineCheckCircle,         color: "text-emerald-500", bg: "bg-emerald-50 border-emerald-200", label: "Good"      },
  needs_fix: { icon: HiOutlineExclamationTriangle,  color: "text-amber-500",  bg: "bg-amber-50 border-amber-200",    label: "Needs Fix" },
  broken:    { icon: HiOutlineXCircle,              color: "text-red-500",    bg: "bg-red-50 border-red-200",        label: "Broken"    },
};

const STATUS_CFG = {
  completed: { color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  failed:    { color: "text-red-500",     bg: "bg-red-50 border-red-200"         },
  pending:   { color: "text-amber-500",   bg: "bg-amber-50 border-amber-200"     },
  running:   { color: "text-blue-500",    bg: "bg-blue-50 border-blue-200"       },
};

function ScoreBadge({ score }) {
  if (score == null) return null;
  const s = Math.round(score);
  const color = s >= 80 ? "text-emerald-600 bg-emerald-50 border-emerald-200"
              : s >= 50 ? "text-amber-600 bg-amber-50 border-amber-200"
              : "text-red-500 bg-red-50 border-red-200";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${color}`}>
      {s}
    </span>
  );
}

function HistoryRow({ item }) {
  const latest = item.latest_report;
  const verdict = latest?.verdict;
  const vcfg = VERDICT_CFG[verdict] || null;
  const VIcon = vcfg?.icon;
  const scfg = STATUS_CFG[latest?.status] || STATUS_CFG.pending;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-surface-border bg-white px-4 py-3 transition hover:shadow-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-500">
        <TbWorld size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-surface-body">{item.url}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-surface-muted">
          <HiOutlineClock size={11} />
          {new Date(item.created_at).toLocaleString()}
          <span className="mx-1 text-surface-border">·</span>
          {item.reports.length} report{item.reports.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {latest && (
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${scfg.bg} ${scfg.color}`}>
            {latest.status}
          </span>
        )}
        {vcfg && VIcon && (
          <span className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${vcfg.bg}`}>
            <VIcon size={11} className={vcfg.color} />
            {vcfg.label}
          </span>
        )}
        <ScoreBadge score={latest?.score} />
      </div>
    </div>
  );
}

export default function History() {
  const [searchParams] = useSearchParams();
  const [urls, setUrls]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState(() => {
    const f = searchParams.get("filter");
    return ["all", "completed", "failed"].includes(f) ? f : "all";
  });

  useEffect(() => {
    const controller = new AbortController();
    api.get("/scanner/urls/", { signal: controller.signal })
      .then(({ data }) => { setUrls(data); setError(null); })
      .catch((err) => {
        if (err.name !== "CanceledError" && err.name !== "AbortError")
          setError("network");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const sorted = [...urls].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const filtered = sorted.filter((item) => {
    const matchSearch = item.url.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === "all") return true;
    return item.reports.some(r => r.status === filter);
  });

  const FILTERS = [
    { key: "all",       label: "All"       },
    { key: "completed", label: "Completed" },
    { key: "failed",    label: "Failed"    },
  ];

  return (
    <div className="flex h-full min-h-screen w-full flex-col bg-surface-bg">
      <Navbar />

      <main className="flex flex-1 flex-col gap-5 overflow-y-auto p-6 scrollbar-thin">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-surface-body">History</h1>
          <p className="mt-1 text-sm text-surface-muted">All previously scanned URLs</p>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <HiOutlineMagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-muted" />
            <input
              type="text"
              placeholder="Search URLs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-white py-2 pl-8 pr-3 text-sm text-surface-body placeholder-surface-muted outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20"
            />
          </div>
          <div className="flex gap-1">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  filter === key
                    ? "bg-accent-500 text-white shadow-orange-glow"
                    : "border border-surface-border bg-white text-surface-label hover:text-surface-body",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1,2,3,4,5].map(n => <div key={n} className="shimmer h-16 rounded-xl" />)}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-surface-muted">
            <HiOutlineArrowPath size={28} className="opacity-30" />
            <p className="text-sm">Could not load history. Check your connection.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-surface-muted">
            <TbWorld size={32} className="opacity-20" />
            <p className="text-sm">{search ? "No results match your search." : "No scans yet."}</p>
            {!search && (
              <Link to="/scanner" className="mt-1 rounded-lg bg-accent-500 px-4 py-2 text-xs font-semibold text-white no-underline shadow-orange-glow hover:bg-accent-600">
                Start a Scan
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-surface-muted">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>
            {filtered.map(item => <HistoryRow key={item.id} item={item} />)}
          </div>
        )}

      </main>
    </div>
  );
}
