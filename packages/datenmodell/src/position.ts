/**
 * Eine Position im Leistungsverzeichnis
 *
 * Eine Position ist die kleinste kalkulierbare Einheit. Sie enthält die
 * vom Auftraggeber vorgegebenen Metadaten (OZ, Text, Menge, Einheit) sowie
 * die vom Kalkulator ausgefüllten Rechenwerte (X, Y, Z, M).
 *
 * Die Benennung folgt bewusst den Excel-Spalten (X, Y, Z, M), damit die
 * Übersetzung zwischen Spec, Excel-Referenz und Code nachvollziehbar bleibt.
 */
import { z } from "zod";
import { dezimalSchema } from "./dezimal.js";

/**
 * Die Rechen-Eingabewerte einer Position.
 *
 * Alle Werte sind pro Einheit der Position (z.B. pro m², pro lfm).
 * Die Multiplikation mit `menge` erfolgt im Rechenkern für die GP-Berechnung.
 */
export const positionRechenInputSchema = z
  .object({
    /** Stoffe EK pro Einheit in € (Excel X). Null/undefined = 0 (keine Stoffe). */
    stoffe_ek: dezimalSchema.optional(),

    /** Zeit in Minuten pro Einheit, roh (Excel Y). Null/undefined = 0 (keine Arbeitszeit). */
    zeit_min_roh: dezimalSchema.optional(),

    /**
     * Gerätezulage €/h für diese Position (Excel Z).
     * Wenn null/undefined, wird `geraetezulage_default` aus den Parametern
     * verwendet.
     */
    geraetezulage_eur_h: dezimalSchema.optional(),

    /** Nachunternehmer EK pro Einheit in € (Excel M). Null/undefined = 0. */
    nu_ek: dezimalSchema.optional(),
  })
  .strict();

export type PositionRechenInput = z.infer<typeof positionRechenInputSchema>;

/**
 * Das Ergebnis einer EP-Berechnung für eine Position.
 *
 * Alle Werte sind mit voller Dezimal-Präzision, ungerundet. Die Rundung
 * erfolgt nur in der UI und beim Export.
 *
 * Spalten-Mapping zu Excel:
 *   zeit_mit_faktor → AC
 *   geraete_ep      → AA
 *   lohn_ep         → AB
 *   stoffe_vk       → AJ
 *   nu_vk           → AK
 *   ep              → E
 *   gp              → F
 */
export const positionBerechnungSchema = z
  .object({
    zeit_mit_faktor: dezimalSchema,
    geraete_ep: dezimalSchema,
    lohn_ep: dezimalSchema,
    stoffe_vk: dezimalSchema,
    nu_vk: dezimalSchema,
    ep: dezimalSchema,
    gp: dezimalSchema,
  })
  .strict();

export type PositionBerechnung = z.infer<typeof positionBerechnungSchema>;

/**
 * Eine vollständige LV-Position mit Metadaten und Rechenwerten.
 *
 * Für den Rechenkern in M1 sind nur `menge` und `rechen_input` relevant;
 * die übrigen Felder sind Metadaten für LV-Struktur, Anzeige und Export.
 */
export const positionSchema = z
  .object({
    /** Ordnungszahl, z.B. "01.02.0010". */
    oz: z.string(),

    /** Erste Zeile des Leistungstextes, z.B. "Schicht ohne Bindemittel aufnehmen". */
    kurztext: z.string(),

    /** Vollständiger Langtext (inkl. Kurztext in erster Zeile). */
    langtext: z.string().optional(),

    /** STLB-Bau-Code, wenn im GAEB-Import vorhanden. Primärer Matching-Schlüssel. */
    stlb_code: z.string().optional(),

    /** Menge, auf die sich die Position bezieht (z.B. 90). */
    menge: dezimalSchema,

    /** Einheit der Menge, z.B. "m²", "lfm", "Stck", "Psch". */
    einheit: z.string(),

    /** Die Rechen-Eingabewerte (X/Y/Z/M). */
    rechen_input: positionRechenInputSchema,
  })
  .strict();

export type Position = z.infer<typeof positionSchema>;
