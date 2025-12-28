import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import router from "./router";
import { ThemeProvider } from "./contexts/theme-context";
import "./globals.css";

const rootElement = document.getElementById("root");

if (!rootElement?.innerHTML) {
  const root = ReactDOM.createRoot(rootElement!);
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </React.StrictMode>
  );
}
