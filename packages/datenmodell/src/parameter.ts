/**
 * Projekt-Parameter für die Kalkulation
 *
 * Das sind die Werte, die in Excel in den Zellen K2..K6 und AP3..AP5 stehen
 * und für *alle* Positionen des Projekts gelten.
 *
 * Referenz: LV3.xlsx Zellen
 *   M2 = verrechnungslohn     (z.B. 102.40 €/h)
 *   K2 = lohn_ek              (z.B. 30.00 €/h — nur zur Referenz, für Zuschlagskalkulation in Phase 2)
 *   K4 = material_zuschlag    (z.B. 0.35 = 35 %)
 *   K5 = nu_zuschlag          (z.B. 0.35 = 35 %)
 *   K6 = geraete_grundzuschlag (z.B. 0.10 = 10 %, bisher nur informell)
 *   AP3 = geraetezulage_default (z.B. 0.50 €/h)
 *   AP5 = zeitwert_faktor     (z.B. -25 = Zeiten um 25 % gekürzt)
 */
import { z } from "zod";
import { dezimalSchema } from "./dezimal.js";

export const parameterSchema = z
  .object({
    /** Verrechnungslohn €/h (Excel M2). */
    verrechnungslohn: dezimalSchema,

    /** Tariflöhne EK €/h (Excel K2). Nur zur Referenz für die spätere Zuschlagskalkulation. */
    lohn_ek: dezimalSchema.optional(),

    /** Material-Zuschlag als Anteil, z.B. 0.35 = 35 % (Excel K4). */
    material_zuschlag: dezimalSchema,

    /** Nachunternehmer-Zuschlag als Anteil, z.B. 0.35 = 35 % (Excel K5). */
    nu_zuschlag: dezimalSchema,

    /** Geräte-Grundzuschlag als Anteil (Excel K6). Aktuell rein informell, wird für Rechenkern nicht genutzt. */
    geraete_grundzuschlag: dezimalSchema.optional(),

    /**
     * Zeitwert-Faktor in Prozent, bidirektional (Excel AP5, "zeitabzug").
     *  -25 = Zeiten um 25 % reduziert
     *  0   = Zeiten unverändert
     * +100 = Zeiten verdoppelt
     */
    zeitwert_faktor: dezimalSchema,

    /** Default-Gerätezulage €/h für Positionen ohne eigenes Z (Excel AP3, "gzuschlag"). */
    geraetezulage_default: dezimalSchema,
  })
  .strict();

export type Parameter = z.infer<typeof parameterSchema>;
