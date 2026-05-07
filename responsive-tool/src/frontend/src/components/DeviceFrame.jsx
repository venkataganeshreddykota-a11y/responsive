import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { FiAlertTriangle, FiLock, FiRefreshCw } from "react-icons/fi";

import useDeviceStream from "../hooks/useDeviceStream";

function DeviceFrame({
  url,
  deviceKey,
  deviceName,
  width,
  height,
  scale = 1,
  status,
  variant,
  reloadToken,
  streamScale = 2,
  maxFps = 14,
  streamFormat = "jpeg",
  streamQuality = 84,
  active = false,
  liveEnabled = true,
  screenshotSrc = "",
}, ref) {
  const frameRef = useRef(null);
  const visibilityRef = useRef(null);
  const wheelDeltaRef = useRef({ x: 0, y: 0 });
  const wheelRafRef = useRef(null);
  const pointerMoveRef = useRef(null);
  const pointerRafRef = useRef(null);
  const device = useMemo(() => ({
    key: deviceKey,
    name: deviceName,
    width,
    height,
  }), [deviceKey, deviceName, height, width]);
  const streamEnabled = liveEnabled;
  const isInteractive = active && streamEnabled;
  const { canvasRef, reconnect, send, status: streamStatus, error } = useDeviceStream({
    url,
    device,
    reloadToken,
    streamScale,
    maxFps,
    streamFormat,
    streamQuality,
    enabled: streamEnabled,
  });
  const isMobile = width <= 540;
  const wrapperWidth = width * scale;
  const wrapperHeight = height * scale;
  const frameColor = {
    good: "border-emerald-400",
    needs_fix: "border-amber-400",
    broken: "border-red-400",
  }[status?.status] || "border-stone-300";

  const displayHost = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "preview";
    }
  })();

  useImperativeHandle(ref, () => ({
    capturePng() {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.width || !canvas.height) return "";
      return canvas.toDataURL("image/png");
    },
  }), []);

  useEffect(() => () => {
    if (wheelRafRef.current) {
      window.cancelAnimationFrame(wheelRafRef.current);
      wheelRafRef.current = null;
    }
    if (pointerRafRef.current) {
      window.cancelAnimationFrame(pointerRafRef.current);
      pointerRafRef.current = null;
    }
  }, []);

  const toDevicePoint = useCallback((event) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(width, Math.round((event.clientX - rect.left) / scale))),
      y: Math.max(0, Math.min(height, Math.round((event.clientY - rect.top) / scale))),
    };
  }, [height, scale, width]);

  const reload = useCallback(() => {
    if (streamStatus === "error" || streamStatus === "closed") {
      reconnect();
      return;
    }
    send({ type: "reload" });
  }, [reconnect, send, streamStatus]);

  const preview = (
    <>
      {!streamEnabled && (
        <div className="absolute inset-0 bg-white">
          {screenshotSrc ? (
            <img
              src={screenshotSrc.startsWith("data:") ? screenshotSrc : `data:image/png;base64,${screenshotSrc}`}
              alt={`${deviceName || "Device"} static preview`}
              className="h-full w-full object-cover object-top"
              decoding="async"
              loading="lazy"
              draggable="false"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-stone-50 text-[11px] font-semibold text-surface-muted">
              Select to start Live View
            </div>
          )}
        </div>
      )}

      {streamEnabled && streamStatus !== "ready" && streamStatus !== "closed" && streamStatus !== "error" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40">
          {screenshotSrc && (
            <img
              src={screenshotSrc.startsWith("data:") ? screenshotSrc : `data:image/png;base64,${screenshotSrc}`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-top opacity-80"
              decoding="async"
              draggable="false"
            />
          )}
          {!screenshotSrc && (
            <span className="rounded-full border border-white/70 bg-white/85 px-3 py-1 text-[11px] font-semibold text-surface-label shadow-sm">
              Starting Playwright browser...
            </span>
          )}
        </div>
      )}

      {streamEnabled && (streamStatus === "error" || streamStatus === "closed") && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-stone-50 text-surface-muted">
          <FiAlertTriangle size={28} className="text-amber-400" />
          <p className="px-6 text-center text-xs">
            {error || "The live browser stream ended. Reload the preview to reconnect."}
          </p>
          <button
            onClick={(event) => {
              event.stopPropagation();
              reload();
            }}
            className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-600"
          >
            <FiRefreshCw size={11} />
            Reload
          </button>
        </div>
      )}

      {streamEnabled && (
        <canvas
          ref={canvasRef}
          className="block bg-white"
          style={{
            width: wrapperWidth,
            height: wrapperHeight,
            imageRendering: "auto",
          }}
        />
      )}
    </>
  );

  const interactiveProps = {
    ref: frameRef,
    tabIndex: 0,
    role: "application",
    "aria-label": `${deviceName || "Device"} live browser preview`,
    onClick: (event) => {
      frameRef.current?.focus();
      if (!isInteractive) return;
      if (!isMobile) return;
      const point = toDevicePoint(event);
      send({ type: "tap", ...point });
    },
    onWheel: (event) => {
      if (!isInteractive) return;
      event.preventDefault();
      wheelDeltaRef.current.x += event.deltaX;
      wheelDeltaRef.current.y += event.deltaY;
      if (wheelRafRef.current) return;
      wheelRafRef.current = window.requestAnimationFrame(() => {
        const delta = wheelDeltaRef.current;
        wheelDeltaRef.current = { x: 0, y: 0 };
        wheelRafRef.current = null;
        if (delta.x || delta.y) send({ type: "scroll", deltaX: delta.x, deltaY: delta.y });
      });
    },
    onPointerDown: (event) => {
      if (!isInteractive || isMobile) return;
      event.preventDefault();
      frameRef.current?.focus();
      frameRef.current?.setPointerCapture?.(event.pointerId);
      const point = toDevicePoint(event);
      send({ type: "mouse_down", ...point });
    },
    onPointerMove: (event) => {
      if (!isInteractive || isMobile) return;
      event.preventDefault();
      pointerMoveRef.current = toDevicePoint(event);
      if (pointerRafRef.current) return;
      pointerRafRef.current = window.requestAnimationFrame(() => {
        pointerRafRef.current = null;
        const point = pointerMoveRef.current;
        pointerMoveRef.current = null;
        if (point) send({ type: "mouse_move", ...point });
      });
    },
    onPointerUp: (event) => {
      if (!isInteractive || isMobile) return;
      event.preventDefault();
      frameRef.current?.releasePointerCapture?.(event.pointerId);
      const point = toDevicePoint(event);
      send({ type: "mouse_up", ...point });
    },
    onPointerCancel: (event) => {
      if (!isInteractive || isMobile) return;
      frameRef.current?.releasePointerCapture?.(event.pointerId);
      const point = toDevicePoint(event);
      send({ type: "mouse_up", ...point });
    },
    onKeyDown: (event) => {
      if (!isInteractive) return;
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        send({ type: "text", value: event.key });
        return;
      }
      const keyMap = {
        Backspace: "Backspace",
        Delete: "Delete",
        Enter: "Enter",
        Escape: "Escape",
        Tab: "Tab",
        ArrowUp: "ArrowUp",
        ArrowDown: "ArrowDown",
        ArrowLeft: "ArrowLeft",
        ArrowRight: "ArrowRight",
      };
      if (keyMap[event.key]) {
        event.preventDefault();
        send({ type: "key", key: keyMap[event.key] });
      }
    },
  };

  if (variant === "workspace") {
    return (
      <div ref={visibilityRef} className="bg-surface-border" style={{ width: wrapperWidth, contentVisibility: "auto", containIntrinsicSize: `${wrapperWidth}px ${wrapperHeight}px` }}>
        <div
          {...interactiveProps}
          className="relative overflow-hidden overscroll-contain bg-white shadow-sm outline-none focus:ring-2 focus:ring-accent-300"
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
        ref={visibilityRef}
        className="overflow-hidden rounded-[30px] border-[4px] border-stone-300 bg-stone-200 shadow-xl"
        style={{ width: wrapperWidth, height: wrapperHeight + 58, contentVisibility: "auto", containIntrinsicSize: `${wrapperWidth}px ${wrapperHeight + 58}px` }}
      >
        <div className="flex h-8 items-center justify-center bg-stone-100">
          <span className="h-2.5 w-2.5 rounded-full bg-stone-400" />
        </div>
        <div
          {...interactiveProps}
          className="relative overflow-hidden bg-white outline-none focus:ring-2 focus:ring-accent-300"
          style={{ width: wrapperWidth, height: wrapperHeight }}
        >
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
      ref={visibilityRef}
      className={`overflow-hidden rounded-lg border-2 bg-white shadow-xl ${frameColor}`}
      style={{ width: wrapperWidth, height: wrapperHeight + 38, contentVisibility: "auto", containIntrinsicSize: `${wrapperWidth}px ${wrapperHeight + 38}px` }}
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
      <div
        {...interactiveProps}
        className="relative overflow-hidden bg-white outline-none focus:ring-2 focus:ring-accent-300"
        style={{ width: wrapperWidth, height: wrapperHeight }}
      >
        {preview}
      </div>
    </div>
  );
}

export default memo(forwardRef(DeviceFrame));
