/**
 * GAEB D84 Export Test — Round-Trip
 *
 * Importiert Riegelsberg D83, kalkuliert, exportiert als D84,
 * prüft dass die exportierte Datei gültige GAEB-Struktur hat.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { Decimal } from "@baukalk/datenmodell";
import type { PositionRechenInput } from "@baukalk/datenmodell";
import { parseGaebD83 } from "@baukalk/import";
import { exportGaebD84 } from "./gaeb-d84-export.js";

const D83_PFAD = resolve(
  "/Users/admin/Library/CloudStorage/OneDrive-kalku/KT01",
  "1695_Gesellchen_GmbH/_abgeschlossen",
  "260319_Friedhoefe_Riegelsberg/01_Pläne_u_Gaeb",
  "Friedhöfe_Wegebau_2026_1_LV.D83",
);

const REFERENZ_PFAD = resolve(
  __dirname,
  "../../../test-daten/riegelsberg/referenz.json",
);

const HAS_FILES = existsSync(D83_PFAD) && existsSync(REFERENZ_PFAD);

function optDec(v: number | null): Decimal | undefined {
  return v === null ? undefined : new Decimal(v);
}

describe.skipIf(!HAS_FILES)("GAEB D84 Export Round-Trip", () => {
  it("D83 → Kalkulation → D84 Export erzeugt gültige Struktur", () => {
    const lv = parseGaebD83(D83_PFAD);
    expect(lv.anzahl_positionen).toBe(46);

    // Referenzwerte laden
    const ref = JSON.parse(readFileSync(REFERENZ_PFAD, "utf-8"));
    const werte = new Map<string, PositionRechenInput>();
    for (const rp of ref.positionen) {
      werte.set(rp.oz, {
        stoffe_ek: optDec(rp.X_stoffe_ek),
        zeit_min_roh: optDec(rp.Y_zeit_min_roh),
        geraetezulage_eur_h: optDec(rp.Z_geraete_eur_h),
        nu_ek: optDec(rp.M_nu_ek),
      });
    }

    const parameter = {
      verrechnungslohn: new Decimal(ref.parameter.verrechnungslohn),
      material_zuschlag: new Decimal(ref.parameter.materialzuschlag),
      nu_zuschlag: new Decimal(ref.parameter.nzuschlag),
      zeitwert_faktor: new Decimal(ref.parameter.zeitwert_faktor),
      geraetezulage_default: new Decimal(ref.parameter.geraetezulage_default),
    };

    // D84 exportieren (mit Preisen)
    const d84 = exportGaebD84({
      lv,
      parameter,
      werte,
      mitPreisen: true,
      projektName: "Riegelsberg Test",
      bieter: "Gesellchen GmbH",
    });

    // Struktur prüfen
    expect(d84).toContain("00"); // Header
    expect(d84).toContain("84"); // GAEB-84
    expect(d84).toContain("99"); // Ende
    expect(d84).toContain("\r\n"); // CR+LF

    // Zeilen zählen
    const zeilen = d84.split("\r\n").filter((l) => l.length > 0);
    expect(zeilen.length).toBeGreaterThan(100); // Mindestens 100 Zeilen

    // Record-Typen prüfen
    const typen = new Set(zeilen.map((l) => l.slice(0, 2)));
    expect(typen.has("00")).toBe(true);
    expect(typen.has("11")).toBe(true);
    expect(typen.has("21")).toBe(true);
    expect(typen.has("25")).toBe(true);
    expect(typen.has("99")).toBe(true);

    // Anzahl 21-Records = 46 Positionen
    const pos21 = zeilen.filter((l) => l.startsWith("21"));
    expect(pos21.length).toBe(46);

    // D81 Export (ohne Preise)
    const d81 = exportGaebD84({
      lv,
      parameter,
      werte,
      mitPreisen: false,
    });
    expect(d81).toContain("81");
  });
});
