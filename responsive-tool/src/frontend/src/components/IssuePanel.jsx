import { useState } from "react";
import { HiOutlineXCircle, HiOutlineExclamationTriangle, HiOutlineInformationCircle, HiOutlineCheckCircle, HiOutlineChevronDown } from "react-icons/hi2";

const SEV = {
  critical: { Icon: HiOutlineXCircle,             iconColor: "text-red-500",   badge: "bg-red-50 text-red-700 border border-red-200",     header: "bg-red-50 border-red-200",     bar: "border-l-red-400",   dot: "bg-red-500"   },
  warning:  { Icon: HiOutlineExclamationTriangle, iconColor: "text-amber-500", badge: "bg-amber-50 text-amber-700 border border-amber-200", header: "bg-amber-50 border-amber-200", bar: "border-l-amber-400", dot: "bg-amber-500" },
  info:     { Icon: HiOutlineInformationCircle,   iconColor: "text-blue-400",  badge: "bg-blue-50 text-blue-700 border border-blue-200",   header: "bg-stone-50 border-stone-200", bar: "border-l-blue-300",  dot: "bg-blue-400"  },
};

const SOURCE_LABEL = { playwright: "Live", static: "Static" };

function IssueItem({ issue }) {
  const sev = SEV[issue.severity] || SEV.info;
  return (
    <li className={`flex gap-3 rounded-lg border-l-2 bg-white p-3 shadow-sm ${sev.bar}`}>
      <sev.Icon size={15} className={`mt-0.5 shrink-0 ${sev.iconColor}`} />
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
        {issue.device && <span className="mt-1 block text-xs text-surface-muted">Affects: {issue.device}</span>}
      </div>
    </li>
  );
}

function GroupedList({ groups }) {
  const [open, setOpen] = useState(() => {
    const s = {};
    groups.forEach((g, i) => { if (g.severity_max === "critical" || g.severity_max === "warning") s[i] = true; });
    return s;
  });

  if (!groups.length) return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-surface-muted">
      <HiOutlineCheckCircle size={28} />
      <p className="text-sm">No layout issues detected.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((group, gi) => {
        const sev    = SEV[group.severity_max] || SEV.info;
        const isOpen = !!open[gi];
        return (
          <div key={gi} className={`overflow-hidden rounded-lg border ${sev.header}`}>
            <button
              className={`flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:brightness-95 ${sev.header}`}
              onClick={() => setOpen((p) => ({ ...p, [gi]: !p[gi] }))}
              aria-expanded={isOpen}
            >
              <span className={`h-2 w-2 rounded-full ${sev.dot}`} />
              <span className="flex-1 text-xs font-semibold text-surface-body">{group.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${sev.badge}`}>{group.count}</span>
              <HiOutlineChevronDown size={13} className={`text-surface-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <ul className="flex flex-col gap-1.5 bg-white/60 p-2.5">
                {group.issues.map((issue, ii) => <IssueItem key={ii} issue={issue} />)}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function IssuePanel({ issues, issueGroups, title = "Detected Issues" }) {
  const useGrouped = issueGroups?.length > 0;
  const total = useGrouped
    ? issueGroups.reduce((s, g) => s + g.count, 0)
    : (issues || []).length;

  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-surface-body">{title}</h3>
        {total > 0 && (
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-600">
            {total} total
          </span>
        )}
      </div>
      {useGrouped
        ? <GroupedList groups={issueGroups} />
        : issues?.length
          ? <ul className="flex flex-col gap-1.5">{issues.map((iss, i) => <IssueItem key={i} issue={iss} />)}</ul>
          : <div className="flex flex-col items-center justify-center gap-2 py-10 text-surface-muted">
              <HiOutlineCheckCircle size={28} />
              <p className="text-sm">No issues detected.</p>
            </div>
      }
    </div>
  );
}
