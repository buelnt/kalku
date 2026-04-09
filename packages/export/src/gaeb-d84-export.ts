/**
 * GAEB DA 1990 D84 Export (Angebotsabgabe mit Preisen)
 *
 * Erzeugt eine GAEB-D84-Datei aus einem kalkulierten LV.
 * Format: 80-Zeichen-Satzformat, CP850-Encoding, CR+LF.
 *
 * Auch D81 (Leistungsbeschreibung ohne Preise) wird unterstützt —
 * einfach `mitPreisen: false` setzen.
 */
import { Decimal, runden } from "@baukalk/datenmodell";
import type { LvImport, Parameter, PositionRechenInput } from "@baukalk/datenmodell";
import { berechne } from "@baukalk/kern";

const NULL = new Decimal(0);

interface GaebExportOptionen {
  lv: LvImport;
  parameter: Parameter;
  werte: Map<string, PositionRechenInput>;
  mitPreisen: boolean;
  projektName?: string;
  bieter?: string;
  waehrung?: string;
}

/**
 * Füllt einen String auf `len` Zeichen auf (rechtsbündig mit Leerzeichen).
 */
function pad(s: string, len: number): string {
  return s.padEnd(len).slice(0, len);
}

/**
 * Füllt eine Zahl als rechtsbündigen String auf `len` Zeichen.
 */
function padNum(n: number, len: number): string {
  return String(n).padStart(len, " ").slice(0, len);
}

/**
 * Formatiert die Menge für GAEB: 20-stellig mit 3 impliziten Dezimalstellen.
 * z.B. 90.0 → "         00000090000"
 */
function formatMenge(menge: Decimal): string {
  const ganzzahl = menge.mul(1000).round().toNumber();
  return String(ganzzahl).padStart(20, "0").slice(-20);
}

/**
 * Formatiert den EP für GAEB: 20-stellig mit 3 impliziten Dezimalstellen.
 */
function formatPreis(preis: Decimal): string {
  const ganzzahl = runden(preis, 3).mul(1000).round().toNumber();
  return String(ganzzahl).padStart(20, "0").slice(-20);
}

/**
 * Konvertiert eine gepunktete OZ zurück in das GAEB-Format.
 * "01.02.0010" → "01020010"
 * "01.02.0020.1" → "01020020" + index "1"
 */
function ozToGaeb(oz: string): { ozRaw: string; index: string } {
  const parts = oz.split(".");
  let index = "";

  // Wenn 4 Teile: der letzte ist der Sub-Index
  if (parts.length === 4) {
    index = parts[3]!;
    parts.pop();
  }

  const ozRaw = parts.join("").padEnd(8, " ");
  return { ozRaw: ozRaw.slice(0, 8), index: index.slice(0, 1) };
}

/**
 * Zerlegt einen Text in 70-Zeichen-Zeilen.
 */
function splitText(text: string, maxLen = 70): string[] {
  const lines: string[] = [];
  const rawLines = text.split("\n");
  for (const line of rawLines) {
    if (line.length <= maxLen) {
      lines.push(line);
    } else {
      // Wortweise umbrechen
      let current = "";
      for (const word of line.split(/\s+/)) {
        if (current.length + word.length + 1 > maxLen) {
          lines.push(current);
          current = word;
        } else {
          current = current ? `${current} ${word}` : word;
        }
      }
      if (current) lines.push(current);
    }
  }
  return lines;
}

/**
 * Erzeugt eine GAEB-D84 (oder D81) Datei als String.
 * Das Ergebnis ist in ASCII (CP850-kompatibel für Standard-Zeichen).
 */
export function exportGaebD84(optionen: GaebExportOptionen): string {
  const { lv, parameter, werte, mitPreisen, projektName, bieter } = optionen;
  const lines: string[] = [];
  let lineNum = 0;

  function addLine(content: string): void {
    lineNum++;
    lines.push(pad(content, 74) + padNum(lineNum, 6));
  }

  const gaebTyp = mitPreisen ? "84" : "81";
  const lbArt = mitPreisen ? "A" : "L";

  // Record 00: Header
  addLine(`00        ${gaebTyp}${lbArt}                                      1122PPPPI90 `);

  // Record 01: Projektinfo
  const name = (projektName ?? lv.meta.original_datei).slice(0, 40);
  addLine(`01${pad(name, 40)}`);

  // Record 02: Projektbezeichnung
  addLine(`02${pad(name, 70)}`);

  // Record 03: Bieter/Auftraggeber
  addLine(`03${pad(bieter ?? "kalku.de", 70)}`);

  // Record 08: Währung
  addLine(`08EURO  EURO`);

  // Einträge durchlaufen
  for (const eintrag of lv.eintraege) {
    if (eintrag.art === "BEREICH") {
      // Record 11: Bereich
      const { ozRaw } = ozToGaeb(eintrag.oz);
      addLine(`11${ozRaw}   N    Bereich`);

      // Record 12: Bereichstext
      const textLines = splitText(eintrag.kurztext);
      for (const tl of textLines) {
        addLine(`12${pad(tl, 70)}`);
      }
    } else {
      // Record 21: Position
      const { ozRaw, index } = ozToGaeb(eintrag.oz);
      const artChar = eintrag.art === "ZULAGE" ? "Z" : eintrag.art === "WAHL" ? "W" : "N";
      const menge = eintrag.menge ?? NULL;
      const einheit = pad(eintrag.einheit ?? "", 4);

      let preisStr = "                    "; // 20 Leerzeichen (kein Preis)
      if (mitPreisen) {
        const input = werte.get(eintrag.oz) ?? {};
        const ergebnis = berechne(input, menge, parameter);
        preisStr = formatPreis(ergebnis.ep);
      }

      const mengeStr = formatMenge(menge);
      // 21 OZ(8) Index(1) Art(1) Art2(1) Flags(2) Menge(20) Einheit(4) EP(20)
      addLine(
        `21${ozRaw}${index || " "}${artChar}${artChar}${artChar}  ${mengeStr.slice(8)}${einheit}${mitPreisen ? preisStr.slice(8) : ""}`,
      );

      // Record 25: Kurztext
      const kurzLines = splitText(eintrag.kurztext);
      for (const kl of kurzLines) {
        addLine(`25${pad(kl, 70)}`);
      }

      // Record 26: Langtext
      if (eintrag.langtext) {
        const langLines = splitText(eintrag.langtext);
        for (const ll of langLines) {
          addLine(`26${pad(ll, 70)}`);
        }
      }
    }
  }

  // Record 99: Dateiende
  addLine(`99`);

  // CR+LF Zeilenende
  return lines.join("\r\n") + "\r\n";
}
