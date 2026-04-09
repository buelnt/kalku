/**
 * Tests für den Excel-LV-Parser
 *
 * Testet gegen die echte Riegelsberg LV.xlsx Datei aus dem OneDrive-Ordner.
 * Prüft Struktur, Hierarchie, Mengen, Einheiten und Texte.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { parseExcelLv } from "./excel-lv-parser.js";

const LV_PFAD = resolve(
  "/Users/admin/Library/CloudStorage/OneDrive-kalku/KT01",
  "1695_Gesellchen_GmbH/_abgeschlossen",
  "260319_Friedhoefe_Riegelsberg/LV.xlsx",
);

// Skip-Guard: Tests überspringen wenn die Datei nicht verfügbar ist
// (z.B. auf CI ohne OneDrive-Sync)
const HAS_FILE = existsSync(LV_PFAD);

describe.skipIf(!HAS_FILE)(
  "Excel-LV-Parser gegen Riegelsberg LV.xlsx",
  () => {
    const lv = parseExcelLv(LV_PFAD);

    it("Import-Metadaten sind korrekt", () => {
      expect(lv.meta.quelle).toBe("excel_lv");
      expect(lv.meta.original_datei).toBe("LV.xlsx");
    });

    it("Korrekte Anzahl Positionen und Bereiche", () => {
      expect(lv.anzahl_positionen).toBe(46);
      expect(lv.anzahl_bereiche).toBe(8);
      expect(lv.eintraege.length).toBe(46 + 8); // 54 Einträge gesamt
    });

    it("Erste Ebene: zwei Haupt-Bereiche (01 + 02)", () => {
      const top = lv.eintraege.filter((e) => e.tiefe === 1);
      expect(top.length).toBe(2);
      expect(top[0]!.oz).toBe("01");
      expect(top[0]!.kurztext).toContain("Waldfriedhof Riegelsberg");
      expect(top[0]!.art).toBe("BEREICH");
      expect(top[1]!.oz).toBe("02");
      expect(top[1]!.kurztext).toContain("Friedhof Walpershofen");
    });

    it("Zweite Ebene: Unterbereiche", () => {
      const sub = lv.eintraege.filter(
        (e) => e.tiefe === 2 && e.art === "BEREICH",
      );
      // 01.01, 01.02, 01.03, 02.01, 02.02, 02.03 = 6 Unterbereiche
      expect(sub.length).toBe(6);
      expect(sub[0]!.oz).toBe("01.01");
      expect(sub[0]!.kurztext).toContain("Allgemein");
    });

    it("Erste Position: Baustelle einrichten", () => {
      const pos = lv.eintraege.find((e) => e.oz === "01.01.0010");
      expect(pos).toBeDefined();
      expect(pos!.art).toBe("NORMAL");
      expect(pos!.kurztext).toContain("Baustelle einrichten");
      expect(pos!.menge?.toNumber()).toBe(1);
      expect(pos!.einheit).toBe("Psch");
      expect(pos!.tiefe).toBe(3);
    });

    it("Position mit Menge und Einheit: Schicht aufnehmen", () => {
      const pos = lv.eintraege.find((e) => e.oz === "01.02.0010");
      expect(pos).toBeDefined();
      expect(pos!.menge?.toNumber()).toBe(90);
      expect(pos!.einheit).toBe("m2");
      expect(pos!.kurztext).toContain("Schicht ohne Bindemittel");
    });

    it("Position mit Unterposition (01.02.0020.1)", () => {
      const pos = lv.eintraege.find((e) => e.oz === "01.02.0020.1");
      expect(pos).toBeDefined();
      expect(pos!.tiefe).toBe(4);
      expect(pos!.menge?.toNumber()).toBe(15);
      expect(pos!.einheit).toBe("m");
    });

    it("Langtext wird korrekt separiert", () => {
      const pos = lv.eintraege.find((e) => e.oz === "01.01.0020");
      expect(pos).toBeDefined();
      expect(pos!.kurztext).toContain("Absperrg");
      // Langtext sollte ab der 2. Zeile kommen
      if (pos!.langtext) {
        expect(pos!.langtext).toContain("Abspsch");
      }
    });

    it("Parent-Index-Hierarchie stimmt", () => {
      // 01.02.0010 sollte Parent 01.02 haben
      const pos = lv.eintraege.find((e) => e.oz === "01.02.0010");
      expect(pos).toBeDefined();
      expect(pos!.parent_index).not.toBeNull();
      const parent = lv.eintraege[pos!.parent_index!];
      expect(parent).toBeDefined();
      expect(parent!.oz).toBe("01.02");
      expect(parent!.art).toBe("BEREICH");
    });

    it("Alle Positionen haben Menge und Einheit", () => {
      const positionen = lv.eintraege.filter((e) => e.art === "NORMAL");
      for (const pos of positionen) {
        expect(pos.menge, `${pos.oz} hat keine Menge`).toBeDefined();
        expect(pos.einheit, `${pos.oz} hat keine Einheit`).toBeDefined();
        expect(
          pos.menge!.gt(0),
          `${pos.oz} Menge muss > 0 sein`,
        ).toBe(true);
      }
    });

    it("Keine Bereiche haben Menge oder Einheit", () => {
      const bereiche = lv.eintraege.filter((e) => e.art === "BEREICH");
      for (const b of bereiche) {
        expect(b.menge, `BEREICH ${b.oz} sollte keine Menge haben`).toBeUndefined();
        expect(b.einheit, `BEREICH ${b.oz} sollte keine Einheit haben`).toBeUndefined();
      }
    });

    it("Letzte Position existiert (02.03.0120)", () => {
      const pos = lv.eintraege.find((e) => e.oz === "02.03.0120");
      expect(pos).toBeDefined();
      expect(pos!.menge?.toNumber()).toBe(40);
      expect(pos!.einheit).toBe("m2");
    });
  },
);
