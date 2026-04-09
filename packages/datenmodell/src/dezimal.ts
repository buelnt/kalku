/**
 * Dezimal-Zahlen in BauKalk Pro
 *
 * Alle Geldbeträge und Zeiten werden mit `decimal.js` gehalten, um
 * Floating-Point-Drift gegenüber Excel zu vermeiden.
 *
 * Für Serialisierung nach JSON verwenden wir Strings im Format `"1234.56"`
 * (nicht mit deutschem Komma, das ist nur für die Anzeige).
 */
import Decimal from "decimal.js";
import { z } from "zod";

// Präzision und Rundungs-Modus: kaufmännisch "HALF_UP" wie Excel.
//
// Wichtig: Excel verwendet ROUND_HALF_UP ("0,5 immer aufrunden"), NICHT
// Banker's Rounding (ROUND_HALF_EVEN). Beispiel: 1,125 → 1,13 (nicht 1,12).
// Diese Einstellung ist verbindlich für BauKalk Pro, weil jede Rechnung
// 1:1 mit Excel übereinstimmen muss.
//
// Wir rechnen intern mit bis zu 40 signifikanten Stellen, die tatsächlichen
// Rundungs-Schritte geschehen explizit im Rechenkern.
Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});

/**
 * Zod-Schema für eine Dezimal-Zahl, die als String oder number eingelesen
 * werden kann und als `Decimal`-Instanz ausgegeben wird.
 *
 * Akzeptiert:
 *  - number: `1234.56` → `new Decimal("1234.56")`
 *  - string (mit Punkt): `"1234.56"` → `new Decimal("1234.56")`
 *  - string (mit Komma): `"1.234,56"` → `new Decimal("1234.56")`
 *  - null / undefined → wird von `optional()` gehandhabt
 *  - bereits ein Decimal: durchgereicht
 */
export const dezimalSchema = z
  .union([z.number(), z.string(), z.instanceof(Decimal)])
  .transform((v, ctx) => {
    if (v instanceof Decimal) return v;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Nur endliche Zahlen erlaubt (kein NaN, kein Infinity)",
        });
        return z.NEVER;
      }
      return new Decimal(v);
    }
    // String: evtl. mit deutschem Komma
    const normalized = v.trim().replace(/\./g, "").replace(/,/, ".");
    try {
      return new Decimal(normalized);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Kein gültiger Zahlenwert: "${v}"`,
      });
      return z.NEVER;
    }
  });

export type DezimalEingabe = z.input<typeof dezimalSchema>;

/**
 * Formatiert einen Decimal-Wert als deutsches Geldformat: `1.234,56 €`
 *
 * @param value   Der zu formatierende Wert
 * @param options Optionale Einstellungen
 */
export function formatGeld(
  value: Decimal | number | string | null | undefined,
  options: { stellen?: number; mitEuroZeichen?: boolean } = {},
): string {
  const { stellen = 2, mitEuroZeichen = true } = options;
  if (value === null || value === undefined) return "";
  const d = value instanceof Decimal ? value : new Decimal(value);
  const formatted = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  }).format(d.toNumber());
  return mitEuroZeichen ? `${formatted} €` : formatted;
}

/**
 * Formatiert eine Dezimal-Zahl als deutsche Zahl ohne Währung: `1.234,56`
 */
export function formatZahl(
  value: Decimal | number | string | null | undefined,
  stellen = 2,
): string {
  if (value === null || value === undefined) return "";
  const d = value instanceof Decimal ? value : new Decimal(value);
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  }).format(d.toNumber());
}

/**
 * Rundet einen Dezimal-Wert mit ROUND_HALF_UP (wie Excel) auf `stellen`
 * Nachkommastellen. Standard: 2 Stellen (Cent).
 *
 * Wichtig: Der Rechenkern ruft diese Funktion bewusst an mehreren Stellen
 * auf (bei AC, AA, AB, AJ, AK), um Excels "Precision as displayed"-Verhalten
 * zu emulieren. Das erzeugt zwar Rundungs-Drift bei großen Aggregationen,
 * ist aber die einzige Möglichkeit, Cent-genau mit Excel übereinzustimmen.
 */
export function runden(
  value: Decimal | number | string,
  stellen = 2,
): Decimal {
  const d = value instanceof Decimal ? value : new Decimal(value);
  return d.toDecimalPlaces(stellen, Decimal.ROUND_HALF_UP);
}

export { Decimal };
