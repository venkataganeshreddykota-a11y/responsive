import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { FiSmartphone, FiTablet, FiMonitor, FiMaximize2, FiX, FiLock } from "react-icons/fi";
import { MdLaptop } from "react-icons/md";
import { HiOutlineCamera } from "react-icons/hi2";

const CATEGORY_UI = {
  Mobile:  { Icon: FiSmartphone, frameW: 260, screenH: 500, isPhone: true  },
  Tablet:  { Icon: FiTablet,     frameW: 420, screenH: 540, isPhone: false },
  Desktop: { Icon: FiMonitor,    frameW: 620, screenH: 540, isPhone: false },
};

const DEFAULT_UI = { Icon: FiSmartphone, frameW: 300, screenH: 500, isPhone: false };

const STATUS_STYLE = {
  good:      { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Good"      },
  needs_fix: { dot: "bg-amber-500",   pill: "bg-amber-50 text-amber-700 border-amber-200",       label: "Needs Fix" },
  broken:    { dot: "bg-red-500",     pill: "bg-red-50 text-red-700 border-red-200",             label: "Broken"    },
};

const FRAME_BORDER = {
  good:      "border-emerald-300",
  needs_fix: "border-amber-300",
  broken:    "border-red-300",
};

function PhoneShell({ src, isLoading, onExpand, frameW, screenH }) {
  return (
    <div
      className="relative overflow-hidden rounded-[24px] border-[3px] border-stone-300 bg-white shadow-lg"
      style={{ width: frameW, height: screenH + 44 }}
    >
      <div className="flex items-center justify-center bg-stone-100" style={{ height: 22 }}>
        <span className="h-2 w-2 rounded-full bg-stone-400" />
      </div>
      <div className="relative overflow-hidden bg-stone-100" style={{ height: screenH }}>
        {isLoading ? (
          <div className="shimmer h-full w-full" />
        ) : src ? (
          <>
            <img src={src} alt="Mobile screenshot" className="h-full w-full object-cover object-top" />
            <div onClick={onExpand}
              className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/0 opacity-0 transition-all hover:bg-black/30 hover:opacity-100">
              <span className="flex items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1 text-xs font-semibold text-stone-700 shadow">
                <FiMaximize2 size={10} /> Expand
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-stone-400">
            <FiSmartphone size={24} />
            <p className="text-xs">No screenshot</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center bg-stone-100" style={{ height: 22 }}>
        <span className="h-1 w-10 rounded-full bg-stone-300" />
      </div>
    </div>
  );
}

function BrowserShell({ src, isLoading, onExpand, label, width, status, frameW, screenH }) {
  const borderClass = status ? FRAME_BORDER[status] : "border-stone-200";
  return (
    <div
      className={`overflow-hidden rounded-xl border-2 bg-white shadow-glass transition-colors ${borderClass}`}
      style={{ width: frameW }}
    >
      <div className="flex items-center gap-1.5 border-b border-stone-100 bg-stone-50 px-2.5 py-1.5">
        <span className="h-2 w-2 rounded-full bg-red-400/80" />
        <span className="h-2 w-2 rounded-full bg-amber-400/80" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
        <div className="ml-1.5 flex flex-1 items-center gap-1 overflow-hidden rounded border border-stone-200 bg-white px-1.5 py-0.5 text-xs text-stone-400">
          <FiLock size={8} className="shrink-0" />
          <span className="truncate text-[10px]">example.com</span>
        </div>
      </div>
      <div className="relative bg-stone-50" style={{ height: screenH }}>
        {isLoading ? (
          <div className="shimmer h-full w-full" />
        ) : src ? (
          <>
            <img src={src} alt={`${label} screenshot`} className="h-full w-full object-cover object-top" />
            <div onClick={onExpand}
              className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/0 opacity-0 transition-all hover:bg-black/25 hover:opacity-100">
              <span className="flex items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1 text-xs font-semibold text-stone-700 shadow">
                <FiMaximize2 size={10} /> Expand
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-stone-400">
            <HiOutlineCamera size={26} />
            <p className="text-xs">No screenshot</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Lightbox rendered via portal into document.body ──────────────────────────
function Lightbox({ device, src, onClose }) {
  const d = device;

  // lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const content = d.isPhone ? (
    /* Phone: narrow shell, scrollable inside */
    <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
      {/* header */}
      <div className="flex w-full max-w-sm items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <FiSmartphone size={14} /> {d.label} — {d.width}px
        </span>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/30 transition-colors"
        >
          <FiX size={13} /> Close
        </button>
      </div>

      {/* phone shell — fixed 390px wide, scrollable screen */}
      <div
        className="flex flex-col overflow-hidden rounded-[40px] border-[5px] border-stone-300 bg-white shadow-2xl"
        style={{ width: 390 }}
      >
        {/* top notch bar */}
        <div className="flex shrink-0 items-center justify-center bg-stone-100" style={{ height: 32 }}>
          <span className="h-2.5 w-2.5 rounded-full bg-stone-400" />
        </div>
        {/* scrollable screen area — max 70vh */}
        <div
          className="overflow-y-auto scrollbar-thin bg-white"
          style={{ maxHeight: "calc(100vh - 180px)" }}
        >
          <img src={src} alt="Mobile full screenshot" style={{ width: "100%", display: "block" }} />
        </div>
        {/* bottom bar */}
        <div className="flex shrink-0 items-center justify-center bg-stone-100" style={{ height: 32 }}>
          <span className="h-1.5 w-14 rounded-full bg-stone-300" />
        </div>
      </div>
    </div>
  ) : (
    /* Desktop / tablet / laptop: wide panel */
    <div
      className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-surface-body">
          <d.Icon size={15} /> {d.label}
        </span>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-stone-50 px-3 py-1 text-sm text-surface-label hover:text-surface-body transition-colors"
        >
          <FiX size={13} /> Close
        </button>
      </div>
      <div className="overflow-y-auto scrollbar-thin">
        <img src={src} alt={`${d.label} full screenshot`} className="w-full" />
      </div>
    </div>
  );

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.75)",
        padding: "24px",
      }}
      onClick={onClose}
    >
      {content}
    </div>,
    document.body
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ScreenshotViewer({ screenshots, deviceStatus, isLoading, onSaveToDrive }) {
  const [lightbox, setLightbox] = useState(null);
  
  // Prepare dynamic device list from deviceStatus
  const devices = (deviceStatus || []).map(ds => {
    const ui = CATEGORY_UI[ds.category] || DEFAULT_UI;
    return {
      key: ds.device,
      label: ds.device_name || ds.device,
      width: ds.width,
      status: ds.status,
      issue_count: ds.issue_count,
      probes: ds.probes,
      ...ui
    };
  });

  const lightboxDevice = lightbox ? devices.find((x) => x.key === lightbox) : null;

  return (
    <>
      <div className="glass rounded-2xl border border-surface-border shadow-glass">
        <div className="overflow-x-auto scrollbar-thin p-5 pb-4">
          <div className="flex gap-6 items-end" style={{ minWidth: "max-content" }}>
            {devices.map(({ key, label, width, Icon, frameW, screenH, isPhone, status, issue_count, probes }) => {
              const src = screenshots?.[key];
              const statusCfg = status ? STATUS_STYLE[status] : null;

              return (
                <div key={key} className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-1.5 self-start">
                    <Icon size={12} className="text-surface-muted" />
                    <span className="text-xs font-semibold text-surface-body">{label}</span>
                    <span className="text-xs text-stone-400">{width}px</span>
                    {status && <span className={`h-1.5 w-1.5 rounded-full ${statusCfg?.dot}`} />}
                  </div>

                  {isPhone ? (
                    <PhoneShell
                      src={src} isLoading={isLoading} frameW={frameW} screenH={screenH}
                      onExpand={() => src && !isLoading && setLightbox(key)}
                    />
                  ) : (
                    <BrowserShell
                      src={src} isLoading={isLoading} frameW={frameW} screenH={screenH}
                      label={label} width={width} status={status}
                      onExpand={() => src && !isLoading && setLightbox(key)}
                    />
                  )}

                  {status && !isLoading && (
                    <div className="flex flex-col gap-1 self-start w-full">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {issue_count > 0 && (
                          <span className="text-[10px] font-bold text-red-500 uppercase tracking-tight">
                            {issue_count} issue{issue_count !== 1 ? "s" : ""}
                          </span>
                        )}
                        {probes?.overflow_count > 0 && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 uppercase">
                            ⚠️ Not Fit
                          </span>
                        )}
                      </div>
                      
                      <button 
                        onClick={() => src && onSaveToDrive?.(key)}
                        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white py-1.5 text-[10px] font-semibold text-stone-600 transition-all hover:bg-stone-50 hover:text-stone-800"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7.71 3.5L1.15 15l3.43 6 6.55-11.5M9.73 15L6.3 21h13.12l3.43-6M18.74 15L12.15 3.5h-6.85L11.88 15" />
                        </svg>
                        Save to Drive
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Portal lightbox — always renders at document.body level */}
      {lightbox && screenshots?.[lightbox] && lightboxDevice && (
        <Lightbox
          device={lightboxDevice}
          src={screenshots[lightbox]}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}
