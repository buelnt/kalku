import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              // Nur echte Node-native Module als external markieren.
              // Workspace-Pakete (@baukalk/*) werden GEBÜNDELT, damit
              // Electron sie nicht als .ts laden muss.
              external: ["electron", "better-sqlite3", "@anthropic-ai/sdk"],
            },
          },
        },
      },
      {
        entry: "electron/preload.ts",
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              output: {
                format: "cjs",
                entryFileNames: "preload.js",
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
