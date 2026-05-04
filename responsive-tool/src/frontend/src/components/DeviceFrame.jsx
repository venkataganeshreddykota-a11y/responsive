import { useCallback, useEffect, useRef, useState } from "react";
import { FiAlertTriangle, FiLock, FiRefreshCw } from "react-icons/fi";

const PROXY_BASE =
  process.env.REACT_APP_PROXY_BASE || "/api/scanner/proxy/?url=";

const WHEEL_DELTA_LINE_HEIGHT = 16;
const WHEEL_DELTA_PAGE_FACTOR = 0.85;

function getYouTubeEmbedUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v") || "";
      } else if (parsed.pathname.startsWith("/shorts/")) {
        videoId = parsed.pathname.split("/").filter(Boolean)[1] || "";
      } else if (parsed.pathname.startsWith("/embed/")) {
        videoId = parsed.pathname.split("/").filter(Boolean)[1] || "";
      }
    }

    return videoId
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`
      : "";
  } catch {
    return "";
  }
}

export default function DeviceFrame({
  url,
  deviceKey,
  deviceName,
  width,
  height,
  scale,
  syncSource,
  syncRatio,
  onScrollSync,
  status,
  variant,
  reloadToken,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const iframeRef = useRef(null);
  const applyingSyncRef = useRef(false);

  const embedUrl = getYouTubeEmbedUrl(url);
  const frameUrl = embedUrl || `${PROXY_BASE}${encodeURIComponent(url)}`;
  const displayHost = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "preview";
    }
  })();
  const isMobile = deviceKey === "mobile";
  const wrapperWidth = width * scale;
  const wrapperHeight = height * scale;
  const frameColor = {
    good: "border-emerald-400",
    needs_fix: "border-amber-400",
    broken: "border-red-400",
  }[status?.status] || "border-stone-300";

  const reload = useCallback(() => {
    setError(false);
    setLoading(true);
    if (iframeRef.current) iframeRef.current.src = frameUrl;
  }, [frameUrl]);

  useEffect(() => {
    if (!reloadToken) return;
    reload();
  }, [reload, reloadToken]);

  useEffect(() => {
    if (!onScrollSync || !deviceKey || loading || error) return undefined;

    let frameWindow;
    let ticking = false;

    const getMetrics = () => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return null;
      const root = doc.scrollingElement || doc.documentElement || doc.body;
      const maxScroll = Math.max(0, root.scrollHeight - frameWindow.innerHeight);
      return { root, maxScroll };
    };

    const handleScroll = () => {
      if (applyingSyncRef.current || ticking) return;
      ticking = true;
      frameWindow.requestAnimationFrame(() => {
        ticking = false;
        const metrics = getMetrics();
        if (!metrics || metrics.maxScroll <= 0) return;
        onScrollSync(deviceKey, frameWindow.scrollY / metrics.maxScroll);
      });
    };

    try {
      frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow) return undefined;
      frameWindow.addEventListener("scroll", handleScroll, { passive: true });
    } catch (_) {
      return undefined;
    }

    return () => {
      try {
        frameWindow?.removeEventListener("scroll", handleScroll);
      } catch (_) {
        // Ignore pages that become inaccessible after navigation.
      }
    };
  }, [deviceKey, error, loading, onScrollSync]);

  useEffect(() => {
    if (!onScrollSync || !deviceKey || loading || error) return undefined;

    let frameWindow;
    let doc;

    const getRoot = () => doc?.scrollingElement || doc?.documentElement || doc?.body;
    const publishScroll = () => {
      const root = getRoot();
      if (!root || !frameWindow) return;
      const maxScroll = Math.max(0, root.scrollHeight - frameWindow.innerHeight);
      if (maxScroll <= 0) return;
      onScrollSync(deviceKey, frameWindow.scrollY / maxScroll);
    };

    const handleWheel = (event) => {
      if (applyingSyncRef.current) return;

      const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
      if (horizontalDelta) {
        const strip = iframeRef.current?.closest("[data-live-view-scroll]");
        if (strip) {
          event.preventDefault();
          strip.scrollLeft += event.deltaX || event.deltaY;
        }
        return;
      }

      const root = getRoot();
      if (!root || !frameWindow) return;

      const maxScroll = Math.max(0, root.scrollHeight - frameWindow.innerHeight);
      if (maxScroll <= 0) return;

      event.preventDefault();
      const deltaMultiplier =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? WHEEL_DELTA_LINE_HEIGHT
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? frameWindow.innerHeight * WHEEL_DELTA_PAGE_FACTOR
            : 1;
      const nextTop = Math.max(0, Math.min(maxScroll, frameWindow.scrollY + event.deltaY * deltaMultiplier));
      frameWindow.scrollTo({ top: nextTop, left: frameWindow.scrollX, behavior: "auto" });
      frameWindow.requestAnimationFrame(publishScroll);
    };

    try {
      frameWindow = iframeRef.current?.contentWindow;
      doc = iframeRef.current?.contentDocument;
      if (!frameWindow || !doc) return undefined;
      doc.addEventListener("wheel", handleWheel, { passive: false });
    } catch (_) {
      return undefined;
    }

    return () => {
      try {
        doc?.removeEventListener("wheel", handleWheel);
      } catch (_) {
        // Ignore pages that become inaccessible after navigation.
      }
    };
  }, [deviceKey, error, loading, onScrollSync]);

  useEffect(() => {
    if (!deviceKey || syncSource === deviceKey || syncRatio == null || loading || error) return;

    try {
      const frameWindow = iframeRef.current?.contentWindow;
      const doc = iframeRef.current?.contentDocument;
      const root = doc?.scrollingElement || doc?.documentElement || doc?.body;
      if (!frameWindow || !root) return;

      const maxScroll = Math.max(0, root.scrollHeight - frameWindow.innerHeight);
      applyingSyncRef.current = true;
      frameWindow.scrollTo({ top: maxScroll * syncRatio, left: frameWindow.scrollX, behavior: "auto" });
      window.setTimeout(() => {
        applyingSyncRef.current = false;
      }, 80);
    } catch (_) {
      applyingSyncRef.current = false;
    }
  }, [deviceKey, error, loading, syncRatio, syncSource]);

  const preview = (
    <>
      {loading && !error && <div className="absolute inset-0 z-10 shimmer" />}

      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-stone-50 text-surface-muted">
          <FiAlertTriangle size={28} className="text-amber-400" />
          <p className="px-6 text-center text-xs">
            Could not load the live preview. The site may block proxying.
          </p>
          <button
            onClick={reload}
            className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-600"
          >
            <FiRefreshCw size={11} />
            Try again
          </button>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={frameUrl}
        title={`Live preview - ${deviceName}`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        onLoad={() => {
          try {
            const doc = iframeRef.current?.contentDocument;
            if (doc && doc.body && doc.body.innerHTML.trim() === "") {
              setError(true);
            }
          } catch (_) {
            // Cross-origin - cannot inspect, assume ok.
          }
          setLoading(false);
        }}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        style={{
          width,
          height,
          border: "none",
          transformOrigin: "top left",
          transform: `scale(${scale})`,
        }}
      />
    </>
  );

  if (variant === "workspace") {
    return (
      <div className="bg-surface-border" style={{ width: wrapperWidth }}>
        <div className="mb-1 h-3 overflow-x-auto overflow-y-hidden bg-white scrollbar-thin">
          <div style={{ width: Math.max(wrapperWidth, width * 0.22), height: 1 }} />
        </div>
        <div
          className="relative overflow-hidden overscroll-contain bg-white shadow-sm"
          style={{ width: wrapperWidth, height: wrapperHeight }}
        >
          {preview}
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div
        className="overflow-hidden rounded-[30px] border-[4px] border-stone-300 bg-stone-200 shadow-xl"
        style={{ width: wrapperWidth, height: wrapperHeight + 58 }}
      >
        <div className="flex h-8 items-center justify-center bg-stone-100">
          <span className="h-2.5 w-2.5 rounded-full bg-stone-400" />
        </div>
        <div className="relative overflow-hidden bg-white" style={{ width: wrapperWidth, height: wrapperHeight }}>
          {preview}
        </div>
        <div className="flex h-[26px] items-center justify-center bg-stone-100">
          <span className="h-1.5 w-14 rounded-full bg-stone-300" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-lg border-2 bg-white shadow-xl ${frameColor}`}
      style={{ width: wrapperWidth, height: wrapperHeight + 38 }}
    >
      <div className="flex h-[38px] items-center gap-2 border-b border-surface-border bg-white px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <div className="ml-2 flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-surface-border bg-stone-50 px-2 text-xs text-surface-muted">
          <FiLock size={10} className="shrink-0" />
          <span className="truncate">{displayHost}</span>
        </div>
        <button
          onClick={reload}
          className="flex h-6 items-center gap-1 rounded-md border border-surface-border bg-white px-2 text-xs text-surface-muted transition-colors hover:text-surface-body"
          title={`Reload ${deviceName}`}
        >
          <FiRefreshCw size={11} />
          Reload
        </button>
      </div>
      <div className="relative overflow-hidden bg-white" style={{ width: wrapperWidth, height: wrapperHeight }}>
        {preview}
      </div>
    </div>
  );
}
