import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiChevronDown,
  FiCopy,
  FiDownload,
  FiExternalLink,
  FiFileText,
  FiGlobe,
  FiGrid,
  FiMonitor,
  FiPlus,
  FiRefreshCw,
  FiRotateCw,
  FiSmartphone,
  FiStar,
  FiTablet,
  FiX,
} from "react-icons/fi";
import { SiGoogledrive } from "react-icons/si";
import { MdLaptop } from "react-icons/md";
import DeviceFrame from "./DeviceFrame";
import api from "../api/axios";
import { createXlsxBlob, downloadBlob, makeRow } from "../utils/xlsxReport";

const PRESET_GROUPS = [
  {
    group: "Mobile",
    Icon: FiSmartphone,
    devices: [
      { key: "iphone-se", label: "iPhone SE", width: 375, height: 667, previewWidth: 170, statusKey: "mobile", Icon: FiSmartphone },
      { key: "iphone-12-pro", label: "iPhone 12 Pro", width: 390, height: 844, previewWidth: 188, statusKey: "mobile", Icon: FiSmartphone },
      { key: "iphone-15", label: "iPhone 15", width: 393, height: 852, previewWidth: 188, statusKey: "mobile", Icon: FiSmartphone },
      { key: "iphone-plus", label: "iPhone 6/7/8 Plus", width: 414, height: 736, previewWidth: 196, statusKey: "mobile", Icon: FiSmartphone },
      { key: "iphone-15-pro-max", label: "iPhone 15 Pro Max", width: 430, height: 932, previewWidth: 202, statusKey: "mobile", Icon: FiSmartphone },
      { key: "pixel-7", label: "Pixel 7", width: 412, height: 915, previewWidth: 196, statusKey: "mobile", Icon: FiSmartphone },
      { key: "pixel-9", label: "Pixel 9", width: 412, height: 915, previewWidth: 196, statusKey: "mobile", Icon: FiSmartphone },
      { key: "galaxy-s22", label: "Galaxy S22", width: 360, height: 780, previewWidth: 168, statusKey: "mobile", Icon: FiSmartphone },
      { key: "galaxy-s24-ultra", label: "Galaxy S24 Ultra", width: 384, height: 854, previewWidth: 184, statusKey: "mobile", Icon: FiSmartphone },
      { key: "oneplus-11", label: "OnePlus 11", width: 412, height: 919, previewWidth: 196, statusKey: "mobile", Icon: FiSmartphone },
    ],
  },
  {
    group: "Tablet",
    Icon: FiTablet,
    devices: [
      { key: "ipad-mini", label: "iPad Mini", width: 768, height: 1024, previewWidth: 330, statusKey: "tablet", Icon: FiTablet },
      { key: "ipad", label: "iPad", width: 768, height: 1024, previewWidth: 330, statusKey: "tablet", Icon: FiTablet },
      { key: "ipad-air", label: "iPad Air", width: 820, height: 1180, previewWidth: 350, statusKey: "tablet", Icon: FiTablet },
      { key: "ipad-pro-11", label: "iPad Pro 11", width: 834, height: 1194, previewWidth: 360, statusKey: "tablet", Icon: FiTablet },
      { key: "ipad-pro-13", label: "iPad Pro 13", width: 1024, height: 1366, previewWidth: 400, statusKey: "tablet", Icon: FiTablet },
      { key: "galaxy-tab-s9", label: "Galaxy Tab S9", width: 800, height: 1280, previewWidth: 345, statusKey: "tablet", Icon: FiTablet },
      { key: "surface-duo", label: "Surface Duo", width: 540, height: 720, previewWidth: 265, statusKey: "tablet", Icon: FiTablet },
    ],
  },
  {
    group: "Laptop",
    Icon: MdLaptop,
    devices: [
      { key: "macbook-air", label: "MacBook Air", width: 1280, height: 832, previewWidth: 540, statusKey: "laptop", Icon: MdLaptop },
      { key: "macbook-pro", label: "MacBook Pro", width: 1440, height: 900, previewWidth: 610, statusKey: "laptop", Icon: MdLaptop },
      { key: "surface-laptop", label: "Surface Laptop", width: 1504, height: 1003, previewWidth: 610, statusKey: "laptop", Icon: MdLaptop },
      { key: "chromebook", label: "Chromebook", width: 1366, height: 768, previewWidth: 560, statusKey: "laptop", Icon: MdLaptop },
      { key: "hd-laptop", label: "HD Laptop", width: 1536, height: 864, previewWidth: 620, statusKey: "laptop", Icon: MdLaptop },
    ],
  },
  {
    group: "Desktop",
    Icon: FiMonitor,
    devices: [
      { key: "desktop-1280", label: "Desktop 1280", width: 1280, height: 720, previewWidth: 560, statusKey: "desktop", Icon: FiMonitor },
      { key: "desktop-1440", label: "Desktop 1440", width: 1440, height: 900, previewWidth: 610, statusKey: "desktop", Icon: FiMonitor },
      { key: "desktop-1600", label: "Desktop 1600", width: 1600, height: 900, previewWidth: 650, statusKey: "desktop", Icon: FiMonitor },
      { key: "desktop-1080p", label: "Desktop 1080p", width: 1920, height: 1080, previewWidth: 700, statusKey: "desktop", Icon: FiMonitor },
      { key: "desktop-2k", label: "Desktop 2K", width: 2560, height: 1440, previewWidth: 760, statusKey: "desktop", Icon: FiMonitor },
      { key: "desktop-4k", label: "Desktop 4K", width: 3840, height: 2160, previewWidth: 820, statusKey: "desktop", Icon: FiMonitor },
    ],
  },
];

const DEFAULT_SELECTED = ["iphone-12-pro", "ipad", "macbook-pro", "iphone-plus", "pixel-9"];

const STATUS_DOT = {
  good: "bg-emerald-500",
  needs_fix: "bg-amber-500",
  broken: "bg-red-500",
};

const STATUS_RING = {
  good: "ring-emerald-300/80",
  needs_fix: "ring-amber-300/80",
  broken: "ring-red-300/80",
};

const DEVICE_MAP = PRESET_GROUPS.flatMap((group) => group.devices).reduce((acc, device) => {
  acc[device.key] = device;
  return acc;
}, {});

const emptyCustomDevice = {
  label: "",
  width: 390,
  height: 844,
  orientation: "portrait",
};

const DEVICE_CARD_GAP = 16;
const VIRTUAL_OVERSCAN_PX = 360;

const DEVICE_CATEGORY_LABEL = {
  mobile: "Mobile",
  tablet: "Tablet",
  laptop: "Laptop",
  desktop: "Desktop",
};

function getModalScale(device) {
  if (typeof window === "undefined") return 1;
  const maxWidth = Math.max(280, window.innerWidth - 120);
  const maxHeight = Math.max(360, window.innerHeight * 0.94 - 92);
  return Math.min(1, maxWidth / device.width, maxHeight / device.height);
}

function formatResolution(device) {
  return `${device.width}\u00d7${device.height}`;
}

function getPreviewWidth(device) {
  return Number(device?.previewWidth) || Math.min(620, Math.max(180, Number(device?.width || 390) * 0.42));
}

function getCardWidth(device, previewWidth = getPreviewWidth(device)) {
  return Math.ceil(Math.max(220, previewWidth + 16));
}

function staticPreviewSrc(src) {
  if (!src) return "";
  return src.startsWith("data:") ? src : `data:image/png;base64,${src}`;
}

function issueMatchesCategory(issue, statusKey) {
  const label = DEVICE_CATEGORY_LABEL[statusKey];
  if (!label || !issue) return false;
  const deviceText = String(issue.device || "");
  const searchable = `${issue.title || ""} ${issue.description || ""}`.toLowerCase();

  return deviceText
    .split(",")
    .some((part) => part.trim().toLowerCase() === label.toLowerCase()) ||
    searchable.includes(statusKey.toLowerCase()) ||
    searchable.includes(label.toLowerCase());
}

function flattenIssues(issues, issueGroups) {
  if (issues?.length) return issues;
  return (issueGroups || []).flatMap((group) => group.issues || []);
}

function issueKindText(deviceStatus, categoryIssues) {
  const probes = deviceStatus?.probes || {};
  const kinds = [];
  if (probes.overflow_count > 0 || categoryIssues.some((issue) => /overflow/i.test(`${issue.title} ${issue.description}`))) {
    kinds.push("overflow");
  }
  if (categoryIssues.some((issue) => /font|text|typography|scal/i.test(`${issue.title} ${issue.description}`))) {
    kinds.push("font scaling");
  }
  if (categoryIssues.some((issue) => /image|container|width|height/i.test(`${issue.title} ${issue.description}`))) {
    kinds.push("width/height constraints");
  }
  if (categoryIssues.some((issue) => /touch|overlap|responsive|viewport|layout/i.test(`${issue.title} ${issue.description}`))) {
    kinds.push("responsive layout");
  }
  if (deviceStatus?.status === "broken") kinds.push("broken UI");
  return [...new Set(kinds)];
}

function fixSuggestionForDevice(device, deviceStatus, categoryIssues, advice) {
  const statusKey = device.statusKey;
  const categoryAdvice = (advice || []).filter((item) => item.device === statusKey);
  const kinds = issueKindText(deviceStatus, categoryIssues);

  if (!categoryIssues.length && !categoryAdvice.length && (!deviceStatus || deviceStatus.status === "good")) {
    return "No layout issues detected for this device category.";
  }

  const suggested = [];
  categoryIssues.slice(0, 2).forEach((issue) => {
    const detail = issue.description || issue.title;
    if (detail) suggested.push(detail);
  });
  categoryAdvice.slice(0, 2).forEach((item) => {
    const detail = item.tip || item.detail || item.css_hint;
    if (detail) suggested.push(detail);
  });

  if (kinds.includes("overflow")) {
    suggested.push("Use media queries and set max-width: 100% on wide containers/images to prevent horizontal overflow.");
  }
  if (kinds.includes("font scaling")) {
    suggested.push("Optimize font sizes and line-height for this breakpoint so text remains readable without clipping.");
  }
  if (kinds.includes("width/height constraints")) {
    suggested.push("Fix width/height constraints with fluid sizing, min/max bounds, and responsive image rules.");
  }
  if (kinds.includes("responsive layout") || kinds.includes("broken UI")) {
    suggested.push("Adjust flex/grid wrapping and spacing for this resolution, then recheck in Live View.");
  }

  if (!suggested.length) {
    suggested.push(`Review layout at ${formatResolution(device)} and add targeted media queries if elements do not fit.`);
  }

  return [...new Set(suggested)].join(" ");
}

function hasDeviceStatusIssues(deviceStatus) {
  const probes = deviceStatus?.probes || {};
  return Boolean(
    deviceStatus?.status === "needs_fix" ||
    deviceStatus?.status === "broken" ||
    deviceStatus?.issue_count > 0 ||
    probes.overflow_count > 0 ||
    probes.img_overflow_count > 0 ||
    probes.small_targets > 0 ||
    probes.invisible_blocks > 0 ||
    probes.overlapping_pairs > 0
  );
}

function buildDevicesReportRows({ url, deviceStatus, issues, issueGroups, advice }) {
  const flatIssues = flattenIssues(issues, issueGroups);
  const statusMap = Object.fromEntries((deviceStatus || []).map((item) => [item.device, item]));
  const rows = [
    makeRow([`URL: ${url || "Not available"}`, "", "", ""], "1"),
    makeRow([`Generated: ${new Date().toLocaleString()}`, "", "", ""], "5"),
    makeRow(["", "", "", ""], "0"),
  ];

  PRESET_GROUPS.forEach((group) => {
    rows.push(makeRow([`Section: ${group.group} Devices`, "", "", ""], "4"));
    rows.push(makeRow(["Device Name", "Resolution", "Issue Found", "Suggested Fix"], "3"));

    group.devices.forEach((device) => {
      const ds = statusMap[device.statusKey];
      const categoryIssues = flatIssues.filter((issue) => issueMatchesCategory(issue, device.statusKey));
      const categoryAdvice = (advice || []).filter((item) => item.device === device.statusKey);
      const issueFound = Boolean(
        categoryIssues.length ||
        categoryAdvice.some((item) => (item.issue_count || 0) > 0 || item.priority === "high" || item.priority === "medium") ||
        hasDeviceStatusIssues(ds)
      );

      rows.push(makeRow([
        device.label,
        formatResolution(device),
        issueFound ? "Yes" : "No",
        fixSuggestionForDevice(device, ds, categoryIssues, advice),
      ], "5", { height: 42 }));
    });

    rows.push(makeRow(["", "", "", ""], "0"));
  });

  return rows;
}

function safeReportFilename(url) {
  let host = "devices-report";
  try {
    host = new URL(url).hostname || host;
  } catch (_) {
    // Keep default name for incomplete URLs.
  }
  const safeHost = host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${safeHost || "devices-report"}-devices-report.xlsx`;
}

// ── Google Drive upload hook ──────────────────────────────────────────────────
function useDriveUpload() {
  const [driveConnected, setDriveConnected] = useState(false);
  // Per-device upload state: { [deviceKey]: { loading, status, link } }
  const [deviceDriveState, setDeviceDriveState] = useState({});
  // Global toast popup: null | { deviceLabel, link }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    api.get("/scanner/gdrive/status/")
      .then(({ data }) => setDriveConnected(data.connected))
      .catch(() => {});
  }, []);

  const showToast = (deviceLabel, link) => {
    clearTimeout(toastTimer.current);
    setToast({ deviceLabel, link });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const dismissToast = () => {
    clearTimeout(toastTimer.current);
    setToast(null);
  };

  const setDeviceState = (deviceKey, patch) => {
    setDeviceDriveState((prev) => ({
      ...prev,
      [deviceKey]: { ...(prev[deviceKey] || {}), ...patch },
    }));
  };

  const connect = () => {
    api.get("/scanner/gdrive/auth/")
      .then(({ data }) => {
        const popup = window.open(data.auth_url, "gdrive_oauth", "width=520,height=620");
        const handler = (event) => {
          if (event.data?.gdrive === "success") {
            setDriveConnected(true);
            window.removeEventListener("message", handler);
          } else if (event.data?.gdrive === "error") {
            window.removeEventListener("message", handler);
          }
        };
        window.addEventListener("message", handler);
        const timer = setInterval(() => {
          if (popup?.closed) {
            clearInterval(timer);
            window.removeEventListener("message", handler);
            api.get("/scanner/gdrive/status/")
              .then(({ data }) => setDriveConnected(data.connected))
              .catch(() => {});
          }
        }, 800);
      })
      .catch(() => {});
  };

  const upload = async (device, src) => {
    if (!src) {
      window.alert(`No ${device.label} screenshot is available yet. Wait for Live View to finish loading, then try again.`);
      return;
    }
    setDeviceState(device.key, { loading: true, status: null, link: "" });
    const safeLabel = device.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const filename  = `${safeLabel || device.key}-screenshot.png`;
    const image_b64 = src.startsWith("data:") ? src : `data:image/png;base64,${src}`;
    try {
      const { data } = await api.post("/scanner/gdrive/upload/", { image_b64, filename });
      const link = data.web_view_link || "";
      setDeviceState(device.key, { loading: false, status: "success", link });
      showToast(device.label, link);
    } catch (err) {
      if (err.response?.data?.auth_required) {
        setDriveConnected(false);
        setDeviceState(device.key, { loading: false, status: null });
        connect();
      } else {
        setDeviceState(device.key, { loading: false, status: "error" });
      }
    }
  };

  const getDeviceState = (deviceKey) => deviceDriveState[deviceKey] || { loading: false, status: null, link: "" };

  return { driveConnected, getDeviceState, toast, dismissToast, connect, upload };
}

export default function LiveViewPanel({
  url,
  deviceStatus,
  screenshots,
  issues,
  issueGroups,
  advice,
  isLoading,
  onActiveDeviceChange,
  issueDetailsOpen,
  onToggleIssueDetails,
}) {
  const [reloadTokens, setReloadTokens] = useState({});
  const [favorite, setFavorite] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [customDevices, setCustomDevices] = useState([]);
  const [customDevice, setCustomDevice] = useState(emptyCustomDevice);
  const [selectedKeys, setSelectedKeys] = useState(DEFAULT_SELECTED);
  const [activeKey, setActiveKey] = useState(DEFAULT_SELECTED[0]);
  const [modalDevice, setModalDevice] = useState(null);
  const [virtualRange, setVirtualRange] = useState({ start: 0, end: DEFAULT_SELECTED.length - 1 });
  const deviceStripRef = useRef(null);
  const deviceFrameRefs = useRef({});
  const virtualRafRef = useRef(null);
  const initialPublishRef = useRef(false);
  const statusMap = useMemo(
    () => Object.fromEntries((deviceStatus || []).map((d) => [d.device, d])),
    [deviceStatus]
  );
  const { driveConnected, getDeviceState, toast, dismissToast, connect: driveConnect, upload: driveUpload } = useDriveUpload();

  const allDevices = useMemo(
    () => ({
      ...DEVICE_MAP,
      ...customDevices.reduce((acc, device) => {
        acc[device.key] = device;
        return acc;
      }, {}),
    }),
    [customDevices]
  );

  const selectedDevices = useMemo(
    () => selectedKeys.map((key) => allDevices[key]).filter(Boolean),
    [allDevices, selectedKeys]
  );

  const groupedDevices = useMemo(
    () => [
      ...PRESET_GROUPS,
      ...(customDevices.length ? [{ group: "Custom", Icon: FiGrid, devices: customDevices }] : []),
    ],
    [customDevices]
  );

  const publishActiveDevice = useCallback((device) => {
    if (!device) return;
    setActiveKey(device.key);
    onActiveDeviceChange?.({
      key: device.key,
      statusKey: device.statusKey,
      label: device.label,
      width: device.width,
      height: device.height,
    });
  }, [onActiveDeviceChange]);

  useEffect(() => {
    if (!selectedDevices.length) return;
    if (!initialPublishRef.current || !selectedKeys.includes(activeKey)) {
      initialPublishRef.current = true;
      publishActiveDevice(selectedDevices[0]);
    }
  }, [activeKey, publishActiveDevice, selectedDevices, selectedKeys]);

  useEffect(() => {
    const strip = deviceStripRef.current;
    if (!strip) return undefined;

    const updateVirtualRange = () => {
      virtualRafRef.current = null;
      const viewStart = Math.max(0, strip.scrollLeft - VIRTUAL_OVERSCAN_PX);
      const viewEnd = strip.scrollLeft + strip.clientWidth + VIRTUAL_OVERSCAN_PX;
      let cursor = 0;
      let start = 0;
      let end = selectedDevices.length - 1;

      for (let index = 0; index < selectedDevices.length; index += 1) {
        const width = getCardWidth(selectedDevices[index]);
        const itemEnd = cursor + width;
        if (itemEnd >= viewStart) {
          start = index;
          break;
        }
        cursor += width + DEVICE_CARD_GAP;
      }

      cursor = 0;
      for (let index = 0; index < selectedDevices.length; index += 1) {
        const width = getCardWidth(selectedDevices[index]);
        const itemStart = cursor;
        const itemEnd = cursor + width;
        if (itemStart <= viewEnd) end = index;
        if (itemStart > viewEnd) break;
        cursor += width + DEVICE_CARD_GAP;
      }

      setVirtualRange((prev) => (
        prev.start === start && prev.end === end ? prev : { start, end }
      ));
    };

    const scheduleVirtualRange = () => {
      if (virtualRafRef.current) return;
      virtualRafRef.current = window.requestAnimationFrame(updateVirtualRange);
    };

    scheduleVirtualRange();
    strip.addEventListener("scroll", scheduleVirtualRange, { passive: true });
    window.addEventListener("resize", scheduleVirtualRange);

    let resizeObserver;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleVirtualRange);
      resizeObserver.observe(strip);
    }

    return () => {
      strip.removeEventListener("scroll", scheduleVirtualRange);
      window.removeEventListener("resize", scheduleVirtualRange);
      resizeObserver?.disconnect();
      if (virtualRafRef.current) {
        window.cancelAnimationFrame(virtualRafRef.current);
        virtualRafRef.current = null;
      }
    };
  }, [selectedDevices]);

  useEffect(() => {
    if (!modalDevice) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setModalDevice(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalDevice]);

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

  const openPreviewModal = (device) => {
    publishActiveDevice(device);
    setModalDevice(device);
  };

  const reloadAll = () => {
    selectedDevices.forEach((device) => reloadDevice(device.key));
  };

  const handleDeviceStripWheel = useCallback((event) => {
    const strip = deviceStripRef.current;
    if (!strip) return;

    const shouldScrollSideways =
      event.shiftKey ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
      event.target.closest("[data-device-chrome]");

    if (!shouldScrollSideways) return;

    event.preventDefault();
    strip.scrollLeft += event.deltaX || event.deltaY;
  }, []);

  const toggleDevice = (key) => {
    setSelectedKeys((prev) => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter((item) => item !== key) : prev;
      }
      return [...prev, key];
    });
    publishActiveDevice(allDevices[key]);
  };

  const addCustomDevice = (event) => {
    event.preventDefault();
    const baseWidth = Number(customDevice.width) || 390;
    const baseHeight = Number(customDevice.height) || 844;
    const isLandscape = customDevice.orientation === "landscape";
    const width = isLandscape ? Math.max(baseWidth, baseHeight) : Math.min(baseWidth, baseHeight);
    const height = isLandscape ? Math.min(baseWidth, baseHeight) : Math.max(baseWidth, baseHeight);
    const key = `custom-${Date.now()}`;
    const device = {
      key,
      label: customDevice.label.trim() || "Custom Screen",
      width,
      height,
      previewWidth: Math.min(620, Math.max(180, width <= 480 ? width * 0.48 : width * 0.42)),
      statusKey: width < 640 ? "mobile" : width < 1024 ? "tablet" : width < 1500 ? "laptop" : "desktop",
      Icon: width < 640 ? FiSmartphone : width < 1024 ? FiTablet : width < 1500 ? MdLaptop : FiMonitor,
      custom: true,
    };

    setCustomDevices((prev) => [...prev, device]);
    setSelectedKeys((prev) => [...prev, key]);
    publishActiveDevice(device);
    setCustomDevice(emptyCustomDevice);
  };

  const removeCustomDevice = (key) => {
    setCustomDevices((prev) => prev.filter((device) => device.key !== key));
    setSelectedKeys((prev) => {
      const next = prev.filter((item) => item !== key);
      return next.length ? next : DEFAULT_SELECTED;
    });
  };

  const setDeviceFrameRef = useCallback((key) => (instance) => {
    if (instance) {
      deviceFrameRefs.current[key] = instance;
      return;
    }
    delete deviceFrameRefs.current[key];
  }, []);

  const getCurrentScreenshotSrc = useCallback((device) => {
    const liveSrc = deviceFrameRefs.current[device.key]?.capturePng?.();
    return liveSrc || screenshots?.[device.statusKey] || "";
  }, [screenshots]);

  const downloadScreenshot = (device) => {
    const src = getCurrentScreenshotSrc(device);
    if (!src) {
      window.alert(`No ${device.label} screenshot is available yet. Wait for Live View to finish loading, then try again.`);
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

  const uploadCurrentScreenshot = (device) => {
    driveUpload(device, getCurrentScreenshotSrc(device));
  };

  const downloadDevicesReport = () => {
    const rows = buildDevicesReportRows({
      url,
      deviceStatus,
      issues,
      issueGroups,
      advice,
    });
    downloadBlob(createXlsxBlob(rows), safeReportFilename(url));
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
    <div className="overflow-hidden rounded-lg border border-surface-border bg-gradient-to-br from-white via-stone-50 to-orange-50/40 shadow-glass">
      {/* Drive "Saved" toast popup */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[10000] flex items-start gap-3 rounded-xl border border-green-200 bg-white px-4 py-3 shadow-lg animate-fade-in"
          style={{ minWidth: 280, maxWidth: 360 }}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <SiGoogledrive size={16} style={{ color: "currentColor", filter: "grayscale(1)" }} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-surface-body">Saved to Drive</p>
            <p className="mt-0.5 truncate text-xs text-surface-muted">{toast.deviceLabel} screenshot uploaded</p>
            {toast.link && (
              <a
                href={toast.link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
              >
                Open in Drive
                <FiExternalLink size={10} />
              </a>
            )}
          </div>
          <button
            onClick={dismissToast}
            className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-surface-muted hover:bg-stone-100 hover:text-surface-body transition-colors"
            aria-label="Dismiss"
          >
            <FiX size={12} />
          </button>
        </div>
      )}
      {isLoading && (
        <div className="flex items-center gap-2 border-b border-accent-100 bg-accent-50/70 px-4 py-2 text-xs font-semibold text-accent-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent-500" />
          Preparing Live View devices
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/80">
            <span className="block h-full w-1/2 animate-shimmer-bar rounded-full bg-accent-300" />
          </span>
        </div>
      )}
      <div className="border-b border-surface-border bg-white/95 px-3 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ToolbarButton title="Browser back" onClick={() => window.history.back()} icon={FiArrowLeft} />
            <ToolbarButton title="Browser forward" onClick={() => window.history.forward()} icon={FiArrowRight} />
            <ToolbarButton title="Reload selected devices" onClick={reloadAll} icon={FiRefreshCw} />
            <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full border border-surface-border bg-white px-3 text-sm text-surface-label shadow-sm">
              <FiGlobe size={14} className="shrink-0 text-surface-muted" />
              <span className="truncate">{url}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectorOpen((open) => !open)}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-accent-200 bg-accent-50 px-3 text-xs font-semibold text-accent-700 shadow-sm transition hover:border-accent-300 hover:bg-accent-100 focus:outline-none focus:ring-2 focus:ring-accent-400/30"
            >
              <FiPlus size={13} />
              Add Screen
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-accent-600 shadow-sm">{selectedKeys.length}</span>
              <FiChevronDown size={12} className={`transition ${selectorOpen ? "rotate-180" : ""}`} />
            </button>
            <ToolbarButton title="Copy URL" onClick={copyUrl} icon={FiCopy} />
            <ToolbarButton title="Open original site" onClick={openOriginal} icon={FiExternalLink} />
            <button
              type="button"
              onClick={downloadDevicesReport}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-surface-border bg-white px-3 text-xs font-semibold text-surface-label shadow-sm transition hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-400/30"
              title="Download Devices Report as Excel"
            >
              <FiFileText size={13} />
              Devices Report
            </button>
            <ToolbarButton title={favorite ? "Remove favorite" : "Mark favorite"} onClick={() => setFavorite((v) => !v)} icon={FiStar} active={favorite} />
          </div>
        </div>

        {selectorOpen && (
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="max-h-72 overflow-y-auto rounded-lg border border-surface-border bg-white/90 p-2 shadow-sm scrollbar-thin">
              {groupedDevices.map(({ group, Icon, devices }) => (
                <section key={group} className="mb-3 last:mb-0">
                  <div className="sticky top-0 z-10 mb-2 flex items-center gap-2 border-b border-surface-border bg-white/95 px-1 py-1.5 text-[10px] font-bold uppercase text-surface-muted">
                    <Icon size={12} />
                    {group}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {devices.map((device) => {
                      const active = selectedKeys.includes(device.key);
                      const ds = statusMap[device.statusKey];
                      return (
                        <button
                          key={device.key}
                          type="button"
                          onClick={() => toggleDevice(device.key)}
                          className={`group relative flex min-h-[68px] items-start gap-2 rounded-lg border p-2.5 text-left transition hover:-translate-y-0.5 hover:border-accent-200 hover:bg-accent-50/50 hover:shadow-sm ${
                            active ? "border-accent-300 bg-accent-50 shadow-sm" : "border-surface-border bg-white"
                          }`}
                        >
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                            active ? "border-accent-200 bg-white text-accent-600" : "border-stone-200 bg-stone-50 text-surface-muted"
                          }`}>
                            <device.Icon size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-semibold text-surface-body">{device.label}</span>
                              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[ds?.status] || "bg-stone-300"}`} />
                            </span>
                            <span className="mt-1 block text-[11px] text-surface-muted">{device.width}x{device.height}</span>
                            {device.custom && (
                              <span
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeCustomDevice(device.key);
                                }}
                                className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-red-500 hover:text-red-600"
                              >
                                <FiX size={10} /> Remove
                              </span>
                            )}
                          </span>
                          {active && (
                            <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent-500 text-white">
                              <FiCheck size={10} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <form onSubmit={addCustomDevice} className="rounded-lg border border-surface-border bg-white/90 p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-surface-body">Custom Screen</p>
                  <p className="text-[11px] text-surface-muted">Name it, size it, preview it live.</p>
                </div>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
                  <FiGrid size={15} />
                </span>
              </div>
              <label className="mb-2 block text-[11px] font-semibold text-surface-label">
                Device name
                <input
                  type="text"
                  value={customDevice.label}
                  onChange={(event) => setCustomDevice((prev) => ({ ...prev, label: event.target.value }))}
                  placeholder="Client kiosk"
                  className="mt-1 h-9 w-full rounded-lg border border-surface-border bg-white px-3 text-xs outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20"
                />
              </label>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <label className="text-[11px] font-semibold text-surface-label">
                  Width
                  <input
                    type="number"
                    min="240"
                    max="5120"
                    value={customDevice.width}
                    onChange={(event) => setCustomDevice((prev) => ({ ...prev, width: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-lg border border-surface-border bg-white px-3 text-xs outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20"
                  />
                </label>
                <label className="text-[11px] font-semibold text-surface-label">
                  Height
                  <input
                    type="number"
                    min="240"
                    max="5120"
                    value={customDevice.height}
                    onChange={(event) => setCustomDevice((prev) => ({ ...prev, height: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-lg border border-surface-border bg-white px-3 text-xs outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-400/20"
                  />
                </label>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-stone-100 p-1">
                {["portrait", "landscape"].map((orientation) => (
                  <button
                    key={orientation}
                    type="button"
                    onClick={() => setCustomDevice((prev) => ({ ...prev, orientation }))}
                    className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-[11px] font-semibold capitalize transition ${
                      customDevice.orientation === orientation ? "bg-white text-accent-600 shadow-sm" : "text-surface-muted hover:text-surface-body"
                    }`}
                  >
                    <FiRotateCw size={11} />
                    {orientation}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-surface-body px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-black"
              >
                <FiPlus size={12} />
                Add Custom Screen
              </button>
            </form>
          </div>
        )}
      </div>

      <div
        ref={deviceStripRef}
        data-live-view-scroll
        onWheel={handleDeviceStripWheel}
        className="overflow-x-auto overscroll-contain px-4 py-4 scrollbar-thin"
      >
        <div className="flex min-w-max items-start gap-4">
          {selectedDevices.map((device, index) => {
            const isModal = modalDevice?.key === device.key;
            const modalScale = isModal ? getModalScale(device) : null;
            const previewWidth = isModal
              ? Math.round(device.width * modalScale)
              : getPreviewWidth(device);
            const cardWidth = getCardWidth(device, previewWidth);
            const isActivePreview = isModal || activeKey === device.key;
            const shouldMount = selectedDevices.length <= 8 || isActivePreview || (index >= virtualRange.start && index <= virtualRange.end);
            const ds = statusMap[device.statusKey];
            const screenshot = screenshots?.[device.statusKey];

            if (!shouldMount) {
              return (
                <div
                  key={device.key}
                  className="shrink-0"
                  style={{ width: cardWidth, height: Math.round(device.height * (previewWidth / device.width)) + 88 }}
                  aria-hidden="true"
                />
              );
            }

            return (
              <Fragment key={device.key}>
              {isModal && (
                <div
                  className="fixed inset-0 z-[9998] bg-black/55 animate-fade-in"
                  onClick={() => setModalDevice(null)}
                  onWheel={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                />
              )}
              <div
                key={device.key}
                onClick={() => publishActiveDevice(device)}
                onDoubleClick={() => openPreviewModal(device)}
                onWheel={(event) => {
                  if (isModal) event.stopPropagation();
                }}
                style={{ width: isModal ? previewWidth + 16 : cardWidth }}
                className={`flex shrink-0 cursor-pointer flex-col gap-2 rounded-lg bg-white/70 p-2 ring-1 transition-colors hover:bg-white/90 ${
                  isModal
                    ? "fixed left-1/2 top-1/2 z-[9999] max-h-[94vh] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-surface-border bg-white shadow-lg animate-slide-up"
                    : ""
                } ${
                  activeKey === device.key ? "ring-2 ring-accent-300" : STATUS_RING[ds?.status] || "ring-surface-border"
                }`}
              >
                <div data-device-chrome className="flex h-6 items-center gap-1.5 text-surface-body">
                  <device.Icon size={13} className="text-surface-muted" />
                  <span className="max-w-36 truncate text-sm font-semibold">{device.label}</span>
                  <span className="text-xs text-surface-muted">{device.width}x{device.height}</span>
                  {isModal && (
                    <span className="rounded-full border border-accent-200 bg-accent-50 px-2 py-0.5 text-[10px] font-semibold text-accent-700">
                      Expanded
                    </span>
                  )}
                  {!isModal && activeKey === device.key && onToggleIssueDetails && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        publishActiveDevice(device);
                        onToggleIssueDetails();
                      }}
                      className={`ml-1 inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[10px] font-semibold shadow-sm transition focus:outline-none focus:ring-1 focus:ring-accent-400/30 ${
                        issueDetailsOpen
                          ? "border-accent-300 bg-accent-50 text-accent-700 hover:bg-accent-100"
                          : "border-surface-border bg-white text-surface-label hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700"
                      }`}
                    >
                      <span>{issueDetailsOpen ? "Hide Details" : "View Details"}</span>
                      <FiChevronDown size={10} className={`transition-transform duration-200 ${issueDetailsOpen ? "rotate-180" : ""}`} />
                    </button>
                  )}
                  {isModal && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setModalDevice(null);
                      }}
                      className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-surface-border bg-white text-surface-label shadow-sm transition hover:bg-accent-50 hover:text-accent-700 focus:outline-none focus:ring-1 focus:ring-accent-400/30"
                      aria-label="Close expanded device preview"
                      title="Close"
                    >
                      <FiX size={13} />
                    </button>
                  )}
                  <span className={`ml-auto h-1.5 w-1.5 rounded-full ${STATUS_DOT[ds?.status] || "bg-stone-400"}`} />
                </div>

                <div data-device-chrome className="flex h-8 items-center justify-between gap-3 rounded-md border border-surface-border bg-white px-1.5 text-surface-label shadow-sm">
                  <div className="flex items-center gap-1">
                    <ToolbarButton title={`Reload ${device.label}`} onClick={() => reloadDevice(device.key)} icon={FiRefreshCw} />
                    <ToolbarButton title={`Download ${device.label} screenshot`} onClick={() => downloadScreenshot(device)} icon={FiDownload} />
                    <DriveButton
                      connected={driveConnected}
                      loading={getDeviceState(device.key).loading}
                      status={getDeviceState(device.key).status}
                      link={getDeviceState(device.key).link}
                      onConnect={driveConnect}
                      onUpload={() => uploadCurrentScreenshot(device)}
                    />
                    <ToolbarButton title="Copy URL" onClick={copyUrl} icon={FiCopy} />
                  </div>
                  <div className="h-4 w-px bg-surface-border" />
                  <div className="flex min-w-0 items-center gap-1">
                    <ToolbarButton title="Open original site in new tab" onClick={openOriginal} icon={FiExternalLink} />
                  </div>
                </div>

                {isActivePreview ? (
                  <DeviceFrame
                    ref={setDeviceFrameRef(device.key)}
                    key={`${device.key}-${url}`}
                    url={url}
                    deviceKey={device.key}
                    deviceName={device.label}
                    width={device.width}
                    height={device.height}
                    scale={previewWidth / device.width}
                    status={ds}
                    variant="workspace"
                    reloadToken={reloadTokens[device.key]}
                    active
                    liveEnabled
                    screenshotSrc={screenshot}
                    streamScale={1}
                    maxFps={60}
                    streamFormat="jpeg"
                    streamQuality={74}
                  />
                ) : (
                  <div
                    className="overflow-hidden bg-surface-border"
                    style={{ width: previewWidth, height: Math.round(device.height * (previewWidth / device.width)), contentVisibility: "auto" }}
                  >
                    {screenshot ? (
                      <img
                        src={staticPreviewSrc(screenshot)}
                        alt={`${device.label} static preview`}
                        className="h-full w-full object-cover object-top"
                        decoding="async"
                        loading="lazy"
                        draggable="false"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-stone-50 text-[11px] font-semibold text-surface-muted">
                        Select to start Live View
                      </div>
                    )}
                  </div>
                )}
                {!isModal && (
                  <p className="text-[10px] font-medium text-surface-muted">Double-click to expand device preview</p>
                )}
              </div>
              </Fragment>
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
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-accent-50 hover:text-accent-600 focus:outline-none focus:ring-1 focus:ring-accent-400 ${
        active ? "bg-accent-50 text-accent-600" : "text-surface-label"
      }`}
    >
      <Icon size={13} />
    </button>
  );
}

function DriveButton({ connected, loading, status, link, onConnect, onUpload }) {
  if (!connected) {
    return (
      <button
        type="button"
        title="Connect Google Drive to save screenshots"
        aria-label="Connect Google Drive"
        onClick={onConnect}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-surface-label transition hover:bg-accent-50 hover:text-accent-600 focus:outline-none focus:ring-1 focus:ring-accent-400"
      >
        <SiGoogledrive size={13} style={{ filter: "grayscale(1) opacity(0.7)" }} />
      </button>
    );
  }

  if (loading) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-surface-label">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
      </span>
    );
  }

  if (status === "success") {
    return (
      <button
        type="button"
        title="Saved to Drive — click to save again"
        aria-label="Saved to Drive"
        onClick={onUpload}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 focus:outline-none focus:ring-1 focus:ring-emerald-400"
      >
        <FiCheck size={13} />
      </button>
    );
  }

  return (
    <button
      type="button"
      title={status === "error" ? "Upload failed — click to retry" : "Save screenshot to Google Drive"}
      aria-label="Save to Google Drive"
      onClick={onUpload}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition focus:outline-none focus:ring-1 focus:ring-accent-400 ${
        status === "error"
          ? "text-red-400 hover:bg-red-50 hover:text-red-500"
          : "text-surface-label hover:bg-accent-50 hover:text-accent-600"
      }`}
    >
      <SiGoogledrive size={13} style={{ filter: "grayscale(1) opacity(0.7)" }} />
    </button>
  );
}
