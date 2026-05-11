import { useState } from "react";
import { FiAlertTriangle, FiChevronRight, FiGrid, FiImage, FiMaximize2, FiMousePointer, FiTablet, FiType } from "react-icons/fi";

// Dark brownish-black + orange palette
const D = {
  bg:       "#13110e",   // page background
  card:     "#1c1814",   // card surface
  row:      "#181410",   // category row bg
  rowHover: "#201c17",   // row hover
  border:   "#2e2620",   // border
  borderOrange: "rgba(249,115,22,0.25)",
  orange:   "#f97316",
  orangeDim:"rgba(249,115,22,0.15)",
  text:     "#f0e6d8",   // primary text
  soft:     "#a89070",   // secondary text
  muted:    "#6a5a48",   // muted text
  expanded: "#110e0b",   // expanded area bg
};

const ISSUE_CATEGORIES = [
  { key: "overflow",  label: "Overflow issues",            Icon: FiMaximize2,    test: /overflow|horizontal/i },
  { key: "broken",    label: "Broken layouts",             Icon: FiAlertTriangle,test: /broken|collapsed|zero-height|invisible|viewport/i },
  { key: "text",      label: "Text wrapping issues",       Icon: FiType,         test: /text|font|typography|wrap|readable/i },
  { key: "image",     label: "Image scaling issues",       Icon: FiImage,        test: /image|img|srcset|scal/i },
  { key: "alignment", label: "Flex/Grid alignment issues", Icon: FiGrid,         test: /flex|grid|align|overlap|position/i },
  { key: "button",    label: "Button sizing issues",       Icon: FiMousePointer, test: /button|touch|target|tap|click/i },
  { key: "spacing",   label: "Spacing issues",             Icon: FiGrid,         test: /spacing|gap|padding|margin|crowd/i },
];

const DEVICE_LABELS = { mobile: "Mobile", tablet: "Tablet", laptop: "Laptop", desktop: "Desktop" };

function issueText(issue) {
  return `${issue?.title || ""} ${issue?.description || ""} ${issue?.detail || ""}`;
}

function deviceMatches(issue, device) {
  if (!device?.statusKey || !issue) return false;
  const expected = DEVICE_LABELS[device.statusKey] || device.label || device.statusKey;
  const deviceField = String(issue.device || "");
  const listedDevices = deviceField.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (listedDevices.length) return listedDevices.includes(expected.toLowerCase());
  return false;
}

function issueKey(issue) {
  return [issue?.device || "", issue?.source || "", issue?.severity || "", issue?.title || "", issue?.description || issue?.detail || ""]
    .join("|").toLowerCase().replace(/\s+/g, " ").trim();
}

export function dedupeIssues(items) {
  const seen = new Set();
  return (items || []).filter((issue) => {
    const key = issueKey(issue);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyIssue(issue) {
  const explicitCategory = String(issue?.category || "").toLowerCase();
  const explicitMatch = ISSUE_CATEGORIES.find((c) => explicitCategory === c.label.toLowerCase() || explicitCategory === c.key);
  if (explicitMatch) return explicitMatch.key;
  const text = issueText(issue);
  return ISSUE_CATEGORIES.find((c) => c.test.test(text))?.key || "broken";
}

export function getSelectedDeviceIssues({ issues, issueGroups, selectedDevice }) {
  const flat = issues?.length ? issues : (issueGroups || []).flatMap((g) => g.issues || []);
  return dedupeIssues(flat.filter((issue) => deviceMatches(issue, selectedDevice)));
}

export function buildIssueGroups({ issues, issueGroups, deviceStatus, selectedDevice }) {
  const deviceIssues = getSelectedDeviceIssues({ issues, issueGroups, deviceStatus, selectedDevice });
  return ISSUE_CATEGORIES.map((category) => ({
    ...category,
    issues: dedupeIssues(deviceIssues.filter((issue) => classifyIssue(issue) === category.key)),
  }));
}

function CategoryRow({ label, Icon, issues: categoryIssues }) {
  const [open, setOpen] = useState(categoryIssues.length > 0);
  const hasIssues = categoryIssues.length > 0;

  return (
    <div style={{ borderBottom: `1px solid ${D.border}` }} className="last:border-b-0">
      {/* Row header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "flex-start", gap: "12px",
          padding: "14px 20px", background: "transparent", border: "none", cursor: "pointer",
          textAlign: "left", transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = D.rowHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {/* Icon */}
        <span style={{ marginTop: "1px", flexShrink: 0 }}>
          <Icon size={15} style={{ color: D.orange }} />
        </span>

        {/* Label + issues */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: D.text, fontSize: "13px", fontWeight: 700, lineHeight: 1.3 }}>{label}</p>
          {hasIssues && open ? null : (
            <p style={{ color: D.muted, fontSize: "12px", marginTop: "3px" }}>
              {hasIssues
                ? `${categoryIssues.length} issue${categoryIssues.length === 1 ? "" : "s"} detected`
                : "No matching issue detected for this category."}
            </p>
          )}
          {/* Inline issues when expanded */}
          {open && hasIssues && (
            <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {categoryIssues.map((issue, i) => (
                <div key={i} style={{
                  background: D.expanded,
                  border: `1px solid ${D.border}`,
                  borderLeft: `3px solid ${D.orange}`,
                  borderRadius: "6px",
                  padding: "10px 12px",
                }}>
                  <p style={{ color: D.text, fontSize: "12px", fontWeight: 700, lineHeight: 1.4 }}>
                    {issue.title || "Responsive issue"}
                  </p>
                  <p style={{ color: D.soft, fontSize: "11px", marginTop: "5px", lineHeight: 1.55 }}>
                    {issue.description || issue.detail || "Needs review at this breakpoint."}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right side: count badge + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, marginTop: "1px" }}>
          {hasIssues && (
            <span style={{
              background: D.orangeDim,
              color: D.orange,
              border: `1px solid ${D.borderOrange}`,
              borderRadius: "999px",
              padding: "1px 9px",
              fontSize: "11px",
              fontWeight: 800,
            }}>
              {categoryIssues.length}
            </span>
          )}
          <FiChevronRight
            size={14}
            style={{
              color: D.muted,
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          />
        </div>
      </button>
    </div>
  );
}

export default function DeviceIssueViewer({ selectedDevice, issues, issueGroups, deviceStatus }) {
  const grouped = buildIssueGroups({ issues, issueGroups, deviceStatus, selectedDevice });
  const selectedIssues = getSelectedDeviceIssues({ issues, issueGroups, deviceStatus, selectedDevice });
  const total = selectedIssues.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

      {/* Selected device card */}
      <div style={{
        background: D.card,
        border: `1px solid ${D.border}`,
        borderRadius: "10px",
        padding: "14px 20px",
      }}>
        <p style={{ color: D.muted, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>
          Selected Device
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{
              width: 34, height: 34, borderRadius: "8px", flexShrink: 0,
              background: D.orangeDim, border: `1px solid ${D.borderOrange}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FiTablet size={15} style={{ color: D.orange }} />
            </span>
            <div>
              <p style={{ color: D.text, fontSize: "14px", fontWeight: 800, lineHeight: 1.2 }}>
                {selectedDevice?.label || "Select a live device"}
              </p>
              <p style={{ color: D.muted, fontSize: "12px", marginTop: "3px" }}>
                {selectedDevice?.width && selectedDevice?.height
                  ? `${selectedDevice.width}×${selectedDevice.height}`
                  : "No resolution selected"}
              </p>
            </div>
          </div>
          {total > 0 && (
            <span style={{
              background: D.orangeDim,
              color: D.orange,
              border: `1px solid ${D.borderOrange}`,
              borderRadius: "999px",
              padding: "4px 14px",
              fontSize: "12px",
              fontWeight: 800,
            }}>
              {total} issue{total === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {/* Category rows */}
      <div style={{
        background: D.card,
        border: `1px solid ${D.border}`,
        borderRadius: "10px",
        overflow: "hidden",
      }}>
        {grouped.map(({ key, label, Icon, issues: categoryIssues }) => (
          <CategoryRow key={key} label={label} Icon={Icon} issues={categoryIssues} />
        ))}
      </div>
    </div>
  );
}
