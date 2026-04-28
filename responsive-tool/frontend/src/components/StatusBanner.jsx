const CONFIG = {
  good: {
    icon: "✅",
    label: "Good",
    className: "status-banner status-banner--good",
    barClass: "status-bar--good",
  },
  needs_fix: {
    icon: "⚠️",
    label: "Needs Fix",
    className: "status-banner status-banner--warn",
    barClass: "status-bar--warn",
  },
  broken: {
    icon: "❌",
    label: "Broken",
    className: "status-banner status-banner--broken",
    barClass: "status-bar--broken",
  },
};

const DEVICE_ICON = { mobile: "📱", tablet: "📟", laptop: "💻", desktop: "🖥️" };

export default function StatusBanner({ verdict, verdictLabel, verdictDetail, score, deviceStatus, url }) {
  const cfg = CONFIG[verdict] || CONFIG["needs_fix"];

  return (
    <div className={cfg.className}>
      {/* left: verdict */}
      <div className="status-verdict">
        <span className="status-icon">{cfg.icon}</span>
        <div>
          <div className="status-label">{verdictLabel || cfg.label}</div>
          <div className="status-detail">{verdictDetail}</div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="status-url"
            >
              {url}
            </a>
          )}
        </div>
      </div>

      {/* center: score gauge */}
      <div className="status-score-wrap">
        <svg className="score-gauge" viewBox="0 0 120 120" aria-label={`Score ${Math.round(score ?? 0)}`}>
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="50"
            fill="none"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="10"
            strokeDasharray={`${(Math.min(score ?? 0, 100) / 100) * 314} 314`}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
          />
          <text x="60" y="55" textAnchor="middle" className="gauge-score">
            {score !== null && score !== undefined ? Math.round(score) : "—"}
          </text>
          <text x="60" y="72" textAnchor="middle" className="gauge-label">/ 100</text>
        </svg>
        <span className="score-caption">Responsiveness Score</span>
      </div>

      {/* right: per-device status pills */}
      {deviceStatus && deviceStatus.length > 0 && (
        <div className="status-devices">
          {deviceStatus.map((ds) => (
            <div key={ds.device} className={`device-pill device-pill--${ds.status}`}>
              <span>{DEVICE_ICON[ds.device]}</span>
              <span className="device-pill-name">{ds.device}</span>
              <span className="device-pill-status">
                {ds.status === "good" ? "✓" : ds.status === "needs_fix" ? "!" : "✗"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
