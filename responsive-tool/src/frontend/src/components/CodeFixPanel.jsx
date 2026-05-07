import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FiAlertTriangle, FiCpu, FiPlay, FiRefreshCw, FiShield, FiX } from "react-icons/fi";
import api from "../api/axios";
import AICodeEditor from "./AICodeEditor";
import DeviceIssueViewer, { buildIssueGroups, getSelectedDeviceIssues } from "./DeviceIssueViewer";
import FixPreview from "./FixPreview";

const TABS = ["Issues", "Generated Code", "Preview"];

function getRegisteredFrame(deviceKey) {
  const registry = window.__responsiveToolFrames || {};
  return registry[deviceKey] || Object.values(registry)[0] || null;
}

function collectDomInfo(doc) {
  const selectors = Array.from(doc.querySelectorAll("body *"))
    .slice(0, 180)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const styles = doc.defaultView.getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || "",
        className: typeof element.className === "string" ? element.className.split(/\s+/).slice(0, 5).join(" ") : "",
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
  const [aiAvailable, setAiAvailable] = useState(true);
  const [beforeHtml, setBeforeHtml] = useState("");
  const [afterHtml, setAfterHtml] = useState("");
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
      try {
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
        setOriginalHtml(data.original_html || "");
        setOriginalCss(data.original_css || "");
        setSourceContext((prev) => ({
          ...(prev || {}),
          html: data.original_html || prev?.html || "",
          css: data.original_css || prev?.css || "",
        }));
        setAiAvailable(data.ai_available !== false);
        setWarning(data.config_warning || "");
        setResult({
          original_html: data.original_html || "",
          original_css: data.original_css || "",
          generated_css: "",
          fixed_css: "",
          issues: data.issues || [],
          device_name: data.device_name || selectedDevice?.label || "",
          resolution: data.resolution || "",
        });
      } catch (err) {
        if (ignore) return;
        setWarning(err.response?.data?.detail || "Backend HTML/CSS extraction failed. The panel will still use the live iframe when possible.");
        try {
          const live = extractContext({ silent: true });
          setOriginalHtml(live.html || "");
          setOriginalCss(live.css || "");
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

  const extractContext = ({ silent = false } = {}) => {
    const frameEntry = getRegisteredFrame(selectedDevice?.key);
    const doc = frameEntry?.iframe?.contentDocument;
    if (!doc) {
      throw new Error("The selected live preview is still loading. Wait for the iframe to finish, then try again.");
    }
    const context = {
      html: snapshotDoc(doc).slice(0, 65000),
      css: collectCss(doc),
      dom: collectDomInfo(doc),
    };
    setSourceContext(context);
    if (context.html) setOriginalHtml((prev) => prev || context.html);
    if (context.css) setOriginalCss((prev) => prev || context.css);
    if (!silent && !context.css && !originalCss) {
      setWarning("No stylesheet rules were readable from the iframe. Backend extraction will still be shown when available.");
    }
    return context;
  };

  const generateFix = async () => {
    if (!aiAvailable) return;
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const context = extractContext();
      const { data } = await api.post("/scanner/ai/fix/", {
        url,
        html: originalHtml || context.html,
        css: originalCss || context.css,
        dom: context.dom,
        device: {
          key: selectedDevice?.key,
          name: selectedDevice?.label,
          width: selectedDevice?.width,
          height: selectedDevice?.height,
          statusKey: selectedDevice?.statusKey,
        },
        issues: selectedIssuePayload,
      });
      setResult({
        ...data,
        fixed_css: data.generated_css || data.fixed_css || "",
        generated_css: data.generated_css || data.fixed_css || "",
      });
      setOriginalHtml(data.original_html || originalHtml || context.html || "");
      setOriginalCss(data.original_css || originalCss || context.css || "");
      setActiveTab("Generated Code");
    } catch (err) {
      if (err.response?.data?.code === "sarvam_not_configured") {
        setAiAvailable(false);
        setWarning(err.response.data.detail || "SARVAM_API_KEY is not configured. AI generation is disabled.");
      } else {
        setError(err.response?.data?.detail || err.message || "AI fix generation failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    const code = result?.generated_css || result?.fixed_css || "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (_) {
      window.prompt("Copy generated CSS", code);
    }
  };

  const applyFix = () => {
    const frameEntry = getRegisteredFrame(selectedDevice?.key);
    const css = result?.generated_css || result?.fixed_css || "";
    const before = injectCss(frameEntry, css);
    if (!before) {
      setError("Could not inject CSS into the selected iframe. Reload Live View and try again.");
      return;
    }
    const doc = frameEntry.iframe.contentDocument;
    setBeforeHtml(before);
    setAfterHtml(snapshotDoc(doc));
    setApplied(true);
    setActiveTab("Preview");
  };

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex justify-end bg-black/25" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-[960px] flex-col border-l border-surface-border bg-surface-bg shadow-lg dark:border-stone-800 dark:bg-stone-950"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-surface-border bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
                <FiCpu size={16} />
              </span>
              <div>
                <h2 className="text-sm font-bold text-surface-body dark:text-stone-100">Code Fix</h2>
                <p className="text-xs text-surface-muted dark:text-stone-400">AI powered responsive repair for iframe previews</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-surface-border bg-white text-surface-label transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300"
            aria-label="Close Code Fix"
          >
            <FiX size={15} />
          </button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-white/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/80">
          <div className="flex gap-1 rounded-lg border border-surface-border bg-white/70 p-1 dark:border-stone-700 dark:bg-stone-950">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`h-8 rounded-md px-3 text-xs font-bold transition ${
                  activeTab === tab
                    ? "bg-accent-500 text-white shadow-sm"
                    : "text-surface-muted hover:bg-accent-50 hover:text-accent-700 dark:text-stone-400 dark:hover:bg-stone-900"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 sm:inline-flex">
              <FiShield size={12} />
              Preview-only CSS overrides
            </span>
            <button
              type="button"
              onClick={generateFix}
              disabled={loading || contextLoading || !url || !aiAvailable}
              className="inline-flex h-8 items-center gap-2 rounded-lg bg-surface-body px-3 text-xs font-bold text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-100 dark:text-stone-950"
            >
              {loading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white dark:border-stone-400 dark:border-t-stone-950" /> : <FiRefreshCw size={13} />}
              {loading ? "Generating" : contextLoading ? "Loading CSS" : "Generate Fix"}
            </button>
          </div>
        </div>

        {warning && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <FiAlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{warning}</span>
          </div>
        )}

        {error && (
          <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin">
          {activeTab === "Issues" && (
            <DeviceIssueViewer
              selectedDevice={selectedDevice}
              issues={issues}
              issueGroups={issueGroups}
              deviceStatus={deviceStatus}
            />
          )}

          {activeTab === "Generated Code" && (
            <div className="flex min-h-full flex-col gap-3">
              {loading && (
                <div className="rounded-lg border border-accent-200 bg-accent-50 p-3 text-xs font-semibold text-accent-700">
                  Sarvam AI is analyzing HTML, CSS, DOM geometry, and device issues.
                </div>
              )}
              {contextLoading && (
                <div className="rounded-lg border border-surface-border bg-white p-3 text-xs font-semibold text-surface-label dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300">
                  Fetching original HTML and CSS from the backend.
                </div>
              )}
              <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-2">
                <AICodeEditor
                  title="Original CSS"
                  code={originalCss || sourceContext?.css || result?.original_css || ""}
                  emptyText="No original CSS was available from backend or iframe extraction."
                />
                <AICodeEditor
                  title="AI-generated CSS fixes"
                  code={result?.generated_css || result?.fixed_css || ""}
                  copied={copied}
                  onCopy={copyCode}
                  emptyText="Generated responsive CSS will appear here."
                  action={
                    <button
                      type="button"
                      onClick={applyFix}
                      disabled={!(result?.generated_css || result?.fixed_css)}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent-500 px-2 text-[11px] font-bold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <FiPlay size={11} />
                      Apply Fix
                    </button>
                  }
                />
              </div>
              {(result?.generated_css || result?.fixed_css || result?.explanation) && (
                <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="rounded-lg border border-surface-border bg-white p-3 shadow-sm dark:border-stone-700 dark:bg-stone-950">
                    <p className="text-[11px] font-bold uppercase text-surface-muted dark:text-stone-400">Confidence</p>
                    <p className="mt-2 text-2xl font-bold text-surface-body dark:text-stone-100">{Math.round((result.confidence || 0) * 100)}%</p>
                  </div>
                  <div className="rounded-lg border border-surface-border bg-white p-3 shadow-sm dark:border-stone-700 dark:bg-stone-950">
                    <p className="text-[11px] font-bold uppercase text-surface-muted dark:text-stone-400">Explanation</p>
                    <p className="mt-2 text-sm leading-6 text-surface-label dark:text-stone-300">{result.explanation}</p>
                    {result.optional_html && (
                      <pre className="mt-3 max-h-32 overflow-auto rounded-md bg-stone-50 p-2 text-[11px] text-stone-700 scrollbar-thin dark:bg-stone-900 dark:text-stone-300">{result.optional_html}</pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "Preview" && (
            <FixPreview
              selectedDevice={selectedDevice}
              beforeHtml={beforeHtml}
              afterHtml={afterHtml}
              applied={applied}
            />
          )}
        </main>
      </aside>
    </div>,
    document.body
  );
}
