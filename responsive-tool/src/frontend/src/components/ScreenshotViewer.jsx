import { useState } from "react";
import { FiSmartphone, FiTablet, FiMonitor, FiMaximize2, FiX, FiLock } from "react-icons/fi";
import { MdLaptop } from "react-icons/md";
import { HiOutlineCamera } from "react-icons/hi2";

// Each device: frameW = visual column width, screenH = screenshot area height
const DEVICES = [
  { key: "mobile",  label: "Mobile",  width: 375,  Icon: FiSmartphone, frameW: 260,  screenH: 500, isPhone: true  },
  { key: "tablet",  label: "Tablet",  width: 768,  Icon: FiTablet,     frameW: 420,  screenH: 540, isPhone: false },
  { key: "laptop",  label: "Laptop",  width: 1280, Icon: MdLaptop,     frameW: 560,  screenH: 540, isPhone: false },
  { key: "desktop", label: "Desktop", width: 1440, Icon: FiMonitor,    frameW: 620,  screenH: 540, isPhone: false },
];

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

// Generic Android phone shell — rounded rect, camera dot, no notch
function PhoneShell({ src, isLoading, onExpand, frameW, screenH }) {
  const shellW = frameW;
  const shellH = screenH + 44; // top bar + screen

  return (
    <div
      className="relative overflow-hidden rounded-[24px] border-[3px] border-stone-300 bg-white shadow-lg"
      style={{ width: shellW, height: shellH }}
    >
      {/* Top bar — camera dot only */}
      <div className="flex items-center justify-center bg-stone-100" style={{ height: 22 }}>
        <span className="h-2 w-2 rounded-full bg-stone-400" />
      </div>
      {/* Screen */}
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
      {/* Bottom bar — thin indicator */}
      <div className="flex items-center justify-center bg-stone-100" style={{ height: 22 }}>
        <span className="h-1 w-10 rounded-full bg-stone-300" />
      </div>
    </div>
  );
}

// Browser chrome frame for tablet / laptop / desktop
function BrowserShell({ src, isLoading, onExpand, label, width, status, frameW, screenH }) {
  const borderClass = status ? FRAME_BORDER[status] : "border-stone-200";
  return (
    <div
      className={`overflow-hidden rounded-xl border-2 bg-white shadow-glass transition-colors ${borderClass}`}
      style={{ width: frameW }}
    >
      {/* Browser bar */}
      <div className="flex items-center gap-1.5 border-b border-stone-100 bg-stone-50 px-2.5 py-1.5">
        <span className="h-2 w-2 rounded-full bg-red-400/80" />
        <span className="h-2 w-2 rounded-full bg-amber-400/80" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
        <div className="ml-1.5 flex flex-1 items-center gap-1 overflow-hidden rounded border border-stone-200 bg-white px-1.5 py-0.5 text-xs text-stone-400">
          <FiLock size={8} className="shrink-0" />
          <span className="truncate text-[10px]">example.com</span>
        </div>
      </div>
      {/* Screenshot */}
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

export default function ScreenshotViewer({ screenshots, deviceStatus, isLoading }) {
  const [lightbox, setLightbox] = useState(null); // key of device to show in lightbox

  const statusMap = Object.fromEntries((deviceStatus || []).map((d) => [d.device, d]));

  return (
    <div className="glass rounded-2xl border border-surface-border shadow-glass">

      {/* Side-by-side scrollable viewport row */}
      <div className="overflow-x-auto scrollbar-thin p-5 pb-4">
        <div className="flex gap-6 items-end" style={{ minWidth: "max-content" }}>
          {DEVICES.map(({ key, label, width, Icon, frameW, screenH, isPhone }) => {
            const src = screenshots?.[key];
            const ds  = statusMap[key];
            const statusCfg = ds ? STATUS_STYLE[ds.status] : null;

            return (
              <div key={key} className="flex flex-col items-center gap-2">
                {/* Label above frame */}
                <div className="flex items-center gap-1.5 self-start">
                  <Icon size={12} className="text-surface-muted" />
                  <span className="text-xs font-semibold text-surface-body">{label}</span>
                  <span className="text-xs text-stone-400">{width}px</span>
                  {ds && (
                    <span className={`h-1.5 w-1.5 rounded-full ${statusCfg?.dot}`} />
                  )}
                </div>

                {/* Device frame */}
                {isPhone ? (
                  <PhoneShell
                    src={src} isLoading={isLoading} frameW={frameW} screenH={screenH}
                    onExpand={() => src && !isLoading && setLightbox(key)}
                  />
                ) : (
                  <BrowserShell
                    src={src} isLoading={isLoading} frameW={frameW} screenH={screenH}
                    label={label} width={width} status={ds?.status}
                    onExpand={() => src && !isLoading && setLightbox(key)}
                  />
                )}

                {/* Status footer below frame */}
                {ds && !isLoading && (
                  <div className="flex flex-wrap items-center gap-1.5 self-start">
                    <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusCfg?.pill}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusCfg?.dot}`} />
                      {statusCfg?.label}
                    </span>
                    {ds.issue_count > 0 && (
                      <span className="text-xs text-surface-muted">
                        {ds.issue_count} issue{ds.issue_count !== 1 ? "s" : ""}
                      </span>
                    )}
                    {ds.probes?.overflow_count > 0 && (
                      <span className="text-xs text-stone-400">{ds.probes.overflow_count} overflow</span>
                    )}
                    {ds.probes?.small_targets > 0 && (
                      <span className="text-xs text-stone-400">{ds.probes.small_targets} small targets</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && screenshots?.[lightbox] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in"
          onClick={() => setLightbox(null)}
          role="dialog" aria-modal="true"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const d = DEVICES.find((x) => x.key === lightbox);
              return (
                <>
                  <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
                    <span className="flex items-center gap-2 text-sm font-semibold text-surface-body">
                      {d && <d.Icon size={15} />}
                      {d?.label} — {d?.width}px
                    </span>
                    <button onClick={() => setLightbox(null)}
                      className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-stone-50 px-3 py-1 text-sm text-surface-label hover:text-surface-body transition-colors">
                      <FiX size={13} /> Close
                    </button>
                  </div>
                  <div className="overflow-y-auto scrollbar-thin">
                    <img src={screenshots[lightbox]} alt={`${d?.label} full screenshot`} className="w-full" />
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
