// Hook for managing scan lifecycle — start, poll, result
import { useRef, useState } from "react";
import { startScan, getScanStatus } from "../services/scanService";

const POLL_INTERVAL = 2500;
const POLL_MAX = 48;

export default function useResponsiveScan() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  const stopPolling = () => clearInterval(pollRef.current);

  const scan = async (url) => {
    stopPolling();
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const { data } = await startScan(url);
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const { data: status } = await getScanStatus(data.report_id);
          if (status.status === "completed") { stopPolling(); setResult(status); setLoading(false); }
          else if (status.status === "failed") { stopPolling(); setError(status.raw_result?.error || "Scan failed."); setLoading(false); }
          if (attempts >= POLL_MAX) { stopPolling(); setError("Scan timed out."); setLoading(false); }
        } catch { stopPolling(); setError("Connection lost."); setLoading(false); }
      }, POLL_INTERVAL);
    } catch (err) {
      const d = err.response?.data;
      stopPolling();
      setError(d?.url?.[0] || d?.detail || "Failed to start scan.");
      setLoading(false);
    }
  };

  return { scan, loading, result, error };
}
