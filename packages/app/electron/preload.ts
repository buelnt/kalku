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

  projektOrdnerWaehlen: () => ipcRenderer.invoke("projekt:ordnerWaehlen"),
  lvImportieren: () => ipcRenderer.invoke("lv:importieren"),
  lvImportierenDatei: (pfad: string) => ipcRenderer.invoke("lv:importieren:datei", pfad),
  lvExportieren: (optionen: unknown) => ipcRenderer.invoke("lv:exportieren", optionen),
  lvGaebExportieren: (optionen: unknown) => ipcRenderer.invoke("lv:gaebExportieren", optionen),
  angeboteScannen: (ordner: string) => ipcRenderer.invoke("angebote:scannen", ordner),
  kiAnalysieren: (positionen: unknown, kontext: unknown) =>
    ipcRenderer.invoke("ki:analysieren", positionen, kontext),
  auditSchreiben: (jsonlZeile: string) => ipcRenderer.invoke("audit:schreiben", jsonlZeile),

  vorgabenLaden: (pfad: string) => ipcRenderer.invoke("vorgaben:laden", pfad),
  vorgabenSpeichern: (pfad: string, daten: unknown) =>
    ipcRenderer.invoke("vorgaben:speichern", pfad, daten),

  projektSpeichern: (pfad: string, daten: unknown) =>
    ipcRenderer.invoke("projekt:speichern", pfad, daten),
  projektLaden: (pfad: string) => ipcRenderer.invoke("projekt:laden", pfad),
});
