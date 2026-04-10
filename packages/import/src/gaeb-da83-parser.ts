/**
 * GAEB DA 83 Parser (Festformat D83/D84)
 *
 * Parser für das ältere GAEB DA 83 Format (Festformat, kein XML).
 * Zeilenbasiert mit 2-stelligem Satztyp am Anfang jeder Zeile.
 *
 * Satztypen:
 *   00 = Kopfsatz
 *   01 = Projekttitel
 *   11 = Bereich (LOS/Abschnitt)
 *   12 = Bereichstext (Kurztext des Bereichs)
 *   21 = Position (OZ, Menge, Einheit)
 *   25 = Positionstext (Kurztext, erste Zeile = Kurztext, Rest = Ergänzung)
 *   26 = Langtext der Position
 *   99 = Endesatz
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Decimal } from "@baukalk/datenmodell";
import type { LvImport, LvEintrag, ImportMeta } from "@baukalk/datenmodell";

/**
 * Erkennt ob eine Datei GAEB DA 83 Festformat ist (nicht XML).
 */
export function istGaebDa83(dateiPfad: string): boolean {
  try {
    const buf = readFileSync(dateiPfad);
    const start = buf.slice(0, 20).toString("latin1");
    // DA83 beginnt mit "00" gefolgt von Leerzeichen und "83"
    return start.startsWith("00") && !start.startsWith("<?xml") && !start.startsWith("<");
  } catch {
    return false;
  }
}

/**
 * Parst eine GAEB DA 83 Datei.
 */
export function parseGaebDa83(
  input: string | Buffer,
  dateiname?: string,
): LvImport {
  let content: string;
  let name: string;

  if (typeof input === "string" && !input.startsWith("00")) {
    // Dateipfad
    const buf = readFileSync(input);
    content = buf.toString("latin1");
    name = dateiname ?? basename(input);
  } else if (Buffer.isBuffer(input)) {
    content = input.toString("latin1");
    name = dateiname ?? "unbekannt.d83";
  } else {
    content = input as string;
    name = dateiname ?? "unbekannt.d83";
  }

  const zeilen = content.split(/\r?\n/);
  const eintraege: LvEintrag[] = [];
  let anzahlPositionen = 0;
  let anzahlBereiche = 0;

  // Aktueller Kontext
  let aktuellerBereichOz = "";
  let aktuellePositionOz = "";
  let sammleKurztext = false;
  let sammleLangtext = false;
  let kurztextZeilen: string[] = [];
  let langtextZeilen: string[] = [];
  let ersteKurztextZeile = true;

  function ozTiefe(oz: string): number {
    return oz.split(".").filter(Boolean).length;
  }

  function findParentIndex(tiefe: number): number | null {
    for (let i = eintraege.length - 1; i >= 0; i--) {
      if (eintraege[i]!.tiefe < tiefe && eintraege[i]!.art === "BEREICH") return i;
    }
    return null;
  }

  /**
   * Beendet die aktuelle Position (sammelt Kurztext + Langtext).
   */
  function abschliessenPosition(): void {
    if (aktuellePositionOz === "") return;

    // Finde die Position in eintraege und ergänze Texte
    const pos = eintraege[eintraege.length - 1];
    if (!pos || pos.oz !== aktuellePositionOz) return;

    if (kurztextZeilen.length > 0) {
      pos.kurztext = kurztextZeilen[0]!.trim();
      // Wenn Kurztext nur ein Trennstrich ist, nächste Zeile nehmen
      if (pos.kurztext.match(/^-+$/)) {
        pos.kurztext = kurztextZeilen.length > 1 ? kurztextZeilen[1]!.trim() : `Position ${pos.oz}`;
      }
    }

    if (langtextZeilen.length > 0) {
      pos.langtext = langtextZeilen.map((z) => z.trim()).join("\n").trim();
    }

    aktuellePositionOz = "";
    kurztextZeilen = [];
    langtextZeilen = [];
    sammleKurztext = false;
    sammleLangtext = false;
    ersteKurztextZeile = true;
  }

  for (const zeile of zeilen) {
    if (zeile.length < 2) continue;

    const satztyp = zeile.slice(0, 2);
    const rest = zeile.slice(2);

    switch (satztyp) {
      case "11": {
        // Bereich: OZ steht in Spalten 3-12 (0-indiziert: rest[0..9])
        abschliessenPosition();
        const ozRaw = rest.slice(0, 9).trim();
        // OZ-Teile zusammenbauen (z.B. "10 1" → "10.1")
        const ozTeile = ozRaw.split(/\s+/).filter(Boolean);
        const oz = ozTeile.join(".");
        aktuellerBereichOz = oz;
        const tiefe = ozTiefe(oz);

        eintraege.push({
          oz,
          art: "BEREICH",
          kurztext: "", // wird durch Satztyp 12 gefüllt
          langtext: undefined,
          menge: undefined,
          einheit: undefined,
          ep: undefined,
          gp: undefined,
          tiefe,
          parent_index: findParentIndex(tiefe),
        });
        anzahlBereiche++;
        break;
      }

      case "12": {
        // Bereichstext
        const textContent = rest.trim();
        // Entferne die Zeilennummer am Ende (6-stellig)
        const cleaned = textContent.replace(/\d{6}$/, "").trim();
        if (eintraege.length > 0) {
          const letzter = eintraege[eintraege.length - 1]!;
          if (letzter.art === "BEREICH") {
            letzter.kurztext = letzter.kurztext
              ? letzter.kurztext + " " + cleaned
              : cleaned;
          }
        }
        break;
      }

      case "21": {
        // Position: OZ + Art + Menge + Einheit
        abschliessenPosition();
        const ozRaw = rest.slice(0, 9).trim();
        const ozTeile = ozRaw.split(/\s+/).filter(Boolean);
        const oz = ozTeile.join(".");

        // Ab Spalte 9: Art-Kennung + Menge + Einheit via Regex
        const nachOz = rest.slice(9);
        const posMatch = nachOz.match(/([NZABE])[NZABE]*\s+(\d{8,11})(\S+)/);

        let menge = new Decimal(0);
        let einheit: string | undefined;
        let artKennung = "N";

        if (posMatch) {
          artKennung = posMatch[1]!;
          // Menge hat 3 implizite Nachkommastellen
          const mengenNum = parseInt(posMatch[2]!, 10);
          if (!isNaN(mengenNum)) {
            menge = new Decimal(mengenNum).div(1000);
          }
          einheit = posMatch[3]!.replace(/\.$/, "").trim() || undefined;
        }

        const tiefe = ozTiefe(oz);
        let art: "NORMAL" | "ZULAGE" | "WAHL" | "EVENTUELL" = "NORMAL";
        if (artKennung === "Z") art = "ZULAGE";
        else if (artKennung === "A") art = "WAHL";
        else if (artKennung === "B" || artKennung === "E") art = "EVENTUELL";

        aktuellePositionOz = oz;
        sammleKurztext = true;
        sammleLangtext = false;
        kurztextZeilen = [];
        langtextZeilen = [];
        ersteKurztextZeile = true;

        eintraege.push({
          oz,
          art,
          kurztext: `Position ${oz}`,
          langtext: undefined,
          menge,
          einheit,
          ep: undefined,
          gp: undefined,
          tiefe,
          parent_index: findParentIndex(tiefe),
        });
        anzahlPositionen++;
        break;
      }

      case "25": {
        // Positionstext (Kurztext)
        if (aktuellePositionOz) {
          const textContent = rest.replace(/\d{6}$/, "").trim();
          // Trennstriche ignorieren
          if (!textContent.match(/^-+$/) || kurztextZeilen.length === 0) {
            kurztextZeilen.push(textContent);
          }
        }
        break;
      }

      case "26": {
        // Langtext
        sammleLangtext = true;
        if (aktuellePositionOz) {
          // Langtext hat 3 Zeichen Einrückung
          const textContent = rest.replace(/\d{6}$/, "").trim();
          langtextZeilen.push(textContent);
        }
        break;
      }

      case "99": {
        // Endesatz
        abschliessenPosition();
        break;
      }

      default:
        break;
    }
  }

  abschliessenPosition();

  // Quelle bestimmen
  const ext = name.toLowerCase();
  let quelle: ImportMeta["quelle"] = "gaeb_d83";
  if (ext.endsWith(".d84")) quelle = "gaeb_d84";

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
