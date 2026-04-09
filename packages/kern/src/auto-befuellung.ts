/**
 * Auto-Befüllung — Positions-Werte automatisch aus Gewerk-Defaults berechnen
 *
 * Scannt den Kurztext/Langtext jeder Position und ordnet automatisch
 * die passenden Zeitwerte, Stoffkosten und Gerätezulagen zu.
 *
 * Die Zuordnung erfolgt über eine priorisierte Keyword-Kaskade:
 * Spezifischere Keywords werden zuerst geprüft, allgemeinere als Fallback.
 *
 * Alle Werte stammen aus dem Kalkulations-Leitfaden v1.3 und dem
 * Gemini Master-Prompt v8.
 */
import { Decimal } from "@baukalk/datenmodell";
import type { PositionRechenInput, LvEintrag } from "@baukalk/datenmodell";

export interface AutoBefuellungsTreffer {
  oz: string;
  input: PositionRechenInput;
  quelle: string;
  konfidenz: "hoch" | "mittel" | "niedrig";
  erklaerung: string;
}

/**
 * Eine Kalkulationsregel: Keywords → Werte
 */
interface KalkRegel {
  /** Keywords die im Volltext (kurztext + langtext) vorkommen müssen (alle, lowercase). */
  keywords: string[];
  /** Keywords von denen mindestens eines vorkommen muss (optional). */
  keywords_oder?: string[];
  /** Keywords die NICHT vorkommen dürfen (optional). */
  keywords_nicht?: string[];
  /** Stoffe EK pro Einheit. */
  X?: number;
  /** Zeit in Minuten pro Einheit. */
  Y?: number;
  /** Gerätezulage €/h. */
  Z?: number;
  /** Nachunternehmer EK pro Einheit. */
  M?: number;
  /** Kommentar/Referenz. */
  kommentar: string;
}

/**
 * Alle Kalkulationsregeln, sortiert von spezifisch nach allgemein.
 * Die erste Regel die matcht, gewinnt.
 */
const REGELN: KalkRegel[] = [
  // ══════════════════════════════════════════════════════════════
  // BAUSTELLENEINRICHTUNG
  // ══════════════════════════════════════════════════════════════
  { keywords: ["baustelle einrichten"], Y: 1800, Z: 50, kommentar: "BE einrichten GaLaBau §1" },
  { keywords: ["baustelle räumen"], Y: 600, Z: 15, kommentar: "BE räumen §1" },
  { keywords: ["bauzaun"], keywords_oder: ["umsetzen", "versetzen"], Y: 5, Z: 5, kommentar: "Bauzaun umsetzen §1" },
  { keywords: ["bauzaun"], keywords_nicht: ["umsetzen", "versetzen", "vorhalten"], Y: 10, Z: 15, kommentar: "Bauzaun herstellen §1" },
  { keywords: ["bauzaun"], keywords_oder: ["vorhalten"], X: 0.45, Y: 0, Z: 0, kommentar: "Bauzaun vorhalten §1 (AA)" },
  { keywords: ["stammschutz"], X: 25, Y: 20, Z: 5, kommentar: "Stammschutz Ummantelung" },
  { keywords: ["absperr"], keywords_oder: ["warneinricht", "aufstellen"], Y: 3, Z: 5, kommentar: "Absperrung aufstellen" },
  { keywords: ["dixi"], keywords_oder: ["aufstellen"], Y: 120, Z: 100, kommentar: "Dixi aufstellen §1" },

  // ══════════════════════════════════════════════════════════════
  // SICHERUNG / ZUGANG
  // ══════════════════════════════════════════════════════════════
  { keywords: ["zugang"], keywords_oder: ["sichern", "sicherung"], Y: 60, Z: 15, kommentar: "Zugang sichern" },
  { keywords: ["toranlage"], keywords_oder: ["sichern"], Y: 45, Z: 10, kommentar: "Toranlage sichern" },

  // ══════════════════════════════════════════════════════════════
  // AUSBAUEN / ENTSORGEN (Spielgeräte, Mobiliar, Vegetation)
  // ══════════════════════════════════════════════════════════════
  { keywords: ["tischtennisplatte"], Y: 60, Z: 25, kommentar: "TT-Platte ausbauen §5.6" },
  { keywords: ["kleinfeldfußballtor"], keywords_oder: ["ausbauen"], Y: 45, Z: 15, kommentar: "Tor ausbauen §5.6" },
  { keywords: ["maltafel"], keywords_oder: ["ausbauen"], Y: 30, Z: 10, kommentar: "Maltafel ausbauen" },
  { keywords: ["klettergerät"], keywords_oder: ["ausbauen"], Y: 120, Z: 25, kommentar: "Klettergerät ausbauen §5.6" },
  { keywords: ["spielgerät"], keywords_oder: ["ausbauen"], Y: 90, Z: 25, kommentar: "Spielgerät ausbauen §5.6" },
  { keywords: ["kamelritt"], Y: 90, Z: 25, kommentar: "Spielgerät Kamelritt ausbauen" },
  { keywords: ["fahrradständer"], keywords_oder: ["entsorgen"], Y: 30, Z: 15, M: 15, kommentar: "Fahrradständer entsorgen" },
  { keywords: ["holzbarriere"], keywords_oder: ["ausbauen"], Y: 10, Z: 10, kommentar: "Holzbarriere ausbauen pro lfm" },
  { keywords: ["bänke"], keywords_oder: ["entsorgen"], Y: 20, Z: 15, M: 10, kommentar: "Bänke entsorgen" },
  { keywords: ["abfallbehälter"], keywords_oder: ["entsorgen"], Y: 15, Z: 10, M: 5, kommentar: "Abfallbehälter entsorgen" },
  { keywords: ["rankgitter"], Y: 30, Z: 10, kommentar: "Rankgitter entfernen" },
  { keywords: ["baum roden"], Y: 60, Z: 30, M: 40, kommentar: "Baum roden inkl. Entsorgung" },
  { keywords: ["baumrodung"], Y: 60, Z: 30, M: 40, kommentar: "Baumrodung" },
  { keywords: ["niedrige gehölze"], keywords_oder: ["entfernen", "roden"], Y: 5, Z: 15, M: 3, kommentar: "Niedrige Gehölze roden" },
  { keywords: ["sträucher entfernen"], Y: 15, Z: 15, M: 8, kommentar: "Sträucher entfernen" },
  { keywords: ["rindenmulch"], keywords_oder: ["entfernen", "aufnehmen"], Y: 2, Z: 15, M: 6, kommentar: "Rindenmulch entfernen" },

  // ══════════════════════════════════════════════════════════════
  // ABBRUCH (Asphalt, Beton, Pflaster, Bord)
  // ══════════════════════════════════════════════════════════════
  { keywords: ["asphalt"], keywords_oder: ["schneiden"], Y: 12, Z: 15, kommentar: "Asphalt schneiden §4.5" },
  { keywords: ["asphaltdecke", "kleingerät"], keywords_oder: ["abbrechen"], Y: 4, Z: 20, kommentar: "Asphalt abbrechen Kleingerät" },
  { keywords: ["asphaltdecke"], keywords_oder: ["abbrechen", "aufnehmen"], Y: 2, Z: 25, kommentar: "Asphalt abbrechen §5.4" },
  { keywords: ["schotterunterbau", "teerhaltig", "kleingerät"], Y: 25, Z: 20, kommentar: "Teerh. Schotter Kleingerät" },
  { keywords: ["schotterunterbau", "teerhaltig"], Y: 15, Z: 30, kommentar: "Teerh. Schotter Großmaschine" },
  { keywords: ["schotterunterbau", "kleingerät"], Y: 20, Z: 20, kommentar: "Schotter lösen Kleingerät" },
  { keywords: ["schotterunterbau"], keywords_oder: ["abbrechen", "lösen"], Y: 10, Z: 30, kommentar: "Schotter lösen §2" },
  { keywords: ["betonpflaster"], keywords_oder: ["abbrechen", "aufnehmen"], Y: 5, Z: 15, kommentar: "Betonpflaster aufnehmen" },
  { keywords: ["betonplatten"], keywords_oder: ["abbrechen", "aufnehmen"], Y: 5, Z: 15, kommentar: "Betonplatten aufnehmen" },
  { keywords: ["rasengittersteine"], keywords_oder: ["abbrechen", "aufnehmen"], Y: 8, Z: 15, kommentar: "Rasengitter aufnehmen" },
  { keywords: ["waschbeton"], keywords_oder: ["abbrechen"], Y: 8, Z: 25, kommentar: "Waschbeton abbrechen" },
  { keywords: ["tiefborde", "kunststoff", "oberirdisch"], Y: 3, Z: 5, kommentar: "Kunststoff-Tiefbord oberird." },
  { keywords: ["tiefborde", "kunststoff"], Y: 5, Z: 15, kommentar: "Kunststoff-Tiefbord abbrechen" },
  { keywords: ["tiefborde", "beton", "oberirdisch"], Y: 4, Z: 10, kommentar: "Beton-Tiefbord oberird." },
  { keywords: ["tiefborde", "beton"], Y: 5, Z: 15, kommentar: "Beton-Tiefbord abbrechen §5.4" },
  { keywords: ["holzhackschnitzel"], keywords_oder: ["aufnehmen"], Y: 3, Z: 15, kommentar: "Hackschnitzel aufnehmen" },
  { keywords: ["rückenstütze"], keywords_oder: ["abbrechen"], Y: 8, Z: 15, kommentar: "Rückenstütze abbrechen" },
  { keywords: ["rinne"], keywords_oder: ["abbrechen"], Y: 10, Z: 15, kommentar: "Rinne abbrechen" },
  { keywords: ["straßenablauf"], keywords_oder: ["ausbauen"], Y: 90, Z: 25, kommentar: "Straßenablauf ausbauen §5.6" },
  { keywords: ["stutzen"], keywords_oder: ["verschließen"], Y: 30, Z: 10, kommentar: "Stutzen verschließen" },
  { keywords: ["saugbagger"], X: 150, Y: 0, Z: 0, kommentar: "Saugbagger Stundensatz" },
  { keywords: ["mauerwerk"], keywords_oder: ["abbruch", "abbrechen"], Y: 30, Z: 25, kommentar: "Mauerwerk abbruch §5.4" },
  { keywords: ["beton"], keywords_oder: ["aufbrechen", "abbruch", "abbrechen"], keywords_nicht: ["pflaster", "platten", "verbund", "waschbeton"], Y: 45, Z: 25, kommentar: "Beton unbewehrt abbrechen §5.4" },
  { keywords: ["stahlbeton"], keywords_oder: ["abbruch", "abbrechen"], Y: 90, Z: 25, kommentar: "Stahlbeton abbrechen §5.4" },

  // ══════════════════════════════════════════════════════════════
  // ERDARBEITEN
  // ══════════════════════════════════════════════════════════════
  { keywords: ["profilgerecht lösen"], keywords_oder: ["b3", "auffüllung"], Y: 3, Z: 25, kommentar: "Auffüllung lösen §2" },
  { keywords: ["profilgerecht lösen"], keywords_oder: ["b4", "boden"], Y: 5, Z: 25, kommentar: "Boden lösen §2" },
  { keywords: ["boden lösen"], Y: 3, Z: 25, kommentar: "Boden lösen §2" },
  { keywords: ["aushub"], keywords_nicht: ["hand"], Y: 3, Z: 25, kommentar: "Aushub Großmaschine §2" },
  { keywords: ["zulage"], keywords_oder: ["handarbeit"], Y: 240, Z: 0, kommentar: "Handarbeit §2.3" },
  { keywords: ["boden einbauen"], Y: 8, Z: 25, kommentar: "Boden einbauen §2" },
  { keywords: ["verfüllen"], Y: 8, Z: 25, kommentar: "Verfüllen §2" },
  { keywords: ["planieren"], keywords_nicht: ["pflanzflächen", "fein"], Y: 0.5, Z: 25, kommentar: "Planieren §2" },
  { keywords: ["planum herstellen"], keywords_nicht: ["fein", "pflanz"], Y: 1, Z: 15, kommentar: "Planum grob §2" },
  { keywords: ["feinplanum"], Y: 2, Z: 5, kommentar: "Feinplanum §2" },
  { keywords: ["verdichten"], keywords_nicht: ["nach"], Y: 0.5, Z: 25, kommentar: "Verdichten §2" },
  { keywords: ["nachverdichten"], Y: 0.5, Z: 15, kommentar: "Nachverdichten §2" },
  { keywords: ["oberboden"], keywords_oder: ["abtragen", "abschieben"], Y: 0.5, Z: 25, kommentar: "Oberboden abtragen §2" },
  { keywords: ["oberboden"], keywords_oder: ["liefern", "einbauen", "auftragen"], X: 25, Y: 5, Z: 25, kommentar: "Oberboden liefern+einbauen" },
  { keywords: ["zwischenlagerung"], Y: 2, Z: 25, kommentar: "Zwischenlagerung laden+kippen" },
  { keywords: ["minibagger"], Y: 10, Z: 15, kommentar: "Minibagger §2.4" },

  // ══════════════════════════════════════════════════════════════
  // ENTSORGUNG (Stoffe = Entsorgungskosten pro Tonne)
  // ══════════════════════════════════════════════════════════════
  { keywords: ["gefährlicher abfall", "asphalt"], X: 45, Y: 2, Z: 25, kommentar: "Teerh. Asphalt entsorgen" },
  { keywords: ["gefährlicher abfall", "schotter"], X: 35, Y: 2, Z: 25, kommentar: "Teerh. Schotter entsorgen" },
  { keywords: ["bm-f2"], X: 55, Y: 2, Z: 25, kommentar: "Entsorgung BM-F2 (belastet)" },
  { keywords: ["bm-f1"], X: 35, Y: 2, Z: 25, kommentar: "Entsorgung BM-F1" },
  { keywords: ["bm-f0"], X: 20, Y: 2, Z: 25, kommentar: "Entsorgung BM-F0*" },
  { keywords: ["bm-0*"], X: 12, Y: 2, Z: 25, kommentar: "Entsorgung BM-0*" },
  { keywords: ["bm-0"], X: 8, Y: 2, Z: 25, kommentar: "Verwertung BM-0" },
  { keywords: ["entsorgen"], keywords_oder: ["abfall", "abbruch", "boden"], X: 15, Y: 2, Z: 25, kommentar: "Entsorgung Standard" },
  { keywords: ["verwerten"], X: 10, Y: 2, Z: 25, kommentar: "Verwertung Standard" },

  // ══════════════════════════════════════════════════════════════
  // ENTWÄSSERUNG
  // ══════════════════════════════════════════════════════════════
  { keywords: ["gräben"], keywords_oder: ["abwasserleitung", "leitung"], Y: 20, Z: 25, kommentar: "Grabenaushub" },
  { keywords: ["suchschlitze"], Y: 45, Z: 15, kommentar: "Suchschlitze vorsichtig" },
  { keywords: ["kopflöcher"], Y: 45, Z: 15, kommentar: "Kopflöcher herstellen" },
  { keywords: ["entwässerungsleitung"], X: 15, Y: 8, Z: 15, kommentar: "Rohr verlegen" },
  { keywords: ["kanalwarnband"], X: 1, Y: 1, Z: 0.5, kommentar: "Warnband" },
  { keywords: ["markierung der trasse"], X: 1, Y: 1, Z: 0.5, kommentar: "Trassenmarkierung" },
  { keywords: ["formstücke", "bögen"], X: 8, Y: 10, Z: 10, kommentar: "Formstück Bogen" },
  { keywords: ["formstücke", "abzweig"], X: 12, Y: 15, Z: 10, kommentar: "Formstück Abzweig" },
  { keywords: ["saugerdränage"], X: 8, Y: 8, Z: 15, kommentar: "Dränage verlegen" },
  { keywords: ["dränage"], X: 8, Y: 8, Z: 15, kommentar: "Dränage verlegen" },
  { keywords: ["rinne aus formsteinen"], X: 25, Y: 20, Z: 5, kommentar: "Rinne Formsteine" },
  { keywords: ["abschlussstein"], X: 15, Y: 15, Z: 5, kommentar: "Abschlussstein" },
  { keywords: ["fertigteilrinne"], keywords_oder: ["schneiden"], Y: 15, Z: 15, kommentar: "Rinne schneiden" },
  { keywords: ["straßenablauf", "muldenform"], X: 250, Y: 120, Z: 25, kommentar: "Straßenablauf komplett §5.6" },
  { keywords: ["entwässerungsrinne", "b 125"], X: 80, Y: 30, Z: 15, kommentar: "Rinne B125" },
  { keywords: ["entwässerungsrinne", "a 15"], X: 60, Y: 30, Z: 15, kommentar: "Rinne A15" },
  { keywords: ["entwässerungsrinne"], X: 70, Y: 30, Z: 15, kommentar: "Entwässerungsrinne" },
  { keywords: ["stirnwand"], X: 20, Y: 10, Z: 5, kommentar: "Stirnwand" },
  { keywords: ["einlaufkasten"], X: 180, Y: 60, Z: 15, kommentar: "Einlaufkasten" },
  { keywords: ["anschluss"], keywords_oder: ["bestehende", "leitung"], Y: 45, Z: 15, kommentar: "Anschluss herstellen" },
  { keywords: ["vollsickerrohr"], X: 10, Y: 30, Z: 10, kommentar: "Vollsickerrohr" },
  { keywords: ["schacht anpassen"], Y: 60, Z: 15, kommentar: "Schacht anpassen §5.6" },
  { keywords: ["höhenanpassung"], keywords_oder: ["schacht", "schächt"], X: 5, Y: 15, Z: 10, kommentar: "Höhenanpassung" },
  { keywords: ["ausgleichsringe"], X: 8, Y: 10, Z: 10, kommentar: "Ausgleichsringe" },

  // ══════════════════════════════════════════════════════════════
  // KONTROLLPRÜFUNGEN (NU)
  // ══════════════════════════════════════════════════════════════
  { keywords: ["kontrollprüfung"], M: 250, Y: 0, Z: 0, kommentar: "NU Kontrollprüfung" },
  { keywords: ["testfeld"], M: 250, Y: 0, Z: 0, kommentar: "NU Testfeld" },

  // ══════════════════════════════════════════════════════════════
  // WEGEBAU (Pflaster, Bord, Tragschicht)
  // ══════════════════════════════════════════════════════════════
  { keywords: ["noppenfolie"], X: 5, Y: 3, Z: 0.5, kommentar: "Noppenfolie" },
  { keywords: ["frostschutzschicht"], X: 18, Y: 5, Z: 25, kommentar: "FSS liefern+einbauen" },
  { keywords: ["tragschicht"], keywords_oder: ["herstellen", "einbauen"], X: 25, Y: 5, Z: 25, kommentar: "Tragschicht" },
  { keywords: ["fugenpflaster"], X: 25, Y: 35, Z: 5, kommentar: "Fugenpflaster, aufwendiger" },
  { keywords: ["mosaikpflaster"], X: 30, Y: 60, Z: 5, kommentar: "Mosaikpflaster, sehr aufwendig" },
  { keywords: ["pflasterfläche"], keywords_oder: ["herstellen"], X: 20, Y: 30, Z: 5, kommentar: "Pflaster verlegen §4.2" },
  { keywords: ["pflaster"], keywords_oder: ["schneiden", "zuarbeiten"], Y: 15, Z: 15, kommentar: "Pflaster schneiden §4.3" },
  { keywords: ["pflaster"], keywords_oder: ["verlegen", "herstellen"], X: 20, Y: 30, Z: 5, kommentar: "Pflaster verlegen §4.2" },
  { keywords: ["tiefbord"], keywords_oder: ["liefern", "einbauen", "setzen"], X: 20, Y: 15, Z: 5, kommentar: "Tiefbord setzen §4.2" },
  { keywords: ["bordstein"], keywords_oder: ["setzen", "liefern"], X: 15, Y: 15, Z: 5, kommentar: "Bordstein setzen §4.2" },
  { keywords: ["einfassung"], keywords_oder: ["rechteckpflaster", "pflaster"], X: 15, Y: 15, Z: 5, kommentar: "Einfassung Pflaster" },
  { keywords: ["einfassungsstein"], keywords_oder: ["setzen"], X: 13, Y: 15, Z: 5, kommentar: "Einfassungsstein setzen §4.2" },
  { keywords: ["baumsubstrat"], keywords_nicht: ["hochstämme"], X: 60, Y: 15, Z: 15, kommentar: "Baumsubstrat" },
  { keywords: ["wurzelbrücke"], X: 35, Y: 10, Z: 5, kommentar: "Wurzelbrücke" },

  // ══════════════════════════════════════════════════════════════
  // SCHÜTTGÜTER
  // ══════════════════════════════════════════════════════════════
  { keywords: ["schotter"], keywords_oder: ["liefern"], X: 19, Y: 0, Z: 0.5, kommentar: "Schotter Lieferung" },
  { keywords: ["schotter"], keywords_oder: ["einbauen", "herstellen"], X: 25, Y: 5, Z: 25, kommentar: "Schotter einbauen §3" },
  { keywords: ["kies"], keywords_oder: ["liefern", "einbauen"], X: 22, Y: 5, Z: 25, kommentar: "Kies liefern+einbauen" },

  // ══════════════════════════════════════════════════════════════
  // FALLSCHUTZ (NU-Trigger §0.7)
  // ══════════════════════════════════════════════════════════════
  { keywords: ["fallschutzbelag"], keywords_oder: ["liefern", "einbauen"], M: 45, Y: 0, Z: 0, kommentar: "Fallschutz NU §0.7" },
  { keywords: ["fallschutz"], M: 45, Y: 0, Z: 0, kommentar: "Fallschutz NU §0.7" },

  // ══════════════════════════════════════════════════════════════
  // SPIELGERÄTE (NU-Komplett)
  // ══════════════════════════════════════════════════════════════
  { keywords: ["spielkombination"], keywords_oder: ["liefern"], M: 8000, Y: 0, Z: 0, kommentar: "NU Spielkombination" },
  { keywords: ["schaukel"], keywords_oder: ["liefern"], M: 3500, Y: 0, Z: 0, kommentar: "NU Schaukel" },
  { keywords: ["kirta-schaukel"], M: 3500, Y: 0, Z: 0, kommentar: "NU Kirta-Schaukel" },
  { keywords: ["reck"], keywords_oder: ["liefern"], M: 2500, Y: 0, Z: 0, kommentar: "NU Reck" },
  { keywords: ["kleinfeldfußballtor", "bodenhülse"], M: 800, Y: 0, Z: 0, kommentar: "NU Tor+Bodenhülse" },
  { keywords: ["kleinfeldfußballtor"], keywords_oder: ["einbauen"], keywords_nicht: ["ausbauen"], Y: 120, Z: 25, kommentar: "Tor einbauen" },
  { keywords: ["linierung"], M: 15, Y: 0, Z: 0, kommentar: "NU Linierung" },
  { keywords: ["spielgerät"], keywords_oder: ["liefern", "einbauen"], keywords_nicht: ["ausbauen"], M: 2000, Y: 0, Z: 0, kommentar: "NU Spielgerät" },

  // ══════════════════════════════════════════════════════════════
  // AUSSTATTUNG (Bänke, Abfallbehälter, Findlinge etc.)
  // ══════════════════════════════════════════════════════════════
  { keywords: ["findlinge", "groß"], X: 150, Y: 60, Z: 25, kommentar: "Große Findlinge" },
  { keywords: ["findlinge"], X: 80, Y: 30, Z: 25, kommentar: "Findlinge" },
  { keywords: ["fundamentbeton"], X: 200, Y: 30, Z: 25, kommentar: "Fundamentbeton §5.1" },
  { keywords: ["trasszementmörtel"], X: 300, Y: 60, Z: 10, kommentar: "Trasszementmörtel" },
  { keywords: ["endlosbank", "grundelement"], M: 800, Y: 60, Z: 15, kommentar: "Bank Grundelement" },
  { keywords: ["endlosbank", "anbauelement"], M: 500, Y: 45, Z: 15, kommentar: "Bank Anbauelement" },
  { keywords: ["bank-tisch-kombination"], M: 1200, Y: 90, Z: 15, kommentar: "Bank-Tisch" },
  { keywords: ["rückenlehne"], M: 200, Y: 30, Z: 10, kommentar: "Rückenlehne" },
  { keywords: ["sitzpodest"], M: 600, Y: 60, Z: 15, kommentar: "Sitzpodest" },
  { keywords: ["abfallbehälter"], keywords_oder: ["liefern", "einbauen"], keywords_nicht: ["entsorgen"], M: 350, Y: 30, Z: 15, kommentar: "Abfallbehälter neu" },
  { keywords: ["fahrradparker"], M: 250, Y: 30, Z: 15, kommentar: "Fahrradparker" },
  { keywords: ["holzbarriere"], keywords_oder: ["liefern", "höhe"], keywords_nicht: ["ausbauen"], X: 45, Y: 15, Z: 15, kommentar: "Holzbarriere neu" },

  // ══════════════════════════════════════════════════════════════
  // BETON
  // ══════════════════════════════════════════════════════════════
  { keywords: ["betonieren"], keywords_oder: ["schalung"], Y: 300, Z: 25, kommentar: "Betonieren inkl. Schalung §5.3" },
  { keywords: ["betonieren"], keywords_oder: ["aushub"], Y: 60, Z: 25, kommentar: "Betonieren inkl. Aushub §5.2" },
  { keywords: ["betonieren"], Y: 30, Z: 25, kommentar: "Betonieren rein §5.1" },
  { keywords: ["schalung"], Y: 25, Z: 25, kommentar: "Schalung §5.3" },

  // ══════════════════════════════════════════════════════════════
  // VEGETATIONSTECHNIK
  // ══════════════════════════════════════════════════════════════
  { keywords: ["baugrund lockern"], Y: 2, Z: 15, kommentar: "Baugrund lockern" },
  { keywords: ["bodenbelüftung"], Y: 3, Z: 10, kommentar: "Bodenbelüftung" },
  { keywords: ["bestandsbäume wässern"], Y: 15, Z: 5, kommentar: "Bäume wässern" },
  { keywords: ["vegetationsschicht lockern"], Y: 2, Z: 10, kommentar: "Vegetationsschicht lockern" },
  { keywords: ["planum"], keywords_oder: ["pflanzflächen"], Y: 2, Z: 5, kommentar: "Planum Pflanzflächen" },
  { keywords: ["bodenaktivator"], X: 2, Y: 1, Z: 0.5, kommentar: "Bodenaktivator" },
  { keywords: ["pflanzflächen düngen"], X: 1.5, Y: 1, Z: 0.5, kommentar: "Düngen" },
  { keywords: ["pflanzflächen"], keywords_oder: ["kreilen"], Y: 1, Z: 0.5, kommentar: "Kreilen" },
  { keywords: ["mulchen"], keywords_oder: ["lava"], X: 8, Y: 2, Z: 5, kommentar: "Mulchen Lava" },

  // ══════════════════════════════════════════════════════════════
  // PFLANZEN (Lieferung = Stoffe, Arbeiten = Zeit)
  // ══════════════════════════════════════════════════════════════
  { keywords: ["tilia"], X: 350, Y: 0, Z: 0, kommentar: "Hochstamm Tilia" },
  { keywords: ["acer"], keywords_oder: ["freemanii", "celebration"], X: 350, Y: 0, Z: 0, kommentar: "Hochstamm Acer" },
  { keywords: ["amelanchier"], X: 35, Y: 0, Z: 0, kommentar: "Amelanchier" },
  { keywords: ["ribes"], X: 8, Y: 0, Z: 0, kommentar: "Ribes" },
  { keywords: ["mahonia"], X: 8, Y: 0, Z: 0, kommentar: "Mahonia" },
  { keywords: ["epimedium"], keywords_nicht: ["zurückschneiden"], X: 3.5, Y: 0, Z: 0, kommentar: "Staude Epimedium" },
  { keywords: ["bergenia"], X: 3.5, Y: 0, Z: 0, kommentar: "Staude Bergenia" },
  { keywords: ["geranium"], X: 3.5, Y: 0, Z: 0, kommentar: "Staude Geranium" },
  { keywords: ["brunnera"], X: 5, Y: 0, Z: 0, kommentar: "Staude Brunnera" },
  { keywords: ["luzula"], X: 3.5, Y: 0, Z: 0, kommentar: "Gras Luzula" },
  { keywords: ["carex"], X: 3.5, Y: 0, Z: 0, kommentar: "Gras Carex" },
  { keywords: ["vinca"], X: 2.5, Y: 0, Z: 0, kommentar: "Bodendecker Vinca" },
  { keywords: ["waldsteinia"], X: 2.5, Y: 0, Z: 0, kommentar: "Bodendecker Waldsteinia" },
  { keywords: ["anemone"], X: 0.8, Y: 0, Z: 0, kommentar: "Zwiebel Anemone" },
  { keywords: ["scilla"], X: 0.8, Y: 0, Z: 0, kommentar: "Zwiebel Scilla" },

  // Pflanzarbeiten
  { keywords: ["sträucher pflanzen"], Y: 6, Z: 0.5, kommentar: "Sträucher pflanzen §6" },
  { keywords: ["stauden"], keywords_oder: ["bodendecker", "gräser", "pflanzen"], Y: 2, Z: 0.5, kommentar: "Stauden pflanzen" },
  { keywords: ["blumenzwiebeln"], Y: 1, Z: 0.5, kommentar: "Zwiebeln stecken" },
  { keywords: ["hochstämme pflanzen"], Y: 120, Z: 15, kommentar: "Hochstamm pflanzen §6" },
  { keywords: ["hochstamm pflanzen"], Y: 120, Z: 15, kommentar: "Hochstamm pflanzen §6" },

  // Baumpflanzung
  { keywords: ["pflanzgrube"], keywords_oder: ["hochstamm"], Y: 30, Z: 25, kommentar: "Pflanzgrube Hochstamm" },
  { keywords: ["wurzelführungsbahn"], X: 25, Y: 10, Z: 5, kommentar: "HDPE Wurzelführung" },
  { keywords: ["belüftungs"], keywords_oder: ["bewässerungsset"], X: 150, Y: 30, Z: 10, kommentar: "Bewässerungsset" },
  { keywords: ["mulchmatte"], X: 40, Y: 15, Z: 5, kommentar: "Mulchmatte" },
  { keywords: ["baumscheibe"], keywords_oder: ["innenring"], X: 250, Y: 45, Z: 15, kommentar: "Baumscheibe mit Ringen" },
  { keywords: ["baumsubstrat", "hochstämme"], X: 60, Y: 15, Z: 15, kommentar: "Baumsubstrat Hochstämme" },
  { keywords: ["baumverankerung"], X: 80, Y: 45, Z: 10, kommentar: "Dreibock" },
  { keywords: ["dreibock"], X: 80, Y: 45, Z: 10, kommentar: "Dreibock" },
  { keywords: ["rindenschutz"], X: 15, Y: 10, Z: 5, kommentar: "Rindenschutz" },

  // Pflege
  { keywords: ["pflanzflächen pflegen"], Y: 1, Z: 0.5, kommentar: "Pflege pro m²" },
  { keywords: ["epimedien"], keywords_oder: ["zurückschneiden"], Y: 2, Z: 0.5, kommentar: "Epimedien schneiden" },
  { keywords: ["wässergang"], keywords_oder: ["bodendecker"], Y: 0.5, Z: 0.5, kommentar: "Wässergang m²" },
  { keywords: ["wässern"], keywords_oder: ["sträucher"], Y: 10, Z: 5, kommentar: "Wässern Sträucher" },
  { keywords: ["wässern"], keywords_oder: ["bäume"], Y: 10, Z: 5, kommentar: "Wässern Bäume" },
  { keywords: ["hochstämme pflegen"], Y: 30, Z: 5, kommentar: "Hochstammpflege" },
  { keywords: ["hochstamm"], keywords_oder: ["pflegen", "düngen"], keywords_nicht: ["pflanzen", "liefern"], Y: 30, Z: 5, kommentar: "Hochstammpflege" },

  // ══════════════════════════════════════════════════════════════
  // ROHRLEITUNGEN
  // ══════════════════════════════════════════════════════════════
  { keywords: ["rohr"], keywords_oder: ["verlegen"], X: 15, Y: 5, Z: 15, kommentar: "Rohr verlegen" },

  // ══════════════════════════════════════════════════════════════
  // ZAUN
  // ══════════════════════════════════════════════════════════════
  { keywords: ["doppelstabmatte"], Y: 35, Z: 15, kommentar: "Doppelstabmatte §5.6" },
  { keywords: ["zaunpfosten"], Y: 90, Z: 15, kommentar: "Zaunpfosten §5.6" },
  { keywords: ["zaun"], keywords_oder: ["setzen", "errichten"], Y: 10, Z: 15, kommentar: "Zaun setzen" },

  // ══════════════════════════════════════════════════════════════
  // RASEN
  // ══════════════════════════════════════════════════════════════
  { keywords: ["rasen"], keywords_oder: ["ansäen", "ansaat", "herstellen"], Y: 2, Z: 0.5, kommentar: "Rasenansaat §6" },
  { keywords: ["saatbett"], Y: 1.5, Z: 0.5, kommentar: "Saatbett §6" },

  // ══════════════════════════════════════════════════════════════
  // SCHNEIDARBEITEN
  // ══════════════════════════════════════════════════════════════
  { keywords: ["schneiden"], keywords_oder: ["beton"], Y: 187, Z: 15, kommentar: "Beton schneiden §4.3" },
  { keywords: ["schneiden"], keywords_oder: ["stahlbeton"], Y: 300, Z: 15, kommentar: "Stahlbeton schneiden §4.4" },
];

/**
 * Prüft ob eine Regel auf einen Volltext matcht.
 */
function regelMatcht(regel: KalkRegel, volltext: string): boolean {
  // Alle Pflicht-Keywords müssen vorhanden sein
  for (const kw of regel.keywords) {
    if (!volltext.includes(kw)) return false;
  }

  // Mindestens ein ODER-Keyword muss vorhanden sein (falls definiert)
  if (regel.keywords_oder && regel.keywords_oder.length > 0) {
    const hatEines = regel.keywords_oder.some((kw) => volltext.includes(kw));
    if (!hatEines) return false;
  }

  // Kein NICHT-Keyword darf vorhanden sein (falls definiert)
  if (regel.keywords_nicht && regel.keywords_nicht.length > 0) {
    const hatVerboten = regel.keywords_nicht.some((kw) => volltext.includes(kw));
    if (hatVerboten) return false;
  }

  return true;
}

/**
 * Befüllt Positionen automatisch mit Kalkulationswerten.
 */
export function autoBefuellung(
  eintraege: LvEintrag[],
): AutoBefuellungsTreffer[] {
  const treffer: AutoBefuellungsTreffer[] = [];

  for (const e of eintraege) {
    if (e.art === "BEREICH") continue;

    const volltext = `${e.kurztext}\n${e.langtext ?? ""}`.toLowerCase();
    let matched = false;

    for (const regel of REGELN) {
      if (regelMatcht(regel, volltext)) {
        const input: PositionRechenInput = {};
        if (regel.X !== undefined && regel.X > 0) input.stoffe_ek = new Decimal(regel.X);
        if (regel.Y !== undefined && regel.Y > 0) input.zeit_min_roh = new Decimal(regel.Y);
        if (regel.Z !== undefined) input.geraetezulage_eur_h = new Decimal(regel.Z);
        if (regel.M !== undefined && regel.M > 0) input.nu_ek = new Decimal(regel.M);

        treffer.push({
          oz: e.oz,
          input,
          quelle: regel.kommentar,
          konfidenz: "hoch",
          erklaerung: `${regel.kommentar} → X=${regel.X ?? 0} Y=${regel.Y ?? 0} Z=${regel.Z ?? 0.5} M=${regel.M ?? 0}`,
        });
        matched = true;
        break;
      }
    }

    if (!matched) {
      treffer.push({
        oz: e.oz,
        input: {},
        quelle: "Kein Match — manuell",
        konfidenz: "niedrig",
        erklaerung: `Nicht erkannt: ${e.kurztext.slice(0, 50)}`,
      });
    }
  }

  return treffer;
}
