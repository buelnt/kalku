/**
 * Kalkulationsregeln-Editor (Das "Gehirn")
 *
 * Zeigt alle 178+ Regeln aus kalk-regeln.json editierbar an.
 * Senior-Kalkulatoren können Regeln ändern, hinzufügen und löschen.
 * Jede Änderung wird mit Datum und Nutzer gespeichert.
 */
import React, { useState, useEffect, useCallback } from "react";

interface KalkRegel {
  id: string;
  keywords: string[];
  keywords_oder?: string[];
  keywords_nicht?: string[];
  X?: number;
  Y?: number;
  Z?: number;
  M?: number;
  quelle: string;
  begruendung: string;
}

interface KalkRegelnData {
  version: string;
  beschreibung: string;
  letzte_aenderung?: string;
  geaendert_von?: string;
  regeln: KalkRegel[];
}

interface Props {
  pfad: string;
  istSenior?: boolean;
}

export function KalkRegelnEditor({ pfad, istSenior }: Props): React.JSX.Element {
  const [daten, setDaten] = useState<KalkRegelnData | null>(null);
  const [filter, setFilter] = useState("");
  const [gespeichert, setGespeichert] = useState(false);
  const [editRegel, setEditRegel] = useState<string | null>(null);
  const [_neueRegel, _setNeueRegel] = useState(false); // Für Phase 2: Dialog

  useEffect(() => {
    (async () => {
      const raw = await window.baukalk.vorgabenLaden(pfad);
      if (raw) setDaten(raw as KalkRegelnData);
    })();
  }, [pfad]);

  const handleSpeichern = useCallback(async () => {
    if (!daten) return;
    const aktualisiert = {
      ...daten,
      letzte_aenderung: new Date().toISOString().slice(0, 10),
      geaendert_von: "Senior Kalkulator",
    };
    await window.baukalk.vorgabenSpeichern(pfad, aktualisiert);
    setDaten(aktualisiert);
    setGespeichert(true);
    setTimeout(() => setGespeichert(false), 2000);
  }, [daten, pfad]);

  const handleRegelAendern = useCallback((id: string, feld: string, wert: unknown) => {
    setDaten((prev) => {
      if (!prev) return prev;
      const neueRegeln = prev.regeln.map((r) => {
        if (r.id !== id) return r;
        if (feld === "keywords" || feld === "keywords_oder" || feld === "keywords_nicht") {
          return { ...r, [feld]: (wert as string).split(",").map((s) => s.trim()).filter(Boolean) };
        }
        if (feld === "X" || feld === "Y" || feld === "Z" || feld === "M") {
          const num = parseFloat(wert as string);
          if (isNaN(num) || (wert as string) === "") {
            const copy = { ...r };
            delete (copy as Record<string, unknown>)[feld];
            return copy;
          }
          return { ...r, [feld]: num };
        }
        return { ...r, [feld]: wert };
      });
      return { ...prev, regeln: neueRegeln };
    });
    setGespeichert(false);
  }, []);

  const handleRegelLoeschen = useCallback((id: string) => {
    setDaten((prev) => {
      if (!prev) return prev;
      return { ...prev, regeln: prev.regeln.filter((r) => r.id !== id) };
    });
    setGespeichert(false);
  }, []);

  const handleNeueRegel = useCallback(() => {
    setDaten((prev) => {
      if (!prev) return prev;
      const neueId = "R_" + String(prev.regeln.length + 1).padStart(3, "0") + "_neu";
      return {
        ...prev,
        regeln: [
          {
            id: neueId,
            keywords: ["neues keyword"],
            Y: 0,
            Z: 0.5,
            quelle: "Neue Regel",
            begruendung: "Bitte ausfüllen",
          },
          ...prev.regeln,
        ],
      };
    });
    _setNeueRegel(false);
    setGespeichert(false);
  }, []);

  if (!daten) return <p>Lade Regeln...</p>;

  const gefiltert = daten.regeln.filter((r) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      r.keywords.some((kw) => kw.includes(f)) ||
      r.quelle.toLowerCase().includes(f) ||
      r.begruendung.toLowerCase().includes(f) ||
      r.id.toLowerCase().includes(f)
    );
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, margin: 0 }}>Kalkulationsregeln — Das Gehirn 🧠</h2>
          <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
            {daten.regeln.length} Regeln | Letzte Änderung: {daten.letzte_aenderung ?? "unbekannt"} | Von: {daten.geaendert_von ?? "System"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {gespeichert && <span style={{ color: "#059669", fontSize: 13 }}>Gespeichert!</span>}
          {istSenior && (
            <button onClick={handleNeueRegel} style={{ ...btnStyle, background: "#059669" }}>
              + Neue Regel
            </button>
          )}
          <button onClick={handleSpeichern} style={btnStyle}>
            Speichern
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Regeln suchen (Keyword, Quelle, Begründung)..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ width: "100%", maxWidth: 400, padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, marginBottom: 12 }}
      />

      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "auto", maxHeight: "calc(100vh - 300px)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f1f5f9", position: "sticky", top: 0, zIndex: 5 }}>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Keywords (UND)</th>
              <th style={thStyle}>Keywords ODER</th>
              <th style={{ ...thStyle, width: 60, textAlign: "right" }}>Y min</th>
              <th style={{ ...thStyle, width: 60, textAlign: "right" }}>X €</th>
              <th style={{ ...thStyle, width: 50, textAlign: "right" }}>Z €/h</th>
              <th style={{ ...thStyle, width: 60, textAlign: "right" }}>M €</th>
              <th style={thStyle}>Quelle</th>
              {istSenior && <th style={{ ...thStyle, width: 30 }}></th>}
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((r) => {
              const isEdit = editRegel === r.id;
              return (
                <tr
                  key={r.id}
                  onClick={() => setEditRegel(isEdit ? null : r.id)}
                  style={{ borderBottom: "1px solid #f1f5f9", background: isEdit ? "#eff6ff" : undefined, cursor: "pointer" }}
                >
                  <td style={{ ...tdStyle, fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>{r.id}</td>
                  <td style={tdStyle}>
                    {isEdit && istSenior ? (
                      <input
                        value={r.keywords.join(", ")}
                        onChange={(e) => handleRegelAendern(r.id, "keywords", e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={editInputStyle}
                      />
                    ) : (
                      <span>{r.keywords.map((kw) => <span key={kw} style={tagStyle}>{kw}</span>)}</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {isEdit && istSenior ? (
                      <input
                        value={(r.keywords_oder ?? []).join(", ")}
                        onChange={(e) => handleRegelAendern(r.id, "keywords_oder", e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={editInputStyle}
                      />
                    ) : (
                      <span style={{ color: "#64748b" }}>{(r.keywords_oder ?? []).join(", ") || "—"}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {isEdit && istSenior ? (
                      <input
                        type="number" step="0.1" value={r.Y ?? ""}
                        onChange={(e) => handleRegelAendern(r.id, "Y", e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...editInputStyle, width: 55, textAlign: "right" }}
                      />
                    ) : (
                      <span style={{ fontWeight: r.Y ? 600 : 400 }}>{r.Y ?? "—"}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {isEdit && istSenior ? (
                      <input
                        type="number" step="0.1" value={r.X ?? ""}
                        onChange={(e) => handleRegelAendern(r.id, "X", e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...editInputStyle, width: 55, textAlign: "right" }}
                      />
                    ) : (
                      <span>{r.X ?? "—"}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {isEdit && istSenior ? (
                      <input
                        type="number" step="0.5" value={r.Z ?? ""}
                        onChange={(e) => handleRegelAendern(r.id, "Z", e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...editInputStyle, width: 45, textAlign: "right" }}
                      />
                    ) : (
                      <span>{r.Z ?? "—"}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {isEdit && istSenior ? (
                      <input
                        type="number" step="0.1" value={r.M ?? ""}
                        onChange={(e) => handleRegelAendern(r.id, "M", e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...editInputStyle, width: 55, textAlign: "right" }}
                      />
                    ) : (
                      <span>{r.M ?? "—"}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 10, color: "#64748b" }} title={r.begruendung}>
                    {r.quelle}
                  </td>
                  {istSenior && (
                    <td style={tdStyle}>
                      {isEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRegelLoeschen(r.id); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 14 }}
                          title="Regel löschen"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
        {gefiltert.length} von {daten.regeln.length} Regeln angezeigt. Klicke auf eine Regel zum Bearbeiten.
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
const tagStyle: React.CSSProperties = {
  display: "inline-block", background: "#e0e7ff", color: "#3730a3",
  padding: "1px 6px", borderRadius: 3, fontSize: 11, marginRight: 3,
};
const editInputStyle: React.CSSProperties = {
  width: "100%", padding: "2px 4px", border: "1px solid #93c5fd",
  borderRadius: 3, fontSize: 11, background: "#eff6ff",
};
