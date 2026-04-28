import { useState } from "react";

const SEV_CONFIG = {
  critical: { badge: "badge-error",   icon: "🔴", order: 0 },
  warning:  { badge: "badge-warning", icon: "🟡", order: 1 },
  info:     { badge: "badge-info",    icon: "🔵", order: 2 },
};

const SOURCE_LABEL = { playwright: "Live", static: "Static" };

function FlatIssueList({ issues }) {
  if (!issues.length) return (
    <div className="issue-empty"><span>✅</span><p>No issues detected for this viewport.</p></div>
  );
  return (
    <ul className="issue-list">
      {issues.map((issue, i) => {
        const sev = SEV_CONFIG[issue.severity] || SEV_CONFIG.info;
        return (
          <li key={i} className={`issue-item ${issue.highlighted ? "issue-item--highlight" : ""}`}>
            <span className="issue-sev-icon">{sev.icon}</span>
            <div className="issue-body">
              <div className="issue-title-row">
                <strong>{issue.title}</strong>
                <span className={`badge ${sev.badge}`}>{issue.severity}</span>
                {issue.source && <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>{SOURCE_LABEL[issue.source] || issue.source}</span>}
              </div>
              <p className="issue-desc">{issue.description}</p>
              {issue.device && <span className="issue-device">Affects: {issue.device}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function GroupedIssueList({ groups }) {
  const [open, setOpen] = useState(() => {
    const s = {};
    groups.forEach((g, i) => { if (g.severity_max === "critical") s[i] = true; });
    return s;
  });
  const toggle = (i) => setOpen((prev) => ({ ...prev, [i]: !prev[i] }));

  if (!groups.length) return (
    <div className="issue-empty"><span>✅</span><p>No layout issues detected.</p></div>
  );

  return (
    <div className="issue-groups">
      {groups.map((group, gi) => {
        const sev    = SEV_CONFIG[group.severity_max] || SEV_CONFIG.info;
        const isOpen = !!open[gi];
        return (
          <div key={gi} className={`issue-group issue-group--${group.severity_max}`}>
            <button className="issue-group-header" onClick={() => toggle(gi)} aria-expanded={isOpen}>
              <span className="issue-sev-icon">{sev.icon}</span>
              <strong>{group.label}</strong>
              <span className={`badge ${sev.badge}`}>{group.count}</span>
              <span className="issue-group-chevron">{isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen && (
              <ul className="issue-list issue-list--inset">
                {group.issues.map((issue, ii) => {
                  const isev = SEV_CONFIG[issue.severity] || SEV_CONFIG.info;
                  return (
                    <li key={ii} className={`issue-item ${issue.highlighted ? "issue-item--highlight" : ""}`}>
                      <span className="issue-sev-icon">{isev.icon}</span>
                      <div className="issue-body">
                        <div className="issue-title-row">
                          <strong>{issue.title}</strong>
                          <span className={`badge ${isev.badge}`}>{issue.severity}</span>
                          {issue.source && <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>{SOURCE_LABEL[issue.source] || issue.source}</span>}
                        </div>
                        <p className="issue-desc">{issue.description}</p>
                        {issue.device && <span className="issue-device">Affects: {issue.device}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function IssuePanel({ issues, issueGroups, title = "Layout Issues" }) {
  const useGrouped = issueGroups && issueGroups.length > 0;
  const totalCount = useGrouped
    ? issueGroups.reduce((s, g) => s + g.count, 0)
    : (issues || []).length;

  return (
    <div className="issue-panel">
      <div className="issue-panel-header">
        <h3>{title}</h3>
        {totalCount > 0 && <span className="badge badge-error">{totalCount} total</span>}
      </div>
      {useGrouped ? <GroupedIssueList groups={issueGroups} /> : <FlatIssueList issues={issues || []} />}
    </div>
  );
}
