// WebSocket message handlers for live device streaming

export function handleDeviceMessage(message, callbacks) {
  const { type, data } = message;
  
  switch (type) {
    case "frame":
      callbacks.onFrame?.(data);
      break;
    case "ready":
      callbacks.onReady?.(data);
      break;
    case "error":
      callbacks.onError?.(data);
      break;
    default:
      console.warn("Unknown message type:", type);
  }
}
