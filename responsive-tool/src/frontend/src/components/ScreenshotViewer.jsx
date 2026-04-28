import { useState } from "react";

const DEVICE_META = {
  mobile:  { icon: "📱", label: "Mobile",  width: 375  },
  tablet:  { icon: "📟", label: "Tablet",  width: 768  },
  laptop:  { icon: "💻", label: "Laptop",  width: 1280 },
  desktop: { icon: "🖥️", label: "Desktop", width: 1440 },
};

const STATUS_CLASS = { good: "ss-status--good", needs_fix: "ss-status--warn", broken: "ss-status--broken" };
const STATUS_ICON  = { good: "✓", needs_fix: "!", broken: "✗" };

export default function ScreenshotViewer({ screenshots, deviceStatus, isLoading }) {
  const [lightbox, setLightbox] = useState(null);
  const devices   = Object.keys(DEVICE_META);
  const statusMap = Object.fromEntries((deviceStatus || []).map((d) => [d.device, d]));

  return (
    <div className="ss-viewer">
      <div className="ss-grid">
        {devices.map((d) => {
          const meta = DEVICE_META[d];
          const src  = screenshots?.[d];
          const ds   = statusMap[d];
          return (
            <div key={d} className={`ss-card ${ds ? `ss-card--${ds.status}` : ""}`}
              onClick={() => src && setLightbox(d)}
              role={src ? "button" : undefined} tabIndex={src ? 0 : undefined}
              onKeyDown={(e) => e.key === "Enter" && src && setLightbox(d)}
              aria-label={src ? `View ${meta.label} screenshot` : undefined}>
              <div className="ss-card-header">
                <span>{meta.icon}</span>
                <strong>{meta.label}</strong>
                <span className="device-res">{meta.width}px</span>
                {ds && (
                  <span className={`ss-status-pill ${STATUS_CLASS[ds.status]}`}>
                    {STATUS_ICON[ds.status]}&nbsp;
                    {ds.status === "good" ? "Good" : ds.status === "needs_fix" ? "Needs Fix" : "Broken"}
                  </span>
                )}
              </div>
              <div className="ss-frame">
                {isLoading ? <div className="ss-skeleton" /> : src ? (
                  <>
                    <img src={`data:image/png;base64,${src}`} alt={`${meta.label} screenshot`} className="ss-img" />
                    <div className="ss-overlay"><span>🔍 View full size</span></div>
                  </>
                ) : (
                  <div className="ss-placeholder"><span>{meta.icon}</span><p>No screenshot</p></div>
                )}
              </div>
              {ds && !isLoading && (
                <div className="ss-footer">
                  {ds.issue_count > 0
                    ? <span className="badge badge-error">{ds.issue_count} issue{ds.issue_count !== 1 ? "s" : ""}</span>
                    : <span className="badge badge-success">No issues</span>}
                  {ds.probes && (
                    <span className="ss-probe-hint muted">
                      {ds.probes.overflow_count > 0 && `${ds.probes.overflow_count} overflow · `}
                      {ds.probes.small_targets  > 0 && `${ds.probes.small_targets} small targets`}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {lightbox && (
        <div className="ss-lightbox" onClick={() => setLightbox(null)}
          role="dialog" aria-modal="true" aria-label="Screenshot lightbox">
          <div className="ss-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <div className="ss-lightbox-header">
              <span>{DEVICE_META[lightbox].icon} {DEVICE_META[lightbox].label} — {DEVICE_META[lightbox].width}px</span>
              <button className="btn-ghost ss-close" onClick={() => setLightbox(null)} aria-label="Close">✕</button>
            </div>
            <div className="ss-lightbox-body">
              <img src={`data:image/png;base64,${screenshots[lightbox]}`}
                alt={`${DEVICE_META[lightbox].label} full screenshot`} className="ss-lightbox-img" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
