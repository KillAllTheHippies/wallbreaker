import React from "react";
import { createRoot } from "react-dom/client";
import { V2App } from "./v2";
import "./styles.css";
import "./v2.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <V2App />
  </React.StrictMode>
);
