import { useState } from "react";
import { FiSmartphone, FiTablet, FiMonitor } from "react-icons/fi";
import { MdLaptop } from "react-icons/md";
import {
  HiOutlineXCircle, HiOutlineExclamationTriangle, HiOutlineInformationCircle,
  HiOutlineCheckCircle, HiOutlineWrenchScrewdriver,
} from "react-icons/hi2";
import { FiImage, FiType, FiZap, FiLayout, FiAlertCircle } from "react-icons/fi";
import { MdOutlineDesktopWindows, MdOutlineAdsClick } from "react-icons/md";

// ── config ────────────────────────────────────────────────────────────────────
const DEVICES = [
  { key: "mobile",  label: "Mobile",  width: "375px",  Icon: FiSmartphone },
  { key: "tablet",  label: "Tablet",  width: "768px",  Icon: FiTablet     },
  { key: "laptop",  label: "Laptop",  width: "1280px", Icon: MdLaptop     },
  { key: "desktop", label: "Desktop", width: "1440px", Icon: FiMonitor    },
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

const CATEGORY_ICON = {
  viewport:    <MdOutlineDesktopWindows size={13} />,
  images:      <FiImage size={13} />,
  typography:  <FiType size={13} />,
  touch:       <MdOutlineAdsClick size={13} />,
  performance: <FiZap size={13} />,
  layout:      <FiLayout size={13} />,
};

const SOURCE_LABEL = { playwright: "Live", static: "Static" };

// ── helpers ───────────────────────────────────────────────────────────────────
// issue.device is like "Mobile", "Mobile, Tablet", "Mobile, Tablet, Laptop"
// deviceLabel is "Mobile" | "Tablet" | "Laptop" | "Desktop"
function issueMatchesDevice(issue, deviceLabel) {
  if (!issue.device) return false; // no device = global, handled separately
  // split by comma and check if any segment matches
  return issue.device.split(",").some(
    (seg) => seg.trim().toLowerCase() === deviceLabel.toLowerCase()
  );
}

// advice item: breakpoint items have device key ("mobile","tablet",...), general suggestions don't
function adviceMatchesDevice(item, deviceKey) {
  return item.device === deviceKey; // only exact match; items without device are general
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
    <div className={`rounded-xl border-l-2 p-3 ${cfg.style}`}>
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

function GeneralFixItem({ item }) {
  return (
    <div className="flex gap-3 rounded-xl border border-surface-border bg-white p-3 shadow-sm">
      <span className="mt-0.5 shrink-0 text-surface-muted">
        {CATEGORY_ICON[item.category] || <FiAlertCircle size={13} />}
      </span>
      <div>
        <p className="text-xs font-semibold text-surface-body">{item.title}</p>
        {item.detail && <p className="mt-0.5 text-xs leading-relaxed text-surface-label">{item.detail}</p>}
      </div>
    </div>
  );
}

// ── single device card ────────────────────────────────────────────────────────
function DeviceCard({ device, deviceStatus, issues, advice }) {
  const [tab, setTab] = useState("issues");
  const { key, label, width, Icon } = device;

  const ds = deviceStatus?.find((d) => d.device === key);
  const statusCfg = ds ? (STATUS_CFG[ds.status] || STATUS_CFG.needs_fix) : null;

  // only issues that explicitly mention this device
  const deviceIssues = (issues || []).filter((iss) => issueMatchesDevice(iss, label));

  // only breakpoint fixes for this device (items with device === key)
  const deviceFixes = (advice || []).filter((a) => adviceMatchesDevice(a, key));

  const issueCount = deviceIssues.length;
  const fixCount   = deviceFixes.length;

  return (
    <div className="glass flex flex-col overflow-hidden rounded-2xl border border-surface-border shadow-glass">
      {/* Header */}
      <div className={`flex items-center gap-3 border-b px-4 py-3 ${statusCfg?.header || "border-surface-border bg-white/40"}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/70 text-surface-muted shadow-sm">
          <Icon size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-surface-body">{label}</span>
            <span className="text-xs text-stone-400">{width}</span>
          </div>
          {ds && (
            <div className="mt-0.5 flex items-center gap-1">
              <span className="text-xs text-surface-muted">
                {ds.issue_count > 0
                  ? `${ds.issue_count} issue${ds.issue_count !== 1 ? "s" : ""}`
                  : "No issues"}
              </span>
            </div>
          )}
        </div>
        {ds?.score != null && (
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums ${statusCfg?.pill}`}>
            {Math.round(ds.score)}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border bg-white/30">
        <button
          onClick={() => setTab("issues")}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            tab === "issues"
              ? "border-b-2 border-accent-500 text-accent-600"
              : "text-surface-muted hover:text-surface-body"
          }`}
        >
          Issues
          {issueCount > 0 && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600">{issueCount}</span>
          )}
        </button>
        <button
          onClick={() => setTab("fixes")}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            tab === "fixes"
              ? "border-b-2 border-accent-500 text-accent-600"
              : "text-surface-muted hover:text-surface-body"
          }`}
        >
          <HiOutlineWrenchScrewdriver size={12} />
          Fixes
          {fixCount > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">{fixCount}</span>
          )}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3" style={{ maxHeight: 300 }}>
        {tab === "issues" ? (
          issueCount === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-surface-muted">
              <HiOutlineCheckCircle size={24} className="opacity-50" />
              <p className="text-xs">No issues for this device.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {deviceIssues.map((iss, i) => <IssueItem key={i} issue={iss} />)}
            </ul>
          )
        ) : (
          fixCount === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-surface-muted">
              <HiOutlineCheckCircle size={24} className="opacity-50" />
              <p className="text-xs">No breakpoint fixes for this device.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {deviceFixes.map((item, i) => <BreakpointFixItem key={i} item={item} />)}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── exported component ────────────────────────────────────────────────────────
export default function DeviceReport({ issues, issueGroups, advice, deviceStatus }) {
  // flatten issueGroups into flat issues list if needed
  const flatIssues = issues?.length
    ? issues
    : (issueGroups || []).flatMap((g) => g.issues || []);

  // general suggestions = advice items with no device field
  const generalSuggestions = (advice || []).filter((a) => !a.device);

  return (
    <div className="flex flex-col gap-4">
      {/* Per-device cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {DEVICES.map((device) => (
          <DeviceCard
            key={device.key}
            device={device}
            deviceStatus={deviceStatus}
            issues={flatIssues}
            advice={advice}
          />
        ))}
      </div>

      {/* General suggestions — shown once below all cards */}
      {generalSuggestions.length > 0 && (
        <div className="glass rounded-2xl border border-surface-border p-4 shadow-glass">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-surface-muted">
            General Improvements
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {generalSuggestions.map((item, i) => (
              <GeneralFixItem key={i} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
