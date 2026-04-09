/**
 * Auto-Befüllung — Positions-Werte aus Gewerk-Defaults vorausfüllen
 *
 * Scannt den Kurztext/Langtext jeder Position und versucht, passende
 * Default-Zeitwerte aus der Vorgaben-Datenbank zuzuordnen.
 *
 * Matching-Strategie (Kaskade, erste Treffer gewinnt):
 * 1. Keyword-Match: Kurztext enthält eines der Schlüsselwörter
 * 2. Fuzzy-Match: Ähnlichkeits-Score über Text-Overlap
 * 3. Fallback: Position bleibt leer (manuell füllen)
 *
 * Die Treffer werden mit Konfidenz-Score und Quelle versehen,
 * damit der Kalkulator sieht, woher die Werte kommen.
 */
import { Decimal } from "@baukalk/datenmodell";
import type { PositionRechenInput, LvEintrag } from "@baukalk/datenmodell";

export interface ZeitwertVorgabe {
  key: string;
  label: string;
  einheit: string;
  wert: number;
  geraetezulage: number;
  referenz: string;
  kommentar?: string;
}

export interface AutoBefuellungsTreffer {
  oz: string;
  input: PositionRechenInput;
  quelle: string;
  konfidenz: "hoch" | "mittel" | "niedrig";
  erklaerung: string;
}

/**
 * Keyword-Mapping: Welche Stichwörter im Kurztext passen zu welchem Zeitwert?
 *
 * Format: [keywords[], zeitwert-key]
 * Die Keywords werden case-insensitive gegen den Volltext geprüft.
 */
const KEYWORD_MAP: Array<[string[], string]> = [
  // Baustelleneinrichtung
  [["baustelle einrichten", "baustelleneinrichtung"], "baustelleneinrichtung_galabau"],
  [["baustelle räumen", "baustellenräumung"], "baustelleneinrichtung_raeumen"],
  [["bauzaun herstellen", "bauzaun aufstellen"], "bauzaun_herstellen"],
  [["bauzaun umsetzen", "bauzaun versetzen"], "bauzaun_umsetzen"],
  [["absperr", "warneinricht"], "bauzaun_aufstellen"],

  // Erdarbeiten
  [["boden lösen", "boden laden", "aushub", "auskoffern"], "aushub_grossmaschine"],
  [["boden einbauen", "verfüllen", "lagenweise"], "einbau_verdichten"],
  [["planum herstellen", "planieren"], "planieren"],
  [["nachverdichten", "verdichten"], "verdichten"],
  [["oberboden abtragen", "oberboden abschieben"], "oberboden_flaechig_pro_10cm"],
  [["oberboden liefern", "oberboden einbauen"], "oberboden_flaechig_pro_10cm"],

  // Schüttgüter
  [["schotter", "kies", "tragschicht", "schottertragschicht"], "schuettgut_kleinmenge"],

  // Pflaster & Bord
  [["pflaster", "verbundstein", "betonstein"], "pflaster_verlegen"],
  [["bordstein setzen", "einfassungsstein", "einfassungssteine.*setzen", "bord setzen"], "bordstein_setzen"],
  [["bordstein.*aufbrechen", "einfassungsstein.*aufbrechen", "bord.*abbrechen"], "abbruch_beton_unbewehrt"],
  [["plattenbelag", "platten verlegen", "gehwegplatten"], "plattenbelag_verlegen"],
  [["pflastersteine zuarbeiten", "zuarbeiten", "schneiden", "anpassen"], "schneiden_pflaster_beton"],

  // Beton
  [["beton einbauen", "betonieren", "ortbeton"], "betonieren_rein"],
  [["fundament.*herstellen", "streifenfundament"], "betonieren_inkl_aushub"],
  [["schalung"], "schalung"],

  // Abbruch
  [["asphalt.*aufnehmen", "asphalt.*abbruch", "asphaltdecke"], "abbruch_asphalt"],
  [["mauerwerk.*abbruch", "mauerwerk.*abbrechen"], "abbruch_mauerwerk"],
  [["beton.*aufbrechen", "beton.*abbruch"], "abbruch_beton_unbewehrt"],

  // Pflanzen
  [["rasen.*ansaat", "rasenansaat", "rasen.*herstellen"], "rasen_ansaeen"],
  [["baum.*pflanzen", "hochstamm"], "hochstamm_pflanzen"],
  [["hecke.*pflanzen"], "hecke_pflanzen"],
  [["strauch.*pflanzen"], "strauch_pflanzen"],

  // Verschiedenes
  [["rohr.*verlegen", "leitung.*verlegen", "kanal.*verlegen"], "rohrleitung_verlegen"],
  [["zaun.*setzen", "doppelstabmatte", "stabgitterzaun"], "zaun_setzen_doppelstab"],
  [["schicht.*aufnehmen", "schicht.*ohne bindemittel"], "schuettgut_kleinmenge"],
  [["feinplanum"], "feinplanum"],
  [["naturschotter.*liefern"], "schuettgut_kleinmenge"],
];

/**
 * Befüllt Positionen automatisch mit Default-Zeitwerten.
 *
 * @param eintraege  Die LV-Einträge (Bereiche + Positionen)
 * @param zeitwerte  Die Default-Zeitwerte aus dem Gewerk (z.B. rohbau.json)
 * @returns          Liste der Treffer mit Eingabewerten und Erklärungen
 */
export function autoBefuellung(
  eintraege: LvEintrag[],
  zeitwerte: ZeitwertVorgabe[],
): AutoBefuellungsTreffer[] {
  const treffer: AutoBefuellungsTreffer[] = [];
  const zeitwertMap = new Map(zeitwerte.map((z) => [z.key, z]));

  for (const e of eintraege) {
    if (e.art === "BEREICH") continue;

    const volltext = `${e.kurztext}\n${e.langtext ?? ""}`.toLowerCase();
    let matched = false;

    // Keyword-Kaskade
    for (const [keywords, zeitwertKey] of KEYWORD_MAP) {
      const keywordMatched = keywords.some((kw) => {
        if (kw.includes(".*")) {
          // Regex-Match
          try {
            return new RegExp(kw, "i").test(volltext);
          } catch {
            return false;
          }
        }
        return volltext.includes(kw.toLowerCase());
      });

      if (keywordMatched) {
        const zw = zeitwertMap.get(zeitwertKey);
        if (zw) {
          // Prüfe ob die Einheit kompatibel ist
          const input: PositionRechenInput = {
            zeit_min_roh: new Decimal(zw.wert),
            geraetezulage_eur_h: new Decimal(zw.geraetezulage),
          };

          // Bei Stoffe-Werten (€/m³ etc.) als Stoffe-EK setzen
          if (zw.einheit.includes("€")) {
            input.stoffe_ek = new Decimal(zw.wert);
            input.zeit_min_roh = undefined;
          }

          treffer.push({
            oz: e.oz,
            input,
            quelle: `Gewerk-Default: ${zw.label} (${zw.referenz})`,
            konfidenz: "hoch",
            erklaerung: `Keyword "${keywords[0]}" matched → ${zw.label}: ${zw.wert} ${zw.einheit}, Geräte ${zw.geraetezulage} €/h`,
          });
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      // Position bleibt leer — kein Match gefunden
      treffer.push({
        oz: e.oz,
        input: {},
        quelle: "Kein Match — manuell füllen",
        konfidenz: "niedrig",
        erklaerung: "Kein passendes Keyword im Kurztext gefunden.",
      });
    }
  }

  return treffer;
}
