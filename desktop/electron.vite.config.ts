import { defineConfig } from "electron-vite";

// No renderer entry: the renderer is the deployed web app (DESKTOP-APP-PLAN D3).
// main → out/main/index.js, preload → out/preload/index.js (conventional entries
// src/main/index.ts and src/preload/index.ts).
export default defineConfig({
  main: {},
  preload: {},
});
