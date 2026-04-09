/**
 * Leistungsverzeichnis-Datenmodell
 *
 * Repräsentiert die Struktur eines importierten LVs mit Abschnitten,
 * Unterabschnitten und Positionen. Diese Typen werden sowohl vom
 * Import-Parser (Excel, GAEB, PDF) als auch vom LV-Editor und
 * Rechenkern verwendet.
 *
 * Die Hierarchie ist: LV → Abschnitt → Unterabschnitt → Position
 * (in der Praxis kann die Tiefe variieren, z.B. 01 → 01.02 → 01.02.0010,
 * aber manchmal auch 01 → 01.01.0010 ohne Unterabschnitt).
 */
import { z } from "zod";
import { dezimalSchema } from "./dezimal.js";

/**
 * Art eines LV-Eintrags.
 *
 * BEREICH = Gliederungsebene (z.B. "01 Waldfriedhof", "01.02 Grabfeld 59")
 * NORMAL = reguläre Leistungsposition mit Menge und Einheit
 * ZULAGE = Zuschlagsposition, bezieht sich auf eine Basis-Position
 * WAHL = Wahlposition / Alternativposition
 * EVENTUELL = Eventualposition (Bedarfsposition)
 */
export const positionArtSchema = z.enum([
  "BEREICH",
  "NORMAL",
  "ZULAGE",
  "WAHL",
  "EVENTUELL",
]);

export type PositionArt = z.infer<typeof positionArtSchema>;

/**
 * Ein einzelner Eintrag im LV (entweder Bereich oder Position).
 *
 * Für BEREICHe sind menge/einheit/ep/gp null.
 * Für NORMAL/ZULAGE/WAHL/EVENTUELL sind sie befüllt.
 */
export const lvEintragSchema = z
  .object({
    /** Ordnungszahl, z.B. "01", "01.02", "01.02.0010". */
    oz: z.string(),

    /** Art des Eintrags. */
    art: positionArtSchema,

    /** Kurztext (erste Zeile der Leistungsbeschreibung). */
    kurztext: z.string(),

    /** Langtext (vollständige Leistungsbeschreibung, kann mehrzeilig sein). */
    langtext: z.string().optional(),

    /** STLB-Bau-Code, wenn im GAEB-Import vorhanden. */
    stlb_code: z.string().optional(),

    /** Menge (nur bei Positionen, nicht bei Bereichen). */
    menge: dezimalSchema.optional(),

    /** Einheit (z.B. "m²", "lfm", "Stck", "Psch"). */
    einheit: z.string().optional(),

    /** Einheitspreis (kann beim Import leer sein → wird kalkuliert). */
    ep: dezimalSchema.optional(),

    /** Gesamtpreis (kann beim Import leer sein → wird berechnet). */
    gp: dezimalSchema.optional(),

    /**
     * Hierarchie-Tiefe, abgeleitet aus der OZ-Struktur.
     * "01" → 1, "01.02" → 2, "01.02.0010" → 3
     * Wird beim Import automatisch berechnet.
     */
    tiefe: z.number().int().min(1),

    /** Index des übergeordneten Bereichs in der Eintrags-Liste, oder null für Root. */
    parent_index: z.number().int().nullable(),
  })
  .strict();

export type LvEintrag = z.infer<typeof lvEintragSchema>;

/**
 * Import-Metadaten: woher das LV kommt.
 */
export const importMetaSchema = z
  .object({
    /** Quelle des Imports. */
    quelle: z.enum([
      "excel_lv",
      "gaeb_d83",
      "gaeb_d84",
      "gaeb_x83",
      "gaeb_x84",
      "gaeb_x86",
      "gaeb_d81",
      "gaeb_x81",
      "pdf_heuristisch",
      "manuell",
    ]),

    /** Originaler Dateiname. */
    original_datei: z.string(),

    /** Zeitpunkt des Imports (ISO 8601). */
    importiert_am: z.string(),

    /** Wer hat importiert (Nutzer-ID). */
    importiert_von: z.string().optional(),
  })
  .strict();

export type ImportMeta = z.infer<typeof importMetaSchema>;

/**
 * Ein vollständiges importiertes LV mit allen Einträgen und Metadaten.
 */
export const lvImportSchema = z
  .object({
    /** Import-Metadaten. */
    meta: importMetaSchema,

    /** Alle Einträge (Bereiche + Positionen) in Reihenfolge. */
    eintraege: z.array(lvEintragSchema),

    /** Zusammenfassung: Anzahl Positionen (ohne Bereiche). */
    anzahl_positionen: z.number().int(),

    /** Zusammenfassung: Anzahl Bereiche. */
    anzahl_bereiche: z.number().int(),
  })
  .strict();

export type LvImport = z.infer<typeof lvImportSchema>;
