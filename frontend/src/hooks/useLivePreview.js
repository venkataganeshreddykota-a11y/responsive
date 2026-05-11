// Hook for managing live preview state across devices
import { useState, useCallback } from "react";

export default function useLivePreview() {
  const [activeUrl, setActiveUrl] = useState("");
  const [activeDevice, setActiveDevice] = useState(null);

  const loadUrl = useCallback((url) => {
    setActiveUrl(url.trim());
  }, []);

  return { activeUrl, activeDevice, setActiveDevice, loadUrl };
}
