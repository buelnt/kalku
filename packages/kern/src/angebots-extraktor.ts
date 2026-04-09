/**
 * Angebots-Extraktor
 *
 * Extrahiert Preise aus Angebots-Texten (aus PDFs extrahiert).
 * Verschiedene Lieferanten haben verschiedene Formate, aber die
 * Kern-Information ist immer: Artikel/Material + Preis pro Einheit.
 *
 * Der Extraktor sucht nach Preismustern im Text und gibt eine Liste
 * von Material-Preis-Paaren zurück.
 */

export interface ExtrahierterPreis {
  /** Was wird angeboten (Artikelbezeichnung). */
  material: string;
  /** Preis pro Einheit in €. */
  preis: number;
  /** Einheit (m², Stck, t, lfm etc.). */
  einheit: string;
  /** Menge aus dem Angebot. */
  menge: number;
  /** Gesamtpreis aus dem Angebot. */
  gesamtpreis: number;
  /** Lieferant (aus dem Dateinamen oder Angebots-Header). */
  lieferant: string;
  /** Angebotsnummer wenn erkennbar. */
  angebots_nr?: string;
  /** Datum wenn erkennbar. */
  datum?: string;
}

/**
 * Extrahiert Preise aus einem Angebots-Text.
 *
 * Sucht nach Zeilen die ein Preismuster enthalten:
 * - "54,91 €" oder "54.91€" oder "54,91 EUR"
 * - Mengen wie "57,670qm" oder "10 Stk" oder "45 m²"
 *
 * @param text        Der extrahierte Text aus dem PDF
 * @param lieferant   Name des Lieferanten
 * @returns           Liste der gefundenen Preise
 */
export function extrahierePreise(
  text: string,
  lieferant: string,
): ExtrahierterPreis[] {
  const ergebnisse: ExtrahierterPreis[] = [];
  const zeilen = text.split("\n");

  // Angebotsnummer suchen
  let angebotsNr: string | undefined;
  let datum: string | undefined;
  for (const z of zeilen.slice(0, 15)) {
    const nrMatch = z.match(/(?:Angebot|Beleg|Angebots-?Nr\.?)[:\s]*(\d[\d\-/]+)/i);
    if (nrMatch) angebotsNr = nrMatch[1];
    const datumMatch = z.match(/(?:vom|Datum)[:\s]*(\d{1,2}\.\d{1,2}\.\d{4})/i);
    if (datumMatch) datum = datumMatch[1];
  }

  const mengeRegex = /(\d+(?:[.,]\d+)?)\s*(qm|m²|m2|Stk|Stck|Stück|St|lfm|m|t|kg|Psch|Pal)/i;

  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i]!;

    // Suche nach Einzelpreis + Gesamtpreis in einer Zeile
    const preise: number[] = [];
    let match: RegExpExecArray | null;
    const tmpRegex = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*€/g;
    while ((match = tmpRegex.exec(zeile)) !== null) {
      const wert = parseFloat(match[1]!.replace(/\./g, "").replace(",", "."));
      preise.push(wert);
    }

    if (preise.length >= 2) {
      // Zwei Preise in einer Zeile: Einzelpreis + Gesamtpreis
      const einzelpreis = preise[0]!;
      const gesamtpreis = preise[preise.length - 1]!;

      // Menge suchen (in derselben oder vorherigen Zeile)
      let menge = 1;
      let einheit = "Stck";
      const mengeMatch = zeile.match(mengeRegex) ?? zeilen[i - 1]?.match(mengeRegex);
      if (mengeMatch) {
        menge = parseFloat(mengeMatch[1]!.replace(",", "."));
        einheit = mengeMatch[2]!;
      } else {
        // Menge aus Gesamtpreis / Einzelpreis ableiten
        if (einzelpreis > 0) {
          menge = Math.round(gesamtpreis / einzelpreis * 100) / 100;
        }
      }

      // Beschreibung: vorherige Zeilen nach Artikeltext durchsuchen
      let material = "";
      for (let j = Math.max(0, i - 3); j <= i; j++) {
        const z = zeilen[j]!.trim();
        // Ignoriere Zeilen die nur Preise/Nummern sind
        if (z.match(/^\d/) && z.match(/€/)) continue;
        if (z.length > 5 && !z.match(/^(Pos|Summe|Zwischen|zzgl|Fracht|Entladung|Zahlungs)/i)) {
          if (material) material += " ";
          material += z;
        }
      }

      // Nur sinnvolle Preise aufnehmen (nicht Summen, Fracht etc.)
      if (einzelpreis > 0 && einzelpreis < 50000 && material.length > 3) {
        // Filtere offensichtliche Nicht-Artikel-Zeilen
        if (!material.match(/Summe|Fracht|Versand|Diesel|MwSt|Steuer|Zahlung|Paletten/i)) {
          ergebnisse.push({
            material: material.slice(0, 120).trim(),
            preis: einzelpreis,
            einheit: normalisiereEinheit(einheit),
            menge,
            gesamtpreis,
            lieferant,
            angebots_nr: angebotsNr,
            datum,
          });
        }
      }
    }
  }

  return ergebnisse;
}

function normalisiereEinheit(einheit: string): string {
  const e = einheit.toLowerCase().trim();
  if (e === "qm" || e === "m2") return "m²";
  if (e === "stk" || e === "stck" || e === "stück") return "Stck";
  if (e === "pal") return "Pal";
  return einheit;
}
