import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineExclamationTriangle,
  HiOutlineMagnifyingGlass,
} from "react-icons/hi2";
import { TbWorld } from "react-icons/tb";
import api from "../api/axios";
import Navbar from "../components/Navbar";
import { loadJsonArray, saveJson } from "../utils/storage";

const DASHBOARD_CACHE_KEY = "rt_dashboard_urls";

function loadCached() {
  return loadJsonArray(DASHBOARD_CACHE_KEY).filter((item) => item && Array.isArray(item.reports));
}

function saveCache(data) {
  if (Array.isArray(data)) saveJson(DASHBOARD_CACHE_KEY, data);
}

function StatCard({ label, value, sub, accent, icon: Icon, to }) {
  const inner = (
    <>
      {Icon && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-50 text-accent-500">
          <Icon size={13} />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-muted">{label}</p>
        <p className={`text-lg font-bold tabular-nums leading-tight ${accent || "text-surface-body"}`}>{value}</p>
        {sub && <p className="text-[10px] text-surface-muted">{sub}</p>}
      </div>
    </>
  );
  return to ? (
    <Link to={to} className="panel flex items-center gap-3 px-4 py-3 no-underline transition hover:shadow-md hover:border-accent-200 cursor-pointer">
      {inner}
    </Link>
  ) : (
    <div className="panel flex items-center gap-3 px-4 py-3">{inner}</div>
  );
}

export default function Dashboard() {
  const [urls, setUrls]       = useState(loadCached);
  const [loading, setLoading] = useState(() => loadCached().length === 0);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    if (urls.length === 0) setLoading(true);
    api.get("/scanner/urls/", { signal: controller.signal })
      .then(({ data }) => {
        const nextUrls = Array.isArray(data) ? data : [];
        setUrls(nextUrls);
        saveCache(nextUrls);
        setError(null);
      })
      .catch((err) => {
        if (err.name !== "CanceledError" && err.name !== "AbortError")
          setError("network");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const total     = urls.length;
  const completed = urls.filter(u => u.reports.some(r => r.status === "completed")).length;
  const failed    = urls.filter(u => u.reports.some(r => r.status === "failed")).length;

  return (
    <div className="flex h-full min-h-screen w-full flex-col bg-surface-bg">
      <Navbar />

      {error === "network" && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5">
          <p className="text-xs text-amber-700">Could not reach the server. Showing cached data.</p>
        </div>
      )}

      <main className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 scrollbar-thin">

        {/* Hero row */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-surface-body">Dashboard</h1>
          <p className="text-sm text-surface-muted">Overview of your responsiveness scans</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Total Scans"
            value={loading ? "—" : total}
            sub="all time"
            icon={TbWorld}
            to="/history?filter=all"
          />
          <StatCard
            label="Completed"
            value={loading ? "—" : completed}
            sub="scans finished"
            accent="text-emerald-600"
            icon={HiOutlineCheckCircle}
            to="/history?filter=completed"
          />
          <StatCard
            label="Failed"
            value={loading ? "—" : failed}
            sub="scans errored"
            accent={failed > 0 ? "text-red-500" : "text-surface-body"}
            icon={HiOutlineXCircle}
            to="/history?filter=failed"
          />
        </div>

        {/* How it works */}
        <div className="grid gap-5">
          <div className="panel flex flex-col gap-5 p-6">
            <h2 className="text-sm font-semibold text-surface-body">How It Works</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { step: "01", icon: TbWorld,                   title: "Enter a URL",         desc: "Paste any public website URL." },
                { step: "02", icon: HiOutlineMagnifyingGlass,  title: "Playwright Captures", desc: "Screenshots at 375, 768, 1280, 1440px." },
                { step: "03", icon: HiOutlineExclamationTriangle, title: "Issue Detection",  desc: "Overflow, tap targets, font sizes." },
                { step: "04", icon: HiOutlineCheckCircle,      title: "Get Your Report",     desc: "Score, verdict, and fix recommendations." },
              ].map(({ step, icon: Icon, title, desc }) => (
                <div key={step} className="flex flex-col gap-2 rounded-xl border border-surface-border bg-white/60 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-accent-400">{step}</span>
                    <Icon size={13} className="text-surface-muted" />
                  </div>
                  <p className="text-xs font-semibold text-surface-body">{title}</p>
                  <p className="text-xs leading-relaxed text-surface-label">{desc}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
