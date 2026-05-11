// AI Fix service — API calls for AI-powered code generation
import api from "./axios";

export const getAIContext = (url, device, issues) => {
  return api.post("/scanner/ai/context/", { url, device, issues });
};

export const generateAIFix = (url, html, css, js, dom, device, issues) => {
  return api.post("/scanner/ai/fix/", { url, html, css, js, dom, device, issues });
};
