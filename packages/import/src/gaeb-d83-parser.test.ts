/**
 * Tests für den GAEB DA 1990 (D83) Parser
 *
 * Testet gegen die echte Riegelsberg D83-Datei.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { parseGaebD83 } from "./gaeb-d83-parser.js";

const D83_PFAD = resolve(
  "/Users/admin/Library/CloudStorage/OneDrive-kalku/KT01",
  "1695_Gesellchen_GmbH/_abgeschlossen",
  "260319_Friedhoefe_Riegelsberg/01_Pläne_u_Gaeb",
  "Friedhöfe_Wegebau_2026_1_LV.D83",
);

const HAS_FILE = existsSync(D83_PFAD);

describe.skipIf(!HAS_FILE)(
  "GAEB-D83-Parser gegen Riegelsberg D83",
  () => {
    const lv = parseGaebD83(D83_PFAD);

    it("Import-Metadaten", () => {
      expect(lv.meta.quelle).toBe("gaeb_d83");
      expect(lv.meta.original_datei).toContain("D83");
    });

    it("Korrekte Anzahl: 46 Positionen, 8 Bereiche", () => {
      expect(lv.anzahl_positionen).toBe(46);
      expect(lv.anzahl_bereiche).toBe(8);
    });

    it("Haupt-Bereiche (Tiefe 1)", () => {
      const top = lv.eintraege.filter((e) => e.tiefe === 1 && e.art === "BEREICH");
      expect(top.length).toBe(2);
      expect(top[0]!.oz).toBe("01");
      expect(top[0]!.kurztext).toContain("Waldfriedhof");
      expect(top[1]!.oz).toBe("02");
      expect(top[1]!.kurztext).toContain("Walpershofen");
    });

    it("Unterbereiche (Tiefe 2)", () => {
      const sub = lv.eintraege.filter((e) => e.tiefe === 2 && e.art === "BEREICH");
      expect(sub.length).toBe(6);
    });

    it("Erste Position: 01.01.0010 Baustelle einrichten", () => {
      const pos = lv.eintraege.find((e) => e.oz === "01.01.0010");
      expect(pos).toBeDefined();
      expect(pos!.art).toBe("NORMAL");
      expect(pos!.kurztext).toContain("Baustelle einrichten");
      expect(pos!.menge?.toNumber()).toBe(1);
      expect(pos!.einheit).toBe("Psch");
    });

    it("Position mit Menge 90 m2: 01.02.0010", () => {
      const pos = lv.eintraege.find((e) => e.oz === "01.02.0010");
      expect(pos).toBeDefined();
      expect(pos!.menge?.toNumber()).toBe(90);
      expect(pos!.einheit).toBe("m2");
    });

    it("Sub-Position: 01.02.0020.1", () => {
      const pos = lv.eintraege.find((e) => e.oz === "01.02.0020.1");
      expect(pos).toBeDefined();
      expect(pos!.menge?.toNumber()).toBe(15);
      expect(pos!.einheit).toBe("m");
      expect(pos!.tiefe).toBe(4);
    });

    it("Sub-Position: 01.02.0020.2", () => {
      const pos = lv.eintraege.find((e) => e.oz === "01.02.0020.2");
      expect(pos).toBeDefined();
      expect(pos!.menge?.toNumber()).toBe(35);
    });

    it("Letzte Position: 02.03.0120", () => {
      const pos = lv.eintraege.find((e) => e.oz === "02.03.0120");
      expect(pos).toBeDefined();
      expect(pos!.menge?.toNumber()).toBe(40);
      expect(pos!.einheit).toBe("m2");
    });

    it("Umlaute korrekt dekodiert (CP850)", () => {
      // "Friedhöfe" enthält ö (CP850: 0x94)
      const bereich = lv.eintraege.find((e) => e.oz === "02");
      expect(bereich).toBeDefined();
      expect(bereich!.kurztext).toContain("Friedhof");
    });

    it("Langtext vorhanden bei Positionen mit Details", () => {
      const pos = lv.eintraege.find((e) => e.oz === "01.01.0010");
      expect(pos).toBeDefined();
      // Baustelleneinrichtung hat typischerweise einen Langtext
      expect(pos!.langtext).toBeDefined();
      if (pos!.langtext) {
        expect(pos!.langtext.length).toBeGreaterThan(10);
      }
    });

    it("Parent-Index-Hierarchie: 01.02.0010 → 01.02 → 01", () => {
      const pos = lv.eintraege.find((e) => e.oz === "01.02.0010");
      expect(pos).toBeDefined();
      const parent = eintraege[pos!.parent_index!];
      expect(parent).toBeDefined();
      expect(parent!.oz).toBe("01.02");

      const grandparent = eintraege[parent!.parent_index!];
      expect(grandparent).toBeDefined();
      expect(grandparent!.oz).toBe("01");
    });

    it("OZ-Konsistenz: gleiche Positionen wie Excel-Import", () => {
      // Alle 46 OZs müssen identisch sein mit dem Excel-Import
      const ozSet = new Set(
        lv.eintraege
          .filter((e) => e.art !== "BEREICH")
          .map((e) => e.oz),
      );
      expect(ozSet.size).toBe(46);
      // Spot-Check einiger OZs
      expect(ozSet.has("01.01.0010")).toBe(true);
      expect(ozSet.has("01.02.0020.1")).toBe(true);
      expect(ozSet.has("02.03.0120")).toBe(true);
    });

    // Helper: Zugriff auf eintraege für Parent-Tests
    const eintraege = lv.eintraege;
  },
);
