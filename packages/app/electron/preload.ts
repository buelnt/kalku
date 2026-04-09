/**
 * Electron Preload Script
 *
 * WICHTIG: Muss als CommonJS enden, weil Electron-Sandbox ESM nicht unterstützt.
 * Deshalb verwenden wir require() statt import.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("baukalk", {
  platform: process.platform,
  version: "0.1.0",

  lvImportieren: () => ipcRenderer.invoke("lv:importieren"),
  lvExportieren: (optionen: unknown) => ipcRenderer.invoke("lv:exportieren", optionen),

  vorgabenLaden: (pfad: string) => ipcRenderer.invoke("vorgaben:laden", pfad),
  vorgabenSpeichern: (pfad: string, daten: unknown) =>
    ipcRenderer.invoke("vorgaben:speichern", pfad, daten),

  projektSpeichern: (pfad: string, daten: unknown) =>
    ipcRenderer.invoke("projekt:speichern", pfad, daten),
  projektLaden: (pfad: string) => ipcRenderer.invoke("projekt:laden", pfad),
});
