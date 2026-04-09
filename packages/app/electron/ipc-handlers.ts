/**
 * IPC-Handler für Electron
 *
 * Brücke zwischen dem React-Frontend (Renderer) und Node.js (Main).
 * Hier laufen alle Datei-Operationen: Import, Export, Speichern, Laden.
 */
import { ipcMain, dialog, BrowserWindow } from "electron";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { parseExcelLv, parseGaebD83, parseGaebXml } from "@baukalk/import";
import { exportGaebD84 } from "@baukalk/export";
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
    } else if (ext === ".d83" || ext === ".d84" || ext === ".d81" || ext === ".d86") {
      lv = parseGaebD83(pfad);
    } else if (ext === ".x83" || ext === ".x84" || ext === ".x86" || ext === ".x81") {
      lv = parseGaebXml(pfad);
    } else {
      throw new Error(
        `Dateiformat "${ext}" wird noch nicht unterstützt. Unterstützt: .xlsx, .d83, .d84, .x83, .x84, .x86`,
      );
    }

    // Decimal-Instanzen in plain numbers konvertieren für IPC (structured clone)
    return JSON.parse(JSON.stringify(lv, (_key, value) => {
      if (value && typeof value === "object" && value.constructor?.name === "Decimal") {
        return Number(value.toString());
      }
      return value;
    }));
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

  // ─── GAEB Exportieren ───
  ipcMain.handle(
    "lv:gaebExportieren",
    async (_event, optionen: { lv: LvImport; parameter: Record<string, number>; werte_raw: Record<string, Record<string, number | null>>; mitPreisen: boolean; projektName?: string; bieter?: string }) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return null;

      const ext = optionen.mitPreisen ? "d84" : "d81";
      const result = await dialog.showSaveDialog(win, {
        title: `Kalkulation als GAEB ${ext.toUpperCase()} exportieren`,
        defaultPath: `Kalkulation_${new Date().toISOString().slice(0, 10)}.${ext}`,
        filters: [{ name: `GAEB ${ext.toUpperCase()}`, extensions: [ext] }],
      });

      if (result.canceled || !result.filePath) return null;

      const werte = new Map<string, PositionRechenInput>();
      for (const [oz, raw] of Object.entries(optionen.werte_raw)) {
        werte.set(oz, {
          stoffe_ek: raw.stoffe_ek != null ? new Decimal(raw.stoffe_ek) : undefined,
          zeit_min_roh: raw.zeit_min_roh != null ? new Decimal(raw.zeit_min_roh) : undefined,
          geraetezulage_eur_h: raw.geraetezulage_eur_h != null ? new Decimal(raw.geraetezulage_eur_h) : undefined,
          nu_ek: raw.nu_ek != null ? new Decimal(raw.nu_ek) : undefined,
        });
      }

      const p = optionen.parameter;
      const parameter = {
        verrechnungslohn: new Decimal(p.verrechnungslohn ?? 90),
        material_zuschlag: new Decimal(p.material_zuschlag ?? 0.3),
        nu_zuschlag: new Decimal(p.nu_zuschlag ?? 0.3),
        zeitwert_faktor: new Decimal(p.zeitwert_faktor ?? 0),
        geraetezulage_default: new Decimal(p.geraetezulage_default ?? 0.5),
      };

      const gaebStr = exportGaebD84({
        lv: optionen.lv,
        parameter,
        werte,
        mitPreisen: optionen.mitPreisen,
        projektName: optionen.projektName,
        bieter: optionen.bieter,
      });

      writeFileSync(result.filePath, gaebStr, "latin1");
      return result.filePath;
    },
  );

  // ─── Angebote aus Ordner scannen ───
  ipcMain.handle(
    "angebote:scannen",
    async (_event, angeboteOrdner: string) => {
      if (!existsSync(angeboteOrdner)) return [];

      const ergebnisse: Array<{ datei: string; lieferant: string; text: string }> = [];
      const scriptPfad = join(dirname(dirname(__dirname)), "scripts", "pdf-text-extract.py");

      // Alle Unterordner durchgehen (ein Ordner pro Lieferant)
      const unterordner = readdirSync(angeboteOrdner, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const lieferant of unterordner) {
        const lieferantPfad = join(angeboteOrdner, lieferant);
        const dateien = readdirSync(lieferantPfad)
          .filter((f) => f.toLowerCase().endsWith(".pdf") && f.toLowerCase().includes("angebot"));

        for (const datei of dateien) {
          const pdfPfad = join(lieferantPfad, datei);
          try {
            const text = execSync(`python3 "${scriptPfad}" "${pdfPfad}"`, {
              timeout: 15000,
              encoding: "utf-8",
            });
            ergebnisse.push({ datei, lieferant, text });
          } catch {
            // PDF nicht lesbar — überspringen
          }
        }
      }

      return ergebnisse;
    },
  );

  // ─── Audit-Log ───
  ipcMain.handle("audit:schreiben", async (_event, jsonlZeile: string) => {
    const logPfad = join(process.cwd(), "vorgaben", "audit-log.jsonl");
    const dir = join(logPfad, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const { appendFileSync } = await import("node:fs");
    appendFileSync(logPfad, jsonlZeile, "utf-8");
    return true;
  });

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
