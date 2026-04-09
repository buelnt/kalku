/**
 * Modifier-Keyword-Scanner
 *
 * Scannt Langtexte von LV-Positionen nach definierten Stichworten und
 * gibt eine Liste von Treffern zurück. Die Treffer werden im LV-Editor
 * visualisiert und können vom Kalkulator bestätigt oder verworfen werden.
 *
 * Vier Kategorien von Modifiern:
 * 1. NU-Trigger: Position wird als NU-Komplett markiert (M>0, Y=0, X=leer)
 * 2. Erschwernis-Trigger: Zeit-/Preis-Werte werden angepasst
 * 3. Vorhalte-Trigger: X=leer, Y=0, AA als Override
 * 4. Reine Arbeitsleistung: X=0 (keine Stoffe)
 */

export interface ModifierKeywords {
  nu_trigger: { keywords: string[] };
  erschwernis_trigger: {
    keywords: Array<{ keyword: string; aktion: string; referenz: string }>;
  };
  vorhalte_trigger: { einheiten: string[]; keywords: string[] };
  reine_arbeitsleistung: { keywords: string[] };
}

export type ModifierTyp =
  | "nu_trigger"
  | "erschwernis"
  | "vorhalte"
  | "reine_arbeitsleistung";

export interface ModifierTreffer {
  typ: ModifierTyp;
  keyword: string;
  aktion: string;
  referenz: string;
  position_im_text: number;
}

/**
 * Scannt den Text einer Position nach Modifier-Keywords.
 *
 * @param kurztext  Kurztext der Position
 * @param langtext  Langtext der Position (optional)
 * @param einheit   Einheit der Position (z.B. "StWo", "m²")
 * @param keywords  Die Modifier-Keywords aus der Vorgaben-JSON
 * @returns         Liste aller Treffer, sortiert nach Position im Text
 */
export function scanModifier(
  kurztext: string,
  langtext: string | undefined,
  einheit: string | undefined,
  keywords: ModifierKeywords,
): ModifierTreffer[] {
  const treffer: ModifierTreffer[] = [];
  const volltext = `${kurztext}\n${langtext ?? ""}`.toLowerCase();

  // 1. NU-Trigger
  for (const kw of keywords.nu_trigger.keywords) {
    const pos = volltext.indexOf(kw.toLowerCase());
    if (pos >= 0) {
      treffer.push({
        typ: "nu_trigger",
        keyword: kw,
        aktion: "M>0, Y=0, X=leer (Nachunternehmer-Komplett)",
        referenz: "Leitfaden §0.7",
        position_im_text: pos,
      });
    }
  }

  // 2. Erschwernis-Trigger
  for (const item of keywords.erschwernis_trigger.keywords) {
    const pos = volltext.indexOf(item.keyword.toLowerCase());
    if (pos >= 0) {
      treffer.push({
        typ: "erschwernis",
        keyword: item.keyword,
        aktion: item.aktion,
        referenz: item.referenz,
        position_im_text: pos,
      });
    }
  }

  // 3. Vorhalte-Trigger (Einheit + Keyword-Kombination)
  const einheitNorm = (einheit ?? "").toLowerCase().trim();
  const istVorhalteEinheit = keywords.vorhalte_trigger.einheiten.some(
    (e) => einheitNorm === e.toLowerCase(),
  );
  if (istVorhalteEinheit) {
    for (const kw of keywords.vorhalte_trigger.keywords) {
      const pos = volltext.indexOf(kw.toLowerCase());
      if (pos >= 0) {
        treffer.push({
          typ: "vorhalte",
          keyword: `${einheit} + ${kw}`,
          aktion: "X=leer, Y=0, AA als Override (Vorhaltekosten)",
          referenz: "Leitfaden §0.9",
          position_im_text: pos,
        });
      }
    }
  }

  // 4. Reine Arbeitsleistung (X=0)
  for (const kw of keywords.reine_arbeitsleistung.keywords) {
    const pos = volltext.indexOf(kw.toLowerCase());
    if (pos >= 0) {
      treffer.push({
        typ: "reine_arbeitsleistung",
        keyword: kw,
        aktion: "X=0 (reine Arbeitsleistung, keine Stoffe)",
        referenz: "Gemini v8 Regel 1",
        position_im_text: pos,
      });
      break; // Nur der erste Treffer zählt
    }
  }

  // Nach Position im Text sortieren
  treffer.sort((a, b) => a.position_im_text - b.position_im_text);
  return treffer;
}
