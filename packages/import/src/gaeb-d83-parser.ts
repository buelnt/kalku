/**
 * GAEB DA 1990 Flat-File Parser (D83/D84)
 *
 * Liest Leistungsverzeichnisse im GAEB DA 1990 Format. Das ist das
 * verbreitetste GAEB-Format bei kommunalen Vergabestellen in Deutschland.
 *
 * Format-Eigenschaften:
 * - 80-Zeichen-Satzformat (fixed width)
 * - Encoding: CP850 (DOS Western European)
 * - Zeilenende: CR+LF
 * - Record-Typen über 2-stelligen numerischen Code in Spalte 1-2
 *
 * Unterstützte Record-Typen:
 *   00  Datei-Header (GAEB-Version, LB-Art)
 *   01  Projektinformationen (Name, Termine)
 *   02  Projektbezeichnung
 *   03  Auftraggeber
 *   08  Währung
 *   11  Bereich/Abschnitt (Hierarchie-Ebene)
 *   12  Bereich-Text (folgt auf 11)
 *   21  Position (OZ, Art, Menge, Einheit)
 *   25  Kurztext (folgt auf 21)
 *   26  Langtext (folgt auf 21/25)
 *   31  Summen-Record (Bereichs-Summe)
 *   99  Dateiende
 *   T0  Beginn Vorbemerkungen
 *   T1  Vorbemerkungstext
 *   T9  Ende Vorbemerkungen
 *
 * OZ-Format (Ordnungszahl):
 *   Standard GAEB-Gliederung: 2+2+4 = 8 Stellen
 *   "01010010" → "01.01.0010"
 *   Plus optionaler Index (1 Stelle): "01020020" + "1" → "01.02.0020.1"
 *
 * Menge-Format:
 *   20-stellig, rechtsbündig, mit 3 impliziten Dezimalstellen
 *   "         00000001000" → 1.000 → 1
 *   "         00000090000" → 90.000 → 90
 *
 * Referenz-Datei: Friedhöfe_Wegebau_2026_1_LV.D83 (Riegelsberg)
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Decimal } from "@baukalk/datenmodell";
import type {
  LvImport,
  LvEintrag,
  PositionArt,
  ImportMeta,
} from "@baukalk/datenmodell";
import { decodeCp850 } from "./cp850.js";

/**
 * Konvertiert eine GAEB-OZ (ohne Punkte) in das gepunktete Format.
 *
 * Gliederung 2+2+4:
 *   "01"       → "01"
 *   "0101"     → "01.01"
 *   "01010010" → "01.01.0010"
 *
 * Mit Index:
 *   "01020020" + "1" → "01.02.0020.1"
 */
function formatOz(rawOz: string, index: string): string {
  const oz = rawOz.replace(/\s+$/, ""); // rechts trimmen
  let dotted: string;

  if (oz.length <= 2) {
    dotted = oz;
  } else if (oz.length <= 4) {
    dotted = `${oz.slice(0, 2)}.${oz.slice(2)}`;
  } else {
    dotted = `${oz.slice(0, 2)}.${oz.slice(2, 4)}.${oz.slice(4)}`;
  }

  // Sub-Index anhängen wenn nicht leer
  const idx = index.trim();
  if (idx.length > 0) {
    dotted += `.${idx}`;
  }

  return dotted;
}

/**
 * Parst die Menge aus dem 20-stelligen Feld mit 3 impliziten Dezimalstellen.
 */
function parseMenge(raw: string): Decimal {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "0") return new Decimal(0);
  // Entferne führende Nullen, parse als Integer, teile durch 1000
  const num = parseInt(trimmed, 10);
  if (isNaN(num)) return new Decimal(0);
  return new Decimal(num).div(1000);
}

/**
 * Berechnet die Hierarchie-Tiefe aus einer gepunkteten OZ.
 */
function ozTiefe(oz: string): number {
  return oz.split(".").length;
}

/**
 * Findet den parent_index für einen Eintrag.
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
 * Parst eine GAEB DA 1990 Flat-Datei (D83 oder D84).
 *
 * @param input     Dateipfad (string) oder Dateiinhalt (Buffer)
 * @param dateiname Original-Dateiname für Metadaten
 */
export function parseGaebD83(
  input: string | Buffer,
  dateiname?: string,
): LvImport {
  let buffer: Buffer;
  let name: string;
  if (typeof input === "string") {
    buffer = readFileSync(input) as Buffer;
    name = dateiname ?? basename(input);
  } else {
    buffer = input;
    name = dateiname ?? "unbekannt.d83";
  }

  // CP850 → Unicode
  const text = decodeCp850(buffer);
  const lines = text.split("\r\n");

  // GAEB-Version aus Record 00 ermitteln
  let gaebVersion = "83";
  for (const line of lines) {
    if (line.startsWith("00") && line.length >= 12) {
      gaebVersion = line.slice(10, 12).trim();
      break;
    }
  }

  // Quelle bestimmen
  const quelle =
    gaebVersion === "84" ? ("gaeb_d84" as const) : ("gaeb_d83" as const);

  // State-Machine: Records sequenziell verarbeiten
  const eintraege: LvEintrag[] = [];
  let currentKurztext: string[] = [];
  let currentLangtext: string[] = [];
  let lastEntryIndex = -1; // Index des letzten 11- oder 21-Eintrags

  for (const line of lines) {
    if (line.length < 2) continue;
    const recordType = line.slice(0, 2);

    switch (recordType) {
      case "11": {
        // Bereich-Header: neuer Abschnitt
        flushTexts();
        const rawOz = line.slice(2, 10);
        const oz = formatOz(rawOz, "");
        const tiefe = ozTiefe(oz);
        const parentIndex = findParentIndex(eintraege, tiefe);

        eintraege.push({
          oz,
          art: "BEREICH",
          kurztext: "", // wird durch nachfolgende 12-Records gefüllt
          langtext: undefined,
          menge: undefined,
          einheit: undefined,
          ep: undefined,
          gp: undefined,
          tiefe,
          parent_index: parentIndex,
        });
        lastEntryIndex = eintraege.length - 1;
        currentKurztext = [];
        currentLangtext = [];
        break;
      }

      case "12": {
        // Bereich-Text (folgt auf 11)
        const text12 = line.slice(2, 72).trimEnd();
        if (text12.length > 0) {
          currentKurztext.push(text12);
        }
        // Kurztext für den Bereich sofort zuweisen
        if (lastEntryIndex >= 0 && eintraege[lastEntryIndex]!.art === "BEREICH") {
          eintraege[lastEntryIndex]!.kurztext = currentKurztext.join(" ").trim();
        }
        break;
      }

      case "21": {
        // Position-Header: neue Position
        flushTexts();
        const rawOz = line.slice(2, 10);
        const index = line.slice(10, 11);
        const oz = formatOz(rawOz, index);
        const artChar = line.slice(11, 12);
        const mengeRaw = line.slice(14, 34);
        const einheitRaw = line.slice(34, 38).trim();

        // Positionsart aus dem Kennbuchstaben
        let art: PositionArt;
        switch (artChar) {
          case "N":
            art = "NORMAL";
            break;
          case "Z":
            art = "ZULAGE";
            break;
          case "W":
            art = "WAHL";
            break;
          case "E":
            art = "EVENTUELL";
            break;
          default:
            art = "NORMAL";
        }

        const menge = parseMenge(mengeRaw);
        const tiefe = ozTiefe(oz);
        const parentIndex = findParentIndex(eintraege, tiefe);

        eintraege.push({
          oz,
          art,
          kurztext: "", // wird durch nachfolgende 25-Records gefüllt
          langtext: undefined,
          menge,
          einheit: einheitRaw || undefined,
          ep: undefined,
          gp: undefined,
          tiefe,
          parent_index: parentIndex,
        });
        lastEntryIndex = eintraege.length - 1;
        currentKurztext = [];
        currentLangtext = [];
        break;
      }

      case "25": {
        // Kurztext-Zeile (folgt auf 21)
        const text25 = line.slice(2, 72).trimEnd();
        currentKurztext.push(text25);
        break;
      }

      case "26": {
        // Langtext-Zeile (folgt auf 21/25)
        const text26 = line.slice(2, 72).trimEnd();
        currentLangtext.push(text26);
        break;
      }

      // Records 00, 01, 02, 03, 08, 31, 99, T0, T1, T9 werden übersprungen
      // (für Phase 1 nicht benötigt; Vorbemerkungen könnten später relevant werden)
    }
  }

  // Letzte Texte flushen
  flushTexts();

  function flushTexts(): void {
    if (lastEntryIndex < 0) return;
    const entry = eintraege[lastEntryIndex]!;
    if (currentKurztext.length > 0 && entry.kurztext === "") {
      // Für Positionen: erste Zeile = Kurztext, Rest = Teil des Langtexts
      entry.kurztext = currentKurztext[0]!.trim();
      if (currentKurztext.length > 1) {
        const restKurztext = currentKurztext
          .slice(1)
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
          .join("\n");
        if (restKurztext.length > 0) {
          currentLangtext.unshift(restKurztext);
        }
      }
    }
    if (currentLangtext.length > 0) {
      entry.langtext = currentLangtext
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join("\n");
    }
  }

  // Zählen
  let anzahlPositionen = 0;
  let anzahlBereiche = 0;
  for (const e of eintraege) {
    if (e.art === "BEREICH") {
      anzahlBereiche++;
    } else {
      anzahlPositionen++;
    }
  }

  const meta: ImportMeta = {
    quelle,
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
