import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FiAlertTriangle, FiCheck, FiCode, FiCopy, FiCpu, FiPlay, FiRefreshCw, FiShield, FiX } from "react-icons/fi";
import api from "../../../services/axios";
import AICodeEditor from "./AICodeEditor";
import DeviceIssueViewer, { buildIssueGroups, getSelectedDeviceIssues } from "./DeviceIssueViewer";
import FixPreview from "./FixPreview";

const TABS = ["Issues", "Generated Code", "Preview"];
// Dark glass card tokens used by sub-components
const G = {
  card:    "rgba(255,255,255,0.04)",
  cardHov: "rgba(255,255,255,0.06)",
  border:  "rgba(255,255,255,0.08)",
  borderO: "rgba(249,115,22,0.3)",
  orange:  "#f97316",
  orangeD: "rgba(249,115,22,0.15)",
  text:    "#f0e6d8",
  soft:    "#a89070",
  muted:   "rgba(255,255,255,0.3)",
  btnBg:   "rgba(255,255,255,0.06)",
  btnBdr:  "rgba(255,255,255,0.1)",
  btnTxt:  "rgba(255,255,255,0.55)",
};

function getRegisteredFrame(deviceKey) {
  const registry = window.__responsiveToolFrames || {};
  return registry[deviceKey] || Object.values(registry)[0] || null;
}

function collectDomInfo(doc) {
  const uniqueSelector = (element) => {
    if (!element || element.nodeType !== 1) return "";
    if (element.id) return `#${CSS.escape(element.id)}`;
    const parts = [];
    let current = element;
    while (current && current.nodeType === 1 && current !== doc.body && parts.length < 4) {
      let part = current.tagName.toLowerCase();
      const classes = Array.from(current.classList || []).filter(Boolean).slice(0, 3);
      if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join("");
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === current.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.length ? parts.join(" > ") : element.tagName.toLowerCase();
  };

  const selectors = Array.from(doc.querySelectorAll("body *"))
    .slice(0, 180)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const styles = doc.defaultView.getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || "",
        className: typeof element.className === "string" ? element.className.split(/\s+/).slice(0, 5).join(" ") : "",
        selector: uniqueSelector(element),
        text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || "",
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        display: styles.display,
        position: styles.position,
        overflow: styles.overflow,
      };
    });

  return {
    title: doc.title,
    viewport: {
      width: doc.documentElement.clientWidth,
      height: doc.documentElement.clientHeight,
      scrollWidth: doc.documentElement.scrollWidth,
      scrollHeight: doc.documentElement.scrollHeight,
    },
    counts: {
      images: doc.images.length,
      links: doc.links.length,
      forms: doc.forms.length,
      buttons: doc.querySelectorAll("button, input, select, textarea, [role='button']").length,
    },
    selectors,
  };
}

function collectCss(doc) {
  const chunks = [];
  doc.querySelectorAll("style").forEach((style) => {
    if (style.id !== "responsive-tool-ai-fix") chunks.push(style.textContent || "");
  });
  Array.from(doc.styleSheets).forEach((sheet) => {
    try {
      const rules = Array.from(sheet.cssRules || []).map((rule) => rule.cssText).join("\n");
      if (rules) chunks.push(rules);
    } catch (_) {
      const href = sheet.href ? `/* External stylesheet: ${sheet.href} */` : "";
      if (href) chunks.push(href);
    }
  });
  return chunks.join("\n\n").slice(0, 65000);
}

function snapshotDoc(doc) {
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function injectCss(frameEntry, css) {
  const doc = frameEntry?.iframe?.contentDocument;
  if (!doc || !css) return "";
  const before = snapshotDoc(doc);
  let style = doc.getElementById("responsive-tool-ai-fix");
  if (!style) {
    style = doc.createElement("style");
    style.id = "responsive-tool-ai-fix";
    style.setAttribute("data-responsive-tool", "code-fix");
    (doc.head || doc.documentElement).appendChild(style);
  }
  style.textContent = css;
  return before;
}

function lineCount(value) {
  const text = String(value || "").trim();
  return text ? text.split(/\r?\n/).length : 0;
}

function buildAffectedElements(dom) {
  const viewport = dom?.viewport || {};
  const selectors = Array.isArray(dom?.selectors) ? dom.selectors : [];
  const viewportWidth = Number(viewport.width || 0);
  return selectors
    .filter((item) => {
      const rect = item.rect || {};
      const text = `${item.tag || ""} ${item.id || ""} ${item.className || ""} ${item.text || ""}`.toLowerCase();
      const overflows = viewportWidth && (Number(rect.x || 0) < 0 || Number(rect.x || 0) + Number(rect.width || 0) > viewportWidth);
      const ctaLike = /\b(start\s*now|primarybtn|primary-btn|cta|call-to-action)\b/i.test(text);
      const buttonLike = /\b(button|btn|chip|pill|tag|filter|badge|role.?button)\b/i.test(text) || ["button", "a", "input", "select", "textarea"].includes(item.tag);
      return overflows || ctaLike || buttonLike;
    })
    .slice(0, 8);
}

function formatElementLabel(item) {
  if (!item) return "No affected element identified yet";
  const parts = [item.tag];
  if (item.id) parts.push(`#${item.id}`);
  if (item.className) parts.push(`.${item.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`);
  const text = item.text ? ` - ${item.text.slice(0, 48)}` : "";
  return `${parts.filter(Boolean).join("")}${text}`;
}

function normalizeFixResult(data) {
  return {
    ...data,
    fixed_css: data.generated_css || data.fixed_css || "",
    generated_css: data.generated_css || data.fixed_css || "",
    fixed_html: data.generated_html || data.fixed_html || data.optional_html || "",
    generated_html: data.generated_html || data.fixed_html || data.optional_html || "",
    fixed_js: data.generated_js || data.fixed_js || "",
    generated_js: data.generated_js || data.fixed_js || "",
  };
}

function hasStructuralRisk(issues = [], elements = []) {
  const issueText = issues
    .map((issue) => `${issue.title || ""} ${issue.description || ""} ${issue.category || ""}`)
    .join(" ")
    .toLowerCase();
  const elementText = elements
    .map((item) => `${item.tag || ""} ${item.id || ""} ${item.className || ""} ${item.text || ""}`)
    .join(" ")
    .toLowerCase();
  return /(overflow|overlap|clipp|layout|button|cta|menu|nav|hero|card|fixed|absolute|position)/i.test(issueText + " " + elementText);
}

function patchFromResult(result) {
  return {
    css: result?.generated_css || result?.fixed_css || "",
    html: result?.generated_html || result?.fixed_html || result?.optional_html || "",
    js: result?.generated_js || result?.fixed_js || "",
  };
}

function hasForbiddenResponsivePatch(patch) {
  const css = patch?.css || "";
  const js = patch?.js || "";
  const html = patch?.html || "";
  return (
    /overflow-x\s*:\s*(hidden|clip)\b/i.test(css) ||
    /overflow\s*:\s*(hidden|clip)\b/i.test(css) ||
    /clip-path\s*:\s*(?!none\b)[^;]+/i.test(css) ||
    /transform\s*:\s*[^;]*(scale|translate|translateX|translate3d)\s*\(/i.test(css) ||
    /\.(?:style\.)?(?:overflowX|overflow)\s*=\s*["'](?:hidden|clip)["']/i.test(js) ||
    /\.style\.transform\s*=|translateX\s*\(|scale\s*\(/i.test(js) ||
    /\sstyle\s*=\s*["'][^"']*(?:overflow-x\s*:\s*(?:hidden|clip)|transform\s*:|clip-path\s*:)/i.test(html)
  );
}

function rescueResultFrom(baseResult, device, explanation) {
  const rescuePatch = buildRescuePatch(device);
  return {
    ...(baseResult || {}),
    generated_css: rescuePatch.css,
    fixed_css: rescuePatch.css,
    generated_html: "",
    fixed_html: "",
    optional_html: "",
    generated_js: rescuePatch.js,
    fixed_js: rescuePatch.js,
    confidence: 0.5,
    explanation,
    structural_retry: true,
    rescue_patch: true,
    unsafe_generated_patch_replaced: true,
  };
}

function summarizeValidation(preview) {
  const notes = [];
  if (preview?.validation_reason) notes.push(preview.validation_reason);
  (preview?.validation_violations || []).slice(0, 5).forEach((violation) => {
    const flags = [
      violation.horizontalOverflow ? "horizontal overflow" : "",
      violation.anchorDrift ? "anchor drift" : "",
      violation.becameMoreClipped ? "became clipped" : "",
      violation.outsideViewport ? "outside viewport" : "",
      violation.missing ? "missing" : "",
    ].filter(Boolean).join(", ");
    notes.push(`Affected element: ${violation.label || "unknown"}${flags ? ` (${flags})` : ""}.`);
  });
  if (preview?.html_patch?.skipped && preview.html_patch.reason) notes.push(preview.html_patch.reason);
  if (preview?.js_patch?.skipped && preview.js_patch.reason) notes.push(preview.js_patch.reason);
  return notes;
}

function buildRescuePatch(device) {
  const maxWidth = Math.max(320, Number(device?.width || 768));
  const css = `/* Code Fix rescue patch: wrap wide groups without hiding or scaling controls */
@media (max-width: ${maxWidth}px) {
  html,
  body {
    width: 100%;
    max-width: 100%;
  }

  body * {
    box-sizing: border-box;
    min-width: 0;
  }

  img,
  video,
  canvas,
  svg,
  iframe {
    max-width: 100%;
    height: auto;
  }

  [class*="container"],
  [class*="Container"],
  [class*="contentContainer"],
  [class*="content"],
  [class*="Content"],
  [class*="hero"],
  [class*="Hero"],
  [class*="card"],
  [class*="Card"] {
    width: auto;
    max-width: 100%;
    min-width: 0;
  }

  [class*="row"],
  [class*="Row"],
  [class*="list"],
  [class*="List"],
  [class*="actions"],
  [class*="Actions"],
  [class*="buttonGroup"],
  [class*="ButtonGroup"],
  [class*="chips"],
  [class*="Chips"],
  [class*="tags"],
  [class*="Tags"] {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-width: 0;
    max-width: 100%;
  }

  [class*="chip"],
  [class*="Chip"],
  [class*="pill"],
  [class*="Pill"],
  [class*="tag"],
  [class*="Tag"],
  [class*="badge"],
  [class*="Badge"],
  button,
  a[role="button"] {
    max-width: 100%;
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  a,
  p,
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    overflow-wrap: anywhere;
  }
}`;

  const js = `(() => {
  const MARK = "data-responsive-tool-rescue";
  const viewportWidth = () => document.documentElement.clientWidth || window.innerWidth || ${maxWidth};
  const isSkippable = (element) => ["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT"].includes(element.tagName);
  const textOf = (element) => (element.innerText || element.textContent || element.getAttribute("aria-label") || "").trim();
  const isChipLike = (element) => /chip|pill|tag|badge|filter|more/i.test(element.className || "") || /^&?\\s*more$/i.test(textOf(element));
  const isLayoutGroup = (element) => {
    const identity = \`\${element.tagName || ""} \${element.id || ""} \${element.className || ""} \${textOf(element)}\`.toLowerCase();
    return /container|content|hero|card|row|list|actions|button.?group|chips|tags|entity|company|bookkeeping|compliance|registration|certification|credential/.test(identity);
  };

  const apply = () => {
    const vw = viewportWidth();
    const pageWidth = Math.max(0, document.documentElement.clientWidth || vw);
    document.documentElement.style.maxWidth = "100%";
    document.body.style.maxWidth = "100%";

    const elements = Array.from(document.body.querySelectorAll("*")).filter((element) => !isSkippable(element));
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = window.getComputedStyle(element);
      const overflows = rect.width > pageWidth || rect.right > pageWidth + 1;
      const chipLike = isChipLike(element);
      const layoutGroup = isLayoutGroup(element);

      if (chipLike) {
        element.style.maxWidth = "100%";
        element.style.minWidth = "0";
        element.style.whiteSpace = "normal";
        element.style.overflowWrap = "anywhere";
      }

      if (layoutGroup || (overflows && element.children.length > 1)) {
        element.style.minWidth = "0";
        element.style.maxWidth = "100%";
        if (style.display === "flex" || element.children.length > 1) {
          element.style.flexWrap = "wrap";
        }
      }

      if (!overflows) continue;
      element.setAttribute(MARK, "1");
      element.style.boxSizing = "border-box";
      element.style.minWidth = "0";
      element.style.maxWidth = "100%";
      if (rect.width > pageWidth) {
        element.style.width = "100%";
      }

      if (style.display === "flex") {
        element.style.flexWrap = element.style.flexWrap || "wrap";
      }
    }
  };

  apply();
  if (!window.__responsiveToolRescueResize) {
    window.__responsiveToolRescueResize = true;
    let timer = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 80);
    }, { passive: true });
  }
})();`;

  return { css, html: "", js };
}

function ApplyFixSidePanel({ result, selectedIssues, affectedElements }) {
  const css = result?.generated_css || result?.fixed_css || "";
  const html = result?.generated_html || result?.fixed_html || result?.optional_html || "";
  const js = result?.generated_js || result?.fixed_js || "";
  const primaryIssue = selectedIssues?.[0];
  const primaryElement = affectedElements?.[0];

  const patches = [
    { label: "CSS",  value: css,  lines: lineCount(css)  },
    { label: "HTML", value: html, lines: lineCount(html) },
    { label: "JS",   value: js,   lines: lineCount(js)   },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        {[
          { label: "Detected Issue", content: primaryIssue?.title || "No issue selected — run a scan first.", sub: primaryIssue?.description },
          { label: "Affected Element", content: formatElementLabel(primaryElement), sub: affectedElements?.length > 1 ? `+${affectedElements.length - 1} more candidate${affectedElements.length === 2 ? "" : "s"}` : null },
        ].map(({ label, content, sub }) => (
          <div key={label} style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: "10px", padding: "12px 14px", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
            <p style={{ color: G.muted, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>{label}</p>
            <p style={{ color: G.text, fontSize: "12px", fontWeight: 700, lineHeight: 1.5, wordBreak: "break-all" }}>{content}</p>
            {sub && <p style={{ color: G.soft, fontSize: "11px", marginTop: "5px", lineHeight: 1.45 }}>{sub}</p>}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
        {patches.map(({ label, value, lines }) => (
          <div key={label} style={{ background: value ? "rgba(249,115,22,0.08)" : G.card, border: `1px solid ${value ? G.borderO : G.border}`, borderRadius: "10px", padding: "10px 12px", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", transition: "all 0.2s" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: G.text, fontSize: "13px", fontWeight: 800 }}>{label}</span>
              <span style={{ borderRadius: "999px", padding: "2px 8px", fontSize: "10px", fontWeight: 800, background: value ? G.orange : "transparent", color: value ? "#fff" : G.muted, border: `1px solid ${value ? G.orange : G.border}` }}>
                {value ? "Ready" : "None"}
              </span>
            </div>
            <p style={{ color: G.soft, fontSize: "11px", marginTop: "4px" }}>
              {value ? `${lines} line${lines === 1 ? "" : "s"}` : label === "HTML" ? "No markup change" : label === "JS" ? "No behavior change" : "Not generated"}
            </p>
          </div>
        ))}
      </div>

      {result?.explanation && (
        <div style={{ background: "rgba(249,115,22,0.06)", border: `1px solid ${G.borderO}`, borderRadius: "10px", padding: "12px 14px", color: G.soft, fontSize: "12px", lineHeight: 1.7, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
          <p style={{ color: G.muted, fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>AI Explanation</p>
          {result.explanation}
        </div>
      )}
    </div>
  );
}

function FixActionToolbar({ result, applied, loading, contextLoading, copied, aiAvailable, onGenerate, onApply, onCopy }) {
  const css = result?.generated_css || result?.fixed_css || "";
  const html = result?.generated_html || result?.fixed_html || result?.optional_html || "";
  const js = result?.generated_js || result?.fixed_js || "";
  const hasFix = Boolean(css || html || js);
  const isWorking = loading || contextLoading;

  return (
    <div style={{ background: G.card, border: `1px solid ${G.border}`, borderRadius: "12px", padding: "16px 20px", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", boxShadow: "0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        <span style={{ width: 36, height: 36, borderRadius: "10px", flexShrink: 0, background: isWorking ? "rgba(249,115,22,0.12)" : hasFix ? "rgba(249,115,22,0.15)" : G.card, border: `1px solid ${isWorking || hasFix ? G.borderO : G.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: G.orange }}>
          {isWorking
            ? <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid rgba(255,255,255,0.1)`, borderTopColor: G.orange, animation: "spin 0.7s linear infinite", display: "inline-block" }} />
            : <FiCode size={16} />}
        </span>
        <div>
          <p style={{ color: G.text, fontSize: "14px", fontWeight: 800, lineHeight: 1.2 }}>
            {isWorking ? (loading ? "Generating fix…" : "Loading context…") : hasFix ? "Patch ready to apply" : "No patch generated yet"}
          </p>
          <p style={{ color: G.muted, fontSize: "11px", marginTop: "3px" }}>
            {isWorking
              ? loading ? "OpenAI is analyzing HTML, CSS, JavaScript, and device issues" : "Fetching HTML, CSS, and JavaScript"
              : hasFix ? `CSS ${lineCount(css)}L · HTML ${lineCount(html) || "—"} · JS ${lineCount(js) || "—"}`
              : "Click Generate Fix to create an AI-powered responsive patch"}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" onClick={onGenerate} disabled={isWorking || !aiAvailable}
          style={{ height: 38, padding: "0 18px", borderRadius: "9px", fontSize: "13px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "7px", cursor: "pointer", background: G.btnBg, border: `1px solid ${G.btnBdr}`, color: G.btnTxt, opacity: (isWorking || !aiAvailable) ? 0.5 : 1, transition: "all 0.15s" }}>
          <FiRefreshCw size={13} />
          {loading ? "Generating…" : "Generate Fix"}
        </button>

        <button type="button" onClick={onApply} disabled={!hasFix || isWorking}
          style={{ height: 38, padding: "0 20px", borderRadius: "9px", fontSize: "13px", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "7px", cursor: "pointer", background: hasFix && !isWorking ? G.orange : G.btnBg, border: `1px solid ${hasFix && !isWorking ? G.orange : G.btnBdr}`, color: hasFix && !isWorking ? "#fff" : G.muted, opacity: (!hasFix || isWorking) ? 0.5 : 1, boxShadow: hasFix && !isWorking ? "0 4px 16px rgba(249,115,22,0.35)" : "none", transition: "all 0.15s" }}>
          <FiPlay size={13} />
          {applied ? "Apply Again" : "Apply Fix"}
        </button>

        <button type="button" onClick={onCopy} disabled={!hasFix}
          style={{ height: 38, padding: "0 16px", borderRadius: "9px", fontSize: "13px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "7px", cursor: "pointer", background: copied ? "rgba(249,115,22,0.12)" : G.btnBg, border: `1px solid ${copied ? G.borderO : G.btnBdr}`, color: copied ? G.orange : G.btnTxt, opacity: !hasFix ? 0.4 : 1, transition: "all 0.15s" }}>
          {copied ? <FiCheck size={13} /> : <FiCopy size={13} />}
          {copied ? "Copied!" : "Copy Code"}
        </button>
      </div>
    </div>
  );
}

export default function CodeFixPanel({
  open,
  onClose,
  url,
  selectedDevice,
  issues,
  issueGroups,
  deviceStatus,
}) {
  const [activeTab, setActiveTab] = useState("Issues");
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [result, setResult] = useState(null);
  const [sourceContext, setSourceContext] = useState(null);
  const [originalHtml, setOriginalHtml] = useState("");
  const [originalCss, setOriginalCss] = useState("");
  const [originalJs, setOriginalJs] = useState("");
  const [aiAvailable, setAiAvailable] = useState(true);
  const [beforeHtml, setBeforeHtml] = useState("");
  const [afterHtml, setAfterHtml] = useState("");
  const [beforeImage, setBeforeImage] = useState("");
  const [afterImage, setAfterImage] = useState("");
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);

  const categorizedIssues = useMemo(
    () => buildIssueGroups({ issues, issueGroups, deviceStatus, selectedDevice }),
    [deviceStatus, issueGroups, issues, selectedDevice]
  );

  const selectedIssues = useMemo(
    () => getSelectedDeviceIssues({ issues, issueGroups, deviceStatus, selectedDevice }),
    [deviceStatus, issueGroups, issues, selectedDevice]
  );

  const selectedIssuePayload = useMemo(() => selectedIssues.map((issue) => ({
      category: issue.category || "",
      title: issue.title,
      description: issue.description || issue.detail || "",
      severity: issue.severity || "info",
  })), [selectedIssues]);

  const affectedElements = useMemo(
    () => buildAffectedElements(sourceContext?.dom),
    [sourceContext?.dom]
  );

  useEffect(() => {
    if (open) setActiveTab("Issues");
  }, [open, selectedDevice?.key, url]);

  useEffect(() => {
    if (!open || !url) return undefined;
    let ignore = false;

    const fetchContext = async () => {
      setContextLoading(true);
      setError("");
      setWarning("");
      setResult(null);
      setApplied(false);
      setBeforeHtml("");
      setAfterHtml("");
      setBeforeImage("");
      setAfterImage("");
      setOriginalJs("");
      let liveContext = null;
      try {
        try {
          liveContext = await extractContext({ silent: true });
        } catch (_) {
          liveContext = null;
        }

        const { data } = await api.post("/scanner/ai/context/", {
          url,
          device: {
            key: selectedDevice?.key,
            name: selectedDevice?.label,
            width: selectedDevice?.width,
            height: selectedDevice?.height,
            statusKey: selectedDevice?.statusKey,
          },
          issues: selectedIssuePayload,
        });
        if (ignore) return;
        const merged = {
          html: liveContext?.html || data.original_html || "",
          css: liveContext?.css || data.original_css || "",
          js: liveContext?.js || data.original_js || "",
          dom: liveContext?.dom || {},
        };
        setOriginalHtml(merged.html);
        setOriginalCss(merged.css);
        setOriginalJs(merged.js);
        setSourceContext((prev) => ({
          ...(prev || {}),
          ...merged,
        }));
        setAiAvailable(data.ai_available !== false);
        const sourceWarnings = [];
        if (!liveContext?.css && data.original_css) sourceWarnings.push("CSS was filled from backend extraction because Chrome Inspect did not expose readable stylesheets.");
        if (!liveContext?.js && data.original_js) sourceWarnings.push("JavaScript was filled from backend extraction because Chrome Inspect did not expose readable scripts.");
        setWarning(data.config_warning || sourceWarnings.join(" "));
        setResult({
          original_html: merged.html,
          original_css: merged.css,
          original_js: merged.js,
          generated_css: "",
          fixed_css: "",
          issues: data.issues || [],
          device_name: data.device_name || selectedDevice?.label || "",
          resolution: data.resolution || "",
        });
      } catch (err) {
        if (ignore) return;
        setWarning(err.response?.data?.detail || "Backend HTML/CSS extraction failed. The panel will still use the live browser when possible.");
        try {
          const live = await extractContext({ silent: true });
          setOriginalHtml(live.html || "");
          setOriginalCss(live.css || "");
          setOriginalJs(live.js || "");
        } catch (_) {
          // Keep the panel usable even when extraction is unavailable.
        }
      } finally {
        if (!ignore) setContextLoading(false);
      }
    };

    fetchContext();
    return () => {
      ignore = true;
    };
  }, [open, url, selectedDevice?.key, selectedIssuePayload]);

  if (!open) return null;

  const extractContext = async ({ silent = false } = {}) => {
    const frameEntry = getRegisteredFrame(selectedDevice?.key);
    if (frameEntry?.inspectPage) {
      const inspected = await frameEntry.inspectPage();
      const context = {
        html: inspected.html || "",
        css: inspected.css || "",
        js: inspected.js || "",
        dom: inspected.dom || {},
      };
      setSourceContext(context);
      if (context.html) setOriginalHtml(context.html);
      if (context.css) setOriginalCss(context.css);
      if (context.js) setOriginalJs(context.js);
      if (!silent && !context.css && !originalCss) {
        setWarning("No stylesheet rules were readable from the selected live browser. Backend extraction will still be shown when available.");
      }
      return context;
    }
    const doc = frameEntry?.iframe?.contentDocument;
    if (!doc) {
      if (originalHtml || originalCss || originalJs) {
        return {
          html: originalHtml,
          css: originalCss,
          js: originalJs,
          dom: sourceContext?.dom || {},
        };
      }
      throw new Error("The selected live preview is still loading. Wait for the live browser to finish, then try again.");
    }
    const context = {
      html: snapshotDoc(doc).slice(0, 65000),
      css: collectCss(doc),
      js: "",
      dom: collectDomInfo(doc),
    };
    setSourceContext(context);
    if (context.html) setOriginalHtml((prev) => prev || context.html);
    if (context.css) setOriginalCss((prev) => prev || context.css);
    if (!silent && !context.css && !originalCss) {
      setWarning("No stylesheet rules were readable from the fallback iframe. Backend extraction will still be shown when available.");
    }
    return context;
  };

  const generateFix = async () => {
    if (!aiAvailable) return;
    setLoading(true);
    setError("");
    setWarning("");
    setCopied(false);
    try {
      const context = await extractContext();
      const requestPayload = {
        url,
        html: originalHtml || context.html,
        css: originalCss || context.css,
        js: originalJs || context.js,
        dom: context.dom,
        device: {
          key: selectedDevice?.key,
          name: selectedDevice?.label,
          width: selectedDevice?.width,
          height: selectedDevice?.height,
          statusKey: selectedDevice?.statusKey,
        },
        issues: selectedIssuePayload,
      };
      const firstResponse = await api.post("/scanner/ai/fix/", requestPayload);
      let nextResult = normalizeFixResult(firstResponse.data);
      const contextElements = buildAffectedElements(context.dom);
      const cssOnly = Boolean(nextResult.generated_css) && !nextResult.generated_html && !nextResult.generated_js;
      const needsStructuralRetry = cssOnly && hasStructuralRisk(selectedIssuePayload, contextElements);

      if (needsStructuralRetry) {
        const retryResponse = await api.post("/scanner/ai/fix/", {
          ...requestPayload,
          require_structural_patch: true,
          previous_patch: {
            fixed_css: nextResult.generated_css,
            fixed_html: nextResult.generated_html,
            fixed_js: nextResult.generated_js,
            explanation: nextResult.explanation || "",
          },
          validation_notes: [
            "The first patch was CSS-only for a structural responsive issue.",
            "Review CTA/button/card/menu placement and include fixed_html or fixed_js if CSS alone can create drift, overlap, clipping, or broken interaction.",
          ],
        });
        const retryResult = normalizeFixResult(retryResponse.data);
        if (retryResult.generated_html || retryResult.generated_js || retryResult.generated_css) {
          nextResult = { ...retryResult, structural_retry: true };
        }
      }

      const nextPatch = patchFromResult(nextResult);
      if (hasForbiddenResponsivePatch(nextPatch)) {
        nextResult = rescueResultFrom(
          nextResult,
          selectedDevice,
          "The generated patch used hidden overflow, clipping, scaling, or transform-based clamping, so Code Fix replaced it with a deterministic wrapping/fluid-width rescue patch."
        );
      }

      setResult(nextResult);
      if (nextResult.validation_warnings?.length) {
        setWarning(`Some generated code was narrowed to preserve the original layout: ${nextResult.validation_warnings.slice(0, 2).join(" ")}`);
      } else if (nextResult.unsafe_generated_patch_replaced) {
        setWarning("Generated patch used a forbidden overflow/clipping strategy, so Code Fix replaced it with a wrapping/fluid-width rescue patch.");
      } else if (nextResult.structural_retry && !nextResult.generated_html && !nextResult.generated_js) {
        setWarning("The structural retry still returned a CSS-only patch. Apply validation will reject it if it moves or clips important controls.");
      } else if (nextResult.structural_retry) {
        setWarning("The first answer was CSS-only, so Code Fix ran a structural retry and included the safer multi-part patch returned by AI.");
      }
      setOriginalHtml(nextResult.original_html || originalHtml || context.html || "");
      setOriginalCss(nextResult.original_css || originalCss || context.css || "");
      setOriginalJs(nextResult.original_js || originalJs || context.js || "");
      setActiveTab("Generated Code");
    } catch (err) {
      if (err.response?.data?.code === "openai_not_configured") {
        setAiAvailable(false);
        setWarning(err.response.data.detail || "OPENAI_API_KEY is not configured. AI generation is disabled.");
      } else {
        setError(err.response?.data?.detail || err.message || "AI fix generation failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    const code = [
      result?.generated_css || result?.fixed_css || "",
      result?.generated_html || result?.fixed_html || result?.optional_html || "",
      result?.generated_js || result?.fixed_js || "",
    ].filter(Boolean).join("\n\n");
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (_) {
      window.prompt("Copy generated patch", code);
    }
  };

  const handlePreviewResult = (preview, successMessage = "") => {
    setBeforeHtml(preview.before_html || originalHtml || "");
    setAfterHtml(preview.after_html || "");
    setBeforeImage(preview.before_image || "");
    setAfterImage(preview.after_image || "");

    if (preview.accepted === false) {
      const moved = preview.validation_violations?.[0];
      const detail = moved?.label ? ` Affected element: ${moved.label}.` : "";
      setError(`${preview.validation_reason || "Generated patch was rejected because it changed the original layout."}${detail}`);
      setApplied(false);
    } else {
      setError("");
      if (preview.partial) {
        const skipped = preview.skipped_rules?.length || 0;
        const messages = [];
        if (preview.validation_reason) messages.push(preview.validation_reason);
        else if (skipped) messages.push(`Applied generated fix and skipped ${skipped} CSS rule${skipped === 1 ? "" : "s"} that would hide or clip controls.`);
        else messages.push(successMessage || "Applied the safe part of the generated fix.");
        if (preview.html_patch?.skipped && preview.html_patch?.reason) messages.push(preview.html_patch.reason);
        if (preview.js_patch?.skipped && preview.js_patch?.reason) messages.push(preview.js_patch.reason);
        setWarning(messages.join(" "));
      } else {
        setWarning(successMessage);
      }
      setApplied(true);
    }
    setActiveTab("Preview");
  };

  const regenerateAfterRejectedApply = async (preview, frameEntry) => {
    setLoading(true);
    setError("");
    setWarning("Generated patch was rejected by live validation. Asking AI for a stricter structural repair...");
    try {
      const context = await extractContext({ silent: true });
      const currentPatch = patchFromResult(result);
      const validationNotes = summarizeValidation(preview);
      const { data } = await api.post("/scanner/ai/fix/", {
        url,
        html: originalHtml || context.html,
        css: originalCss || context.css,
        js: originalJs || context.js,
        dom: context.dom,
        device: {
          key: selectedDevice?.key,
          name: selectedDevice?.label,
          width: selectedDevice?.width,
          height: selectedDevice?.height,
          statusKey: selectedDevice?.statusKey,
        },
        issues: selectedIssuePayload,
        require_structural_patch: true,
        previous_patch: {
          fixed_css: currentPatch.css,
          fixed_html: currentPatch.html,
          fixed_js: currentPatch.js,
          explanation: result?.explanation || "",
        },
        validation_notes: [
          ...validationNotes,
          "The previous patch failed live apply validation. Return a replacement patch that removes horizontal overflow without clipping chips, CTAs, buttons, or the '& More' control.",
          "Do not use overflow-x hidden, transform scale, translate-based viewport clamping, clipping, or removal of important controls. Prefer flex-wrap, fluid widths, min-width: 0, and grid/flex column adjustments.",
          "If CSS alone cannot preserve the card/chip/button structure, include fixed_html and/or fixed_js.",
        ],
      });
      const retryResult = { ...normalizeFixResult(data), structural_retry: true };
      if (hasForbiddenResponsivePatch(patchFromResult(retryResult))) {
        const rescueResult = rescueResultFrom(
          retryResult,
          selectedDevice,
          "The regenerated patch still used hidden overflow, clipping, scaling, or transform-based clamping, so Code Fix replaced it with a deterministic wrapping/fluid-width rescue patch."
        );
        setResult(rescueResult);
        setOriginalHtml(rescueResult.original_html || originalHtml || context.html || "");
        setOriginalCss(rescueResult.original_css || originalCss || context.css || "");
        setOriginalJs(rescueResult.original_js || originalJs || context.js || "");
        const rescuePreview = frameEntry.applyFix
          ? await frameEntry.applyFix(patchFromResult(rescueResult))
          : await frameEntry.applyCss(rescueResult.generated_css);
        handlePreviewResult(rescuePreview, "Generated patch used a forbidden overflow/clipping strategy, so Code Fix applied a local wrapping rescue patch.");
        return;
      }
      setResult(retryResult);
      setOriginalHtml(retryResult.original_html || originalHtml || context.html || "");
      setOriginalCss(retryResult.original_css || originalCss || context.css || "");
      setOriginalJs(retryResult.original_js || originalJs || context.js || "");

      const retryPatch = patchFromResult(retryResult);
      const retryPreview = frameEntry.applyFix
        ? await frameEntry.applyFix(retryPatch)
        : await frameEntry.applyCss(retryPatch.css);
      if (retryPreview.accepted === false) {
        const rescueResult = rescueResultFrom(
          retryResult,
          selectedDevice,
          "The AI retry still failed live validation, so Code Fix applied a deterministic HTML/CSS/JS-safe rescue patch that converts wide containers and chip/button groups to fluid wrapping layouts."
        );
        setResult(rescueResult);
        const rescuePreview = frameEntry.applyFix
          ? await frameEntry.applyFix(patchFromResult(rescueResult))
          : await frameEntry.applyCss(rescueResult.generated_css);
        handlePreviewResult(rescuePreview, "AI retry failed validation, so Code Fix applied a local responsive rescue patch.");
        return;
      }
      handlePreviewResult(retryPreview, "Rejected patch was regenerated and applied with stricter layout validation.");
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Patch was rejected and the automatic repair retry failed.");
      setApplied(false);
    } finally {
      setLoading(false);
    }
  };

  const applyFix = () => {
    const frameEntry = getRegisteredFrame(selectedDevice?.key);
    const { css, html, js } = patchFromResult(result);
    setError("");
    setWarning("");
    if (frameEntry?.applyFix || frameEntry?.applyCss) {
      const request = frameEntry.applyFix
        ? frameEntry.applyFix({ css, html, js })
        : frameEntry.applyCss(css);
      request
        .then((preview) => {
          if (preview.accepted === false) {
            regenerateAfterRejectedApply(preview, frameEntry);
            return;
          }
          handlePreviewResult(preview);
        })
        .catch((err) => {
          setError(err.message || "Could not apply the generated patch to the selected live browser. Reload Live View and try again.");
        });
      return;
    }
    const before = injectCss(frameEntry, css);
    if (!before) {
      setError("Could not apply the generated patch to the selected live preview. Reload Live View and try again.");
      return;
    }
    const doc = frameEntry.iframe.contentDocument;
    setBeforeHtml(before);
    setAfterHtml(snapshotDoc(doc));
    setApplied(true);
    setActiveTab("Preview");
  };

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex justify-end" style={{ background: "rgba(28,26,23,0.46)" }} onClick={onClose}>
      <aside
        style={{ background: "#13110e", borderLeft: "1px solid #2e2620", boxShadow: "-24px 0 60px rgba(0,0,0,0.4)" }}
        className="flex h-full w-full max-w-[min(1380px,96vw)] flex-col shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <header style={{ background: "#1c1814", borderBottom: "1px solid #2e2620" }}
          className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span style={{ background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.25)", borderRadius: "8px" }}
              className="flex h-9 w-9 items-center justify-center">
              <FiCpu size={16} style={{ color: "#f97316" }} />
            </span>
            <div>
              <h2 style={{ color: "#f0e6d8", fontSize: "15px", fontWeight: 800 }}>Code Fix</h2>
              <p style={{ color: "#6a5a48", fontSize: "12px", marginTop: "1px" }}>AI powered responsive repair for live device previews</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ color: "#6a5a48", borderRadius: "6px", padding: "4px", background: "transparent", border: "none", cursor: "pointer" }}
            className="flex h-7 w-7 items-center justify-center transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.background = "#2e2620"; e.currentTarget.style.color = "#f0e6d8"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6a5a48"; }}
            aria-label="Close Code Fix"
          >
            <FiX size={15} />
          </button>
        </header>

        {/* Tabs row */}
        <div style={{ background: "#1c1814", borderBottom: "1px solid #2e2620" }}
          className="flex shrink-0 items-center justify-between gap-3 px-5 py-3">
          <div style={{ display: "flex", gap: "4px" }}>
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={activeTab === tab
                  ? { background: "#f97316", color: "#fff", borderRadius: "7px", padding: "6px 18px", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 2px 8px rgba(249,115,22,0.3)" }
                  : { background: "transparent", color: "#6a5a48", borderRadius: "7px", padding: "6px 18px", fontSize: "12px", fontWeight: 600, border: "none", cursor: "pointer" }
                }
                onMouseEnter={(e) => { if (activeTab !== tab) e.currentTarget.style.color = "#a89070"; }}
                onMouseLeave={(e) => { if (activeTab !== tab) e.currentTarget.style.color = "#6a5a48"; }}
              >
                {tab}
              </button>
            ))}
          </div>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)",
            borderRadius: "999px", padding: "4px 12px",
            color: "#f97316", fontSize: "11px", fontWeight: 700,
          }}>
            <FiShield size={11} />
            Preview-only HTML/CSS/JS patch
          </span>
        </div>

        {warning && (
          <div style={{ margin: "12px 20px 0", background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: "8px", padding: "10px 14px" }}
            className="flex items-start gap-2">
            <FiAlertTriangle size={14} style={{ color: "#f97316", marginTop: "1px", flexShrink: 0 }} />
            <span style={{ color: "#a89070", fontSize: "12px", fontWeight: 600 }}>{warning}</span>
          </div>
        )}

        {error && (
          <div style={{ margin: "12px 20px 0", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "8px", padding: "10px 14px" }}>
            <span style={{ color: "#f87171", fontSize: "12px", fontWeight: 600 }}>{error}</span>
          </div>
        )}

        <main style={{ background: "#0f0d0a" }} className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
          {activeTab === "Issues" && (
            <DeviceIssueViewer
              selectedDevice={selectedDevice}
              issues={issues}
              issueGroups={issueGroups}
              deviceStatus={deviceStatus}
            />
          )}

          {activeTab === "Generated Code" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", minHeight: "100%" }}>

              {/* ── 1. Action bar ── */}
              <FixActionToolbar
                result={result}
                applied={applied}
                loading={loading}
                contextLoading={contextLoading}
                copied={copied}
                aiAvailable={aiAvailable && Boolean(url)}
                onGenerate={generateFix}
                onApply={applyFix}
                onCopy={copyCode}
              />

              {/* ── 2. Fix Review (issue + element + patch readiness) ── */}
              {/* ── 3. Code editors — AI output (prominent) + originals ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

                {/* Section label */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.08)" }} />
                  <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 8px" }}>AI-Generated Patch</span>
                  <span style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.08)" }} />
                </div>

                {/* Generated output — full width, tall */}
                <div className="grid gap-3 xl:grid-cols-3">
                  <div className="min-h-[360px]">
                    <AICodeEditor
                      title="AI-generated CSS"
                      code={result?.generated_css || result?.fixed_css || ""}
                      emptyText="Generated CSS will appear here after clicking Generate Fix."
                    />
                  </div>
                  <div className="min-h-[360px]">
                    <AICodeEditor
                      title="AI-generated HTML"
                      code={result?.generated_html || result?.fixed_html || result?.optional_html || ""}
                      emptyText="No HTML patch generated for this issue."
                      language="html"
                    />
                  </div>
                  <div className="min-h-[360px]">
                    <AICodeEditor
                      title="AI-generated JS"
                      code={result?.generated_js || result?.fixed_js || ""}
                      emptyText="No JS patch generated for this issue."
                      language="javascript"
                    />
                  </div>
                </div>

                {/* Section label */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <span style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.08)" }} />
                  <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 8px" }}>Original Source</span>
                  <span style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.08)" }} />
                </div>

                {/* Original source — full width, tall */}
                <div className="grid gap-3 xl:grid-cols-3">
                  <div className="min-h-[360px]">
                    <AICodeEditor
                      title="Original HTML"
                      code={originalHtml || sourceContext?.html || result?.original_html || ""}
                      emptyText="Original HTML will load automatically."
                      language="html"
                    />
                  </div>
                  <div className="min-h-[360px]">
                    <AICodeEditor
                      title="Original CSS"
                      code={originalCss || sourceContext?.css || result?.original_css || ""}
                      emptyText="Original CSS will load automatically."
                    />
                  </div>
                  <div className="min-h-[360px]">
                    <AICodeEditor
                      title="Original JS"
                      code={originalJs || sourceContext?.js || result?.original_js || ""}
                      emptyText="Original JS will load automatically."
                      language="javascript"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "Preview" && (
            <FixPreview
              selectedDevice={selectedDevice}
              beforeHtml={beforeHtml}
              afterHtml={afterHtml}
              beforeImage={beforeImage}
              afterImage={afterImage}
              applied={applied}
            />
          )}
        </main>
      </aside>
    </div>,
    document.body
  );
}
