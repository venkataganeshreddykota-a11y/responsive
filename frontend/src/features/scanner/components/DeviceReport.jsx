import { useState } from "react";
import { FiChevronDown, FiSmartphone, FiTablet, FiImage, FiType, FiZap, FiLayout, FiAlertCircle, FiArrowRight } from "react-icons/fi";
import { MdLaptop, MdOutlineDesktopWindows, MdOutlineAdsClick } from "react-icons/md";
import {
  HiOutlineXCircle, HiOutlineExclamationTriangle, HiOutlineInformationCircle,
  HiOutlineCheckCircle, HiOutlineLightBulb,
} from "react-icons/hi2";

// ── config ────────────────────────────────────────────────────────────────────
const DEVICES = [
  { key: "mobile", statusKey: "mobile", label: "Samsung S24 Ultra", width: 384, height: 854, Icon: FiSmartphone },
  { key: "tablet", statusKey: "tablet", label: "Samsung S9 FE", width: 800, height: 1280, Icon: FiTablet },
  { key: "laptop", statusKey: "laptop", label: "Galaxy Book 5", width: 1440, height: 900, Icon: MdLaptop },
  { key: "desktop", statusKey: "desktop", label: "Desktop FHD", width: 1920, height: 1080, Icon: MdOutlineDesktopWindows },
];

const STATUS_CFG = {
  good:      { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", label: "Good",      header: "border-emerald-200 bg-emerald-50/40", text: "text-emerald-700" },
  needs_fix: { pill: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500",   label: "Needs Fix", header: "border-amber-200 bg-amber-50/40",     text: "text-amber-700"   },
  broken:    { pill: "bg-red-50 text-red-700 border-red-200",             dot: "bg-red-500",     label: "Broken",    header: "border-red-200 bg-red-50/40",         text: "text-red-700"     },
};

const SEV = {
  critical: { Icon: HiOutlineXCircle,             iconColor: "text-red-500",   badge: "bg-red-50 text-red-700 border border-red-200",      bar: "border-l-red-400"   },
  warning:  { Icon: HiOutlineExclamationTriangle, iconColor: "text-amber-500", badge: "bg-amber-50 text-amber-700 border border-amber-200", bar: "border-l-amber-400" },
  info:     { Icon: HiOutlineInformationCircle,   iconColor: "text-blue-400",  badge: "bg-blue-50 text-blue-700 border border-blue-200",    bar: "border-l-blue-300"  },
};

const PRIORITY = {
  high:   { dot: "bg-red-500",   style: "border-l-red-400 bg-red-50/60",     badge: "bg-red-50 text-red-700 border-red-200"      },
  medium: { dot: "bg-amber-500", style: "border-l-amber-400 bg-amber-50/60", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  low:    { dot: "bg-stone-400", style: "border-l-stone-300 bg-white",        badge: "bg-stone-50 text-stone-600 border-stone-200" },
};

// Enhanced category config with colors and icons
const CATEGORY_CFG = {
  viewport:    { Icon: MdOutlineDesktopWindows, color: "text-violet-600", bg: "bg-violet-50",  border: "border-violet-200", label: "Viewport"    },
  images:      { Icon: FiImage,                 color: "text-blue-600",   bg: "bg-blue-50",    border: "border-blue-200",   label: "Images"      },
  typography:  { Icon: FiType,                  color: "text-pink-600",   bg: "bg-pink-50",    border: "border-pink-200",   label: "Typography"  },
  touch:       { Icon: MdOutlineAdsClick,        color: "text-orange-600", bg: "bg-orange-50",  border: "border-orange-200", label: "Touch"       },
  performance: { Icon: FiZap,                   color: "text-amber-600",  bg: "bg-amber-50",   border: "border-amber-200",  label: "Performance" },
  layout:      { Icon: FiLayout,                color: "text-emerald-600",bg: "bg-emerald-50", border: "border-emerald-200",label: "Layout"      },
};

const SOURCE_LABEL = { playwright: "Live", static: "Static" };

// ── helpers ───────────────────────────────────────────────────────────────────
function issueMatchesDevice(issue, deviceLabel) {
  if (!issue.device) return false;
  return issue.device.split(",").some(
    (seg) => seg.trim().toLowerCase() === deviceLabel.toLowerCase()
  );
}

function adviceMatchesDevice(item, deviceKey) {
  return item.device === deviceKey;
}

function bucketLabel(deviceKey) {
  return { mobile: "Mobile", tablet: "Tablet", laptop: "Laptop", desktop: "Desktop" }[deviceKey] || deviceKey;
}

function formatResolution(device) {
  if (device.height) return `${device.width}x${device.height}`;
  return `${device.width}px`;
}

function cssHintForDevice(device) {
  const width = Number(device.width);
  if (!width) return "";
  if (width < 640) return `@media (max-width: ${width}px) { ... }`;
  if (width < 1024) return `@media (min-width: 641px) and (max-width: ${width}px) { ... }`;
  return `@media (min-width: ${width}px) { ... }`;
}

function projectIssueToSelectedDevice(issue, selectedDevice) {
  if (!selectedDevice) return issue;
  const bucket = selectedDevice.statusKey || selectedDevice.key;
  const label = selectedDevice.label;
  const resolution = formatResolution(selectedDevice);
  const bucketText = bucketLabel(bucket);
  const bucketRegex = new RegExp(`\\b${bucket}\\b`, "ig");
  const bucketLabelRegex = new RegExp(`\\b${bucketText}\\b`, "g");
  return {
    ...issue,
    title: (issue.title || "").replace(bucketRegex, label),
    description: (issue.description || "")
      .replace(bucketLabelRegex, label)
      .replace(/the \d+px viewport/gi, `the ${resolution} viewport`)
      .replace(/\b\d+px viewport/gi, `${resolution} viewport`),
    device: `${label} (${resolution})`,
  };
}

function projectAdviceToSelectedDevice(item, selectedDevice) {
  if (!selectedDevice) return item;
  const resolution = formatResolution(selectedDevice);
  return {
    ...item,
    viewport: `${selectedDevice.label} - ${resolution}`,
    css_hint: cssHintForDevice(selectedDevice) || item.css_hint,
    tip: item.tip || `Tune layout rules for ${resolution} and verify this preset in Live View.`,
  };
}

// ── GeneralFixItem — enhanced card ────────────────────────────────────────────
function GeneralFixItem({ item, index }) {
  const cfg = CATEGORY_CFG[item.category] || {
    Icon: HiOutlineLightBulb,
    color: "text-accent-600",
    bg: "bg-accent-50",
    border: "border-accent-200",
    label: "Tip",
  };
  const { Icon } = cfg;

  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-surface-border bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-200 hover:shadow-md">
      {/* subtle gradient accent top bar */}
      <div className={`absolute inset-x-0 top-0 h-0.5 rounded-t-xl ${cfg.bg.replace("bg-", "bg-gradient-to-r from-")} opacity-80`} />

      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.border} ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <p className="mt-1.5 text-xs font-semibold leading-snug text-surface-body">{item.title}</p>
        </div>
      </div>

      {item.detail && (
        <p className="text-xs leading-relaxed text-surface-label">{item.detail}</p>
      )}

      <div className="flex items-center gap-1 text-[11px] font-medium text-surface-muted group-hover:text-accent-600 transition-colors">
        <FiArrowRight size={11} />
        Apply fix
      </div>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────
function IssueItem({ issue }) {
  const sev = SEV[issue.severity] || SEV.info;
  return (
    <li className={`flex gap-3 rounded-lg border-l-2 bg-white p-3 shadow-sm ${sev.bar}`}>
      <sev.Icon size={14} className={`mt-0.5 shrink-0 ${sev.iconColor}`} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-surface-body">{issue.title}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sev.badge}`}>{issue.severity}</span>
          {issue.source && (
            <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs text-surface-muted">
              {SOURCE_LABEL[issue.source] || issue.source}
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-surface-label">{issue.description}</p>
      </div>
    </li>
  );
}

function BreakpointFixItem({ item }) {
  const cfg = PRIORITY[item.priority] || PRIORITY.low;
  return (
    <div className={`rounded-lg border-l-2 p-3 ${cfg.style}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
        <span className="text-xs font-semibold text-surface-body">{item.viewport}</span>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
          {item.priority === "high" ? "High" : item.priority === "medium" ? "Medium" : "Low"} Priority
        </span>
      </div>
      {item.css_hint && (
        <code className="mb-1.5 block rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-mono text-xs text-emerald-700 break-all">
          {item.css_hint}
        </code>
      )}
      {item.tip && <p className="text-xs leading-relaxed text-surface-label">{item.tip}</p>}
    </div>
  );
}

// ── single device card ────────────────────────────────────────────────────────
function DeviceTable({ device, deviceStatus, issues, advice, focused = false, detailsExpanded, onToggleDetails }) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const { key, statusKey = key, label, width, Icon } = device;
  const expanded = detailsExpanded ?? localExpanded;
  const toggleExpanded = onToggleDetails || (() => setLocalExpanded((open) => !open));

  const ds = deviceStatus?.find((d) => d.device === statusKey);
  const statusCfg = ds ? (STATUS_CFG[ds.status] || STATUS_CFG.needs_fix) : null;
  const matchingLabel = bucketLabel(statusKey);

  const deviceIssues = (issues || [])
    .filter((iss) => issueMatchesDevice(iss, matchingLabel))
    .map((iss) => projectIssueToSelectedDevice(iss, focused ? device : null));

  const deviceFixes = (advice || [])
    .filter((a) => adviceMatchesDevice(a, statusKey))
    .map((item) => projectAdviceToSelectedDevice(item, focused ? device : null));

  const issueCount = deviceIssues.length;
  const fixCount   = deviceFixes.length;
  const rows = [
    ...deviceIssues.map((issue, index) => ({
      key: `issue-${index}`,
      type: "Issue",
      tone: "border-red-200 bg-red-50 text-red-700",
      title: issue.title,
      detail: issue.description,
      meta: issue.severity,
      source: SOURCE_LABEL[issue.source] || issue.source || "Scan",
    })),
    ...deviceFixes.map((item, index) => ({
      key: `fix-${index}`,
      type: "Fix",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
      title: item.viewport,
      detail: item.tip || item.detail || "Review this breakpoint for the selected screen.",
      meta: item.priority ? `${item.priority} priority` : "recommended",
      source: item.css_hint || "Responsive CSS",
    })),
  ];

  return (
    <div className="panel flex flex-col overflow-hidden">
      <div className={`flex items-center gap-3 border-b px-4 py-3 ${statusCfg?.header || "border-surface-border bg-white/40"}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/75 text-surface-muted shadow-sm">
          <Icon size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-surface-body">{label}</span>
            <span className="text-xs text-stone-400">{formatResolution(device)}</span>
            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
              {issueCount} Issue{issueCount !== 1 ? "s" : ""}
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {fixCount} Fix{fixCount !== 1 ? "es" : ""}
            </span>
          </div>
          {focused && (
            <p className="mt-0.5 text-xs text-surface-muted">
              Selected {bucketLabel(statusKey).toLowerCase()} preset. Use the control on the right to {expanded ? "hide" : "view"} detailed issues and fixes.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ds?.score != null && (
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums ${statusCfg?.pill}`}>
              {Math.round(ds.score)}
            </span>
          )}
          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            className="flex h-8 items-center gap-2 rounded-lg border border-surface-border bg-white px-2.5 text-xs font-semibold text-surface-label shadow-sm transition hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-400/25"
          >
            <span className="hidden sm:inline">{expanded ? "Hide Details" : "View Details"}</span>
            <FiChevronDown size={15} className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      <div className={`grid transition-all duration-300 ease-out ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-surface-muted">
                <HiOutlineCheckCircle size={24} className="opacity-50" />
                <p className="text-xs">No issues or fixes for this device.</p>
              </div>
            ) : (
              <table className="min-w-[760px] w-full border-collapse text-left text-xs">
                <thead className="bg-stone-50 text-[11px] uppercase text-surface-muted">
                  <tr>
                    <th className="border-b border-surface-border px-4 py-2 font-bold">Type</th>
                    <th className="border-b border-surface-border px-4 py-2 font-bold">Title / Viewport</th>
                    <th className="border-b border-surface-border px-4 py-2 font-bold">Details</th>
                    <th className="border-b border-surface-border px-4 py-2 font-bold">Severity / Priority</th>
                    <th className="border-b border-surface-border px-4 py-2 font-bold">Source / CSS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border bg-white">
                  {rows.map((row) => (
                    <tr key={row.key} className="align-top transition hover:bg-accent-50/30">
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${row.tone}`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="max-w-[260px] px-4 py-3 font-semibold text-surface-body">{row.title}</td>
                      <td className="max-w-[420px] px-4 py-3 leading-relaxed text-surface-label">{row.detail}</td>
                      <td className="whitespace-nowrap px-4 py-3 capitalize text-surface-label">{row.meta}</td>
                      <td className="max-w-[280px] px-4 py-3">
                        {row.type === "Fix" ? (
                          <code className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 font-mono text-[11px] text-emerald-700">
                            {row.source}
                          </code>
                        ) : (
                          <span className="text-surface-label">{row.source}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── exported component ────────────────────────────────────────────────────────
export default function DeviceReport({ issues, issueGroups, advice, deviceStatus, selectedDevice, detailsExpanded, onToggleDetails }) {
  const flatIssues = issues?.length
    ? issues
    : (issueGroups || []).flatMap((g) => g.issues || []);

  const generalSuggestions = (advice || []).filter((a) => !a.device);

  return (
    <div className="flex flex-col gap-4">
      {/* Per-device cards */}
      <div className={selectedDevice ? "grid gap-4" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-4"}>
        {(selectedDevice ? [{
          ...selectedDevice,
          statusKey: selectedDevice.statusKey || selectedDevice.key,
          Icon: selectedDevice.width < 640 ? FiSmartphone : selectedDevice.width < 1024 ? FiTablet : MdLaptop,
        }] : DEVICES).map((device) => (
          <DeviceTable
            key={device.key}
            device={device}
            deviceStatus={deviceStatus}
            issues={flatIssues}
            advice={advice}
            focused={!!selectedDevice}
            detailsExpanded={selectedDevice ? detailsExpanded : undefined}
            onToggleDetails={selectedDevice ? onToggleDetails : undefined}
          />
        ))}
      </div>

    </div>
  );
}
