const DEVICES = {
  mobile:  { label: "Mobile",  icon: "📱", width: 375,  height: 812,  scale: 0.36 },
  tablet:  { label: "Tablet",  icon: "📟", width: 768,  height: 1024, scale: 0.26 },
  laptop:  { label: "Laptop",  icon: "💻", width: 1280, height: 800,  scale: 0.20 },
  desktop: { label: "Desktop", icon: "🖥️", width: 1440, height: 900,  scale: 0.18 },
};

/**
 * Props:
 *   device      – "mobile" | "tablet" | "laptop" | "desktop"
 *   url         – live URL for iframe fallback
 *   screenshot  – base64 PNG string (from Playwright)
 *   isLoading   – show spinner
 *   issueCount  – optional number badge
 *   focused     – larger display mode
 */
export default function DeviceFrame({ device, url, screenshot, isLoading, issueCount = 0, focused = false }) {
  const cfg = DEVICES[device];
  const scale  = focused ? Math.min(cfg.scale * 1.8, 0.72) : cfg.scale;
  const frameW = cfg.width  * scale;
  const frameH = cfg.height * scale;

  return (
    <div className={`device-card ${focused ? "device-card--focused" : ""}`}>
      {/* header */}
      <div className="device-label">
        <span>{cfg.icon}</span>
        <strong>{cfg.label}</strong>
        <span className="device-res">{cfg.width} × {cfg.height}</span>
        {issueCount > 0 && (
          <span className="badge badge-error" style={{ marginLeft: "auto" }}>
            {issueCount} {issueCount === 1 ? "issue" : "issues"}
          </span>
        )}
      </div>

      {/* frame */}
      <div className="device-frame" style={{ width: frameW, height: frameH }}>
        {isLoading ? (
          <div className="frame-loading"><div className="spinner" /></div>
        ) : screenshot ? (
          /* Real Playwright screenshot */
          <img
            src={`data:image/png;base64,${screenshot}`}
            alt={`${cfg.label} screenshot`}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : url ? (
          /* Live iframe fallback */
          <iframe
            src={url}
            title={`${cfg.label} preview`}
            style={{
              width: cfg.width,
              height: cfg.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              border: "none",
              pointerEvents: "none",
            }}
          />
        ) : (
          <div className="frame-empty">
            <span>{cfg.icon}</span>
            <p>Preview will appear here</p>
          </div>
        )}
      </div>

      {/* footer */}
      <div className="device-meta">
        <span className="badge badge-info">{cfg.width}px</span>
        {screenshot && <span className="badge badge-success">Screenshot ✓</span>}
      </div>
    </div>
  );
}

export { DEVICES };
