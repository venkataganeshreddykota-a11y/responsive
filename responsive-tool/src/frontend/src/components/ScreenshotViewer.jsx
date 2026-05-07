import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FiCode, FiSmartphone, FiTablet, FiMonitor, FiMaximize2, FiX, FiLock } from "react-icons/fi";
import { MdLaptop } from "react-icons/md";
import { HiOutlineCamera } from "react-icons/hi2";
import { TbLiveView } from "react-icons/tb";
import LiveViewPanel from "./LiveViewPanel";

const CodeFixPanel = lazy(() => import("./CodeFixPanel"));

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
          <FiSmartphone size={14} /> {d.label} - {d.width}px
        </span>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/30 transition-colors"
        >
          <FiX size={13} /> Close
        </button>
      </div>

      {/* phone shell - fixed 390px wide, scrollable screen */}
      <div
        className="flex flex-col overflow-hidden rounded-[40px] border-[5px] border-stone-300 bg-white shadow-lg"
        style={{ width: 390 }}
      >
        {/* top notch bar */}
        <div className="flex shrink-0 items-center justify-center bg-stone-100" style={{ height: 32 }}>
          <span className="h-2.5 w-2.5 rounded-full bg-stone-400" />
        </div>
        {/* scrollable screen area - max 70vh */}
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
      className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-surface-border bg-white shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-surface-body">
          <d.Icon size={15} /> {d.label} - {d.width}px
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
export default function ScreenshotViewer({
  screenshots,
  deviceStatus,
  issues,
  issueGroups,
  advice,
  isLoading,
  activeUrl,
  onLiveDeviceChange,
  issueDetailsOpen,
  onToggleIssueDetails,
}) {
  const [lightbox, setLightbox]         = useState(null);
  const [viewMode, setViewMode]         = useState("live");
  const [codeFixOpen, setCodeFixOpen]   = useState(false);
  const [selectedLiveDevice, setSelectedLiveDevice] = useState(null);

  const statusMap = useMemo(
    () => Object.fromEntries((deviceStatus || []).map((d) => [d.device, d])),
    [deviceStatus]
  );
  const lightboxDevice = lightbox ? DEVICES.find((x) => x.key === lightbox) : null;

  useEffect(() => {
    if (activeUrl) setViewMode("live");
  }, [activeUrl, isLoading]);

  const handleLiveDeviceChange = useCallback((device) => {
    setSelectedLiveDevice(device);
    onLiveDeviceChange?.(device);
  }, [onLiveDeviceChange]);

  const openCodeFix = () => {
    setViewMode("live");
    setCodeFixOpen(true);
  };

  return (
    <>
      {/* Mode toggle row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex w-fit gap-1 rounded-lg border border-surface-border bg-white/60 p-1">
          <button
            onClick={() => setViewMode("live")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "live"
                ? "bg-accent-500 text-white shadow-sm"
                : "text-surface-muted hover:text-surface-body"
            }`}
          >
            <TbLiveView size={13} />
            Live View
          </button>
          <button
            onClick={() => setViewMode("screenshots")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "screenshots"
                ? "bg-accent-500 text-white shadow-sm"
                : "text-surface-muted hover:text-surface-body"
            }`}
          >
            <HiOutlineCamera size={13} />
            Screenshots
          </button>
          <button
            onClick={openCodeFix}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              codeFixOpen
                ? "bg-accent-500 text-white shadow-sm"
                : "text-surface-muted hover:text-surface-body"
            }`}
          >
            <FiCode size={13} />
            Code Fix
          </button>
        </div>
      </div>

      {viewMode === "live" ? (
        <LiveViewPanel
          url={activeUrl}
          deviceStatus={deviceStatus}
          screenshots={screenshots}
          issues={issues}
          issueGroups={issueGroups}
          advice={advice}
          isLoading={isLoading}
          onActiveDeviceChange={handleLiveDeviceChange}
          issueDetailsOpen={issueDetailsOpen}
          onToggleIssueDetails={onToggleIssueDetails}
        />
      ) : (
        <div className="panel">
          <div className="overflow-x-auto scrollbar-thin p-5 pb-4">
            <div className="flex gap-6 items-end" style={{ minWidth: "max-content" }}>
              {DEVICES.map(({ key, label, width, Icon, frameW, screenH, isPhone }) => {
                const src = screenshots?.[key];
                const ds  = statusMap[key];
                const statusCfg = ds ? STATUS_STYLE[ds.status] : null;

                return (
                  <div key={key} className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-1.5 self-start">
                      <Icon size={12} className="text-surface-muted" />
                      <span className="text-xs font-semibold text-surface-body">{label}</span>
                      <span className="text-xs text-stone-400">{width}px</span>
                      {ds && <span className={`h-1.5 w-1.5 rounded-full ${statusCfg?.dot}`} />}
                    </div>

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

                    {ds && !isLoading && (
                      <div className="flex flex-wrap items-center gap-1.5 self-start">
                        {ds.issue_count > 0 && (
                          <span className="text-xs text-surface-muted">
                            {ds.issue_count} issue{ds.issue_count !== 1 ? "s" : ""}
                          </span>
                        )}
                        {ds.probes?.overflow_count > 0 && (
                          <span className="text-xs text-stone-400">{ds.probes.overflow_count} overflow</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {lightbox && screenshots?.[lightbox] && lightboxDevice && (
        <Lightbox
          device={lightboxDevice}
          src={screenshots[lightbox]}
          onClose={() => setLightbox(null)}
        />
      )}

      {codeFixOpen && (
        <Suspense fallback={null}>
          <CodeFixPanel
            open={codeFixOpen}
            onClose={() => setCodeFixOpen(false)}
            url={activeUrl}
            selectedDevice={selectedLiveDevice}
            issues={issues}
            issueGroups={issueGroups}
            deviceStatus={deviceStatus}
          />
        </Suspense>
      )}
    </>
  );
}


