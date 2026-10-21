/** Application entry point for the Relay web application. */

import * as React from "react";
import { StrictMode } from "react";
import * as ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// Development-only accessibility auditing. Findings appear in the browser console.
if (import.meta.env.DEV) {
  import("@axe-core/react")
    .then(({ default: axe }) => {
      axe(React, ReactDOM, 1000);
    })
    .catch((error) => {
      console.error("Accessibility auditing could not start:", error);
    });
}



import { BrowserRouter } from "react-router-dom";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
