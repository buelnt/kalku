import { PROJEKTE_PFAD } from "../pfade.js";
/**
 * Projekt-Speicher/Lade-Dialoge
 *
 * Speichert den aktuellen Projekt-Stand (LV + Werte + Parameter) als JSON.
 * Kann auch ein gespeichertes Projekt wieder laden.
 */
import React, { useCallback } from "react";
import { Decimal } from "@baukalk/datenmodell";
import type { LvImport, PositionRechenInput, Parameter } from "@baukalk/datenmodell";

interface ProjektDaten {
  name: string;
  kunde: string;
  lv: LvImport;
  werte: Record<string, { stoffe_ek?: number; zeit_min_roh?: number; geraetezulage_eur_h?: number; nu_ek?: number }>;
  parameter: {
    verrechnungslohn: number;
    material_zuschlag: number;
    nu_zuschlag: number;
    zeitwert_faktor: number;
    geraetezulage_default: number;
  };
  gespeichert_am: string;
}

interface ProjektSpeichernProps {
  projektName: string;
  kunde: string;
  lv: LvImport;
  werte: Map<string, PositionRechenInput>;
  parameter: Parameter;
  onGeladen: (lv: LvImport, werte: Map<string, PositionRechenInput>, parameter: Parameter, name: string) => void;
  onMeldung: (text: string) => void;
}

export function ProjektSpeichern(props: ProjektSpeichernProps): React.JSX.Element {
  const { projektName, kunde, lv, werte, parameter, onGeladen, onMeldung } = props;

  const handleSpeichern = useCallback(async () => {
    // Werte serialisieren
    const werteObj: ProjektDaten["werte"] = {};
    for (const [oz, input] of werte) {
      werteObj[oz] = {
        stoffe_ek: input.stoffe_ek?.toNumber(),
        zeit_min_roh: input.zeit_min_roh?.toNumber(),
        geraetezulage_eur_h: input.geraetezulage_eur_h?.toNumber(),
        nu_ek: input.nu_ek?.toNumber(),
      };
    }

    const daten: ProjektDaten = {
      name: projektName,
      kunde,
      lv,
      werte: werteObj,
      parameter: {
        verrechnungslohn: parameter.verrechnungslohn.toNumber(),
        material_zuschlag: parameter.material_zuschlag.toNumber(),
        nu_zuschlag: parameter.nu_zuschlag.toNumber(),
        zeitwert_faktor: parameter.zeitwert_faktor.toNumber(),
        geraetezulage_default: parameter.geraetezulage_default.toNumber(),
      },
      gespeichert_am: new Date().toISOString(),
    };

    const pfad = `${PROJEKTE_PFAD}/${projektName.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    try {
      await window.baukalk.projektSpeichern(pfad, daten);
      onMeldung(`Projekt gespeichert: ${pfad}`);
    } catch (err) {
      onMeldung(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [projektName, kunde, lv, werte, parameter, onMeldung]);

  const handleLaden = useCallback(async () => {
    // Einfacher Datei-Picker wäre besser, aber für Phase 1 laden wir
    // direkt aus dem Projekt-Ordner
    const name = prompt("Projektname zum Laden:");
    if (!name) return;

    const pfad = `${PROJEKTE_PFAD}/${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    try {
      const raw = await window.baukalk.projektLaden(pfad);
      if (!raw) {
        onMeldung("Projekt nicht gefunden: " + pfad);
        return;
      }

      const daten = raw as ProjektDaten;

      // Werte deserialisieren
      const neueWerte = new Map<string, PositionRechenInput>();
      for (const [oz, w] of Object.entries(daten.werte)) {
        neueWerte.set(oz, {
          stoffe_ek: w.stoffe_ek !== undefined ? new Decimal(w.stoffe_ek) : undefined,
          zeit_min_roh: w.zeit_min_roh !== undefined ? new Decimal(w.zeit_min_roh) : undefined,
          geraetezulage_eur_h: w.geraetezulage_eur_h !== undefined ? new Decimal(w.geraetezulage_eur_h) : undefined,
          nu_ek: w.nu_ek !== undefined ? new Decimal(w.nu_ek) : undefined,
        });
      }

      const neueParameter: Parameter = {
        verrechnungslohn: new Decimal(daten.parameter.verrechnungslohn),
        material_zuschlag: new Decimal(daten.parameter.material_zuschlag),
        nu_zuschlag: new Decimal(daten.parameter.nu_zuschlag),
        zeitwert_faktor: new Decimal(daten.parameter.zeitwert_faktor),
        geraetezulage_default: new Decimal(daten.parameter.geraetezulage_default),
      };

      onGeladen(daten.lv, neueWerte, neueParameter, daten.name);
      onMeldung(`Projekt geladen: ${daten.name} (gespeichert am ${new Date(daten.gespeichert_am).toLocaleString("de-DE")})`);
    } catch (err) {
      onMeldung(`Laden fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [onGeladen, onMeldung]);

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={handleSpeichern} style={btnStyle("#2563eb")}>
        Projekt speichern
      </button>
      <button onClick={handleLaden} style={btnStyle("#6366f1")}>
        Projekt laden
      </button>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: "6px 14px", background: bg, color: "#fff", border: "none",
    borderRadius: 5, fontSize: 12, cursor: "pointer",
  };
}
