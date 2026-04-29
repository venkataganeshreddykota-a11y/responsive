import { useState } from "react";

const STATUS_CLASS = { good: "ss-status--good", needs_fix: "ss-status--warn", broken: "ss-status--broken" };
const STATUS_ICON  = { good: "✓", needs_fix: "!", broken: "✗" };

export default function ScreenshotViewer({ screenshots, deviceStatus, isLoading }) {
  const [lightbox, setLightbox] = useState(null);
  
  // Extract device list and metadata from deviceStatus
  const devices = (deviceStatus || []).map(d => ({
    key: d.device,
    name: d.device_name || d.device,
    width: d.width,
    height: d.height,
    icon: d.icon || "📱",
    status: d.status,
    issue_count: d.issue_count,
    probes: d.probes
  }));

  const activeLightboxDevice = devices.find(d => d.key === lightbox);

  return (
    <div className="ss-viewer">
      <div className="ss-grid ss-grid--dynamic">
        {devices.map((d) => {
          const src = screenshots?.[d.key];
          return (
            <div key={d.key} className={`ss-card ss-card--dynamic ${d.status ? `ss-card--${d.status}` : ""}`}
              onClick={() => src && setLightbox(d.key)}
              role={src ? "button" : undefined} tabIndex={src ? 0 : undefined}
              onKeyDown={(e) => e.key === "Enter" && src && setLightbox(d.key)}
              style={{ "--device-width": `${d.width}px` }}>
              <div className="ss-card-header">
                <span className="ss-card-icon">{d.icon}</span>
                <div className="ss-card-title-group">
                  <strong>{d.name}</strong>
                  <span className="device-res">{d.width} × {d.height}</span>
                </div>
                {d.status && (
                  <span className={`ss-status-pill ${STATUS_CLASS[d.status]}`}>
                    {STATUS_ICON[d.status]}&nbsp;
                    {d.status === "good" ? "Good" : d.status === "needs_fix" ? "Needs Fix" : "Broken"}
                  </span>
                )}
              </div>
              <div className="ss-frame ss-frame--device">
                {isLoading ? <div className="ss-skeleton" /> : src ? (
                  <>
                    <img src={`data:image/png;base64,${src}`} alt={`${d.name} screenshot`} className="ss-img" />
                    <div className="ss-overlay"><span>🔍 View full size</span></div>
                  </>
                ) : (
                  <div className="ss-placeholder"><span>{d.icon}</span><p>No screenshot</p></div>
                )}
              </div>
              {d.status && !isLoading && (
                <div className="ss-footer">
                  {d.issue_count > 0
                    ? <span className="badge badge-error">{d.issue_count} issue{d.issue_count !== 1 ? "s" : ""}</span>
                    : <span className="badge badge-success">No issues</span>}
                  {d.probes && (
                    <span className="ss-probe-hint muted">
                      {d.probes.overflow_count > 0 && `${d.probes.overflow_count} overflow`}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {lightbox && activeLightboxDevice && (
        <div className="ss-lightbox" onClick={() => setLightbox(null)}
          role="dialog" aria-modal="true" aria-label="Screenshot lightbox">
          <div className="ss-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <div className="ss-lightbox-header">
              <span>{activeLightboxDevice.icon} {activeLightboxDevice.name} — {activeLightboxDevice.width} × {activeLightboxDevice.height}</span>
              <button className="btn-ghost ss-close" onClick={() => setLightbox(null)} aria-label="Close">✕</button>
            </div>
            <div className="ss-lightbox-body">
              <img src={`data:image/png;base64,${screenshots[lightbox]}`}
                alt={`${activeLightboxDevice.name} full screenshot`} className="ss-lightbox-img" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
