/**
 * Electron Preload Script
 *
 * Stellt die Brücke zwischen Main-Prozess (Node.js) und Renderer (React) her.
 * In Phase 1 minimal — grundlegende Plattform-Info.
 */
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("baukalk", {
  platform: process.platform,
  version: "0.1.0",
});
