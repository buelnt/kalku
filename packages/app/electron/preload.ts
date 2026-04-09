/**
 * Electron Preload Script
 *
 * Stellt die Brücke zwischen Main-Prozess (Node.js) und Renderer (React) her.
 * Alle Datei-Operationen laufen über diese API — das React-Frontend hat
 * keinen direkten Zugriff auf das Dateisystem.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("baukalk", {
  platform: process.platform,
  version: "0.1.0",

  // LV-Operationen
  lvImportieren: () => ipcRenderer.invoke("lv:importieren"),
  lvExportieren: (optionen: unknown) => ipcRenderer.invoke("lv:exportieren", optionen),

  // Vorgaben
  vorgabenLaden: (pfad: string) => ipcRenderer.invoke("vorgaben:laden", pfad),
  vorgabenSpeichern: (pfad: string, daten: unknown) =>
    ipcRenderer.invoke("vorgaben:speichern", pfad, daten),

  // Projekt
  projektSpeichern: (pfad: string, daten: unknown) =>
    ipcRenderer.invoke("projekt:speichern", pfad, daten),
  projektLaden: (pfad: string) => ipcRenderer.invoke("projekt:laden", pfad),
});
