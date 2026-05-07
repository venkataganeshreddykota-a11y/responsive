import { FiAlertTriangle, FiGrid, FiImage, FiMaximize2, FiMousePointer, FiType } from "react-icons/fi";

const ISSUE_CATEGORIES = [
  { key: "overflow", label: "Overflow issues", Icon: FiMaximize2, test: /overflow|horizontal/i },
  { key: "broken", label: "Broken layouts", Icon: FiAlertTriangle, test: /broken|collapsed|zero-height|invisible|viewport/i },
  { key: "text", label: "Text wrapping issues", Icon: FiType, test: /text|font|typography|wrap|readable/i },
  { key: "image", label: "Image scaling issues", Icon: FiImage, test: /image|img|srcset|scal/i },
  { key: "alignment", label: "Flex/Grid alignment issues", Icon: FiGrid, test: /flex|grid|align|overlap|position/i },
  { key: "button", label: "Button sizing issues", Icon: FiMousePointer, test: /button|touch|target|tap|click/i },
  { key: "spacing", label: "Spacing issues", Icon: FiGrid, test: /spacing|gap|padding|margin|crowd/i },
];

const DEVICE_LABELS = {
  mobile: "Mobile",
  tablet: "Tablet",
  laptop: "Laptop",
  desktop: "Desktop",
};

function issueText(issue) {
  return `${issue?.title || ""} ${issue?.description || ""} ${issue?.detail || ""}`;
}

function deviceMatches(issue, device) {
  if (!device?.statusKey || !issue) return false;
  const expected = DEVICE_LABELS[device.statusKey] || device.label || device.statusKey;
  const deviceField = String(issue.device || "");
  const listedDevices = deviceField
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (listedDevices.length) {
    return listedDevices.includes(expected.toLowerCase());
  }

  return false;
}

function issueKey(issue) {
  return [
    issue?.device || "",
    issue?.source || "",
    issue?.severity || "",
    issue?.title || "",
    issue?.description || issue?.detail || "",
  ].join("|").toLowerCase().replace(/\s+/g, " ").trim();
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
  const explicitMatch = ISSUE_CATEGORIES.find((category) => explicitCategory === category.label.toLowerCase() || explicitCategory === category.key);
  if (explicitMatch) return explicitMatch.key;

  const text = issueText(issue);
  return ISSUE_CATEGORIES.find((category) => category.test.test(text))?.key || "broken";
}

export function getSelectedDeviceIssues({ issues, issueGroups, selectedDevice }) {
  const flat = issues?.length ? issues : (issueGroups || []).flatMap((group) => group.issues || []);
  const matched = flat.filter((issue) => deviceMatches(issue, selectedDevice));

  return dedupeIssues(matched);
}

export function buildIssueGroups({ issues, issueGroups, deviceStatus, selectedDevice }) {
  const deviceIssues = getSelectedDeviceIssues({ issues, issueGroups, deviceStatus, selectedDevice });
  return ISSUE_CATEGORIES.map((category) => ({
    ...category,
    issues: dedupeIssues(deviceIssues.filter((issue) => classifyIssue(issue) === category.key)),
  }));
}

export default function DeviceIssueViewer({ selectedDevice, issues, issueGroups, deviceStatus }) {
  const grouped = buildIssueGroups({ issues, issueGroups, deviceStatus, selectedDevice });
  const selectedIssues = getSelectedDeviceIssues({ issues, issueGroups, deviceStatus, selectedDevice });
  const total = selectedIssues.length;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-surface-border bg-white p-3 shadow-sm dark:border-stone-700 dark:bg-stone-950">
        <p className="text-[11px] font-bold uppercase text-surface-muted dark:text-stone-400">Selected device</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-surface-body dark:text-stone-100">{selectedDevice?.label || "Select a live device"}</p>
            <p className="text-xs text-surface-muted dark:text-stone-400">
              {selectedDevice?.width && selectedDevice?.height ? `${selectedDevice.width}x${selectedDevice.height}` : "No resolution selected"}
            </p>
          </div>
          {total > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
              {total} issue{total === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {total === 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          No responsive issues were detected for this selected device.
        </div>
      )}

      {grouped.map(({ key, label, Icon, issues: categoryIssues }) => (
        <section key={key} className="rounded-lg border border-surface-border bg-white p-3 shadow-sm dark:border-stone-700 dark:bg-stone-950">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-xs font-bold text-surface-body dark:text-stone-100">
              <Icon size={13} className="text-accent-500" />
              {label}
            </h3>
            {categoryIssues.length > 0 && (
              <span className="text-[11px] font-semibold text-surface-muted dark:text-stone-400">{categoryIssues.length}</span>
            )}
          </div>
          {categoryIssues.length ? (
            <div className="mt-2 space-y-2">
              {categoryIssues.map((issue, index) => (
                <div key={`${key}-${index}`} className="rounded-md bg-stone-50 p-2 dark:bg-stone-900">
                  <p className="text-xs font-semibold text-surface-body dark:text-stone-100">{issue.title || "Responsive issue"}</p>
                  <p className="mt-1 text-[11px] leading-4 text-surface-muted dark:text-stone-400">{issue.description || issue.detail || "Needs review at this breakpoint."}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-surface-muted dark:text-stone-500">No matching issue detected for this category.</p>
          )}
        </section>
      ))}
    </div>
  );
}
