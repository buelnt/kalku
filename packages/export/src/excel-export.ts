/**
 * Excel-Export im LV3-Layout
 *
 * Erzeugt eine Excel-Datei, die für den Kunden (= Baufirma) identisch
 * aussieht wie die heutigen manuell erstellten LV3-Kalkulationstabellen.
 *
 * Layout-Referenz: 260319_Friedhoefe_Riegelsberg/LV3.xlsx
 *
 * Kundenansicht (Spalten A-M, sichtbar):
 *   A  = Pos. (OZ)
 *   B  = Bezeichnung (Kurztext)
 *   C  = Menge
 *   D  = Einheit (z.B. m², lfm, Psch)
 *   E  = EP (Einheitspreis)
 *   F  = GP (Gesamtpreis)
 *   G  = (Bereichs-Summen)
 *   H  = (Trennlinie, schmal)
 *   I  = EP | EK (Stoffe EK für den Kunden)
 *   J  = Min/Einheit (Zeitaufwand)
 *   K  = Lstg./Std. (Leistung pro Stunde bei EK-Satz)
 *   L  = Lstg./Std. (Leistung pro Stunde bei VK-Satz)
 *   M  = EP | EK (NU-Kosten für den Kunden)
 *
 * Rechen-Spalten (ab X, ausgeblendet):
 *   X  = Stoffe EK pro Einheit
 *   Y  = Zeit in min (roh)
 *   Z  = Gerätezulage €/h
 *   AA = EP Geräte
 *   AB = EP Löhne
 *   AC = Echte Zeit (mit Zeitwert-Faktor)
 *   AE = GP Löhne
 *   AF = GP Stoffe
 *   AG = GP Geräte
 *   AH = GP Nachunt.
 *   AJ = EP Stoffe VK
 *   AK = EP NU VK
 */
import ExcelJS from "exceljs";
import {
  Decimal,
  runden,
  type Parameter,
  type PositionRechenInput,
} from "@baukalk/datenmodell";
import type { LvImport } from "@baukalk/datenmodell";
import { berechne } from "@baukalk/kern";

/** Projekt-Metadaten für den Excel-Kopf. */
export interface ProjektMeta {
  auftraggeber: string;
  leistung: string;
  bauvorhaben: string;
  bieter: string;
  vergabenummer?: string;
  abgabedatum?: string;
  mwst_satz: number;
  personal?: number;
}

/** Rechen-Eingaben pro Position (OZ → Werte). */
export type PositionWerte = Map<
  string,
  PositionRechenInput
>;

export interface ExportOptionen {
  /** Das importierte LV mit Struktur und Positionen. */
  lv: LvImport;
  /** Die Projekt-Parameter (Verrechnungslohn, Zuschläge etc.). */
  parameter: Parameter;
  /** Rechen-Eingaben pro Position (OZ als Schlüssel). */
  werte: PositionWerte;
  /** Projekt-Metadaten für den Kopf. */
  meta: ProjektMeta;
}

// Spalten-Konstanten (1-basiert wie ExcelJS)
const COL = {
  POS: 1,        // A
  BEZ: 2,        // B
  MENGE: 3,      // C
  EINHEIT: 4,    // D
  EP: 5,         // E
  GP: 6,         // F
  BEREICH_SUM: 7,// G
  I_EP_EK: 9,    // I (Stoffe EK Ansicht)
  J_MIN: 10,     // J (Min/Einheit)
  K_LSTG: 11,    // K (Leistung/Std EK)
  L_LSTG: 12,    // L (Leistung/Std VK)
  M_NU: 13,      // M (NU EK Ansicht)
  X: 24,         // X (Stoffe EK)
  Y: 25,         // Y (Zeit min roh)
  Z: 26,         // Z (Gerätezulage)
  AA: 27,        // AA (EP Geräte)
  AB: 28,        // AB (EP Löhne)
  AC: 29,        // AC (Echte Zeit)
  AE: 31,        // AE (GP Löhne)
  AF: 32,        // AF (GP Stoffe)
  AG: 33,        // AG (GP Geräte)
  AH: 34,        // AH (GP NU)
  AJ: 36,        // AJ (EP Stoffe VK)
  AK: 37,        // AK (EP NU VK)
} as const;

const HEADER_ROW = 13;
const DATA_START_ROW = 15;

const NULL = new Decimal(0);

/**
 * Erzeugt eine vollständig kalkulierte Excel-Datei im LV3-Layout.
 *
 * @returns ExcelJS.Workbook, das mit `workbook.xlsx.writeFile(path)` oder
 *          `workbook.xlsx.writeBuffer()` gespeichert werden kann.
 */
export async function exportExcelLv3(
  optionen: ExportOptionen,
): Promise<ExcelJS.Workbook> {
  const { lv, parameter, werte, meta } = optionen;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Kalkulation", {
    views: [{ showGridLines: true }],
  });

  // ─── Spaltenbreiten ───
  ws.getColumn(COL.POS).width = 10;
  ws.getColumn(COL.BEZ).width = 27;
  ws.getColumn(COL.MENGE).width = 14;
  ws.getColumn(COL.EINHEIT).width = 5;
  ws.getColumn(COL.EP).width = 9;
  ws.getColumn(COL.GP).width = 9;
  ws.getColumn(COL.BEREICH_SUM).width = 9;

  // ─── Kopf-Bereich (Zeilen 2-10) ───
  writeKopf(ws, parameter, meta);

  // ─── Header-Zeile (Zeile 13) ───
  writeHeaders(ws);

  // ─── Positionen und Bereiche ───
  let currentRow = DATA_START_ROW;
  const bereichSummenZeilen: { row: number; startRow: number; endRow: number }[] = [];
  // lastBereichRow wird in Phase 2 für erweiterte Bereichs-Logik genutzt

  // Netto-Summen-Tracking
  let nettoSumme = new Decimal(0);
  let sumLohn = new Decimal(0);
  let sumStoffe = new Decimal(0);
  let sumGeraete = new Decimal(0);
  let sumNU = new Decimal(0);

  for (let i = 0; i < lv.eintraege.length; i++) {
    const eintrag = lv.eintraege[i]!;

    if (eintrag.art === "BEREICH") {
      // Bereich-Zeile
      const row = ws.getRow(currentRow);
      row.getCell(COL.POS).value = ` ${eintrag.oz}`;
      row.getCell(COL.BEZ).value = eintrag.kurztext;
      row.getCell(COL.POS).font = { bold: true };
      row.getCell(COL.BEZ).font = { bold: true };

      bereichSummenZeilen.push({
        row: currentRow,
        startRow: currentRow + 1,
        endRow: currentRow, // wird später aktualisiert
      });
      // lastBereichRow = currentRow; (Phase 2)
      currentRow++;
      continue;
    }

    // Position-Zeile
    const posWerte = werte.get(eintrag.oz);
    const input: PositionRechenInput = posWerte ?? {
      stoffe_ek: undefined,
      zeit_min_roh: undefined,
      geraetezulage_eur_h: undefined,
      nu_ek: undefined,
    };

    const menge = eintrag.menge ?? NULL;
    const ergebnis = berechne(input, menge, parameter);

    const row = ws.getRow(currentRow);

    // Kundenansicht (A-F)
    row.getCell(COL.POS).value = ` ${eintrag.oz}`;
    row.getCell(COL.BEZ).value = eintrag.kurztext;
    row.getCell(COL.MENGE).value = menge.toNumber();
    row.getCell(COL.EINHEIT).value = eintrag.einheit ?? "";
    row.getCell(COL.EP).value = runden(ergebnis.ep).toNumber();
    row.getCell(COL.GP).value = runden(ergebnis.gp).toNumber();

    // Kunden-Info-Spalten (I-M)
    row.getCell(COL.I_EP_EK).value = (input.stoffe_ek ?? NULL).toNumber() || undefined;
    const acNum = ergebnis.zeit_mit_faktor.toNumber();
    row.getCell(COL.J_MIN).value = acNum === 0 ? "-" : runden(ergebnis.zeit_mit_faktor).toNumber();
    // K: Leistung/Std bei EK-Lohn
    if (!ergebnis.zeit_mit_faktor.isZero()) {
      const personal = meta.personal ?? 1;
      row.getCell(COL.K_LSTG).value = runden(
        new Decimal(60).div(ergebnis.zeit_mit_faktor).mul(personal),
      ).toNumber();
      row.getCell(COL.L_LSTG).value = runden(
        new Decimal(60).div(ergebnis.zeit_mit_faktor).mul(8).mul(personal),
      ).toNumber();
    } else {
      row.getCell(COL.K_LSTG).value = "-";
      row.getCell(COL.L_LSTG).value = "-";
    }
    row.getCell(COL.M_NU).value = (input.nu_ek ?? NULL).toNumber() || undefined;

    // Rechen-Spalten (X-AK)
    const stoffe = input.stoffe_ek ?? NULL;
    const zeit = input.zeit_min_roh ?? NULL;
    const geraete = input.geraetezulage_eur_h ?? parameter.geraetezulage_default;

    if (!stoffe.isZero()) row.getCell(COL.X).value = stoffe.toNumber();
    if (!zeit.isZero()) row.getCell(COL.Y).value = zeit.toNumber();
    row.getCell(COL.Z).value = geraete.toNumber();
    row.getCell(COL.AA).value = runden(ergebnis.geraete_ep).toNumber();
    row.getCell(COL.AB).value = runden(ergebnis.lohn_ep).toNumber();
    row.getCell(COL.AC).value = runden(ergebnis.zeit_mit_faktor).toNumber();

    // GP-Spalten
    row.getCell(COL.AE).value = runden(menge.mul(ergebnis.lohn_ep)).toNumber();
    row.getCell(COL.AF).value = runden(menge.mul(ergebnis.stoffe_vk)).toNumber();
    row.getCell(COL.AG).value = runden(menge.mul(ergebnis.geraete_ep)).toNumber();
    row.getCell(COL.AH).value = runden(menge.mul(ergebnis.nu_vk)).toNumber();
    row.getCell(COL.AJ).value = runden(ergebnis.stoffe_vk).toNumber();
    row.getCell(COL.AK).value = runden(ergebnis.nu_vk).toNumber();

    // Zahlenformat für Geld-Spalten
    for (const col of [COL.EP, COL.GP, COL.I_EP_EK, COL.M_NU, COL.AA, COL.AB, COL.AJ, COL.AK]) {
      row.getCell(col).numFmt = '#,##0.00';
    }

    // Summen-Tracking
    nettoSumme = nettoSumme.plus(ergebnis.gp);
    sumLohn = sumLohn.plus(menge.mul(ergebnis.lohn_ep));
    sumStoffe = sumStoffe.plus(menge.mul(ergebnis.stoffe_vk));
    sumGeraete = sumGeraete.plus(menge.mul(ergebnis.geraete_ep));
    sumNU = sumNU.plus(menge.mul(ergebnis.nu_vk));

    // Bereichs-Summe aktualisieren
    if (bereichSummenZeilen.length > 0) {
      bereichSummenZeilen[bereichSummenZeilen.length - 1]!.endRow = currentRow;
    }

    currentRow++;
  }

  // ─── Bereichs-Summen in Spalte G eintragen ───
  for (const bs of bereichSummenZeilen) {
    if (bs.endRow > bs.startRow) {
      // Summenformel: =SUM(F{start}:F{end})
      ws.getRow(bs.row).getCell(COL.BEREICH_SUM).value = {
        formula: `SUM(F${bs.startRow}:F${bs.endRow})`,
      };
      ws.getRow(bs.row).getCell(COL.BEREICH_SUM).numFmt = '#,##0.00';
    }
  }

  // ─── Netto/MwSt/Brutto in Kopf ───
  ws.getRow(8).getCell(COL.GP).value = runden(nettoSumme).toNumber();
  ws.getRow(8).getCell(COL.GP).numFmt = '#,##0.00';

  const mwstBetrag = runden(nettoSumme.mul(new Decimal(meta.mwst_satz)));
  ws.getRow(9).getCell(COL.GP).value = mwstBetrag.toNumber();
  ws.getRow(9).getCell(COL.GP).numFmt = '#,##0.00';

  const brutto = runden(nettoSumme.plus(mwstBetrag));
  ws.getRow(10).getCell(COL.GP).value = brutto.toNumber();
  ws.getRow(10).getCell(COL.GP).numFmt = '#,##0.00';
  ws.getRow(10).getCell(COL.GP).font = { bold: true };

  // ─── Zusammenfassungs-Spalten im Kopf (I-M, Zeilen 4-7) ───
  // Stoffe
  ws.getRow(4).getCell(12).value = runden(sumStoffe).toNumber();
  ws.getRow(4).getCell(12).numFmt = '#,##0.00';
  // NU
  ws.getRow(5).getCell(12).value = runden(sumNU).toNumber();
  ws.getRow(5).getCell(12).numFmt = '#,##0.00';
  // Geräte
  ws.getRow(6).getCell(12).value = runden(sumGeraete).toNumber();
  ws.getRow(6).getCell(12).numFmt = '#,##0.00';
  // Lohn
  ws.getRow(7).getCell(12).value = runden(sumLohn).toNumber();
  ws.getRow(7).getCell(12).numFmt = '#,##0.00';

  return wb;
}

function writeKopf(
  ws: ExcelJS.Worksheet,
  parameter: Parameter,
  meta: ProjektMeta,
): void {
  // Zeile 2: Auftraggeber + Abgabedatum + Stundensatz
  ws.getRow(2).getCell(1).value = "AG:";
  ws.getRow(2).getCell(2).value = meta.auftraggeber;
  ws.getRow(2).getCell(4).value = "Abgabedatum:";
  ws.getRow(2).getCell(6).value = meta.abgabedatum ?? "";
  ws.getRow(2).getCell(9).value = "Lohnkosten, inkl L-NK / Std.:";
  ws.getRow(2).getCell(11).value = (parameter.lohn_ek ?? NULL).toNumber();
  ws.getRow(2).getCell(12).value = "Stundensatz:";
  ws.getRow(2).getCell(13).value = parameter.verrechnungslohn.toNumber();

  // Zeile 4: Leistung + Stoffe-Zuschlag
  ws.getRow(4).getCell(1).value = "Leistung:";
  ws.getRow(4).getCell(2).value = meta.leistung;
  ws.getRow(4).getCell(4).value = "Vergabenummer:";
  ws.getRow(4).getCell(6).value = meta.vergabenummer ?? "";
  ws.getRow(4).getCell(9).value = "Stoffe:";
  ws.getRow(4).getCell(11).value = parameter.material_zuschlag.toNumber();

  // Zeile 5: NU-Zuschlag
  ws.getRow(5).getCell(9).value = "Nachuntern.:";
  ws.getRow(5).getCell(11).value = parameter.nu_zuschlag.toNumber();

  // Zeile 6: BV + Geräte-Zuschlag
  ws.getRow(6).getCell(1).value = "BV:";
  ws.getRow(6).getCell(2).value = meta.bauvorhaben;
  ws.getRow(6).getCell(9).value = "Gerätekosten:";
  ws.getRow(6).getCell(11).value = (parameter.geraete_grundzuschlag ?? NULL).toNumber();

  // Zeile 7: Lohn
  ws.getRow(7).getCell(9).value = "Lohn:";

  // Zeile 8: Bieter + Netto
  ws.getRow(8).getCell(1).value = "Bieter:";
  ws.getRow(8).getCell(2).value = meta.bieter;
  ws.getRow(8).getCell(3).value = "Netto Angebotssumme";
  ws.getRow(8).getCell(9).value = "Mitarbeiter:";
  ws.getRow(8).getCell(10).value = meta.personal ?? 1;

  // Zeile 9: MwSt
  ws.getRow(9).getCell(3).value = "MwSt.:";
  ws.getRow(9).getCell(4).value = meta.mwst_satz;
  ws.getRow(9).getCell(4).numFmt = '0%';

  // Zeile 10: Brutto
  ws.getRow(10).getCell(3).value = "Brutto Angebotssumme";
}

function writeHeaders(ws: ExcelJS.Worksheet): void {
  const row = ws.getRow(HEADER_ROW);
  const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 9 };

  row.getCell(COL.POS).value = "Pos.";
  row.getCell(COL.BEZ).value = "Bezeichnung";
  row.getCell(COL.MENGE).value = "Menge";
  row.getCell(COL.EP).value = "EP";
  row.getCell(COL.GP).value = "GP";
  row.getCell(COL.I_EP_EK).value = "EP | EK";
  row.getCell(COL.J_MIN).value = "Min/Einheit";
  row.getCell(COL.K_LSTG).value = "Lstg./Std.";
  row.getCell(COL.L_LSTG).value = "Lstg./Std.";
  row.getCell(COL.M_NU).value = "EP | EK";

  for (let c = 1; c <= 13; c++) {
    row.getCell(c).font = headerFont;
  }
}
