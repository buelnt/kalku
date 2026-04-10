/**
 * Korrektur-Workflow — Sammel-Dialog beim Projektabschluss
 *
 * Zeigt alle Positionen, deren Werte vom Gewerk-Default abweichen.
 * Pro Zeile zwei Häkchen:
 * - "Für diesen Kunden als Vorgabe speichern"
 * - "Global als neuen Default speichern"
 *
 * Bei Junior-Kalkulatoren landen globale Änderungen in der Approval-Queue.
 */
import React, { useState, useCallback } from "react";

interface Abweichung {
  oz: string;
  kurztext: string;
  feld: string;
  alterWert: number | undefined;
  neuerWert: number | undefined;
}

interface KorrekturEntscheidung {
  oz: string;
  feld: string;
  fuerKunde: boolean;
  fuerGlobal: boolean;
  /** Neue Regel im Gehirn (kalk-regeln.json) erstellen */
  insGehirn: boolean;
}

interface KorrekturDialogProps {
  abweichungen: Abweichung[];
  onAbschliessen: (entscheidungen: KorrekturEntscheidung[]) => void;
  onAbbrechen: () => void;
}

export function KorrekturDialog(props: KorrekturDialogProps): React.JSX.Element {
  const { abweichungen, onAbschliessen, onAbbrechen } = props;

  const [entscheidungen, setEntscheidungen] = useState<Map<string, { fuerKunde: boolean; fuerGlobal: boolean; insGehirn: boolean }>>(
    () => {
      const map = new Map<string, { fuerKunde: boolean; fuerGlobal: boolean; insGehirn: boolean }>();
      for (const a of abweichungen) {
        map.set(`${a.oz}:${a.feld}`, { fuerKunde: false, fuerGlobal: false, insGehirn: false });
      }
      return map;
    },
  );

  const handleToggle = useCallback((key: string, typ: "fuerKunde" | "fuerGlobal" | "insGehirn") => {
    setEntscheidungen((prev) => {
      const neu = new Map(prev);
      const existing = neu.get(key) ?? { fuerKunde: false, fuerGlobal: false, insGehirn: false };
      neu.set(key, { ...existing, [typ]: !existing[typ] });
      return neu;
    });
  }, []);

  const handleAbschliessen = useCallback(() => {
    const result: KorrekturEntscheidung[] = [];
    for (const a of abweichungen) {
      const key = `${a.oz}:${a.feld}`;
      const e = entscheidungen.get(key);
      if (e && (e.fuerKunde || e.fuerGlobal || e.insGehirn)) {
        result.push({
          oz: a.oz,
          feld: a.feld,
          fuerKunde: e.fuerKunde,
          fuerGlobal: e.fuerGlobal,
          insGehirn: e.insGehirn,
        });
      }
    }
    onAbschliessen(result);
  }, [abweichungen, entscheidungen, onAbschliessen]);

  if (abweichungen.length === 0) {
    return (
      <div style={overlayStyle}>
        <div style={dialogStyle}>
          <h2 style={{ marginBottom: 16 }}>Keine Abweichungen</h2>
          <p>Alle Werte entsprechen den Gewerk-Defaults. Nichts zu übernehmen.</p>
          <button onClick={onAbbrechen} style={btnStyle}>Schließen</button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...dialogStyle, maxWidth: 800, maxHeight: "80vh", overflow: "auto" }}>
        <h2 style={{ marginBottom: 8 }}>Korrekturen sichten</h2>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>
          {abweichungen.length} Werte weichen vom Default ab. Welche sollen als neue Vorgabe übernommen werden?
        </p>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th style={thStyle}>Position</th>
              <th style={thStyle}>Feld</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Alter Wert</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Neuer Wert</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Für Kunde</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Global</th>
              <th style={{ ...thStyle, textAlign: "center" }}>🧠 Gehirn</th>
            </tr>
          </thead>
          <tbody>
            {abweichungen.map((a) => {
              const key = `${a.oz}:${a.feld}`;
              const e = entscheidungen.get(key) ?? { fuerKunde: false, fuerGlobal: false, insGehirn: false };
              return (
                <tr key={key} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{a.oz}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{a.kurztext.slice(0, 40)}</div>
                  </td>
                  <td style={tdStyle}>{a.feld}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8" }}>
                    {a.alterWert?.toFixed(2) ?? "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "#059669" }}>
                    {a.neuerWert?.toFixed(2) ?? "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input type="checkbox" checked={e.fuerKunde} onChange={() => handleToggle(key, "fuerKunde")} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input type="checkbox" checked={e.fuerGlobal} onChange={() => handleToggle(key, "fuerGlobal")} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={e.insGehirn}
                      onChange={() => handleToggle(key, "insGehirn")}
                      title="Als neue Kalkulationsregel speichern — wird bei zukünftigen Kalkulationen automatisch angewendet"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onAbbrechen} style={{ ...btnStyle, background: "#94a3b8" }}>
            Abbrechen
          </button>
          <button onClick={handleAbschliessen} style={btnStyle}>
            {entscheidungen.size > 0 ? "Übernehmen und abschließen" : "Ohne Übernahme abschließen"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const dialogStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 12, padding: 24, minWidth: 400,
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
};
const thStyle: React.CSSProperties = {
  padding: "8px 8px", textAlign: "left", fontWeight: 600, fontSize: 11,
  color: "#475569", borderBottom: "2px solid #e2e8f0",
};
const tdStyle: React.CSSProperties = { padding: "6px 8px" };
const btnStyle: React.CSSProperties = {
  padding: "8px 20px", background: "#2563eb", color: "#fff", border: "none",
  borderRadius: 6, fontSize: 13, cursor: "pointer",
};
