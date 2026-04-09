/**
 * Vorgaben-Editor (Admin-Panel)
 *
 * Liest die JSON-Vorgabendateien und zeigt sie editierbar an.
 * Änderungen werden direkt in die JSON-Dateien zurückgeschrieben.
 */
import React, { useState, useEffect, useCallback } from "react";

interface ZeitwertEintrag {
  key: string;
  label: string;
  einheit: string;
  wert: number;
  geraetezulage: number;
  referenz: string;
  kommentar?: string;
}

interface GewerkeVorgaben {
  id: string;
  name: string;
  default_zeitwerte: ZeitwertEintrag[];
  erschwernis_zuschlaege: unknown[];
  kleinmengen_schwellwerte: Record<string, number>;
  konstanten: Record<string, number>;
}

interface VorgabenEditorProps {
  vorgabenPfad: string;
}

export function VorgabenEditor(props: VorgabenEditorProps): React.JSX.Element {
  const [daten, setDaten] = useState<GewerkeVorgaben | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  const [filter, setFilter] = useState("");

  // Daten laden
  useEffect(() => {
    (async () => {
      try {
        const raw = await window.baukalk.vorgabenLaden(props.vorgabenPfad);
        if (raw) {
          setDaten(raw as GewerkeVorgaben);
        } else {
          setFehler("Datei nicht gefunden: " + props.vorgabenPfad);
        }
      } catch (err) {
        setFehler(String(err));
      } finally {
        setLaden(false);
      }
    })();
  }, [props.vorgabenPfad]);

  // Zeitwert ändern
  const handleZeitwertAendern = useCallback(
    (index: number, feld: "wert" | "geraetezulage", neuerWert: number) => {
      setDaten((prev) => {
        if (!prev) return prev;
        const neueZeitwerte = [...prev.default_zeitwerte];
        neueZeitwerte[index] = { ...neueZeitwerte[index]!, [feld]: neuerWert };
        return { ...prev, default_zeitwerte: neueZeitwerte };
      });
      setGespeichert(false);
    },
    [],
  );

  // Speichern
  const handleSpeichern = useCallback(async () => {
    if (!daten) return;
    try {
      await window.baukalk.vorgabenSpeichern(props.vorgabenPfad, daten);
      setGespeichert(true);
      setTimeout(() => setGespeichert(false), 2000);
    } catch (err) {
      setFehler("Speichern fehlgeschlagen: " + String(err));
    }
  }, [daten, props.vorgabenPfad]);

  if (laden) return <p>Lade Vorgaben...</p>;
  if (fehler) return <p style={{ color: "#dc2626" }}>Fehler: {fehler}</p>;
  if (!daten) return <p>Keine Daten</p>;

  // Filter
  const gefiltert = daten.default_zeitwerte.filter(
    (z) =>
      filter === "" ||
      z.label.toLowerCase().includes(filter.toLowerCase()) ||
      z.key.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>{daten.name}</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {gespeichert && <span style={{ color: "#059669", fontSize: 13 }}>Gespeichert!</span>}
          <button onClick={handleSpeichern} style={speichernBtnStyle}>
            Vorgaben speichern
          </button>
        </div>
      </div>

      {/* Filter */}
      <input
        type="text"
        placeholder="Zeitwerte filtern..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ ...inputStyle, marginBottom: 16, maxWidth: 300 }}
      />

      {/* Zeitwerte-Tabelle */}
      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={thStyle}>Leistung</th>
              <th style={{ ...thStyle, width: 80 }}>Einheit</th>
              <th style={{ ...thStyle, width: 100, textAlign: "right" }}>Zeitwert</th>
              <th style={{ ...thStyle, width: 100, textAlign: "right" }}>Geräte €/h</th>
              <th style={{ ...thStyle, width: 150 }}>Referenz</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((z) => {
              const realIdx = daten.default_zeitwerte.indexOf(z);
              return (
                <tr key={z.key} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={tdStyle} title={z.kommentar}>
                    {z.label}
                    {z.kommentar && <span style={{ color: "#94a3b8", fontSize: 11 }}> ({z.kommentar})</span>}
                  </td>
                  <td style={{ ...tdStyle, color: "#64748b" }}>{z.einheit}</td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.1"
                      value={z.wert}
                      onChange={(e) => handleZeitwertAendern(realIdx, "wert", parseFloat(e.target.value) || 0)}
                      style={tabellenInputStyle}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.5"
                      value={z.geraetezulage}
                      onChange={(e) => handleZeitwertAendern(realIdx, "geraetezulage", parseFloat(e.target.value) || 0)}
                      style={tabellenInputStyle}
                    />
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11, color: "#94a3b8" }}>{z.referenz}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
        {daten.default_zeitwerte.length} Einträge gesamt, {gefiltert.length} angezeigt
      </p>

      {/* Konstanten */}
      <h3 style={{ fontSize: 14, marginTop: 24, marginBottom: 12 }}>Umrechnungs-Konstanten</h3>
      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {Object.entries(daten.konstanten).map(([key, val]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f8fafc" }}>
              <span style={{ fontSize: 12 }}>{key.replace(/_/g, " ")}</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 12,
  color: "#475569", borderBottom: "2px solid #e2e8f0",
};
const tdStyle: React.CSSProperties = { padding: "4px 12px" };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0",
  borderRadius: 6, fontSize: 14,
};
const tabellenInputStyle: React.CSSProperties = {
  width: "100%", padding: "3px 6px", border: "1px solid #e2e8f0",
  borderRadius: 3, fontSize: 12, textAlign: "right",
};
const speichernBtnStyle: React.CSSProperties = {
  padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none",
  borderRadius: 6, fontSize: 13, cursor: "pointer",
};
