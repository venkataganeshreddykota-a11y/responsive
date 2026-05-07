import { FiCheck, FiCopy } from "react-icons/fi";

function stripEditorArtifacts(value) {
  return String(value || "")
    .replace(/<\/?span[^>]*>/gi, "")
    .replace(/&lt;\/?span[^&]*&gt;/gi, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function formatCss(code) {
  const raw = stripEditorArtifacts(code);
  if (!raw) return "";

  const strings = [];
  const masked = raw.replace(/(["'])(?:\\.|(?!\1).)*\1/gs, (match) => {
    const token = `__CSS_STRING_${strings.length}__`;
    strings.push(match);
    return token;
  });

  const formatted = masked
    .replace(/\s*\/\*\s*Source:/g, "\n\n/* Source:")
    .replace(/\*\/\s*/g, " */\n")
    .replace(/\s*{\s*/g, " {\n  ")
    .replace(/;\s*/g, ";\n  ")
    .replace(/\s*}\s*/g, "\n}\n")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\n\s*@/g, "\n@")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  return formatted.replace(/__CSS_STRING_(\d+)__/g, (_, index) => strings[Number(index)] || "");
}

export default function AICodeEditor({ title, code, emptyText, copied, onCopy, action }) {
  const formattedCode = formatCss(code);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-surface-border bg-white shadow-sm dark:border-stone-700 dark:bg-stone-950">
      <div className="flex min-h-[42px] items-center justify-between gap-3 border-b border-surface-border bg-stone-50 px-3 dark:border-stone-800 dark:bg-stone-900">
        <h3 className="text-xs font-bold text-surface-body dark:text-stone-100">{title}</h3>
        <div className="flex items-center gap-2">
          {action}
          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              disabled={!code}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-surface-border bg-white px-2 text-[11px] font-semibold text-surface-label transition hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300"
            >
              {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      </div>
      <pre className="min-h-[220px] flex-1 overflow-auto bg-white p-3 text-[11px] leading-5 text-stone-800 scrollbar-thin dark:bg-stone-950 dark:text-stone-200">
        {formattedCode ? (
          <code>{formattedCode}</code>
        ) : (
          <code className="text-stone-400">{emptyText || "No code generated yet."}</code>
        )}
      </pre>
    </section>
  );
}
