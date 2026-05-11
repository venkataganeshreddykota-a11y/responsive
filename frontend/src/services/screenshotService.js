// Screenshot service — API calls for screenshot capture and storage
import api from "./axios";

export const captureScreenshot = (url, device) => {
  return api.post("/scanner/screenshot/", { url, device });
};

export const getScreenshots = (reportId) => {
  return api.get(`/scanner/scan/${reportId}/screenshots/`);
};
