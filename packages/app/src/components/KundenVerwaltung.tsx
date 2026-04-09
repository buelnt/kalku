import { VORGABEN_PFAD } from "../pfade.js";
/**
 * Kunden-Verwaltung
 *
 * Ermöglicht das Anlegen, Bearbeiten und Auswählen von Kunden.
 * Jeder Kunde hat:
 * - Name
 * - OneDrive-Ordner (wo seine Ausschreibungen liegen)
 * - Angebote-Unterordner (Standard: 04_Angebote)
 * - Overrides (kundenspezifische Vorgabe-Überschreibungen)
 * - Notizen
 */
import React, { useState, useEffect, useCallback } from "react";

interface Kunde {
  id: string;
  name: string;
  ordner: string;
  angebote_unterordner: string;
  overrides: Record<string, unknown>;
  erstellt_am: string;
  notizen: string;
}

interface KundenDaten {
  version: string;
  kunden: Kunde[];
}

interface KundenVerwaltungProps {
  onKundeGewaehlt: (kunde: Kunde) => void;
  aktuellerKunde?: string;
}

const KUNDEN_PFAD = `${VORGABEN_PFAD}/kunden.json`;

export function KundenVerwaltung(props: KundenVerwaltungProps): React.JSX.Element {
  const [daten, setDaten] = useState<KundenDaten | null>(null);
  const [laden, setLaden] = useState(true);
  const [neuerKunde, setNeuerKunde] = useState(false);
  const [formName, setFormName] = useState("");
  const [formOrdner, setFormOrdner] = useState("");
  const [formNotizen, setFormNotizen] = useState("");
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await window.baukalk.vorgabenLaden(KUNDEN_PFAD);
        if (raw) setDaten(raw as KundenDaten);
        else setDaten({ version: "1.0.0", kunden: [] });
      } catch {
        setDaten({ version: "1.0.0", kunden: [] });
      } finally {
        setLaden(false);
      }
    })();
  }, []);

  const handleKundeAnlegen = useCallback(async () => {
    if (!daten || !formName.trim()) return;
    const id = formName.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
    const neuer: Kunde = {
      id,
      name: formName.trim(),
      ordner: formOrdner.trim(),
      angebote_unterordner: "04_Angebote",
      overrides: {},
      erstellt_am: new Date().toISOString().slice(0, 10),
      notizen: formNotizen.trim(),
    };
    const neueDaten = { ...daten, kunden: [...daten.kunden, neuer] };
    await window.baukalk.vorgabenSpeichern(KUNDEN_PFAD, neueDaten);
    setDaten(neueDaten);
    setNeuerKunde(false);
    setFormName("");
    setFormOrdner("");
    setFormNotizen("");
    setGespeichert(true);
    setTimeout(() => setGespeichert(false), 2000);
  }, [daten, formName, formOrdner, formNotizen]);

  if (laden) return <p>Lade Kunden...</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Kunde auswählen</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {gespeichert && <span style={{ color: "#059669", fontSize: 13 }}>Gespeichert!</span>}
          <button
            onClick={() => setNeuerKunde(true)}
            style={btnStyle}
          >
            + Neuen Kunden anlegen
          </button>
        </div>
      </div>

      {/* Kunden-Liste */}
      {daten && daten.kunden.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {daten.kunden.map((k) => (
            <button
              key={k.id}
              onClick={() => props.onKundeGewaehlt(k)}
              style={{
                display: "block",
                width: "100%",
                padding: "12px 16px",
                textAlign: "left",
                border: props.aktuellerKunde === k.name ? "2px solid #2563eb" : "1px solid #e2e8f0",
                borderRadius: 8,
                background: props.aktuellerKunde === k.name ? "#eff6ff" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{k.name}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                {k.ordner ? `📁 ${k.ordner.split("/").pop()}` : "Kein Ordner zugeordnet"}
                {k.notizen ? ` — ${k.notizen}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}

      {daten && daten.kunden.length === 0 && !neuerKunde && (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>
          Noch keine Kunden angelegt. Klicke auf „+ Neuen Kunden anlegen".
        </p>
      )}

      {/* Neuen Kunden anlegen */}
      {neuerKunde && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Neuen Kunden anlegen</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={labelStyle}>Kundenname *</label>
              <input
                type="text"
                placeholder="z.B. Gesellchen GmbH"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>OneDrive-Ordner (optional)</label>
              <input
                type="text"
                placeholder="/Users/admin/Library/CloudStorage/OneDrive-kalku/KT01/..."
                value={formOrdner}
                onChange={(e) => setFormOrdner(e.target.value)}
                style={inputStyle}
              />
              <p style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                Wenn angegeben, werden Angebotspreise automatisch aus dem Ordner gelesen.
              </p>
            </div>
            <div>
              <label style={labelStyle}>Notizen</label>
              <input
                type="text"
                placeholder="z.B. Tiefbau, GaLaBau — Standardkunde"
                value={formNotizen}
                onChange={(e) => setFormNotizen(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleKundeAnlegen} style={btnStyle} disabled={!formName.trim()}>
                Anlegen
              </button>
              <button onClick={() => setNeuerKunde(false)} style={{ ...btnStyle, background: "#94a3b8" }}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none",
  borderRadius: 6, fontSize: 13, cursor: "pointer",
};
const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 8, padding: 20, border: "1px solid #e2e8f0",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0",
  borderRadius: 6, fontSize: 14,
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, color: "#64748b", marginBottom: 4,
};
