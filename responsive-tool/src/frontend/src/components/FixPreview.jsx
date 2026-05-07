import { FiCheckCircle } from "react-icons/fi";

export default function FixPreview({ selectedDevice, beforeHtml, afterHtml, applied }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-lg border border-surface-border bg-white p-3 shadow-sm dark:border-stone-700 dark:bg-stone-950">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-surface-body dark:text-stone-100">Live CSS injection</p>
            <p className="text-xs text-surface-muted dark:text-stone-400">
              {selectedDevice?.label || "Selected device"} {selectedDevice?.width ? `- ${selectedDevice.width}x${selectedDevice.height}` : ""}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
            applied
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-stone-200 bg-stone-50 text-surface-muted"
          }`}>
            <FiCheckCircle size={12} />
            {applied ? "Applied to iframe" : "Waiting for Apply Fix"}
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <PreviewFrame title="Before" html={beforeHtml} />
        <PreviewFrame title="After" html={afterHtml} />
      </div>
    </div>
  );
}

function PreviewFrame({ title, html }) {
  return (
    <section className="flex min-h-[300px] flex-col overflow-hidden rounded-lg border border-surface-border bg-white shadow-sm dark:border-stone-700 dark:bg-stone-950">
      <div className="border-b border-surface-border bg-stone-50 px-3 py-2 text-xs font-bold text-surface-body dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
        {title}
      </div>
      {html ? (
        <iframe
          title={`${title} responsive fix preview`}
          srcDoc={html}
          sandbox="allow-same-origin"
          className="h-full min-h-[300px] w-full bg-white"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-surface-muted dark:text-stone-400">
          Generate and apply a fix to see the comparison.
        </div>
      )}
    </section>
  );
}
