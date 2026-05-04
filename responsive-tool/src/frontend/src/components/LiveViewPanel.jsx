import { useCallback, useRef, useState } from "react";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCopy,
  FiDownload,
  FiExternalLink,
  FiGlobe,
  FiMaximize2,
  FiMinimize2,
  FiMonitor,
  FiRefreshCw,
  FiServer,
  FiSmartphone,
  FiStar,
  FiTablet,
} from "react-icons/fi";
import { MdLaptop } from "react-icons/md";
import DeviceFrame from "./DeviceFrame";

const PROXY_BASE =
  process.env.REACT_APP_PROXY_BASE || "/api/scanner/proxy/?url=";

const DEVICES = [
  { key: "mobile", statusKey: "mobile", label: "iPhone 12 Pro", width: 390, height: 844, previewWidth: 188, Icon: FiSmartphone },
  { key: "tablet", statusKey: "tablet", label: "iPad", width: 768, height: 1024, previewWidth: 370, Icon: FiTablet },
  { key: "laptop", statusKey: "laptop", label: "MacBook Pro", width: 1440, height: 900, previewWidth: 690, Icon: MdLaptop },
  { key: "plus", statusKey: "mobile", label: "iPhone 6/7/8 Plus", width: 414, height: 736, previewWidth: 200, Icon: FiSmartphone },
  { key: "pixel", statusKey: "mobile", label: "Pixel 9", width: 412, height: 915, previewWidth: 198, Icon: FiSmartphone },
];

const STATUS_DOT = {
  good: "bg-emerald-500",
  needs_fix: "bg-amber-500",
  broken: "bg-red-500",
};

export default function LiveViewPanel({ url, deviceStatus, screenshots }) {
  const [scrollSync, setScrollSync] = useState({ source: "", ratio: 0 });
  const [reloadTokens, setReloadTokens] = useState({});
  const [expandedDevices, setExpandedDevices] = useState({});
  const [favorite, setFavorite] = useState(false);
  const deviceStripRef = useRef(null);
  const statusMap = Object.fromEntries((deviceStatus || []).map((d) => [d.device, d]));

  const handleScrollSync = useCallback((source, ratio) => {
    setScrollSync({ source, ratio });
  }, []);

  const proxyUrl = useCallback((targetUrl) => `${PROXY_BASE}${encodeURIComponent(targetUrl)}`, []);

  const bumpToken = (setter, key, payload = {}) => {
    setter((prev) => ({ ...prev, [key]: { ...payload, id: Date.now() } }));
  };

  const reloadDevice = (key) => {
    bumpToken(setReloadTokens, key);
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (_) {
      window.prompt("Copy URL", url);
    }
  };

  const openOriginal = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openProxied = () => {
    window.open(proxyUrl(url), "_blank", "noopener,noreferrer");
  };

  const toggleExpanded = (key) => {
    setExpandedDevices((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const reloadAll = () => {
    DEVICES.forEach((device) => reloadDevice(device.key));
  };

  const handleDeviceStripWheel = (event) => {
    const strip = deviceStripRef.current;
    if (!strip) return;

    const shouldScrollSideways =
      event.shiftKey ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
      event.target.closest("[data-device-chrome]");

    if (!shouldScrollSideways) return;

    event.preventDefault();
    strip.scrollLeft += event.deltaX || event.deltaY;
  };

  const downloadScreenshot = (device) => {
    const src = screenshots?.[device.statusKey];
    if (!src) {
      window.alert(`No ${device.label} screenshot is available yet. Run Analyze first, then try again.`);
      return;
    }

    const href = src.startsWith("data:")
      ? src
      : `data:image/png;base64,${src}`;
    const safeLabel = device.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const link = document.createElement("a");
    link.href = href;
    link.download = `${safeLabel || device.key}-screenshot.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (!url) {
    return (
      <div className="panel flex flex-col items-center gap-2 p-8 text-surface-muted">
        <FiMonitor size={28} className="opacity-30" />
        <p className="text-xs">Run a scan first to enable Live View.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden overscroll-contain rounded-lg border border-surface-border bg-surface-border shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-surface-border bg-white/80 px-3 text-surface-body">
        <ToolbarButton title="Browser back" onClick={() => window.history.back()} icon={FiArrowLeft} />
        <ToolbarButton title="Browser forward" onClick={() => window.history.forward()} icon={FiArrowRight} />
        <ToolbarButton title="Reload all devices" onClick={reloadAll} icon={FiRefreshCw} />
        <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-full border border-surface-border bg-white px-3 text-sm text-surface-label shadow-sm">
          <FiGlobe size={14} className="shrink-0 text-surface-muted" />
          <span className="truncate">{url}</span>
        </div>
        <ToolbarButton title="Copy URL" onClick={copyUrl} icon={FiCopy} />
        <ToolbarButton title="Open original site" onClick={openOriginal} icon={FiExternalLink} />
        <ToolbarButton title="Open proxied preview" onClick={openProxied} icon={FiServer} />
        <ToolbarButton title={favorite ? "Remove favorite" : "Mark favorite"} onClick={() => setFavorite((v) => !v)} icon={FiStar} active={favorite} />
      </div>

      <div
        ref={deviceStripRef}
        data-live-view-scroll
        onWheel={handleDeviceStripWheel}
        className="overflow-x-auto overscroll-contain px-4 py-3 scrollbar-thin"
      >
        <div className="flex min-w-max items-start gap-5">
          {DEVICES.map((device) => {
            const isExpanded = expandedDevices[device.key];
            const previewWidth = isExpanded ? Math.round(device.previewWidth * 1.3) : device.previewWidth;

            return (
            <div key={device.key} className="flex shrink-0 flex-col gap-2">
              <div data-device-chrome className="flex h-6 items-center gap-1 text-surface-body">
                <device.Icon size={13} className="text-surface-muted" />
                <span className="text-sm font-medium">{device.label}</span>
                <span className="text-xs text-surface-muted">{device.width}x{device.height}</span>
                <span className={`ml-1 h-1.5 w-1.5 rounded-full ${STATUS_DOT[statusMap[device.statusKey]?.status] || "bg-stone-400"}`} />
              </div>

              <div data-device-chrome className="flex h-8 items-center justify-between gap-3 rounded-md border border-surface-border bg-white/85 px-1.5 text-surface-label shadow-sm">
                <div className="flex items-center gap-1">
                  <ToolbarButton title={`Reload ${device.label}`} onClick={() => reloadDevice(device.key)} icon={FiRefreshCw} />
                  <ToolbarButton title={`Download ${device.label} screenshot`} onClick={() => downloadScreenshot(device)} icon={FiDownload} />
                  <ToolbarButton title="Copy URL" onClick={copyUrl} icon={FiCopy} />
                </div>
                <div className="h-4 w-px bg-surface-border" />
                <div className="flex items-center gap-1">
                  <ToolbarButton title="Open original site in new tab" onClick={openOriginal} icon={FiExternalLink} />
                  <ToolbarButton title="Open proxied preview" onClick={openProxied} icon={FiServer} />
                  <ToolbarButton title={isExpanded ? "Shrink preview" : "Enlarge preview"} onClick={() => toggleExpanded(device.key)} icon={isExpanded ? FiMinimize2 : FiMaximize2} />
                </div>
              </div>

              <DeviceFrame
                key={`${device.key}-${url}`}
                url={url}
                deviceKey={device.key}
                deviceName={device.label}
                width={device.width}
                height={device.height}
                scale={previewWidth / device.width}
                syncSource={scrollSync.source}
                syncRatio={scrollSync.ratio}
                onScrollSync={handleScrollSync}
                status={statusMap[device.statusKey]}
                variant="workspace"
                reloadToken={reloadTokens[device.key]}
              />
            </div>
          );
          })}
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ title, onClick, icon: Icon, active = false }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-accent-50 hover:text-accent-600 focus:outline-none focus:ring-1 focus:ring-accent-400 ${
        active ? "bg-accent-50 text-accent-600" : "text-surface-label"
      }`}
    >
      <Icon size={13} />
    </button>
  );
}
