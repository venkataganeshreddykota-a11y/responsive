import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HiOutlineMagnifyingGlass, HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineExclamationTriangle, HiOutlineChartBar } from "react-icons/hi2";
import { FiSmartphone, FiTablet, FiMonitor, FiArrowRight } from "react-icons/fi";
import { MdLaptop } from "react-icons/md";
import { TbWorld } from "react-icons/tb";
import api from "../api/axios";
import Navbar from "../components/Navbar";

const VERDICT_CFG = {
  good:      { icon: HiOutlineCheckCircle,        color: "text-emerald-500", bg: "bg-emerald-50 border-emerald-200",  label: "Good"      },
  needs_fix: { icon: HiOutlineExclamationTriangle, color: "text-amber-500",  bg: "bg-amber-50 border-amber-200",      label: "Needs Fix" },
  broken:    { icon: HiOutlineXCircle,             color: "text-red-500",    bg: "bg-red-50 border-red-200",          label: "Broken"    },
};

const DEVICE_ICONS = {
  mobile:  FiSmartphone,
  tablet:  FiTablet,
  laptop:  MdLaptop,
  desktop: FiMonitor,
};

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="glass rounded-2xl p-5 shadow-glass flex flex-col gap-1">
      <p className="text-xs text-surface-muted">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${accent || "text-surface-body"}`}>{value}</p>
      {sub && <p className="text-xs text-surface-muted">{sub}</p>}
    </div>
  );
}

function ScoreBar({ label, score }) {
  const s = Math.round(score ?? 0);
  const color = s >= 80 ? "bg-emerald-500" : s >= 50 ? "bg-amber-400" : "bg-red-400";
  const text  = s >= 80 ? "text-emerald-700" : s >= 50 ? "text-amber-700" : "text-red-600";
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs text-surface-label capitalize">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-stone-200 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${s}%` }} />
      </div>
      <span className={`w-8 text-right text-xs font-bold tabular-nums ${text}`}>{s}</span>
    </div>
  );
}

function RecentItem({ item }) {
  const latestReport = item.reports?.[item.reports.length - 1];
  const verdict = latestReport?.verdict;
  const cfg = VERDICT_CFG[verdict] || null;
  const Icon = cfg?.icon;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-white/60 px-4 py-3 hover:bg-white/90 transition-colors">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-500">
        <TbWorld size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-surface-body">{item.url}</p>
        <p className="text-xs text-surface-muted">{new Date(item.created_at).toLocaleString()}</p>
      </div>
      {cfg && Icon && (
        <span className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.bg}`}>
          <Icon size={11} className={cfg.color} />
          {cfg.label}
        </span>
      )}
      {latestReport?.score != null && (
        <span className="text-xs font-bold tabular-nums text-surface-muted w-8 text-right">
          {Math.round(latestReport.score)}
        </span>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [urls, setUrls]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/scanner/urls/")
      .then(({ data }) => setUrls(data))
      .finally(() => setLoading(false));
  }, []);

  // Derived stats
  const total     = urls.length;
  const completed = urls.filter(u => u.reports.some(r => r.status === "completed"));
  const failed    = urls.filter(u => u.reports.some(r => r.status === "failed")).length;

  const allReports = urls.flatMap(u => u.reports.filter(r => r.status === "completed"));
  const avgScore   = allReports.length
    ? Math.round(allReports.reduce((s, r) => s + (r.score ?? 0), 0) / allReports.length)
    : null;

  const verdictCounts = { good: 0, needs_fix: 0, broken: 0 };
  allReports.forEach(r => { if (r.verdict) verdictCounts[r.verdict] = (verdictCounts[r.verdict] || 0) + 1; });

  // Device health across all reports
  const deviceScores = { mobile: [], tablet: [], laptop: [], desktop: [] };
  urls.forEach(u => {
    u.reports.forEach(r => {
      if (r.status === "completed" && r.device_scores) {
        Object.entries(r.device_scores).forEach(([dev, sc]) => {
          if (deviceScores[dev]) deviceScores[dev].push(sc);
        });
      }
    });
  });
  const deviceAvg = Object.fromEntries(
    Object.entries(deviceScores).map(([dev, scores]) => [
      dev,
      scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    ])
  );

  const recent = [...urls].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

  return (
    <div className="flex h-full min-h-screen w-full flex-col bg-surface-bg">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-72 shrink-0 flex-col gap-4 border-r border-surface-border p-5 overflow-y-auto scrollbar-thin">
          <div className="glass rounded-2xl p-5 shadow-glass">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent-500">
              Responsiveness Analyzer
            </p>
            <h1 className="mb-2 text-lg font-bold text-surface-body leading-snug">
              Welcome to Responsive Tool
            </h1>
            <p className="mb-4 text-xs leading-relaxed text-surface-label">
              Capture real Playwright screenshots across mobile, tablet, laptop, and desktop — with automated issue detection.
            </p>
            <Link
              to="/scanner"
              className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white no-underline shadow-orange-glow transition hover:bg-accent-600 active:scale-95"
            >
              <HiOutlineMagnifyingGlass size={14} />
              Start a New Scan
            </Link>
          </div>

          {/* Verdict breakdown */}
          {!loading && allReports.length > 0 && (
            <div className="glass rounded-2xl p-4 shadow-glass">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-surface-muted">Verdict Breakdown</p>
              <div className="flex flex-col gap-2">
                {[
                  { key: "good",      label: "Good",      color: "bg-emerald-500", text: "text-emerald-700" },
                  { key: "needs_fix", label: "Needs Fix", color: "bg-amber-400",   text: "text-amber-700"   },
                  { key: "broken",    label: "Broken",    color: "bg-red-400",     text: "text-red-600"     },
                ].map(({ key, label, color, text }) => {
                  const count = verdictCounts[key] || 0;
                  const pct   = allReports.length ? Math.round((count / allReports.length) * 100) : 0;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${color}`} />
                      <span className="flex-1 text-xs text-surface-label">{label}</span>
                      <span className={`text-xs font-bold tabular-nums ${text}`}>{count}</span>
                      <span className="text-xs text-stone-400 w-8 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="glass rounded-2xl p-4 shadow-glass">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-surface-muted">Quick Tips</p>
            <ul className="flex flex-col gap-2.5">
              {[
                "Use HTTPS URLs for accurate results.",
                "Score ≥ 80 means fully responsive.",
                "Check overflow issues on mobile first.",
                "Small tap targets hurt mobile UX.",
              ].map((tip, i) => (
                <li key={i} className="flex gap-2 text-xs text-surface-label leading-relaxed">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main */}
        <main className="flex flex-1 flex-col overflow-y-auto scrollbar-thin p-6 gap-6">

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard label="Total Scans" value={loading ? "—" : total} sub="all time" />
            <StatCard label="Completed" value={loading ? "—" : completed.length} sub="scans finished" accent="text-emerald-600" />
            <StatCard label="Failed" value={loading ? "—" : failed} sub="scans errored" accent={failed > 0 ? "text-red-500" : "text-surface-body"} />
          </div>

          {/* Device health + Recent scans */}
          <div className="grid gap-5 lg:grid-cols-2">

            {/* Device health */}
            <div className="glass rounded-2xl p-5 shadow-glass flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-surface-body flex items-center gap-2">
                  <HiOutlineChartBar size={15} className="text-accent-500" />
                  Device Health
                </h2>
                <span className="text-xs text-surface-muted">avg score per device</span>
              </div>
              {loading ? (
                <div className="flex flex-col gap-3">
                  {[1,2,3,4].map(n => <div key={n} className="shimmer h-4 rounded-full" />)}
                </div>
              ) : allReports.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-surface-muted">
                  <HiOutlineChartBar size={28} className="opacity-30" />
                  <p className="text-xs">No data yet. Run a scan to see device health.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {Object.entries(deviceAvg).map(([dev, score]) => {
                    const Icon = DEVICE_ICONS[dev];
                    return (
                      <div key={dev} className="flex items-center gap-3">
                        {Icon && <Icon size={13} className="shrink-0 text-surface-muted" />}
                        <ScoreBar label={dev} score={score ?? 0} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent scans */}
            <div className="glass rounded-2xl p-5 shadow-glass flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-surface-body">Recent Scans</h2>
                <Link to="/scanner" className="flex items-center gap-1 text-xs text-accent-500 no-underline hover:text-accent-600 transition-colors">
                  New scan <FiArrowRight size={11} />
                </Link>
              </div>
              {loading ? (
                <div className="flex flex-col gap-2">
                  {[1,2,3].map(n => <div key={n} className="shimmer h-12 rounded-xl" />)}
                </div>
              ) : recent.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-surface-muted">
                  <HiOutlineMagnifyingGlass size={28} className="opacity-30" />
                  <p className="text-xs">No scans yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {recent.map(item => <RecentItem key={item.id} item={item} />)}
                </div>
              )}
            </div>
          </div>

          {/* How it works */}
          <div className="glass rounded-2xl p-5 shadow-glass">
            <h2 className="mb-4 text-sm font-semibold text-surface-body">How It Works</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { step: "01", icon: TbWorld,                  title: "Enter a URL",          desc: "Paste any public website URL into the scanner." },
                { step: "02", icon: HiOutlineMagnifyingGlass, title: "Playwright Captures",  desc: "Real browser screenshots at 375, 768, 1280, and 1440px." },
                { step: "03", icon: HiOutlineChartBar,        title: "Issue Detection",      desc: "Overflow, small targets, font sizes, and layout breaks." },
                { step: "04", icon: HiOutlineCheckCircle,     title: "Get Your Report",      desc: "Score, verdict, and actionable fix recommendations." },
              ].map(({ step, icon: Icon, title, desc }) => (
                <div key={step} className="flex flex-col gap-2 rounded-xl border border-surface-border bg-white/50 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-accent-400">{step}</span>
                    <Icon size={14} className="text-surface-muted" />
                  </div>
                  <p className="text-sm font-semibold text-surface-body">{title}</p>
                  <p className="text-xs leading-relaxed text-surface-label">{desc}</p>
                </div>
              ))}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
