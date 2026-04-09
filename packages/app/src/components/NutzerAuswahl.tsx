/**
 * Nutzer-Auswahl beim App-Start
 *
 * Zeigt eine Liste der konfigurierten Nutzer mit ihrer Rolle.
 * Senior-Kalkulatoren haben Vollzugriff, Junioren können
 * Default-Änderungen nur als Vorschlag einreichen.
 */
import React, { useState, useEffect } from "react";

export interface Nutzer {
  id: string;
  name: string;
  email: string;
  rolle: "senior" | "junior";
}

interface NutzerAuswahlProps {
  onGewaehlt: (nutzer: Nutzer) => void;
}

const NUTZER_PFAD = `${typeof process !== "undefined" && process.cwd ? process.cwd() : "."}/vorgaben/nutzer.json`;

export function NutzerAuswahl(props: NutzerAuswahlProps): React.JSX.Element {
  const [nutzer, setNutzer] = useState<Nutzer[]>([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await window.baukalk.vorgabenLaden(NUTZER_PFAD);
        if (raw && typeof raw === "object" && "nutzer" in (raw as Record<string, unknown>)) {
          setNutzer((raw as { nutzer: Nutzer[] }).nutzer);
        }
      } catch { /* */ }
      finally { setLaden(false); }
    })();
  }, []);

  if (laden) return <p>Lade Nutzer...</p>;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: 32, minWidth: 400,
        boxShadow: "0 25px 50px rgba(0,0,0,0.25)", textAlign: "center",
      }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>BauKalk Pro</h1>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
          Wer kalkuliert heute?
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {nutzer.map((n) => (
            <button
              key={n.id}
              onClick={() => props.onGewaehlt(n)}
              style={{
                padding: "14px 20px", border: "1px solid #e2e8f0", borderRadius: 8,
                background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{n.name}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{n.email}</div>
              </div>
              <span style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: n.rolle === "senior" ? "#dbeafe" : "#fef3c7",
                color: n.rolle === "senior" ? "#1d4ed8" : "#92400e",
              }}>
                {n.rolle === "senior" ? "Senior" : "Junior"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
