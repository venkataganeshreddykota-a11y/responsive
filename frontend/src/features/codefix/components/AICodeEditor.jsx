import { useMemo, useState } from "react";
import { FiCheck, FiCopy, FiMaximize2, FiMinimize2 } from "react-icons/fi";

// Dark glassmorphism palette
const E = {
  bg:       "rgba(255,255,255,0.03)",          // glass card bg
  bgHeader: "rgba(255,255,255,0.05)",          // header slightly lighter
  border:   "rgba(255,255,255,0.08)",          // subtle glass border
  borderTop:"rgba(249,115,22,0.35)",           // orange top accent
  codeBg:   "rgba(0,0,0,0.25)",               // code area darker
  lineHover:"rgba(249,115,22,0.07)",           // line hover
  lineNum:  "rgba(255,255,255,0.15)",          // line numbers
  lineDiv:  "rgba(255,255,255,0.06)",          // line number divider
  text:     "#e8d5b8",                         // warm code text
  muted:    "rgba(255,255,255,0.3)",           // muted labels
  btnBg:    "rgba(255,255,255,0.06)",          // button bg
  btnBorder:"rgba(255,255,255,0.1)",           // button border
  btnText:  "rgba(255,255,255,0.5)",           // button text
  orange:   "#f97316",
};

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
    .split("\n").map((l) => l.trimEnd()).join("\n").trim();
  return formatted.replace(/__CSS_STRING_(\d+)__/g, (_, i) => strings[Number(i)] || "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function highlightCssPlain(s) {
  return escapeHtml(s)
    .replace(/(@[\w-]+)/g, '<span class="et-kw">$1</span>')
    .replace(/((?:--)?[a-zA-Z_-][\w-]*)(\s*:)/g, '<span class="et-prop">$1</span>$2')
    .replace(/([.#]?-?[_a-zA-Z][\w-]*)(?=\s*(?:,|\{))/g, '<span class="et-sel">$1</span>')
    .replace(/\b(-?\d*\.?\d+(?:px|rem|em|vh|vw|%|s|ms|deg)?|#[0-9a-fA-F]{3,8})\b/g, '<span class="et-num">$1</span>')
    .replace(/\b(display|position|relative|absolute|fixed|sticky|flex|grid|block|inline|none|auto|hidden|visible|center|space-between|column|row|wrap|nowrap|calc|min|max|clamp|var|rgb|rgba|hsl|hsla)\b/g, '<span class="et-val">$1</span>');
}

function highlightJsPlain(s) {
  return escapeHtml(s)
    .replace(/\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|true|false|null|undefined)\b/g, '<span class="et-kw">$1</span>')
    .replace(/\b([a-zA-Z_$][\w$]*)(?=\s*\()/g, '<span class="et-fn">$1</span>')
    .replace(/\b(-?\d*\.?\d+)\b/g, '<span class="et-num">$1</span>')
    .replace(/\b(document|window|console|Array|Object|Promise|Math|Date|JSON)\b/g, '<span class="et-val">$1</span>');
}

function highlightProtectedLine(line, tokenRegex, plainHighlighter) {
  let html = "", cursor = 0, match;
  while ((match = tokenRegex.exec(line)) !== null) {
    html += plainHighlighter(line.slice(cursor, match.index));
    const token = match[0];
    const cls = token.startsWith("/*") || token.startsWith("//") ? "et-comment" : "et-str";
    html += `<span class="${cls}">${escapeHtml(token)}</span>`;
    cursor = match.index + token.length;
  }
  html += plainHighlighter(line.slice(cursor));
  return html || " ";
}

function highlightLine(line, language) {
  if (language === "css") return highlightProtectedLine(line, /\/\*.*?\*\/|(["'])(?:\\.|(?!\1).)*\1/g, highlightCssPlain);
  if (language === "javascript" || language === "js") return highlightProtectedLine(line, /\/\/.*$|\/\*.*?\*\/|(["'`])(?:\\.|(?!\1).)*\1/g, highlightJsPlain);
  return escapeHtml(line) || " ";
}

function getLanguageLabel(language) {
  if (language === "css") return "CSS";
  if (language === "html") return "HTML";
  if (language === "javascript" || language === "js") return "JavaScript";
  return "Text";
}

export default function AICodeEditor({ title, code, emptyText, copied, onCopy, action, language = "css" }) {
  const [wrapLines, setWrapLines] = useState(false);
  const formattedCode = language === "css" ? formatCss(code) : stripEditorArtifacts(code);
  const lines = useMemo(() => (formattedCode ? formattedCode.split("\n") : []), [formattedCode]);
  const lineCount = Math.max(lines.length, formattedCode ? 1 : 0);
  const charCount = formattedCode.length;

  return (
    <section
      className="et-editor flex flex-1 flex-col overflow-hidden"
      style={{
        background: E.bg,
        border: `1px solid ${E.border}`,
        borderTop: `2px solid ${E.borderTop}`,
        borderRadius: "10px",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
        height: "100%",
        minHeight: "inherit",
      }}
    >
      <style>{`
        .et-editor .et-comment { color: #6a7a5a; font-style: italic; }
        .et-editor .et-kw     { color: #f97316; }
        .et-editor .et-sel    { color: #fb923c; }
        .et-editor .et-prop   { color: #d4b896; }
        .et-editor .et-val    { color: #c8956a; }
        .et-editor .et-str    { color: #e8a87c; }
        .et-editor .et-num    { color: #fbbf24; }
        .et-editor .et-fn     { color: #fdba74; }
      `}</style>

      {/* Header */}
      <div style={{
        background: E.bgHeader,
        borderBottom: `1px solid ${E.border}`,
        padding: "10px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
        minHeight: 44,
      }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ color: "#f0e6d8", fontSize: "12px", fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </h3>
          <p style={{ color: E.muted, fontSize: "10px", fontWeight: 600, marginTop: "2px" }}>
            {getLanguageLabel(language)}
            <span style={{ margin: "0 5px", color: "rgba(255,255,255,0.12)" }}>/</span>
            {lineCount} lines
            <span style={{ margin: "0 5px", color: "rgba(255,255,255,0.12)" }}>/</span>
            {charCount.toLocaleString()} chars
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          {action}
          <button
            type="button"
            onClick={() => setWrapLines((v) => !v)}
            style={{ background: E.btnBg, border: `1px solid ${E.btnBorder}`, color: E.btnText, borderRadius: "6px", padding: "0 8px", height: 26, fontSize: "11px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "5px", cursor: "pointer" }}
            title={wrapLines ? "Disable line wrapping" : "Enable line wrapping"}
          >
            {wrapLines ? <FiMinimize2 size={11} /> : <FiMaximize2 size={11} />}
            {wrapLines ? "Wrap" : "Scroll"}
          </button>
          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              disabled={!code}
              style={{ background: E.btnBg, border: `1px solid ${E.btnBorder}`, color: E.btnText, borderRadius: "6px", padding: "0 8px", height: 26, fontSize: "11px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "5px", cursor: "pointer", opacity: !code ? 0.4 : 1 }}
            >
              {copied ? <FiCheck size={11} /> : <FiCopy size={11} />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      </div>

      {/* Code area */}
      <div style={{ background: E.codeBg, flex: 1, overflow: "auto", minHeight: 0 }} className="scrollbar-thin">
        {lines.length ? (
          <code
            className={`block py-3 font-mono text-[12px] leading-6 ${wrapLines ? "min-w-full" : "min-w-max"}`}
            style={{ color: E.text }}
          >
            {lines.map((line, index) => (
              <div
                key={`${index}-${line.slice(0, 12)}`}
                className={`grid min-h-6 grid-cols-[3.5rem_minmax(0,1fr)] ${wrapLines ? "min-w-0" : "min-w-max"}`}
                onMouseEnter={(e) => { e.currentTarget.style.background = E.lineHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ borderRight: `1px solid ${E.lineDiv}`, color: E.lineNum, fontSize: "11px", textAlign: "right", paddingRight: "12px", userSelect: "none" }}>
                  {index + 1}
                </span>
                <span
                  className={`pl-4 pr-5 ${wrapLines ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
                  dangerouslySetInnerHTML={{ __html: highlightLine(line, language) }}
                />
              </div>
            ))}
          </code>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 280, gap: "12px", padding: "24px", textAlign: "center" }}>
            <span style={{ fontSize: 32, opacity: 0.15, color: "#f97316" }}>{"{ }"}</span>
            <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "12px", lineHeight: 1.6, maxWidth: 240, fontFamily: "monospace" }}>
              {emptyText || "No code generated yet."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
