/**
 * Preisdatenbank-Editor
 *
 * Zeigt alle Material- und Entsorgungspreise editierbar an.
 * Senior-Kalkulatoren können Preise ändern, hinzufügen und löschen.
 */
import React, { useState, useEffect, useCallback } from "react";

interface PreisEintrag {
  suchbegriff: string;
  material: string;
  preis_pro_einheit: number;
  einheit: string;
  quelle: string;
  datum?: string;
  lieferant?: string;
}

interface PreisData {
  version: string;
  beschreibung: string;
  eintraege: PreisEintrag[];
}

interface Props {
  pfad: string;
  istSenior?: boolean;
}

export function PreisdatenbankEditor({ pfad, istSenior }: Props): React.JSX.Element {
  const [daten, setDaten] = useState<PreisData | null>(null);
  const [filter, setFilter] = useState("");
  const [gespeichert, setGespeichert] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const raw = await window.baukalk.vorgabenLaden(pfad);
      if (raw) setDaten(raw as PreisData);
    })();
  }, [pfad]);

  const handleSpeichern = useCallback(async () => {
    if (!daten) return;
    await window.baukalk.vorgabenSpeichern(pfad, daten);
    setGespeichert(true);
    setTimeout(() => setGespeichert(false), 2000);
  }, [daten, pfad]);

  const handleAendern = useCallback((idx: number, feld: keyof PreisEintrag, wert: string | number) => {
    setDaten((prev) => {
      if (!prev) return prev;
      const neueEintraege = [...prev.eintraege];
      neueEintraege[idx] = { ...neueEintraege[idx]!, [feld]: wert };
      return { ...prev, eintraege: neueEintraege };
    });
    setGespeichert(false);
  }, []);

  const handleLoeschen = useCallback((idx: number) => {
    setDaten((prev) => {
      if (!prev) return prev;
      return { ...prev, eintraege: prev.eintraege.filter((_, i) => i !== idx) };
    });
    setGespeichert(false);
  }, []);

  const handleNeu = useCallback(() => {
    setDaten((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        eintraege: [
          {
            suchbegriff: "neuer suchbegriff",
            material: "Neues Material",
            preis_pro_einheit: 0,
            einheit: "t",
            quelle: "Neu angelegt " + new Date().toISOString().slice(0, 10),
            datum: new Date().toISOString().slice(0, 10),
          },
          ...prev.eintraege,
        ],
      };
    });
    setEditIdx(0);
    setGespeichert(false);
  }, []);

  if (!daten) return <p>Lade Preisdatenbank...</p>;

  const gefiltert = daten.eintraege
    .map((e, i) => ({ ...e, _idx: i }))
    .filter((e) => {
      if (!filter) return true;
      const f = filter.toLowerCase();
      return e.suchbegriff.includes(f) || e.material.toLowerCase().includes(f) || e.quelle.toLowerCase().includes(f);
    });

  // Gruppiere: Entsorgung vs Material
  const entsorgung = gefiltert.filter((e) => e.suchbegriff.includes("entsorgung") || e.suchbegriff.includes("bm-"));
  const material = gefiltert.filter((e) => !e.suchbegriff.includes("entsorgung") && !e.suchbegriff.includes("bm-"));

  const renderTabelle = (titel: string, eintraege: typeof gefiltert, farbe: string) => (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, marginBottom: 8, color: farbe }}>{titel} ({eintraege.length})</h3>
      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={thStyle}>Suchbegriff</th>
              <th style={thStyle}>Material / Beschreibung</th>
              <th style={{ ...thStyle, width: 80, textAlign: "right" }}>Preis €</th>
              <th style={{ ...thStyle, width: 50 }}>Einheit</th>
              <th style={thStyle}>Quelle</th>
              <th style={{ ...thStyle, width: 80 }}>Datum</th>
              {istSenior && <th style={{ ...thStyle, width: 30 }}></th>}
            </tr>
          </thead>
          <tbody>
            {eintraege.map((e) => {
              const isEdit = editIdx === e._idx;
              return (
                <tr
                  key={e._idx}
                  onClick={() => setEditIdx(isEdit ? null : e._idx)}
                  style={{ borderBottom: "1px solid #f1f5f9", background: isEdit ? "#eff6ff" : undefined, cursor: "pointer" }}
                >
                  <td style={tdStyle}>
                    {isEdit && istSenior ? (
                      <input value={e.suchbegriff} onChange={(ev) => handleAendern(e._idx, "suchbegriff", ev.target.value)} onClick={(ev) => ev.stopPropagation()} style={editInput} />
                    ) : (
                      <code style={{ fontSize: 11, background: "#f1f5f9", padding: "1px 4px", borderRadius: 2 }}>{e.suchbegriff}</code>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {isEdit && istSenior ? (
                      <input value={e.material} onChange={(ev) => handleAendern(e._idx, "material", ev.target.value)} onClick={(ev) => ev.stopPropagation()} style={editInput} />
                    ) : e.material}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {isEdit && istSenior ? (
                      <input type="number" step="0.01" value={e.preis_pro_einheit} onChange={(ev) => handleAendern(e._idx, "preis_pro_einheit", parseFloat(ev.target.value) || 0)} onClick={(ev) => ev.stopPropagation()} style={{ ...editInput, width: 65, textAlign: "right" }} />
                    ) : (
                      <strong>{e.preis_pro_einheit.toFixed(2)}</strong>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {isEdit && istSenior ? (
                      <input value={e.einheit} onChange={(ev) => handleAendern(e._idx, "einheit", ev.target.value)} onClick={(ev) => ev.stopPropagation()} style={{ ...editInput, width: 40 }} />
                    ) : e.einheit}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 10, color: "#64748b" }}>{e.quelle}</td>
                  <td style={{ ...tdStyle, fontSize: 10, color: "#94a3b8" }}>{e.datum ?? "—"}</td>
                  {istSenior && (
                    <td style={tdStyle}>
                      {isEdit && (
                        <button onClick={(ev) => { ev.stopPropagation(); handleLoeschen(e._idx); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 14 }} title="Löschen">✕</button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, margin: 0 }}>Preisdatenbank 💰</h2>
          <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
            {daten.eintraege.length} Einträge — Material- und Entsorgungspreise
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {gespeichert && <span style={{ color: "#059669", fontSize: 13 }}>Gespeichert!</span>}
          {istSenior && (
            <button onClick={handleNeu} style={{ ...btnStyle, background: "#059669" }}>+ Neuer Preis</button>
          )}
          <button onClick={handleSpeichern} style={btnStyle}>Speichern</button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Suchen (Suchbegriff, Material, Quelle)..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ width: "100%", maxWidth: 400, padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, marginBottom: 16 }}
      />

      {renderTabelle("Entsorgungspreise", entsorgung, "#dc2626")}
      {renderTabelle("Materialpreise", material, "#2563eb")}

      <p style={{ fontSize: 11, color: "#94a3b8" }}>
        Klicke auf einen Eintrag zum Bearbeiten. Änderungen werden erst nach "Speichern" wirksam.
      </p>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 6px", textAlign: "left", fontWeight: 600, fontSize: 11,
  color: "#475569", borderBottom: "2px solid #e2e8f0", background: "#f1f5f9",
};
const tdStyle: React.CSSProperties = { padding: "4px 6px" };
const btnStyle: React.CSSProperties = {
  padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none",
  borderRadius: 6, fontSize: 13, cursor: "pointer",
};
const editInput: React.CSSProperties = {
  width: "100%", padding: "2px 4px", border: "1px solid #93c5fd",
  borderRadius: 3, fontSize: 11, background: "#eff6ff",
};
