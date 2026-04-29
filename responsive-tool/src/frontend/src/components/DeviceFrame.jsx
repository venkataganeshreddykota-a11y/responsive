import { useRef, useState } from "react";
import { FiRefreshCw, FiAlertTriangle } from "react-icons/fi";

// Point directly at the Django backend — bypasses the CRA dev-server proxy
// which crashes on large streaming HTML responses in Node v24.
const PROXY_BASE = "http://localhost:8000/api/scanner/proxy/?url=";

/**
 * DeviceFrame
 *
 * Props:
 *   url        {string}  – target website URL (will be proxied)
 *   deviceName {string}  – display label, e.g. "Mobile"
 *   width      {number}  – true device viewport width in px (e.g. 375)
 *   height     {number}  – true device viewport height in px (e.g. 812)
 *   scale      {number}  – scale factor, e.g. 0.4 shrinks 375→150px wide
 *
 * The wrapper div is sized to width*scale × height*scale so it takes up
 * exactly the right amount of layout space. The iframe is rendered at the
 * full width×height then scaled down with CSS transform so the site
 * actually *behaves* at that breakpoint (media queries fire correctly).
 */
export default function DeviceFrame({ url, deviceName, width, height, scale }) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const iframeRef             = useRef(null);

  const proxyUrl = `${PROXY_BASE}${encodeURIComponent(url)}`;

  // Outer wrapper dimensions — what the component occupies in the layout
  const wrapperWidth  = width  * scale;
  const wrapperHeight = height * scale;

  const reload = () => {
    setError(false);
    setLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = proxyUrl;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Label + reload */}
      <div className="flex items-center justify-between" style={{ width: wrapperWidth }}>
        <span className="text-xs font-semibold text-surface-body">
          {deviceName} — {width}px
        </span>
        <button
          onClick={reload}
          className="flex items-center gap-1 rounded-lg border border-surface-border bg-white px-2 py-1 text-xs text-surface-muted hover:text-surface-body transition-colors"
          title={`Reload ${deviceName}`}
        >
          <FiRefreshCw size={11} />
          Reload
        </button>
      </div>

      {/*
        Wrapper: sized to the *scaled* dimensions so surrounding layout is correct.
        overflow:hidden clips the full-size iframe to this box.
      */}
      <div
        className="relative overflow-hidden rounded-xl border border-surface-border bg-stone-50 shadow-glass"
        style={{ width: wrapperWidth, height: wrapperHeight }}
      >
        {/* Loading shimmer */}
        {loading && !error && (
          <div className="absolute inset-0 z-10 shimmer" />
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-stone-50 text-surface-muted">
            <FiAlertTriangle size={28} className="text-amber-400" />
            <p className="text-xs text-center px-6">
              Could not load the live preview. The site may block proxying.
            </p>
            <button
              onClick={reload}
              className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-600 transition-colors"
            >
              <FiRefreshCw size={11} />
              Try again
            </button>
          </div>
        )}

        {/*
          iframe: rendered at the true device dimensions so media queries fire
          correctly, then scaled down visually via CSS transform.
          transform-origin: top left keeps the top-left corner anchored inside
          the wrapper so nothing gets clipped unexpectedly.
        */}
        <iframe
          ref={iframeRef}
          src={proxyUrl}
          title={`Live preview – ${deviceName}`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
          onLoad={() => {
            try {
              const doc = iframeRef.current?.contentDocument;
              // If the document body is empty the proxy likely failed
              if (doc && doc.body && doc.body.innerHTML.trim() === "") {
                setError(true);
              }
            } catch (_) {
              // cross-origin — can't inspect, assume ok
            }
            setLoading(false);
          }}
          onError={() => { setLoading(false); setError(true); }}
          style={{
            width,
            height,
            border: "none",
            transformOrigin: "top left",
            transform: `scale(${scale})`,
          }}
        />
      </div>
    </div>
  );
}
