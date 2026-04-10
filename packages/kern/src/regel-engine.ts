/**
 * Deterministische Regel-Engine (Schicht 1)
 *
 * Wendet die Kalkulationsregeln aus kalk-regeln.json EXAKT an.
 * Kein Spielraum, keine Schätzungen. Jeder Wert bekommt eine
 * Quellen-Annotation die erklärt woher er kommt.
 *
 * Die Engine läuft VOR der KI. Nur Positionen die hier NICHT
 * abgedeckt werden, gehen an die KI (Schicht 2).
 */
import { Decimal } from "@baukalk/datenmodell";
import type { LvEintrag, PositionRechenInput } from "@baukalk/datenmodell";
import type { WertQuelle } from "@baukalk/datenmodell";

/** Eine Regel aus kalk-regeln.json */
export interface KalkRegel {
  id: string;
  keywords: string[];
  keywords_oder?: string[];
  keywords_nicht?: string[];
  X?: number;
  Y?: number;
  Z?: number;
  M?: number;
  quelle: string;
  begruendung: string;
}

/** Ein Preisdatenbank-Eintrag (Re-Export aus preis-waterfall vermeiden) */
interface PreisdatenbankEintragLokal {
  suchbegriff: string;
  material: string;
  preis_pro_einheit: number;
  einheit: string;
  quelle: string;
  datum?: string;
  lieferant?: string;
}

/** Ergebnis der Regel-Engine für eine Position */
export interface RegelErgebnis {
  oz: string;
  input: PositionRechenInput;
  quellen: WertQuelle[];
  /** true = alle nötigen Werte gesetzt, KI wird NICHT benötigt */
  abgedeckt: boolean;
  /** true = Position ist reine Arbeitsleistung (X muss 0 sein) */
  reineArbeit: boolean;
}

/**
 * Prüft ob eine Regel auf den Text matcht.
 * Exakt gleiche Logik wie die alte auto-befuellung.ts.
 */
/**
 * Prüft ob eine Regel matcht.
 * - `keywords` werden im GESAMTTEXT (Kurztext + Langtext) gesucht
 * - `keywords_oder` und `keywords_nicht` werden NUR im KURZTEXT gesucht
 *   (Langtext enthält oft Begriffe die zu Falsch-Matches führen,
 *    z.B. "vorhalten" im Langtext einer Bauzaun-Aufstell-Position)
 */
function regelMatcht(gesamttext: string, kurztext: string, regel: KalkRegel): boolean {
  const t = gesamttext.toLowerCase();
  const kt = kurztext.toLowerCase();

  // Alle keywords müssen im Gesamttext vorkommen (AND)
  for (const kw of regel.keywords) {
    if (!t.includes(kw.toLowerCase())) return false;
  }

  // keywords_oder: mindestens eines muss im KURZTEXT vorkommen (OR)
  if (regel.keywords_oder && regel.keywords_oder.length > 0) {
    const hatOder = regel.keywords_oder.some((kw) => kt.includes(kw.toLowerCase()));
    if (!hatOder) return false;
  }

  // keywords_nicht: keines darf im KURZTEXT vorkommen (NOT)
  if (regel.keywords_nicht && regel.keywords_nicht.length > 0) {
    const hatNicht = regel.keywords_nicht.some((kw) => kt.includes(kw.toLowerCase()));
    if (hatNicht) return false;
  }

  return true;
}

/** Keywords die "reine Arbeitsleistung" markieren (X muss 0 sein) */
const REINE_ARBEIT_KEYWORDS = [
  // BE & Schutzmaßnahmen
  "bauzaun aufstellen", "bauzaun umsetzen", "bauzaun herstellen",
  "bauzaun", "baumschutzzaun", "schutzzaun", "absperrung",
  "baustelle einrichten", "baustelle räumen",
  "bereitstellungsfläche",
  "abstecken", "vermessung", "einmessen",
  "verkehrszeichen", "verkehrssicherung",
  "überweg",
  // Abbruch & Demontage
  "ausbau", "ausbauen", "abbrechen", "aufbrechen", "aufnehmen",
  "abtragen", "abbruch", "roden", "entfernen", "demontage", "rückbau",
  // Erdarbeiten (reine Bewegung, kein Material)
  "boden lösen", "boden laden", "boden fördern",
  "oberboden abtragen", "oberboden gelagert", "oberboden lösen",
  "oberboden abschieben",
  "lösen laden fördern", "lösen lagern", "lösen und laden",
  "boden separieren",
  "andecken",
  "planum herstellen", "profilieren", "nachverdichten", "planieren",
  "feinplanum",
  "auflockern", "baugrund auflockern",
  "saugbagger",
  // Vegetationsarbeiten (reine Arbeit)
  "mähen", "fräsen", "vegetationsfläche", "vegetationsflächen",
  "vegetationsschicht fräsen",
  "geräte umsetzen",
  // Sonstiges
  "sichern", "umsetzen", "verschließen",
  "schneiden",
];

/** Keywords die Entsorgung anzeigen (X muss > 0 sein mit Entsorgungskosten) */
const ENTSORGUNGS_KEYWORDS = [
  "entsorgen", "entsorgung", "verwerten", "abfahren",
  "laden und abfahren", "abtransport",
  "bm-0", "bm-f", "abbruchabfälle", "abfälle",
];

/**
 * Keywords die eine Ausbau-Position markieren.
 * Bei Ausbau-Positionen (z.B. "Fahrradständer entsorgen", "Maltafel ausbauen")
 * fallen KEINE Entsorgungskosten als Stoffe (X) an — die Entsorgung ist reine Arbeit.
 * Entsorgungskosten als X gibt es nur bei MASSE-Entsorgung (Boden, Schotter, Asphalt etc.)
 */
/**
 * Positionen die KEINE Entsorgungskosten als X bekommen dürfen.
 * Abbruch-Entsorgung läuft über SEPARATE Positionen im LV.
 */
const KEINE_ENTSORGUNG_IN_X_KEYWORDS = [
  // Ausbau/Demontage
  "ausbauen", "entfernen", "roden", "demontage", "rückbau",
  "sichern", "seitlich lagern",
  // Abbruch — Entsorgung ist IMMER eine separate LV-Position!
  "abbrechen", "aufbrechen", "aufnehmen", "abtragen",
  // Spezifische Ausbau-Positionen
  "maltafel", "klettergerät", "spielgerät", "tischtennisplatte",
  "fahrradständer", "holzbarriere", "bänke", "abfallbehälter",
  "rankgitter", "toranlage", "zugang",
  // Schneidarbeiten
  "schneiden",
  // Saugbagger
  "saugbagger",
];

/**
 * Wendet die deterministischen Regeln auf alle Positionen an.
 *
 * Reihenfolge:
 * 1. Keyword-Match in kalk-regeln.json → Y, Z, ggf. X, M setzen
 * 2. Preisdatenbank-Match → X setzen (Material/Entsorgung)
 * 3. Reine-Arbeit-Check → X auf 0 setzen wenn nötig
 * 4. Entsorgungspreis-Check → X setzen wenn entsorgen im Text
 *
 * @returns Array mit Ergebnis pro Position (nur NORMAL-Positionen)
 */
export function wendeRegelnAn(
  positionen: LvEintrag[],
  regeln: KalkRegel[],
  preisdatenbank: PreisdatenbankEintragLokal[],
): RegelErgebnis[] {
  const ergebnisse: RegelErgebnis[] = [];

  for (const pos of positionen) {
    if (pos.art !== "NORMAL") continue;

    const text = (pos.kurztext + " " + (pos.langtext ?? "")).toLowerCase();
    const kurztext = pos.kurztext.toLowerCase();
    const quellen: WertQuelle[] = [];
    const input: PositionRechenInput = {};

    // --- 1. Keyword-Match in Regeln ---
    for (const regel of regeln) {
      if (regelMatcht(text, kurztext, regel)) {

        if (regel.Y !== undefined) {
          input.zeit_min_roh = new Decimal(regel.Y);
          quellen.push({
            feld: "zeit_min_roh",
            wert: regel.Y,
            quelle: regel.quelle,
            regel_id: regel.id,
            begruendung: `${regel.begruendung}: ${regel.Y} min/${pos.einheit ?? "Einh."}`,
            konfidenz: "fest",
          });
        }

        if (regel.Z !== undefined) {
          input.geraetezulage_eur_h = new Decimal(regel.Z);
          quellen.push({
            feld: "geraetezulage_eur_h",
            wert: regel.Z,
            quelle: regel.quelle,
            regel_id: regel.id,
            begruendung: `${regel.begruendung}: ${regel.Z} €/h Gerätezulage`,
            konfidenz: "fest",
          });
        }

        if (regel.X !== undefined) {
          input.stoffe_ek = new Decimal(regel.X);
          quellen.push({
            feld: "stoffe_ek",
            wert: regel.X,
            quelle: regel.quelle,
            regel_id: regel.id,
            begruendung: `${regel.begruendung}: ${regel.X} €/${pos.einheit ?? "Einh."} Material`,
            konfidenz: "fest",
          });
        }

        if (regel.M !== undefined) {
          input.nu_ek = new Decimal(regel.M);
          quellen.push({
            feld: "nu_ek",
            wert: regel.M,
            quelle: regel.quelle,
            regel_id: regel.id,
            begruendung: `${regel.begruendung}: ${regel.M} €/${pos.einheit ?? "Einh."} NU`,
            konfidenz: "fest",
          });
        }

        break; // Erste Regel gewinnt
      }
    }

    // --- 2. Preisdatenbank-Match für Stoffe (nur wenn X noch nicht gesetzt) ---
    if (input.stoffe_ek === undefined) {
      // WICHTIG: Reine-Arbeit-Check ZUERST — hat Vorrang vor allem
      const istReineArbeit = REINE_ARBEIT_KEYWORDS.some((kw) => kurztext.includes(kw));

      // Entsorgung nur im KURZTEXT prüfen — Langtext enthält oft "entsorgen"
      // bei Positionen die primär Arbeit sind (z.B. "Mähen ... Schnittgut entsorgen")
      const istEntsorgungImKurztext = ENTSORGUNGS_KEYWORDS.some((kw) => kurztext.includes(kw));
      const istAusbau = KEINE_ENTSORGUNG_IN_X_KEYWORDS.some((kw) => kurztext.includes(kw));

      // Spezial: Position ist primär Entsorgung (Kurztext sagt "entsorgen")
      // UND ist nicht Ausbau/Abbruch → Entsorgungskosten als X
      if (istEntsorgungImKurztext && !istAusbau && !istReineArbeit) {
          // Suche passenden Entsorgungspreis in Preisdatenbank
          // Sortiere nach Suchbegriff-Länge (längste/spezifischste zuerst)
          const sortedPdb = [...preisdatenbank].sort((a, b) => b.suchbegriff.length - a.suchbegriff.length);
          for (const pd of sortedPdb) {
            if (text.includes(pd.suchbegriff)) {
              input.stoffe_ek = new Decimal(pd.preis_pro_einheit);
              quellen.push({
                feld: "stoffe_ek",
                wert: pd.preis_pro_einheit,
                quelle: `Preisdatenbank: ${pd.quelle}`,
                begruendung: `${pd.material}: ${pd.preis_pro_einheit} €/${pd.einheit}`,
                konfidenz: "fest",
              });
              break;
            }
          }

          // Fallback: Standard-Entsorgungspreis wenn kein spezifischer gefunden
          if (input.stoffe_ek === undefined) {
            const standardEntsorgung = 18; // €/t Standard
            input.stoffe_ek = new Decimal(standardEntsorgung);
            quellen.push({
              feld: "stoffe_ek",
              wert: standardEntsorgung,
              quelle: "Entsorgung Standard",
              begruendung: `Standard-Entsorgungspreis: ${standardEntsorgung} €/t`,
              konfidenz: "berechnet",
            });
          }
      } else if (istReineArbeit || istAusbau) {
        // Reine Arbeit oder Ausbau → X=0, kein Material
        input.stoffe_ek = new Decimal(0);
        quellen.push({
          feld: "stoffe_ek",
          wert: 0,
          quelle: "Leitfaden Regel",
          begruendung: "Reine Arbeitsleistung — kein Material",
          konfidenz: "fest",
        });
      } else {
          // Normales Material aus Preisdatenbank suchen (nur Kurztext, nicht Langtext)
          for (const pd of preisdatenbank) {
            if (!pd.suchbegriff.includes("entsorgung") && kurztext.includes(pd.suchbegriff)) {
              input.stoffe_ek = new Decimal(pd.preis_pro_einheit);
              quellen.push({
                feld: "stoffe_ek",
                wert: pd.preis_pro_einheit,
                quelle: `Preisdatenbank: ${pd.quelle}`,
                begruendung: `${pd.material}: ${pd.preis_pro_einheit} €/${pd.einheit}`,
                konfidenz: "berechnet",
              });
              break;
            }
          }
      }
    }

    // --- 3. Abgedeckt-Check ---
    const hatZeit = input.zeit_min_roh !== undefined;
    const hatNU = input.nu_ek !== undefined;
    // Eine Position ist "abgedeckt" wenn sie mindestens Zeit ODER NU hat
    const abgedeckt = hatZeit || hatNU;

    const istReineArbeit = quellen.some((q) => q.begruendung.includes("Reine Arbeitsleistung"));

    ergebnisse.push({
      oz: pos.oz,
      input,
      quellen,
      abgedeckt,
      reineArbeit: istReineArbeit,
    });
  }

  return ergebnisse;
}
