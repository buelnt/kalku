/**
 * Preisquellen-Waterfall
 *
 * Bestimmt die Materialpreise für eine Position nach einer festen
 * Prioritätsreihenfolge. Der erste Treffer gewinnt.
 *
 * Reihenfolge (aus Interview F4/F11, Spec §14.5):
 *
 * 1. AKTUELLE PROJEKT-ANGEBOTE (grün)
 *    → PDFs/Excel aus dem 04_Angebote-Ordner des Projekts
 *    → Höchste Priorität, weil aktuellste und projektspezifische Preise
 *
 * 2. INTERNE PREISDATENBANK (gelb)
 *    → Wird automatisch aus abgeschlossenen Kalkulationen aufgebaut
 *    → Gespeichert in vorgaben/preisdatenbank.json
 *
 * 3. GEWERK-VORGABEN (gelb)
 *    → Leitfaden v1.3 Default-Zeitwerte und Materialpreise
 *    → Die 200+ Regeln in auto-befuellung.ts
 *
 * 4. WEB-RECHERCHE (rot)
 *    → Letzter Notnagel, mit rotem "ungeprüft"-Flag
 *    → Nie automatisch übernommen, immer mit Bestätigung
 *
 * Jede Preisquelle wird mit einer Farbe und einem Quelltext versehen,
 * damit der Kalkulator im LV-Editor sieht, woher der Wert stammt.
 */

export type PreisQuelle = "angebot" | "preisdatenbank" | "vorgabe" | "web" | "manuell" | "unbekannt";

export type PreisFarbe = "gruen" | "gelb" | "rot" | "grau";

export interface PreisTreffer {
  /** Der gefundene Preis pro Einheit. */
  preis: number;
  /** Woher stammt der Preis? */
  quelle: PreisQuelle;
  /** Farbe für die UI-Kennzeichnung. */
  farbe: PreisFarbe;
  /** Beschreibender Text (Lieferant, Datum, Angebots-Nr. etc.). */
  beschreibung: string;
  /** Konfidenz: wie sicher ist der Preis? */
  konfidenz: "hoch" | "mittel" | "niedrig";
}

export interface PreisdatenbankEintrag {
  suchbegriff: string;
  material: string;
  preis_pro_einheit: number;
  einheit: string;
  quelle: string;
  datum: string;
  lieferant?: string;
}

/**
 * Sucht einen Materialpreis in der Preisdatenbank.
 *
 * Matching: Der Suchbegriff wird case-insensitive gegen den Volltext
 * (Kurztext + Langtext) der Position geprüft. Der erste Treffer gewinnt.
 *
 * @param volltext    Kurztext + Langtext der Position (lowercase)
 * @param eintraege   Die Preisdatenbank-Einträge
 * @returns           Der Treffer oder null
 */
export function sucheInPreisdatenbank(
  volltext: string,
  eintraege: PreisdatenbankEintrag[],
): PreisTreffer | null {
  const volltextLower = volltext.toLowerCase();

  for (const e of eintraege) {
    if (volltextLower.includes(e.suchbegriff.toLowerCase())) {
      return {
        preis: e.preis_pro_einheit,
        quelle: "preisdatenbank",
        farbe: "gelb",
        beschreibung: `${e.material} — ${e.preis_pro_einheit} €/${e.einheit} (${e.quelle}, ${e.datum})`,
        konfidenz: "mittel",
      };
    }
  }

  return null;
}

/**
 * Farbcode für eine Preisquelle.
 */
export function quelleFarbe(quelle: PreisQuelle): PreisFarbe {
  switch (quelle) {
    case "angebot": return "gruen";
    case "preisdatenbank": return "gelb";
    case "vorgabe": return "gelb";
    case "web": return "rot";
    case "manuell": return "grau";
    default: return "grau";
  }
}

/**
 * CSS-Farbe für die Zellen-Hinterlegung im LV-Editor.
 */
export function quelleCssHintergrund(farbe: PreisFarbe): string {
  switch (farbe) {
    case "gruen": return "#dcfce7";  // grün — aus aktuellem Angebot
    case "gelb": return "#fefce8";   // gelb — aus Preisdatenbank/Vorgabe
    case "rot": return "#fef2f2";    // rot — aus Web/ungeprüft
    case "grau": return "#f8fafc";   // grau — manuell/unbekannt
    default: return "#ffffff";
  }
}

/**
 * Fügt einen neuen Preis zur Preisdatenbank hinzu.
 *
 * Wird aufgerufen wenn der Kalkulator beim Projektabschluss
 * "Global speichern" wählt.
 */
export function preisdatenbankEintragErstellen(
  kurztext: string,
  preis: number,
  einheit: string,
  lieferant: string,
  quelle: string,
): PreisdatenbankEintrag {
  // Suchbegriff aus den ersten 3-4 signifikanten Wörtern des Kurztexts
  const woerter = kurztext
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s/]/gi, "")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4);

  return {
    suchbegriff: woerter.join(" "),
    material: kurztext,
    preis_pro_einheit: preis,
    einheit,
    quelle,
    datum: new Date().toISOString().slice(0, 10),
    lieferant: lieferant || undefined,
  };
}
