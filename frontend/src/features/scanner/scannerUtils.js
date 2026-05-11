// Scanner utility functions — polling, status formatting, etc.

export const POLL_INTERVAL = 2500;
export const POLL_MAX = 48;

export function formatScanStatus(status) {
  const labels = {
    pending: "Queued",
    running: "Scanning",
    completed: "Completed",
    failed: "Failed",
  };
  return labels[status] || status;
}
