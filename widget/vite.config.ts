import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Library builds do not replace this; React reads it at runtime.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    lib: {
      entry: "src/index.tsx",
      name: "SupportWidget",
      formats: ["iife"],
      fileName: () => "support-widget.js",
    },
  },
});
