/**
 * Gold-Standard-Tests für den Rechenkern
 *
 * Lädt die Riegelsberg-Referenzwerte aus `test-daten/riegelsberg/referenz.json`
 * und prüft, dass `berechne()` für jede der 46 Positionen exakt die gleichen
 * Werte produziert wie die Original-Excel.
 *
 * Bei Abweichungen > 1 Cent schlägt der Test fehl — das ist die Schutzfolie
 * gegen Regressionen beim Umbauen des Rechenkerns.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Decimal, type Parameter } from "@baukalk/datenmodell";
import { berechne } from "./rechnen.js";

// Laden der Referenz-Datei. Path ist relativ zum Repo-Root.
const __dirname = dirname(fileURLToPath(import.meta.url));
const REFERENZ_PFAD = resolve(
  __dirname,
  "../../../test-daten/riegelsberg/referenz.json",
);

interface RohParameter {
  verrechnungslohn: number;
  lohn_ek: number;
  materialzuschlag: number;
  nzuschlag: number;
  geraete_grundzuschlag: number;
  zeitwert_faktor: number;
  geraetezulage_default: number;
}

interface RohPosition {
  oz: string;
  kurztext: string | null;
  menge: number;
  einheit: string;
  X_stoffe_ek: number | null;
  Y_zeit_min_roh: number | null;
  Z_geraete_eur_h: number | null;
  M_nu_ek: number | null;
  AC_zeit_mit_faktor: number;
  AA_geraete_ep: number;
  AB_lohn_ep: number;
  AJ_stoffe_vk: number;
  AK_nu_vk: number;
  EP: number;
  GP: number;
}

interface ReferenzDatei {
  parameter: RohParameter;
  positionen: RohPosition[];
}

const daten = JSON.parse(readFileSync(REFERENZ_PFAD, "utf-8")) as ReferenzDatei;

// Parameter vom rohen JSON in das TypeScript-Parameter-Objekt übersetzen.
const params: Parameter = {
  verrechnungslohn: new Decimal(daten.parameter.verrechnungslohn),
  lohn_ek: new Decimal(daten.parameter.lohn_ek),
  material_zuschlag: new Decimal(daten.parameter.materialzuschlag),
  nu_zuschlag: new Decimal(daten.parameter.nzuschlag),
  geraete_grundzuschlag: new Decimal(daten.parameter.geraete_grundzuschlag),
  zeitwert_faktor: new Decimal(daten.parameter.zeitwert_faktor),
  geraetezulage_default: new Decimal(daten.parameter.geraetezulage_default),
};

/**
 * Konvertiert einen optionalen numerischen Roh-Wert zu einem Decimal oder
 * `undefined`, wenn der Wert im JSON null ist.
 */
function optDecimal(value: number | null): Decimal | undefined {
  return value === null ? undefined : new Decimal(value);
}

/**
 * Prüft, dass zwei Decimal-Werte (berechnet vs. Referenz) auf zwei
 * Nachkommastellen übereinstimmen (Cent-genau).
 *
 * Die Excel-Rundung ist kaufmännisch; Decimal.js mit ROUND_HALF_EVEN
 * macht das gleiche, aber wir vergleichen die gerundeten Werte, um
 * Display-Rundungs-Differenzen abzufangen.
 */
function cent(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toFixed(2);
}

function centZahl(value: number): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toFixed(2);
}

describe("Rechenkern gegen Riegelsberg LV3 (Gold Standard)", () => {
  it("Referenz-JSON ist geladen und enthält 46 Positionen", () => {
    expect(daten.positionen.length).toBe(46);
  });

  it("Projekt-Parameter sind wie erwartet", () => {
    expect(params.verrechnungslohn.toFixed(2)).toBe("102.40");
    expect(params.material_zuschlag.toFixed(2)).toBe("0.35");
    expect(params.nu_zuschlag.toFixed(2)).toBe("0.35");
    expect(params.zeitwert_faktor.toFixed(0)).toBe("-25");
  });

  // Ein Test pro Position, damit wir bei Fehlern sofort sehen, welche OZ
  // fehlerhaft ist — besser als ein einziger Test mit Schleife.
  for (const pos of daten.positionen) {
    it(`${pos.oz} — ${pos.kurztext ?? ""}`.trim(), () => {
      const result = berechne(
        {
          stoffe_ek: optDecimal(pos.X_stoffe_ek),
          zeit_min_roh: optDecimal(pos.Y_zeit_min_roh),
          geraetezulage_eur_h: optDecimal(pos.Z_geraete_eur_h),
          nu_ek: optDecimal(pos.M_nu_ek),
        },
        new Decimal(pos.menge),
        params,
      );

      // AC (Zeit mit Zeitwert-Faktor)
      expect(cent(result.zeit_mit_faktor), `${pos.oz} AC`).toBe(
        centZahl(pos.AC_zeit_mit_faktor),
      );

      // AA (Geräte-EP)
      expect(cent(result.geraete_ep), `${pos.oz} AA`).toBe(
        centZahl(pos.AA_geraete_ep),
      );

      // AB (Lohn-EP)
      expect(cent(result.lohn_ep), `${pos.oz} AB`).toBe(
        centZahl(pos.AB_lohn_ep),
      );

      // AJ (Stoffe VK)
      expect(cent(result.stoffe_vk), `${pos.oz} AJ`).toBe(
        centZahl(pos.AJ_stoffe_vk),
      );

      // AK (NU VK)
      expect(cent(result.nu_vk), `${pos.oz} AK`).toBe(centZahl(pos.AK_nu_vk));

      // EP (Einheitspreis)
      expect(cent(result.ep), `${pos.oz} EP`).toBe(centZahl(pos.EP));

      // GP (Gesamtpreis)
      expect(cent(result.gp), `${pos.oz} GP`).toBe(centZahl(pos.GP));
    });
  }
});
