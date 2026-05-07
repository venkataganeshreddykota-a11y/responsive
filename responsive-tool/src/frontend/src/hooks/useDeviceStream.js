import { useCallback, useEffect, useRef, useState } from "react";

function wsBaseUrl() {
  const explicit = process.env.REACT_APP_WS_BASE;
  if (explicit) return explicit.replace(/\/$/, "");

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  if (window.location.hostname === "localhost" && window.location.port !== "8000") {
    return `${protocol}://localhost:8000`;
  }
  if (window.location.hostname === "127.0.0.1" && window.location.port !== "8000") {
    return `${protocol}://127.0.0.1:8000`;
  }
  return `${protocol}://${window.location.host}`;
}

export default function useDeviceStream({
  url,
  device,
  reloadToken,
  streamScale = 2,
  maxFps = 14,
  streamFormat = "jpeg",
  streamQuality = 84,
  enabled = true,
}) {
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const readyRef = useRef(false);
  const decodingRef = useRef(false);
  const latestFrameRef = useRef(null);
  const frameRafRef = useRef(null);
  const canvasContextRef = useRef(null);
  const [state, setState] = useState({ status: "idle", error: "" });
  const [reconnectToken, setReconnectToken] = useState(0);

  useEffect(() => {
    if (!enabled || !url || !device?.width || !device?.height) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setState({ status: enabled ? "idle" : "paused", error: "" });
      return undefined;
    }

    let alive = true;
    const drawWidth = Math.max(1, Math.round(device.width * streamScale));
    const drawHeight = Math.max(1, Math.round(device.height * streamScale));
    const mimeType = streamFormat === "png" ? "image/png" : "image/jpeg";
    const ws = new WebSocket(`${wsBaseUrl()}/rt-ws/scanner/live-preview/`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    readyRef.current = false;
    decodingRef.current = false;
    latestFrameRef.current = null;
    canvasContextRef.current = null;
    setState({ status: "connecting", error: "" });

    const drawBitmap = (bitmap) => {
      const canvas = canvasRef.current;
      if (!canvas || !alive) {
        decodingRef.current = false;
        return;
      }

      if (canvas.width !== drawWidth) canvas.width = drawWidth;
      if (canvas.height !== drawHeight) canvas.height = drawHeight;

      const ctx = canvasContextRef.current || canvas.getContext("2d", { alpha: false, desynchronized: true });
      canvasContextRef.current = ctx;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = streamScale > 1 ? "medium" : "low";
      ctx.drawImage(bitmap, 0, 0, drawWidth, drawHeight);
      bitmap.close?.();

      if (!readyRef.current) {
        readyRef.current = true;
        setState({ status: "ready", error: "" });
      }

      decodingRef.current = false;
      const nextFrame = latestFrameRef.current;
      latestFrameRef.current = null;
      if (nextFrame) {
        frameRafRef.current = window.requestAnimationFrame(() => {
          frameRafRef.current = null;
          decodeFrame(nextFrame);
        });
      }
    };

    const decodeFrame = (frame) => {
      if (!alive) return;
      decodingRef.current = true;

      const blob = frame instanceof Blob
        ? frame
        : new Blob([frame], { type: mimeType });

      if ("createImageBitmap" in window) {
        createImageBitmap(blob)
          .then((bitmap) => {
            if (!alive) {
              bitmap.close?.();
              return;
            }
            drawBitmap(bitmap);
          })
          .catch(() => {
            decodingRef.current = false;
          });
        return;
      }

      const image = new Image();
      const objectUrl = URL.createObjectURL(blob);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        drawBitmap(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        decodingRef.current = false;
      };
      image.src = objectUrl;
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "start",
        url,
        deviceKey: device.key || "",
        deviceName: device.name || "",
        width: device.width,
        height: device.height,
        streamScale,
        maxFps,
        streamFormat,
        streamQuality,
      }));
    };

    ws.onmessage = (event) => {
      if (!alive) return;

      if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
        if (decodingRef.current) {
          latestFrameRef.current = event.data;
          return;
        }
        latestFrameRef.current = event.data;
        if (frameRafRef.current) return;
        frameRafRef.current = window.requestAnimationFrame(() => {
          const nextFrame = latestFrameRef.current;
          latestFrameRef.current = null;
          frameRafRef.current = null;
          if (nextFrame) decodeFrame(nextFrame);
        });
        return;
      }

      let message;
      try {
        message = JSON.parse(event.data);
      } catch (_) {
        return;
      }

      if (message.type === "ready") {
        setState({ status: "ready", error: "" });
        return;
      }

      if (message.type === "error") {
        setState({ status: "error", error: message.message || "Live browser preview failed." });
        return;
      }

      if (message.type !== "frame" || !message.data) return;

      const binaryString = atob(message.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let index = 0; index < binaryString.length; index += 1) {
        bytes[index] = binaryString.charCodeAt(index);
      }

      if (decodingRef.current) {
        latestFrameRef.current = bytes.buffer;
        return;
      }
      latestFrameRef.current = bytes.buffer;
      if (frameRafRef.current) return;
      frameRafRef.current = window.requestAnimationFrame(() => {
        const nextFrame = latestFrameRef.current;
        latestFrameRef.current = null;
        frameRafRef.current = null;
        if (nextFrame) decodeFrame(nextFrame);
      });
    };

    ws.onerror = () => {
      if (alive) setState({ status: "error", error: "Could not connect to the Playwright live browser." });
    };

    ws.onclose = () => {
      if (alive) setState((prev) => (prev.status === "error" ? prev : { status: "closed", error: "" }));
    };

    return () => {
      alive = false;
      if (frameRafRef.current) {
        window.cancelAnimationFrame(frameRafRef.current);
        frameRafRef.current = null;
      }
      ws.close();
    };
  }, [device?.height, device?.key, device?.name, device?.width, enabled, maxFps, reconnectToken, reloadToken, streamFormat, streamQuality, streamScale, url]);

  const send = useCallback((payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const reconnect = useCallback(() => {
    setReconnectToken((token) => token + 1);
  }, []);

  return { canvasRef, reconnect, send, ...state };
}
