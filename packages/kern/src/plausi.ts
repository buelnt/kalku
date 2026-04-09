/**
 * Plausi-Check-Engine
 *
 * Wertet deklarative Plausi-Regeln (aus plausi-regeln.json) gegen eine
 * Position aus und gibt PASS/WARN/FAIL zurück.
 *
 * Die Engine ist bewusst einfach gehalten — sie evaluiert JSON-basierte
 * Bedingungen gegen die konkreten Werte einer Position. Komplexere Logik
 * (z.B. Cross-Position-Checks wie Hierarchie-Vergleiche) kommt in Phase 2.
 *
 * Phase 1: Einzelposition-Checks (Mindestzeiten, NU-Konsistenz, Einheiten)
 * Phase 2: Cross-Position-Checks (Hierarchie "Abbruch < Neubau")
 */
import { Decimal } from "@baukalk/datenmodell";
import type { PositionRechenInput } from "@baukalk/datenmodell";

export type PlausiStatus = "PASS" | "WARN" | "FAIL";

export interface PlausiErgebnis {
  regel_id: string;
  regel_name: string;
  status: PlausiStatus;
  nachricht: string;
  referenz: string;
}

export interface PlausiRegel {
  id: string;
  name: string;
  gewerk: string;
  bedingung: Record<string, unknown>;
  aktion: "FAIL" | "WARN";
  nachricht: string;
  referenz: string;
}

interface PlausiKontext {
  kurztext: string;
  langtext?: string;
  einheit?: string;
  menge?: Decimal;
  input: PositionRechenInput;
  zeitMitFaktor?: Decimal;
}

const NULL = new Decimal(0);

/**
 * Evaluiert alle Regeln gegen eine Position und gibt die Ergebnisse zurück.
 *
 * @param regeln     Liste der Plausi-Regeln (aus plausi-regeln.json)
 * @param kontext    Die zu prüfende Position mit allen relevanten Werten
 * @param gewerk     Das Gewerk der Position (für Gewerk-Filter)
 * @returns          Liste der Ergebnisse (nur Regeln die matchen)
 */
export function pruefePlausi(
  regeln: PlausiRegel[],
  kontext: PlausiKontext,
  gewerk: string,
): PlausiErgebnis[] {
  const ergebnisse: PlausiErgebnis[] = [];
  const volltext = `${kontext.kurztext}\n${kontext.langtext ?? ""}`.toLowerCase();
  const einheitNorm = (kontext.einheit ?? "").toLowerCase();
  const zeitMin = (kontext.input.zeit_min_roh ?? NULL).toNumber();
  const stoffeEk = (kontext.input.stoffe_ek ?? NULL).toNumber();
  const nuEk = (kontext.input.nu_ek ?? NULL).toNumber();
  const geraeteZulage = (kontext.input.geraetezulage_eur_h ?? NULL).toNumber();

  for (const regel of regeln) {
    // Gewerk-Filter
    if (regel.gewerk !== "*" && regel.gewerk !== gewerk) continue;

    const bed = regel.bedingung;
    let matches = true;

    // Text-Bedingungen
    if (bed.langtext_enthaelt && typeof bed.langtext_enthaelt === "string") {
      if (!volltext.includes(bed.langtext_enthaelt.toLowerCase())) matches = false;
    }

    if (Array.isArray(bed.langtext_enthaelt_eines)) {
      const found = (bed.langtext_enthaelt_eines as string[]).some((kw) =>
        volltext.includes(kw.toLowerCase()),
      );
      if (!found) matches = false;
    }

    if (Array.isArray(bed.langtext_enthaelt_eines_2)) {
      const found = (bed.langtext_enthaelt_eines_2 as string[]).some((kw) =>
        volltext.includes(kw.toLowerCase()),
      );
      if (!found) matches = false;
    }

    if (Array.isArray(bed.langtext_enthaelt_nicht)) {
      const found = (bed.langtext_enthaelt_nicht as string[]).some((kw) =>
        volltext.includes(kw.toLowerCase()),
      );
      if (found) matches = false;
    }

    // Einheit-Bedingung
    if (Array.isArray(bed.einheit_ist)) {
      const found = (bed.einheit_ist as string[]).some(
        (e) => einheitNorm === e.toLowerCase(),
      );
      if (!found) matches = false;
    }

    // Numerische Bedingungen
    if (typeof bed.zeit_min_kleiner_als === "number") {
      if (zeitMin === 0 || zeitMin >= bed.zeit_min_kleiner_als) matches = false;
    }

    if (typeof bed.zeit_min_groesser_als === "number") {
      if (zeitMin <= bed.zeit_min_groesser_als) matches = false;
    }

    if (typeof bed.nu_ek_groesser_als === "number") {
      if (nuEk <= bed.nu_ek_groesser_als) matches = false;
    }

    if (typeof bed.geraetezulage_nicht === "number") {
      if (geraeteZulage === bed.geraetezulage_nicht) matches = false;
    }

    // Alle-null-Bedingung
    if (Array.isArray(bed.alle_null)) {
      const allNull = (bed.alle_null as string[]).every((field) => {
        switch (field) {
          case "stoffe_ek": return stoffeEk === 0;
          case "zeit_min_roh": return zeitMin === 0;
          case "nu_ek": return nuEk === 0;
          default: return true;
        }
      });
      if (!allNull) matches = false;
    }

    if (matches) {
      // Nachricht mit Platzhaltern füllen
      let nachricht = regel.nachricht
        .replace("{wert}", String(zeitMin))
        .replace("{zeit_min}", String(zeitMin))
        .replace("{nu_ek}", String(nuEk))
        .replace("{geraetezulage}", String(geraeteZulage));

      ergebnisse.push({
        regel_id: regel.id,
        regel_name: regel.name,
        status: regel.aktion,
        nachricht,
        referenz: regel.referenz,
      });
    }
  }

  return ergebnisse;
}
