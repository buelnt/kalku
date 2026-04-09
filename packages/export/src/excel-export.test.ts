/**
 * End-to-End Test: Import → Berechnung → Export → Verify
 *
 * Importiert das Riegelsberg-LV, füllt die Rechenwerte aus der Referenz-JSON
 * ein, exportiert als Excel, liest die exportierte Datei zurück und prüft,
 * dass EP/GP Cent-genau mit den Referenzwerten übereinstimmen.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { existsSync, readFileSync, mkdirSync, unlinkSync } from "node:fs";
import { Decimal } from "@baukalk/datenmodell";
import type { PositionRechenInput } from "@baukalk/datenmodell";
import { parseExcelLv } from "@baukalk/import";
import { exportExcelLv3 } from "./excel-export.js";
import type { PositionWerte, ProjektMeta } from "./excel-export.js";
import ExcelJS from "exceljs";

const LV_PFAD = resolve(
  "/Users/admin/Library/CloudStorage/OneDrive-kalku/KT01",
  "1695_Gesellchen_GmbH/_abgeschlossen",
  "260319_Friedhoefe_Riegelsberg/LV.xlsx",
);

const REFERENZ_PFAD = resolve(
  __dirname,
  "../../../test-daten/riegelsberg/referenz.json",
);

const EXPORT_PFAD = resolve(
  __dirname,
  "../../../test-daten/riegelsberg/export_test.xlsx",
);

const HAS_FILES = existsSync(LV_PFAD) && existsSync(REFERENZ_PFAD);

interface RohPosition {
  oz: string;
  X_stoffe_ek: number | null;
  Y_zeit_min_roh: number | null;
  Z_geraete_eur_h: number | null;
  M_nu_ek: number | null;
  EP: number;
  GP: number;
}

interface ReferenzDatei {
  parameter: {
    verrechnungslohn: number;
    materialzuschlag: number;
    nzuschlag: number;
    geraete_grundzuschlag: number;
    zeitwert_faktor: number;
    geraetezulage_default: number;
    lohn_ek: number;
  };
  positionen: RohPosition[];
}

function optDec(v: number | null): Decimal | undefined {
  return v === null ? undefined : new Decimal(v);
}

describe.skipIf(!HAS_FILES)(
  "End-to-End: Import → Calc → Export → Verify",
  () => {
    const referenz = JSON.parse(
      readFileSync(REFERENZ_PFAD, "utf-8"),
    ) as ReferenzDatei;

    it("Importiert LV, berechnet, exportiert und verifiziert Cent-genau", async () => {
      // 1. Import
      const lv = parseExcelLv(LV_PFAD);
      expect(lv.anzahl_positionen).toBe(46);

      // 2. Rechenwerte aus Referenz zuordnen
      const werte: PositionWerte = new Map();
      for (const rp of referenz.positionen) {
        const input: PositionRechenInput = {
          stoffe_ek: optDec(rp.X_stoffe_ek),
          zeit_min_roh: optDec(rp.Y_zeit_min_roh),
          geraetezulage_eur_h: optDec(rp.Z_geraete_eur_h),
          nu_ek: optDec(rp.M_nu_ek),
        };
        werte.set(rp.oz, input);
      }

      // 3. Parameter
      const parameter = {
        verrechnungslohn: new Decimal(referenz.parameter.verrechnungslohn),
        lohn_ek: new Decimal(referenz.parameter.lohn_ek),
        material_zuschlag: new Decimal(referenz.parameter.materialzuschlag),
        nu_zuschlag: new Decimal(referenz.parameter.nzuschlag),
        geraete_grundzuschlag: new Decimal(referenz.parameter.geraete_grundzuschlag),
        zeitwert_faktor: new Decimal(referenz.parameter.zeitwert_faktor),
        geraetezulage_default: new Decimal(referenz.parameter.geraetezulage_default),
      };

      // 4. Meta
      const meta: ProjektMeta = {
        auftraggeber: "Gemeinde Riegelsberg",
        leistung: "Tiefbauarbeiten",
        bauvorhaben: "Wegebau- und Wegeunterhaltung 2026",
        bieter: "Gesellchen GmbH",
        vergabenummer: "GRIEG-2026-0001",
        abgabedatum: "19.03.2026 um 14:00 Uhr",
        mwst_satz: 0.19,
        personal: 3,
      };

      // 5. Export
      const wb = await exportExcelLv3({ lv, parameter, werte, meta });

      // Temporäre Datei speichern
      mkdirSync(resolve(__dirname, "../../../test-daten/riegelsberg"), {
        recursive: true,
      });
      await wb.xlsx.writeFile(EXPORT_PFAD);

      // 6. Exportierte Datei zurücklesen und verifizieren
      const wb2 = new ExcelJS.Workbook();
      await wb2.xlsx.readFile(EXPORT_PFAD);
      const ws = wb2.getWorksheet("Kalkulation")!;
      expect(ws).toBeDefined();

      // Zeile 8: Netto-Summe prüfen
      const netto = ws.getRow(8).getCell(6).value as number;
      expect(netto).toBeCloseTo(42994.21, 0); // ±1 € Toleranz für Aggregation

      // Verifiziere EP/GP jeder Position
      let posRow = 15;
      let posChecked = 0;
      const refMap = new Map(referenz.positionen.map((p) => [p.oz, p]));

      for (let r = posRow; r <= ws.rowCount; r++) {
        const ozCell = ws.getRow(r).getCell(1).value;
        if (!ozCell) continue;
        const oz = String(ozCell).trim();
        const ref = refMap.get(oz);
        if (!ref) continue; // Bereich-Zeile, keine Referenz

        const ep = ws.getRow(r).getCell(5).value as number;
        const gp = ws.getRow(r).getCell(6).value as number;

        if (ep === undefined || ep === null) continue;

        // Cent-genauer Vergleich
        expect(
          Math.abs(ep - ref.EP),
          `${oz} EP: export=${ep} ref=${ref.EP}`,
        ).toBeLessThanOrEqual(0.01);

        expect(
          Math.abs(gp - ref.GP),
          `${oz} GP: export=${gp} ref=${ref.GP}`,
        ).toBeLessThanOrEqual(0.01);

        posChecked++;
      }

      expect(posChecked).toBe(46);

      // Aufräumen
      try {
        unlinkSync(EXPORT_PFAD);
      } catch {
        // Ignorieren wenn Datei nicht existiert
      }
    });
  },
);
