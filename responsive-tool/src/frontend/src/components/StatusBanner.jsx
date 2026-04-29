const CONFIG = {
  good:     { icon: "✅", label: "Good",      className: "status-banner status-banner--good"   },
  needs_fix:{ icon: "⚠️", label: "Needs Fix", className: "status-banner status-banner--warn"   },
  broken:   { icon: "❌", label: "Broken",    className: "status-banner status-banner--broken" },
};



export default function StatusBanner({ verdict, verdictLabel, verdictDetail, score, deviceStatus, url }) {
  const cfg = CONFIG[verdict] || CONFIG["needs_fix"];
  return (
    <div className={cfg.className}>
      <div className="status-verdict">
        <span className="status-icon">{cfg.icon}</span>
        <div>
          <div className="status-label">{verdictLabel || cfg.label}</div>
        </div>
      </div>
      <div className="status-score-wrap">
        <svg className="score-gauge" viewBox="0 0 120 120" aria-label={`Score ${Math.round(score ?? 0)}`}>
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="10" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="10"
            strokeDasharray={`${(Math.min(score ?? 0, 100) / 100) * 314} 314`}
            strokeLinecap="round" transform="rotate(-90 60 60)" />
          <text x="60" y="55" textAnchor="middle" className="gauge-score">
            {score !== null && score !== undefined ? Math.round(score) : "—"}
          </text>
          <text x="60" y="72" textAnchor="middle" className="gauge-label">/ 100</text>
        </svg>
        <span className="score-caption">Responsiveness Score</span>
      </div>
    </div>
  );
}
