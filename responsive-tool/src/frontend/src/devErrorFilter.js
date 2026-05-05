const EXTENSION_PROTOCOLS = ["chrome-extension://", "moz-extension://", "edge-extension://"];

function includesExtensionSource(value) {
  return typeof value === "string" && EXTENSION_PROTOCOLS.some((prefix) => value.includes(prefix));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isLikelyExtensionNoise({ message, filename, error, reason }) {
  const payload = reason ?? error;
  const payloadText = String(payload);
  const source = [
    message,
    filename,
    payload?.name,
    payload?.message,
    payloadText,
    error?.stack,
    reason?.stack,
  ].filter(Boolean).join("\n");
  if (includesExtensionSource(source)) return true;

  if (!source.includes("[object Object]")) return false;
  if (message === "ERROR" || payload?.name === "ERROR") return true;
  if (payload?.message === "[object Object]" || payloadText === "[object Object]") return true;

  const hasUsefulErrorShape =
    payload instanceof Error ||
    typeof payload === "string" ||
    Boolean(payload?.message || payload?.stack || payload?.response || payload?.request);

  return message === "[object Object]" && isPlainObject(payload) && !hasUsefulErrorShape;
}

function stopDevOverlay(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

export function installDevErrorFilter() {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;

  window.addEventListener(
    "error",
    (event) => {
      if (
        isLikelyExtensionNoise({
          message: event.message,
          filename: event.filename,
          error: event.error,
        })
      ) {
        stopDevOverlay(event);
      }
    },
    true
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      if (isLikelyExtensionNoise({ message: String(event.reason), reason: event.reason })) {
        stopDevOverlay(event);
      }
    },
    true
  );
}
