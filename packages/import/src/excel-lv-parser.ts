/**
 * Excel-LV-Parser
 *
 * Liest ein Leistungsverzeichnis aus einer Excel-Datei im Format, wie es
 * von Vergabestellen geliefert wird (z.B. das LV.xlsx bei Gesellchen/Riegelsberg).
 *
 * Erwartetes Format:
 *   Spalte A = OZ (Ordnungszahl)
 *   Spalte B = PosArt (BEREICH | NORMAL | ZULAGE | WAHL | EVENTUELL)
 *   Spalte C = Kurztext, ggf. mit \n und Langtext
 *   Spalte D = Menge
 *   Spalte E = Einheit
 *   Spalte F = EP (oft leer beim Import)
 *   Spalte G = GP (oft leer beim Import)
 *
 * Das Format wird heuristisch erkannt: wenn Zeile 1 die Header "OZ" und
 * "Kurztext" (oder "Bezeichnung") enthält, wird das Sheet als LV-Sheet
 * behandelt. Sonst wird das erste Sheet probiert.
 *
 * Besonderheiten:
 * - Kurztext und Langtext kommen oft in einer Zelle mit \n getrennt.
 *   Der Parser trennt: erste Zeile = Kurztext, Rest = Langtext.
 * - Die OZ-Hierarchie wird aus der Punkt-Struktur abgeleitet:
 *   "01" → Tiefe 1, "01.02" → Tiefe 2, "01.02.0010" → Tiefe 3.
 * - Leere Zeilen und Zeilen ohne OZ werden übersprungen.
 * - Menge, EP, GP werden als Decimal geparst, wo vorhanden.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";
import { Decimal } from "@baukalk/datenmodell";
import type {
  LvImport,
  LvEintrag,
  PositionArt,
  ImportMeta,
} from "@baukalk/datenmodell";

/** Spalten-Mapping (0-basiert). */
const COL = {
  OZ: 0,       // A
  POS_ART: 1,  // B
  TEXT: 2,      // C
  MENGE: 3,    // D
  EINHEIT: 4,  // E
  EP: 5,       // F
  GP: 6,       // G
} as const;

/**
 * Berechnet die Hierarchie-Tiefe aus einer OZ.
 *
 * "01"          → 1
 * "01.02"       → 2
 * "01.02.0010"  → 3
 * "01.02.0010.1"→ 4
 */
function ozTiefe(oz: string): number {
  return oz.split(".").length;
}

/**
 * Normalisiert die PosArt aus der Excel-Zelle.
 * Erkennt auch Varianten wie "Bereich", "Normal", Groß-/Kleinschreibung.
 */
function parsePosArt(raw: string | null | undefined): PositionArt | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  switch (normalized) {
    case "BEREICH":
      return "BEREICH";
    case "NORMAL":
      return "NORMAL";
    case "ZULAGE":
      return "ZULAGE";
    case "WAHL":
      return "WAHL";
    case "EVENTUELL":
    case "BEDARFSPOSITION":
      return "EVENTUELL";
    default:
      return null;
  }
}

/**
 * Trennt Kurztext und Langtext aus einer kombinierten Zelle.
 *
 * Konvention: Die erste Zeile ist der Kurztext, alles danach ist Langtext.
 * Trailing whitespace wird entfernt.
 */
function splitKurzLangtext(raw: string | null | undefined): {
  kurztext: string;
  langtext: string | undefined;
} {
  if (!raw) return { kurztext: "", langtext: undefined };
  const text = String(raw).trimEnd();
  const firstNewline = text.indexOf("\n");
  if (firstNewline === -1) {
    return { kurztext: text.trim(), langtext: undefined };
  }
  const kurztext = text.slice(0, firstNewline).trim();
  const langtext = text.slice(firstNewline + 1).trim();
  return {
    kurztext,
    langtext: langtext.length > 0 ? langtext : undefined,
  };
}

/**
 * Versucht einen Zellwert als Decimal zu parsen.
 * Gibt undefined zurück wenn der Wert null, leer oder 0 ist.
 */
function parseOptionalDecimal(
  value: unknown,
): Decimal | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") {
    return value === 0 ? undefined : new Decimal(value);
  }
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/\./g, "").replace(/,/, ".");
    if (cleaned === "" || cleaned === "0") return undefined;
    try {
      const d = new Decimal(cleaned);
      return d.isZero() ? undefined : d;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Parst einen Zellwert als Decimal. Gibt 0 zurück wenn nicht parsbar.
 */
function parseDecimalOrZero(value: unknown): Decimal {
  const d = parseOptionalDecimal(value);
  return d ?? new Decimal(0);
}

/**
 * Findet das richtige Sheet in der Workbook.
 *
 * Priorisierung:
 * 1. Sheet mit Name "LV" (case-insensitive)
 * 2. Sheet dessen Zeile 1 "OZ" in Spalte A enthält
 * 3. Erstes Sheet
 */
function findLvSheet(wb: XLSX.WorkBook): string {
  // Exakter Name-Match
  for (const name of wb.SheetNames) {
    if (name.toUpperCase() === "LV") return name;
  }
  // Header-Match
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const a1 = ws["A1"];
    if (a1 && String(a1.v).toUpperCase().includes("OZ")) return name;
  }
  // Fallback: erstes Sheet
  return wb.SheetNames[0]!;
}

/**
 * Findet den parent_index für einen Eintrag basierend auf der OZ-Tiefe.
 *
 * Sucht rückwärts in der Eintrags-Liste nach dem nächsten Eintrag mit
 * einer geringeren Tiefe, der ein BEREICH ist.
 */
function findParentIndex(
  eintraege: LvEintrag[],
  tiefe: number,
): number | null {
  for (let i = eintraege.length - 1; i >= 0; i--) {
    const e = eintraege[i]!;
    if (e.tiefe < tiefe && e.art === "BEREICH") {
      return i;
    }
  }
  return null;
}

/**
 * Parsed eine Excel-Datei (als Dateipfad oder als Buffer) und gibt ein
 * strukturiertes LV-Import-Objekt zurück.
 *
 * @param input      Dateipfad (string) oder Dateiinhalt (Buffer)
 * @param dateiname  Original-Dateiname (für Metadaten). Wird automatisch
 *                   aus dem Pfad abgeleitet, wenn `input` ein String ist.
 */
export function parseExcelLv(
  input: string | Buffer,
  dateiname?: string,
): LvImport {
  // Datei lesen
  let buffer: Buffer;
  let name: string;
  if (typeof input === "string") {
    buffer = readFileSync(input) as Buffer;
    name = dateiname ?? basename(input);
  } else {
    buffer = input;
    name = dateiname ?? "unbekannt.xlsx";
  }

  // SheetJS parsen
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = findLvSheet(wb);
  const ws = wb.Sheets[sheetName]!;

  // Als Array-of-Arrays (raw values), header: 1 = keine Header-Transformation
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    rawNumbers: true,
  });

  // Header-Zeile identifizieren (suche nach "OZ" in Spalte A)
  let startRow = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;
    const a = row[COL.OZ];
    if (a && String(a).toUpperCase().includes("OZ")) {
      startRow = i + 1; // Daten beginnen nach dem Header
      break;
    }
  }

  // Einträge sammeln
  const eintraege: LvEintrag[] = [];
  let anzahlPositionen = 0;
  let anzahlBereiche = 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // OZ muss vorhanden sein
    const ozRaw = row[COL.OZ];
    if (ozRaw === null || ozRaw === undefined || String(ozRaw).trim() === "") {
      continue;
    }
    const oz = String(ozRaw).trim();

    // PosArt parsen
    const artRaw = row[COL.POS_ART];
    let art = parsePosArt(artRaw != null ? String(artRaw) : null);

    // Heuristik: wenn keine PosArt angegeben, aus der OZ-Tiefe und dem
    // Vorhandensein von Menge/Einheit ableiten
    if (art === null) {
      const menge = row[COL.MENGE];
      const einheit = row[COL.EINHEIT];
      if (menge !== null && menge !== undefined && einheit) {
        art = "NORMAL";
      } else {
        art = "BEREICH";
      }
    }

    // Text
    const textRaw = row[COL.TEXT];
    const { kurztext, langtext } = splitKurzLangtext(
      textRaw != null ? String(textRaw) : null,
    );

    // Menge & Einheit
    const menge =
      art !== "BEREICH" ? parseDecimalOrZero(row[COL.MENGE]) : undefined;
    const einheit =
      art !== "BEREICH" && row[COL.EINHEIT]
        ? String(row[COL.EINHEIT]).trim()
        : undefined;

    // EP & GP (können beim Import leer sein)
    const ep = parseOptionalDecimal(row[COL.EP]);
    const gp = art === "BEREICH"
      ? parseOptionalDecimal(row[COL.GP])
      : parseOptionalDecimal(row[COL.GP]);

    const tiefe = ozTiefe(oz);
    const parentIndex = findParentIndex(eintraege, tiefe);

    const eintrag: LvEintrag = {
      oz,
      art,
      kurztext,
      langtext,
      menge,
      einheit,
      ep,
      gp,
      tiefe,
      parent_index: parentIndex,
    };

    eintraege.push(eintrag);

    if (art === "BEREICH") {
      anzahlBereiche++;
    } else {
      anzahlPositionen++;
    }
  }

  const meta: ImportMeta = {
    quelle: "excel_lv",
    original_datei: name,
    importiert_am: new Date().toISOString(),
  };

  return {
    meta,
    eintraege,
    anzahl_positionen: anzahlPositionen,
    anzahl_bereiche: anzahlBereiche,
  };
}
