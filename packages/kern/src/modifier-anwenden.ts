/**
 * Modifier automatisch auf Positions-Werte anwenden
 *
 * Nimmt die Ergebnisse des Modifier-Scans und wendet die entsprechenden
 * Änderungen auf die Positions-Eingabewerte an.
 *
 * Regeln:
 * - NU-Trigger: M wird auf einen Platzhalter gesetzt (muss vom Kalkulator
 *   mit echtem NU-Preis gefüllt werden), Y=0, X=undefined
 * - Vorhalte: X=undefined, Y=0 (AA-Override muss separat gesetzt werden)
 * - Reine Arbeitsleistung: X=undefined
 * - Erschwernis: wird als Hinweis angezeigt, muss vom Kalkulator bestätigt werden
 */
import { Decimal } from "@baukalk/datenmodell";
import type { PositionRechenInput } from "@baukalk/datenmodell";
import type { ModifierTreffer } from "./modifier-scan.js";

const NULL = new Decimal(0);

export interface ModifierErgebnis {
  /** Die angepassten Eingabewerte. */
  input: PositionRechenInput;
  /** Welche Felder wurden automatisch geändert? */
  aenderungen: string[];
  /** Muss der Kalkulator manuell eingreifen? */
  benoetigt_eingabe: boolean;
  /** Hinweistexte für den Kalkulator. */
  hinweise: string[];
}

/**
 * Wendet Modifier-Treffer auf die Eingabewerte einer Position an.
 */
export function wendeModifierAn(
  bestehendeWerte: PositionRechenInput,
  treffer: ModifierTreffer[],
): ModifierErgebnis {
  const input = { ...bestehendeWerte };
  const aenderungen: string[] = [];
  const hinweise: string[] = [];
  let benoetigt_eingabe = false;

  for (const t of treffer) {
    switch (t.typ) {
      case "nu_trigger":
        // NU-Komplett: Y=0, X=leer, M muss vom Kalkulator gefüllt werden
        input.zeit_min_roh = NULL;
        input.stoffe_ek = undefined;
        aenderungen.push("Y=0 (NU-Komplett)");
        aenderungen.push("X=leer (NU-Komplett)");
        if (!input.nu_ek || input.nu_ek.isZero()) {
          benoetigt_eingabe = true;
          hinweise.push(
            `NU-Trigger "${t.keyword}" erkannt — bitte NU-Preis (M) eingeben.`,
          );
        }
        break;

      case "vorhalte":
        // Vorhalte: X=leer, Y=0
        input.stoffe_ek = undefined;
        input.zeit_min_roh = NULL;
        aenderungen.push("X=leer, Y=0 (Vorhalte-Position)");
        hinweise.push("Vorhalte-Position — bitte AA-Override prüfen.");
        break;

      case "reine_arbeitsleistung":
        // Reine Arbeit: X=0
        input.stoffe_ek = undefined;
        aenderungen.push("X=0 (reine Arbeitsleistung)");
        break;

      case "erschwernis":
        // Erschwernis: nur Hinweis, kein automatisches Ändern
        hinweise.push(`Erschwernis "${t.keyword}" erkannt: ${t.aktion}`);
        break;
    }
  }

  return {
    input,
    aenderungen,
    benoetigt_eingabe,
    hinweise,
  };
}
