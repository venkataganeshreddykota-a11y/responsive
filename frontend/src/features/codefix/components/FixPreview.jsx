import { FiCheckCircle } from "react-icons/fi";

const PREVIEW = {
  surface: "rgba(255,255,255,0.045)",
  surface2: "rgba(255,255,255,0.065)",
  surface3: "rgba(249,115,22,0.12)",
  canvas: "#080705",
  frame: "#11100d",
  border: "rgba(255,255,255,0.09)",
  border2: "rgba(249,115,22,0.24)",
  orange: "#f97316",
  orange2: "#ea6c0a",
  text: "#f5eadc",
  muted: "#a89070",
  shadow: "0 16px 48px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
};

export default function FixPreview({ selectedDevice, beforeHtml, afterHtml, beforeImage, afterImage, applied }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div style={{ background: PREVIEW.surface, border: `1px solid ${PREVIEW.border}`, boxShadow: PREVIEW.shadow, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }} className="rounded-lg p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p style={{ color: PREVIEW.text }} className="text-sm font-bold">Live patch injection</p>
            <p style={{ color: PREVIEW.muted }} className="text-xs">
              {selectedDevice?.label || "Selected device"} {selectedDevice?.width ? `- ${selectedDevice.width}x${selectedDevice.height}` : ""}
            </p>
          </div>
          <span
            style={{
              background: applied ? PREVIEW.surface3 : PREVIEW.surface2,
              border: `1px solid ${applied ? PREVIEW.border2 : PREVIEW.border}`,
              color: applied ? PREVIEW.orange : PREVIEW.muted,
            }}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
          >
            <FiCheckCircle size={12} />
            {applied ? "Applied to live preview" : "Waiting for Apply Fix"}
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <PreviewFrame title="Before" html={beforeHtml} image={beforeImage} />
        <PreviewFrame title="After" html={afterHtml} image={afterImage} />
      </div>
    </div>
  );
}

function PreviewFrame({ title, html, image }) {
  const hasContent = Boolean(image || html);
  return (
    <section style={{ background: PREVIEW.surface, border: `1px solid ${hasContent ? PREVIEW.border2 : PREVIEW.border}`, boxShadow: PREVIEW.shadow, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }} className="flex min-h-[300px] flex-col overflow-hidden rounded-lg">
      <div style={{ background: PREVIEW.surface2, borderBottom: `1px solid ${PREVIEW.border}`, color: PREVIEW.text }} className="flex items-center justify-between px-3 py-2 text-xs font-bold">
        <span>{title}</span>
        <span style={{ color: PREVIEW.muted }} className="text-[10px] font-semibold uppercase tracking-widest">
          {hasContent ? "Snapshot" : "Pending"}
        </span>
      </div>
      <div
        style={{
          background: `
            linear-gradient(135deg, rgba(249,115,22,0.07), rgba(255,255,255,0) 34%),
            radial-gradient(circle at 50% 0%, rgba(255,255,255,0.08), rgba(255,255,255,0) 34%),
            ${PREVIEW.canvas}
          `,
        }}
        className="flex min-h-0 flex-1 items-center justify-center p-4"
      >
        {image ? (
          <div style={{ background: PREVIEW.frame, border: `1px solid ${PREVIEW.border}` }} className="flex h-full w-full items-start justify-center overflow-hidden rounded-md p-3 shadow-inner">
            <img
              src={image}
              alt={`${title} responsive fix preview`}
              className="max-h-full min-h-[300px] max-w-full object-contain object-top"
              draggable="false"
            />
          </div>
        ) : html ? (
          <div style={{ background: PREVIEW.frame, border: `1px solid ${PREVIEW.border}` }} className="h-full min-h-[300px] w-full overflow-hidden rounded-md p-3">
            <iframe
              title={`${title} responsive fix preview`}
              srcDoc={html}
              sandbox="allow-same-origin"
              className="h-full min-h-[300px] w-full rounded bg-white"
            />
          </div>
        ) : (
          <div style={{ color: PREVIEW.muted, border: `1px dashed ${PREVIEW.border}` }} className="flex min-h-[300px] w-full items-center justify-center rounded-md bg-black/20 p-6 text-center text-xs">
            Generate and apply a fix to see the comparison.
          </div>
        )}
      </div>
    </section>
  );
}
