import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-ignore
import { realSystemFsPlugin } from "./vite.realFs.js";

export default defineConfig({
  plugins: [react(), realSystemFsPlugin()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
  },
});
