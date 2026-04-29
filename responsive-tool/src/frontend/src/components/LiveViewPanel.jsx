import { useState } from "react";
import { FiSmartphone, FiTablet, FiMonitor } from "react-icons/fi";
import { MdLaptop } from "react-icons/md";
import DeviceFrame from "./DeviceFrame";

// Container width the frame must fit inside (CSS px)
const CONTAINER_WIDTH = 640;
// Visible height of the preview area (CSS px)
const CONTAINER_HEIGHT = 520;

const DEVICES = [
  { key: "mobile",  label: "Mobile",  width: 375,  height: 812,  Icon: FiSmartphone },
  { key: "tablet",  label: "Tablet",  width: 768,  height: 1024, Icon: FiTablet     },
  { key: "laptop",  label: "Laptop",  width: 1280, height: 800,  Icon: MdLaptop     },
  { key: "desktop", label: "Desktop", width: 1440, height: 900,  Icon: FiMonitor    },
];

/**
 * LiveViewPanel — device-picker shell that renders a DeviceFrame for the
 * selected breakpoint, proxied through Django to bypass X-Frame-Options.
 */
export default function LiveViewPanel({ url }) {
  const [activeDevice, setActiveDevice] = useState("mobile");
  const device = DEVICES.find((d) => d.key === activeDevice);

  // Derive scale so the frame fits within CONTAINER_WIDTH
  const scale = CONTAINER_WIDTH / device.width;

  if (!url) {
    return (
      <div className="glass rounded-2xl border border-surface-border p-8 shadow-glass flex flex-col items-center gap-2 text-surface-muted">
        <FiMonitor size={28} className="opacity-30" />
        <p className="text-xs">Run a scan first to enable Live View.</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl border border-surface-border shadow-glass">
      {/* Device picker tabs */}
      <div className="flex border-b border-surface-border bg-white/40 rounded-t-2xl overflow-hidden">
        {DEVICES.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveDevice(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              activeDevice === key
                ? "border-b-2 border-accent-500 text-accent-600 bg-white/60"
                : "text-surface-muted hover:text-surface-body"
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Frame area */}
      <div className="flex justify-center p-5 overflow-x-auto scrollbar-thin">
        <DeviceFrame
          key={`${activeDevice}-${url}`}  // remount on device or URL change
          url={url}
          deviceName={device.label}
          width={device.width}
          height={device.height}
          scale={scale}
        />
      </div>

      <p className="px-5 pb-3 text-center text-xs text-surface-muted">
        Live preview is proxied — some sites may block or render differently.
      </p>
    </div>
  );
}
