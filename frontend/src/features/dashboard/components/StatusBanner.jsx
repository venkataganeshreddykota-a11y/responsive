import { HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlineXCircle } from "react-icons/hi2";
import { FiSmartphone, FiTablet, FiMonitor } from "react-icons/fi";
import { MdLaptop } from "react-icons/md";

const VERDICT = {
  good:      { bg: "bg-emerald-50", border: "border-emerald-200", iconBg: "bg-emerald-100 text-emerald-600", textColor: "text-emerald-800", label: "Good",      Icon: HiOutlineCheckCircle },
  needs_fix: { bg: "bg-amber-50",   border: "border-amber-200",   iconBg: "bg-amber-100 text-amber-600",     textColor: "text-amber-800",   label: "Needs Fix", Icon: HiOutlineExclamationTriangle },
  broken:    { bg: "bg-red-50",     border: "border-red-200",     iconBg: "bg-red-100 text-red-600",         textColor: "text-red-800",     label: "Broken",    Icon: HiOutlineXCircle },
};

const DEVICE_ICON = {
  mobile:  <FiSmartphone size={13} />,
  tablet:  <FiTablet size={13} />,
  laptop:  <MdLaptop size={13} />,
  desktop: <FiMonitor size={13} />,
};

const DEVICE_PILL = {
  good:      "bg-emerald-100 text-emerald-700 border-emerald-200",
  needs_fix: "bg-amber-100 text-amber-700 border-amber-200",
  broken:    "bg-red-100 text-red-700 border-red-200",
};

function ScoreRing({ score }) {
  const s = Math.min(score ?? 0, 100);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (s / 100) * circ;
  const color      = s >= 80 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444";
  const trackColor = s >= 80 ? "#d1fae5" : s >= 50 ? "#fef3c7" : "#fee2e2";

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <svg width="90" height="90" viewBox="0 0 90 90" aria-label={`Score ${Math.round(s)}`}>
        <circle cx="45" cy="45" r={r} fill="none" stroke={trackColor} strokeWidth="7" />
        <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 45 45)" style={{ transition: "stroke-dasharray 0.8s ease" }} />
        <text x="45" y="41" textAnchor="middle" fill="#1c1a17" fontSize="18" fontWeight="700">{Math.round(s)}</text>
        <text x="45" y="55" textAnchor="middle" fill="#a09d97" fontSize="9">/ 100</text>
      </svg>
      <span className="text-xs text-surface-muted">Responsiveness Score</span>
    </div>
  );
}

export default function StatusBanner({ verdict, verdictLabel, verdictDetail, score, deviceStatus, url }) {
  const cfg = VERDICT[verdict] || VERDICT.needs_fix;
  const { Icon } = cfg;

  return (
    <div className={`animate-fade-in rounded-lg border p-5 shadow-glass ${cfg.bg} ${cfg.border}`}>
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex flex-1 items-start gap-3 min-w-[180px]">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${cfg.iconBg}`}>
            <Icon size={22} />
          </div>
          <div>
            <div className={`text-lg font-bold ${cfg.textColor}`}>{verdictLabel || cfg.label}</div>
            <div className="mt-0.5 text-xs leading-relaxed text-surface-label max-w-xs">{verdictDetail}</div>
            {url && (
              <a href={url} target="_blank" rel="noreferrer"
                className="mt-1 block truncate text-xs text-surface-muted no-underline hover:text-accent-600 transition-colors max-w-[220px]">
                {url}
              </a>
            )}
          </div>
        </div>

        <ScoreRing score={score} />

        {deviceStatus?.length > 0 && (
          <div className="flex flex-wrap gap-2 self-center">
            {deviceStatus.map((ds) => (
              <span key={ds.device}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${DEVICE_PILL[ds.status] || DEVICE_PILL.needs_fix}`}>
                {DEVICE_ICON[ds.device]}
                <span className="capitalize">{ds.device}</span>
                <span className="font-semibold">{ds.status === "good" ? "Good" : ds.status === "needs_fix" ? "Fix" : "Broken"}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

