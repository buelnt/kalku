/**
 * IPC-Handler für Electron
 *
 * Brücke zwischen dem React-Frontend (Renderer) und Node.js (Main).
 * Hier laufen alle Datei-Operationen: Import, Export, Speichern, Laden.
 */
import { ipcMain, dialog, BrowserWindow } from "electron";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { parseExcelLv, parseGaebD83 } from "@baukalk/import";
import { exportExcelLv3 } from "@baukalk/export";
import type { ExportOptionen } from "@baukalk/export";
import { Decimal } from "@baukalk/datenmodell";
import type { LvImport, PositionRechenInput } from "@baukalk/datenmodell";

export function registerIpcHandlers(): void {
  // ─── LV Importieren ───
  ipcMain.handle("lv:importieren", async (_event) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      title: "Leistungsverzeichnis importieren",
      filters: [
        {
          name: "LV-Dateien",
          extensions: ["xlsx", "xls", "d83", "d84", "x83", "x84", "x86", "d81", "x81"],
        },
        { name: "Excel-Dateien", extensions: ["xlsx", "xls"] },
        { name: "GAEB-Dateien", extensions: ["d83", "d84", "x83", "x84", "x86"] },
        { name: "Alle Dateien", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const pfad = result.filePaths[0]!;
    const ext = extname(pfad).toLowerCase();

    let lv: LvImport;

    if (ext === ".xlsx" || ext === ".xls") {
      lv = parseExcelLv(pfad);
    } else if (ext === ".d83" || ext === ".d84") {
      lv = parseGaebD83(pfad);
    } else {
      throw new Error(
        `Dateiformat "${ext}" wird noch nicht unterstützt. Unterstützt: .xlsx, .d83, .d84`,
      );
    }

    return lv;
  });

  // ─── Excel Exportieren ───
  ipcMain.handle(
    "lv:exportieren",
    async (_event, optionen: ExportOptionen & { werte_raw: Record<string, Record<string, number | null>> }) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return null;

      const result = await dialog.showSaveDialog(win, {
        title: "Kalkulation als Excel exportieren",
        defaultPath: `Kalkulation_${new Date().toISOString().slice(0, 10)}.xlsx`,
        filters: [{ name: "Excel-Dateien", extensions: ["xlsx"] }],
      });

      if (result.canceled || !result.filePath) return null;

      // Werte von rohen Zahlen zu Decimal konvertieren
      const werte = new Map<string, PositionRechenInput>();
      for (const [oz, raw] of Object.entries(optionen.werte_raw)) {
        werte.set(oz, {
          stoffe_ek: raw.stoffe_ek != null ? new Decimal(raw.stoffe_ek) : undefined,
          zeit_min_roh: raw.zeit_min_roh != null ? new Decimal(raw.zeit_min_roh) : undefined,
          geraetezulage_eur_h: raw.geraetezulage_eur_h != null ? new Decimal(raw.geraetezulage_eur_h) : undefined,
          nu_ek: raw.nu_ek != null ? new Decimal(raw.nu_ek) : undefined,
        });
      }

      // Parameter konvertieren
      const p = optionen.parameter as unknown as Record<string, number>;
      const parameter = {
        verrechnungslohn: new Decimal(p.verrechnungslohn ?? 90),
        lohn_ek: p.lohn_ek != null ? new Decimal(p.lohn_ek) : undefined,
        material_zuschlag: new Decimal(p.material_zuschlag ?? 0.3),
        nu_zuschlag: new Decimal(p.nu_zuschlag ?? 0.3),
        geraete_grundzuschlag: p.geraete_grundzuschlag != null ? new Decimal(p.geraete_grundzuschlag) : undefined,
        zeitwert_faktor: new Decimal(p.zeitwert_faktor ?? 0),
        geraetezulage_default: new Decimal(p.geraetezulage_default ?? 0.5),
      };

      const wb = await exportExcelLv3({
        lv: optionen.lv,
        parameter,
        werte,
        meta: optionen.meta,
      });

      await wb.xlsx.writeFile(result.filePath);
      return result.filePath;
    },
  );

  // ─── Vorgaben laden ───
  ipcMain.handle("vorgaben:laden", async (_event, pfad: string) => {
    if (!existsSync(pfad)) return null;
    const inhalt = readFileSync(pfad, "utf-8");
    return JSON.parse(inhalt);
  });

  // ─── Vorgaben speichern ───
  ipcMain.handle(
    "vorgaben:speichern",
    async (_event, pfad: string, daten: unknown) => {
      const dir = join(pfad, "..");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(pfad, JSON.stringify(daten, null, 2), "utf-8");
      return true;
    },
  );

  // ─── Projekt speichern ───
  ipcMain.handle(
    "projekt:speichern",
    async (_event, pfad: string, daten: unknown) => {
      const dir = join(pfad, "..");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(pfad, JSON.stringify(daten, null, 2), "utf-8");
      return true;
    },
  );

  // ─── Projekt laden ───
  ipcMain.handle("projekt:laden", async (_event, pfad: string) => {
    if (!existsSync(pfad)) return null;
    return JSON.parse(readFileSync(pfad, "utf-8"));
  });
}
