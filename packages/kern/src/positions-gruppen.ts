/**
 * Positions-Gruppen — Mischkalkulations-Vermeidung
 *
 * Identische Positionen in einem LV müssen denselben EP haben,
 * sonst droht bei öffentlichen Ausschreibungen der Ausschluss
 * wegen Mischkalkulation.
 *
 * Dieses Modul bildet Gruppen identischer Positionen und stellt
 * sicher, dass der EP innerhalb einer Gruppe synchron bleibt.
 *
 * # Algorithmus
 *
 * 1. Textnormalisierung: lowercase, Whitespace-Collapse, Sonderzeichen raus
 * 2. STLB-Code als primärer Schlüssel wenn vorhanden
 * 3. Normalisierter Text als sekundärer Schlüssel
 * 4. Positionen mit Menge unter Gewerk-Schwellwert → Kleinmengen-Subgruppe
 * 5. Entkopplung nur mit Pflicht-Begründung, und entkoppelter EP muss höher sein
 */
import { Decimal } from "@baukalk/datenmodell";
import type { LvEintrag } from "@baukalk/datenmodell";

export interface PositionsGruppe {
  /** Eindeutige Gruppen-ID. */
  id: string;
  /** Der normalisierte Text oder STLB-Code, der die Gruppe definiert. */
  schluessel: string;
  /** Typ des Schlüssels. */
  schluessel_typ: "stlb" | "text";
  /** Indizes der Mitglieder in der Eintrags-Liste. */
  mitglieder: number[];
  /** OZs der Mitglieder (für Anzeige). */
  mitglieder_oz: string[];
  /** Ist die Gruppe gesperrt (EP synchron)? */
  gesperrt: boolean;
  /** Entkoppelte Mitglieder (mit Begründung). */
  entkoppelte: Array<{
    index: number;
    oz: string;
    begruendung: string;
    ist_kleinmenge: boolean;
  }>;
}

export interface KleinmengenSchwellwerte {
  m2: number;
  lfm: number;
  m3: number;
  stueck: number;
  [key: string]: number;
}

/**
 * Normalisiert einen Text für Gruppen-Matching.
 *
 * - Lowercase
 * - Whitespace-Collapse (mehrere Leerzeichen/Tabs/Newlines → ein Leerzeichen)
 * - Sonderzeichen entfernen (alles außer Buchstaben, Zahlen, Leerzeichen)
 * - Trim
 */
export function normalisiereText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^a-zäöüß0-9\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Prüft ob eine Menge unter dem Kleinmengen-Schwellwert für die gegebene Einheit liegt.
 */
function istKleinmenge(
  menge: Decimal | undefined,
  einheit: string | undefined,
  schwellwerte: KleinmengenSchwellwerte,
): boolean {
  if (!menge || !einheit) return false;

  const einheitNorm = einheit.toLowerCase().replace(/[²³]/g, (c) =>
    c === "²" ? "2" : "3",
  );

  let schwelle: number | undefined;
  if (einheitNorm.includes("m2") || einheitNorm === "qm") {
    schwelle = schwellwerte.m2;
  } else if (einheitNorm === "m" || einheitNorm === "lfm") {
    schwelle = schwellwerte.lfm;
  } else if (einheitNorm.includes("m3") || einheitNorm === "cbm") {
    schwelle = schwellwerte.m3;
  } else if (
    einheitNorm === "st" ||
    einheitNorm === "stck" ||
    einheitNorm === "stück"
  ) {
    schwelle = schwellwerte.stueck;
  }

  if (schwelle === undefined) return false;
  return menge.lt(schwelle);
}

/**
 * Bildet Positions-Gruppen aus einer Liste von LV-Einträgen.
 *
 * Nur NORMAL-Positionen (keine Bereiche, Zulagen etc.) werden gruppiert.
 * Gruppen mit nur einem Mitglied werden nicht erzeugt (kein Mischkalk-Risiko).
 *
 * @param eintraege   Alle LV-Einträge
 * @param schwellwerte Kleinmengen-Schwellwerte pro Einheit
 * @returns           Liste der Gruppen (nur Gruppen mit ≥2 Mitgliedern)
 */
export function bildePositionsGruppen(
  eintraege: LvEintrag[],
  schwellwerte: KleinmengenSchwellwerte = {
    m2: 10,
    lfm: 5,
    m3: 0.1,
    stueck: 1,
  },
): PositionsGruppe[] {
  // Nur NORMAL-Positionen
  const positionen = eintraege
    .map((e, i) => ({ eintrag: e, index: i }))
    .filter((p) => p.eintrag.art === "NORMAL");

  // Schlüssel berechnen und gruppieren
  const gruppenMap = new Map<
    string,
    Array<{ eintrag: LvEintrag; index: number; schluesselTyp: "stlb" | "text" }>
  >();

  for (const p of positionen) {
    let schluessel: string;
    let typ: "stlb" | "text";

    if (p.eintrag.stlb_code) {
      schluessel = p.eintrag.stlb_code.trim();
      typ = "stlb";
    } else {
      const volltext = `${p.eintrag.kurztext}\n${p.eintrag.langtext ?? ""}`;
      schluessel = normalisiereText(volltext);
      typ = "text";
    }

    const existing = gruppenMap.get(schluessel);
    if (existing) {
      existing.push({ eintrag: p.eintrag, index: p.index, schluesselTyp: typ });
    } else {
      gruppenMap.set(schluessel, [
        { eintrag: p.eintrag, index: p.index, schluesselTyp: typ },
      ]);
    }
  }

  // Nur Gruppen mit ≥2 Mitgliedern behalten
  const gruppen: PositionsGruppe[] = [];
  let gruppenCounter = 0;

  for (const [schluessel, mitglieder] of gruppenMap) {
    if (mitglieder.length < 2) continue;

    gruppenCounter++;
    const gruppe: PositionsGruppe = {
      id: `grp_${gruppenCounter}`,
      schluessel,
      schluessel_typ: mitglieder[0]!.schluesselTyp,
      mitglieder: [],
      mitglieder_oz: [],
      gesperrt: true,
      entkoppelte: [],
    };

    for (const m of mitglieder) {
      const isKlein = istKleinmenge(
        m.eintrag.menge,
        m.eintrag.einheit,
        schwellwerte,
      );

      if (isKlein) {
        // Automatisch in Kleinmengen-Subgruppe
        gruppe.entkoppelte.push({
          index: m.index,
          oz: m.eintrag.oz,
          begruendung: "Kleinmenge, erschwerter Zugang/Anfahrt",
          ist_kleinmenge: true,
        });
      } else {
        gruppe.mitglieder.push(m.index);
        gruppe.mitglieder_oz.push(m.eintrag.oz);
      }
    }

    // Nur Gruppen behalten, die nach Kleinmengen-Entkopplung noch ≥2 Mitglieder haben
    if (gruppe.mitglieder.length >= 2 || gruppe.entkoppelte.length > 0) {
      gruppen.push(gruppe);
    }
  }

  return gruppen;
}
