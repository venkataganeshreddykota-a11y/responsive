const PRIORITY_CONFIG = {
  high:   { label: "High Priority",   className: "ra-item--high",   icon: "🔴" },
  medium: { label: "Medium Priority", className: "ra-item--medium", icon: "🟡" },
  low:    { label: "Suggestion",      className: "ra-item--low",    icon: "🔵" },
};

const DEVICE_ICON    = { mobile: "📱", tablet: "📟", laptop: "💻", desktop: "🖥️" };
const CATEGORY_ICONS = { viewport: "📐", images: "🖼️", typography: "🔤", touch: "👆", performance: "⚡", layout: "📦" };

export default function ResolutionAdvisor({ advice }) {
  if (!advice || advice.length === 0) {
    return (
      <div className="ra-panel">
        <h3 className="ra-title">Recommended Resolutions</h3>
        <p className="muted">No resolution advice available.</p>
      </div>
    );
  }

  const breakpointItems = advice.filter((a) => a.viewport);
  const suggestionItems = advice.filter((a) => !a.viewport);

  return (
    <div className="ra-panel">
      <h3 className="ra-title">Recommended Resolutions & Fixes</h3>
      {breakpointItems.length > 0 && (
        <div className="ra-section">
          <p className="ra-section-label">Breakpoint Fixes</p>
          <div className="ra-list">
            {breakpointItems.map((item, i) => {
              const cfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.low;
              return (
                <div key={i} className={`ra-item ${cfg.className}`}>
                  <div className="ra-item-header">
                    <span className="ra-priority-icon">{cfg.icon}</span>
                    <span className="ra-device-icon">{DEVICE_ICON[item.device]}</span>
                    <strong>{item.viewport}</strong>
                    <span className={`badge ${item.priority === "high" ? "badge-error" : "badge-warning"}`}>{cfg.label}</span>
                    {item.issue_count > 0 && (
                      <span className="muted" style={{ marginLeft: "auto", fontSize: "0.8rem" }}>
                        {item.issue_count} issue{item.issue_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {item.css_hint && <code className="ra-code">{item.css_hint}</code>}
                  {item.tip && <p className="ra-tip">{item.tip}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {suggestionItems.length > 0 && (
        <div className="ra-section">
          <p className="ra-section-label">General Suggestions</p>
          <div className="ra-list">
            {suggestionItems.map((item, i) => (
              <div key={i} className="ra-item ra-item--low">
                <div className="ra-item-header">
                  <span className="ra-priority-icon">{CATEGORY_ICONS[item.category] || "💡"}</span>
                  <strong>{item.title}</strong>
                </div>
                {item.detail && <p className="ra-tip">{item.detail}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
