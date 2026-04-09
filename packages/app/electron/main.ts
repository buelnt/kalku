/**
 * Electron Main Process
 *
 * Startet die Desktop-App und öffnet das Hauptfenster.
 * In Phase 1 minimal — nur Fenster + grundlegende Menüs.
 */
import { app, BrowserWindow, Menu } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpcHandlers } from "./ipc-handlers.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "BauKalk Pro",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // In Entwicklung: Vite Dev Server laden
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "right" });
  } else {
    // Produktion: gebaute Dateien laden
    mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// macOS-Menü
const template: Electron.MenuItemConstructorOptions[] = [
  {
    label: "BauKalk Pro",
    submenu: [
      { role: "about", label: "Über BauKalk Pro" },
      { type: "separator" },
      { role: "quit", label: "BauKalk Pro beenden" },
    ],
  },
  {
    label: "Bearbeiten",
    submenu: [
      { role: "undo", label: "Rückgängig" },
      { role: "redo", label: "Wiederholen" },
      { type: "separator" },
      { role: "cut", label: "Ausschneiden" },
      { role: "copy", label: "Kopieren" },
      { role: "paste", label: "Einfügen" },
      { role: "selectAll", label: "Alles auswählen" },
    ],
  },
  {
    label: "Ansicht",
    submenu: [
      { role: "reload", label: "Neu laden" },
      { role: "toggleDevTools", label: "Entwicklertools" },
      { type: "separator" },
      { role: "resetZoom", label: "Originalgröße" },
      { role: "zoomIn", label: "Vergrößern" },
      { role: "zoomOut", label: "Verkleinern" },
      { type: "separator" },
      { role: "togglefullscreen", label: "Vollbild" },
    ],
  },
];

app.whenReady().then(() => {
  registerIpcHandlers();
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
