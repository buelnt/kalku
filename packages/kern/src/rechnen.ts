/**
 * Der Rechenkern von BauKalk Pro
 *
 * Bildet die EP-Formelkette aus LV3.xlsx exakt nach. Diese Datei ist der
 * kritischste Code des Projekts — jede Änderung wird durch die Tests in
 * `rechnen.test.ts` gegen die 46 Referenz-Positionen aus Riegelsberg
 * validiert, und jeder Cent muss passen.
 *
 * # Die Formeln (Referenz: LV3.xlsx)
 *
 * Eingaben pro Position:
 *   X = Stoffe EK pro Einheit (€)
 *   Y = Zeit pro Einheit (min), roh
 *   Z = Gerätezulage €/h (überschreibt Default)
 *   M = Nachunternehmer EK pro Einheit (€)
 *
 * Parameter aus dem Projekt:
 *   verrechnungslohn     (M2)   Lohn inkl. aller Zuschläge, €/h
 *   material_zuschlag    (K4)   Anteil, z.B. 0.35
 *   nu_zuschlag          (K5)   Anteil, z.B. 0.35
 *   zeitwert_faktor      (AP5)  Prozent, bidirektional (-25 = -25%)
 *   geraetezulage_default (AP3) €/h für Positionen ohne eigenes Z
 *
 * Formelkette (in Excel: AC, AA, AB, AJ, AK, E, F):
 *
 *   AC = Y + (Y / 100 * zeitwert_faktor)        → auf 2 Dezimalen gerundet
 *   AA = (AC / 60) * Z_effektiv                 → auf 2 Dezimalen gerundet
 *   AB = (AC / 60) * verrechnungslohn           → auf 2 Dezimalen gerundet
 *   AJ = X * (1 + material_zuschlag)            → auf 2 Dezimalen gerundet
 *   AK = M * (1 + nu_zuschlag)                  → auf 2 Dezimalen gerundet
 *   E  = AA + AB + AJ + AK                      (EP pro Einheit, bereits gerundet)
 *   F  = C * E                                  (GP, auf 2 Dezimalen gerundet)
 *
 * # Rundungsregeln
 *
 * Alle Zwischenwerte werden auf 2 Dezimalstellen mit ROUND_HALF_UP gerundet,
 * weil Excel in diesem File mit der Option "Precision as displayed" arbeitet.
 * Das heißt: 1,125 → 1,13 (nicht 1,12 wie bei Banker's Rounding).
 *
 * Jede Änderung an dieser Rundungslogik muss durch die 46 Referenz-Tests
 * validiert werden — die sind der einzige zuverlässige Schutz gegen
 * Regressionen.
 *
 * # Z-Effektiv-Logik
 *
 * Wenn `input.geraetezulage_eur_h` explizit gesetzt ist (auch 0), wird dieser
 * Wert verwendet. Nur wenn `undefined`, wird `params.geraetezulage_default`
 * herangezogen. Im Riegelsberg-LV tragen alle Positionen ein Z ein, deshalb
 * kommt der Default-Pfad in der Praxis selten zum Einsatz.
 */
import {
  Decimal,
  runden,
  type Parameter,
  type PositionRechenInput,
  type PositionBerechnung,
} from "@baukalk/datenmodell";

const HUNDERT = new Decimal(100);
const SECHZIG = new Decimal(60);
const EINS = new Decimal(1);
const NULL = new Decimal(0);

/**
 * Berechnet das Rechenergebnis für eine einzelne Position.
 *
 * @param input  Die Rechen-Eingabewerte der Position (X, Y, Z, M).
 * @param menge  Die Menge der Position (C).
 * @param params Die Projekt-Parameter.
 * @returns      Das Rechenergebnis mit allen Zwischen- und Endwerten.
 */
export function berechne(
  input: PositionRechenInput,
  menge: Decimal,
  params: Parameter,
): PositionBerechnung {
  // Alle Eingaben zu Decimal normalisieren, null/undefined als 0
  const X = input.stoffe_ek ?? NULL;
  const Y = input.zeit_min_roh ?? NULL;
  const M = input.nu_ek ?? NULL;

  // Z-Effektiv-Logik: wenn Position kein eigenes Z hat, Default verwenden
  const Z =
    input.geraetezulage_eur_h !== undefined
      ? input.geraetezulage_eur_h
      : params.geraetezulage_default;

  // AC: Zeit mit bidirektionalem Zeitwert-Faktor, auf 2 Dezimalen gerundet
  //     AC = Y + (Y / 100 * zeitwert_faktor)
  const zeit_mit_faktor = runden(
    Y.plus(Y.div(HUNDERT).mul(params.zeitwert_faktor)),
  );

  // Stunden aus gerundeter AC (bewusst, damit nachfolgende Rundungen matchen)
  const stunden = zeit_mit_faktor.div(SECHZIG);

  // AA: Geräte-EP pro Einheit, gerundet
  const geraete_ep = runden(stunden.mul(Z));

  // AB: Lohn-EP pro Einheit, gerundet
  const lohn_ep = runden(stunden.mul(params.verrechnungslohn));

  // AJ: Stoffe VK inkl. Zuschlag, gerundet
  const stoffe_vk = runden(X.mul(EINS.plus(params.material_zuschlag)));

  // AK: NU VK inkl. Zuschlag, gerundet
  const nu_vk = runden(M.mul(EINS.plus(params.nu_zuschlag)));

  // E: EP pro Einheit — Summe bereits gerundeter Werte, also schon 2-stellig
  const ep = geraete_ep.plus(lohn_ep).plus(stoffe_vk).plus(nu_vk);

  // F: GP = Menge × EP, auf 2 Dezimalen gerundet
  const gp = runden(menge.mul(ep));

  return {
    zeit_mit_faktor,
    geraete_ep,
    lohn_ep,
    stoffe_vk,
    nu_vk,
    ep,
    gp,
  };
}
