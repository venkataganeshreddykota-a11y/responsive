// Scan service — API calls for scan lifecycle
import api from "./axios";

export const startScan = (url) => api.post("/scanner/scan/", { url });

export const getScanStatus = (reportId) => api.get(`/scanner/scan/${reportId}/status/`);

export const getScanUrls = () => api.get("/scanner/urls/");
