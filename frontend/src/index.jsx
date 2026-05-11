import React from "react";
import ReactDOM from "react-dom/client";
import { installDevErrorFilter } from "./dev/devErrorFilter";
import App from "./app/App";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/bootstrap-compat.css";

installDevErrorFilter();

ReactDOM.createRoot(document.getElementById("rt-app")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
