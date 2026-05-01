import { useCallback, useState } from "react";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCamera,
  FiCode,
  FiCopy,
  FiEyeOff,
  FiGlobe,
  FiHome,
  FiMaximize2,
  FiMinimize2,
  FiMonitor,
  FiMove,
  FiRefreshCw,
  FiSmartphone,
  FiStar,
  FiTablet,
  FiUpload,
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
  const [scrollCommands, setScrollCommands] = useState({});
  const [hiddenDevices, setHiddenDevices] = useState({});
  const [expandedDevices, setExpandedDevices] = useState({});
  const [favorite, setFavorite] = useState(false);
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

  const scrollDevice = (key, position) => {
    bumpToken(setScrollCommands, key, { position });
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

  const toggleHidden = (key) => {
    setHiddenDevices((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleExpanded = (key) => {
    setExpandedDevices((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const reloadAll = () => {
    DEVICES.forEach((device) => reloadDevice(device.key));
  };

  const showAll = () => {
    setHiddenDevices({});
  };

  const downloadScreenshot = (device) => {
    const src = screenshots?.[device.statusKey];
    if (!src) {
      window.alert(`No ${device.label} screenshot is available yet. Run Analyse first, then try again.`);
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
      <div className="glass flex flex-col items-center gap-2 rounded-2xl border border-surface-border p-8 text-surface-muted shadow-glass">
        <FiMonitor size={28} className="opacity-30" />
        <p className="text-xs">Run a scan first to enable Live View.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#c8d3df] bg-[#dfe8f3] shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-[#c8d3df] bg-[#f4f8fc] px-3 text-[#243247]">
        <ToolbarButton title="Browser back" onClick={() => window.history.back()} icon={FiArrowLeft} />
        <ToolbarButton title="Browser forward" onClick={() => window.history.forward()} icon={FiArrowRight} />
        <ToolbarButton title="Reload all devices" onClick={reloadAll} icon={FiRefreshCw} />
        <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-full border border-[#d7e0ea] bg-white px-3 text-sm text-[#2f3b4f] shadow-sm">
          <FiGlobe size={14} className="shrink-0 text-[#66758a]" />
          <span className="truncate">{url}</span>
        </div>
        <ToolbarButton title="Copy URL" onClick={copyUrl} icon={FiCopy} />
        <ToolbarButton title="Open original site" onClick={openOriginal} icon={FiUpload} />
        <ToolbarButton title="Open proxied preview" onClick={openProxied} icon={FiCode} />
        <ToolbarButton title="Show all devices" onClick={showAll} icon={FiMonitor} />
        <ToolbarButton title={favorite ? "Remove favorite" : "Mark favorite"} onClick={() => setFavorite((v) => !v)} icon={FiStar} active={favorite} />
      </div>

      <div className="overflow-x-auto px-4 py-3 scrollbar-thin">
        <div className="flex min-w-max items-start gap-5">
          {DEVICES.map((device) => {
            const isHidden = hiddenDevices[device.key];
            const isExpanded = expandedDevices[device.key];
            const previewWidth = isExpanded ? Math.round(device.previewWidth * 1.3) : device.previewWidth;

            return (
            <div key={device.key} className="flex shrink-0 flex-col gap-1.5">
              <div className="flex h-5 items-center gap-1 text-[#172033]">
                <device.Icon size={13} className="text-[#6d7786]" />
                <span className="text-sm font-medium">{device.label}</span>
                <span className="text-xs text-[#778292]">{device.width}x{device.height}</span>
                <span className={`ml-1 h-1.5 w-1.5 rounded-full ${STATUS_DOT[statusMap[device.statusKey]?.status] || "bg-stone-400"}`} />
              </div>

              <div className="flex h-5 items-center justify-between text-[#344154]">
                <div className="flex items-center gap-2">
                  <ToolbarButton title={`Reload ${device.label}`} onClick={() => reloadDevice(device.key)} icon={FiRefreshCw} />
                  <ToolbarButton title={`Download ${device.label} screenshot`} onClick={() => downloadScreenshot(device)} icon={FiCamera} />
                  <ToolbarButton title="Copy URL" onClick={copyUrl} icon={FiCopy} />
                  <ToolbarButton title="Scroll to middle" onClick={() => scrollDevice(device.key, "middle")} icon={FiMove} />
                  <ToolbarButton title="Open proxied preview" onClick={openProxied} icon={FiCode} />
                </div>
                <div className="flex items-center gap-2">
                  <ToolbarButton title="Open original site in new tab" onClick={openOriginal} icon={FiUpload} />
                  <ToolbarButton title="Scroll to top" onClick={() => scrollDevice(device.key, "top")} icon={FiHome} />
                  <ToolbarButton title="Scroll to bottom" onClick={() => scrollDevice(device.key, "bottom")} icon={FiMonitor} />
                  <ToolbarButton title={isHidden ? "Show device" : "Hide device"} onClick={() => toggleHidden(device.key)} icon={FiEyeOff} />
                  <ToolbarButton title={isExpanded ? "Shrink preview" : "Enlarge preview"} onClick={() => toggleExpanded(device.key)} icon={isExpanded ? FiMinimize2 : FiMaximize2} />
                </div>
              </div>

              {isHidden ? (
                <button
                  type="button"
                  onClick={() => toggleHidden(device.key)}
                  className="flex h-32 items-center justify-center rounded border border-dashed border-[#9aa8ba] bg-[#edf3fa] text-xs font-medium text-[#526173] hover:bg-white"
                  style={{ width: previewWidth }}
                >
                  Show {device.label}
                </button>
              ) : (
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
                  scrollCommand={scrollCommands[device.key]}
                />
              )}
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
      className={`inline-flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-white/80 hover:text-accent-600 focus:outline-none focus:ring-1 focus:ring-accent-400 ${
        active ? "bg-white text-accent-600" : "text-[#344154]"
      }`}
    >
      <Icon size={12} />
    </button>
  );
}
