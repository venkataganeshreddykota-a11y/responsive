import { FiImage, FiType, FiZap, FiLayout, FiAlertCircle } from "react-icons/fi";
import { MdOutlineDesktopWindows, MdOutlineAdsClick } from "react-icons/md";

const PRIORITY = {
  high:   { dot: "bg-red-500",   style: "border-l-red-400 bg-red-50/60",      badge: "bg-red-50 text-red-700 border-red-200"      },
  medium: { dot: "bg-amber-500", style: "border-l-amber-400 bg-amber-50/60",  badge: "bg-amber-50 text-amber-700 border-amber-200" },
  low:    { dot: "bg-stone-400", style: "border-l-stone-300 bg-white",         badge: "bg-stone-50 text-stone-600 border-stone-200" },
};

const DEVICE_LABEL = { mobile: "Mobile", tablet: "Tablet", laptop: "Laptop", desktop: "Desktop" };

const CATEGORY_ICON = {
  viewport:    <MdOutlineDesktopWindows size={14} />,
  images:      <FiImage size={14} />,
  typography:  <FiType size={14} />,
  touch:       <MdOutlineAdsClick size={14} />,
  performance: <FiZap size={14} />,
  layout:      <FiLayout size={14} />,
};

export default function ResolutionAdvisor({ advice }) {
  if (!advice?.length) return (
    <div className="glass rounded-2xl border border-surface-border p-5 shadow-glass">
      <h3 className="mb-3 text-sm font-semibold text-surface-body">Recommended Fixes</h3>
      <p className="text-xs text-surface-muted">No resolution advice available.</p>
    </div>
  );

  const breakpoints = advice.filter((a) => a.viewport);
  const suggestions = advice.filter((a) => !a.viewport);

  return (
    <div className="glass rounded-2xl border border-surface-border p-5 shadow-glass">
      <h3 className="mb-4 text-sm font-semibold text-surface-body">Recommended Fixes</h3>

      {suggestions.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-surface-muted">
            General Suggestions
          </p>
          <div className="flex flex-col gap-1.5">
            {suggestions.map((item, i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-surface-border bg-white p-3 shadow-sm">
                <span className="mt-0.5 shrink-0 text-surface-muted">
                  {CATEGORY_ICON[item.category] || <FiAlertCircle size={14} />}
                </span>
                <div>
                  <p className="text-xs font-semibold text-surface-body">{item.title}</p>
                  {item.detail && <p className="mt-0.5 text-xs leading-relaxed text-surface-label">{item.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {breakpoints.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-surface-muted">
            Breakpoint Fixes
          </p>
          <div className="flex flex-col gap-1.5">
            {breakpoints.map((item, i) => {
              const cfg = PRIORITY[item.priority] || PRIORITY.low;
              return (
                <div key={i} className={`rounded-xl border-l-2 p-3 ${cfg.style}`}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                    <span className="text-xs font-semibold text-surface-body">
                      {DEVICE_LABEL[item.device]} — {item.viewport}
                    </span>
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
            })}
          </div>
        </div>
      )}
    </div>
  );
}
