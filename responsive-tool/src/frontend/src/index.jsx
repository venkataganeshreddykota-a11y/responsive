import React from "react";
import ReactDOM from "react-dom/client";
import { installDevErrorFilter } from "./devErrorFilter";
import App from "./App";
import "./index.css";

installDevErrorFilter();

ReactDOM.createRoot(document.getElementById("rt-app")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
