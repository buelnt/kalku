/**
 * Projekt-Start-Wizard
 *
 * Schrittweiser Ablauf:
 * 1. Ausschreibungsordner wählen → Auto-Erkennung Kunde + LV + Angebote
 * 2. LV importieren und Angebote scannen (mit Fortschrittsanzeige)
 * 3. Schicht 1 (Regeln) anwenden
 * 4. Schicht 2 (KI) für Lücken
 */
import React, { useState, useCallback } from "react";

interface ProjektInfo {
  ordnerPfad: string;
  ordnerName: string;
  kundenName: string;
  lvDateien: string[];
  angeboteOrdner: string | null;
  angeboteAnzahl: number;
  lieferanten: string[];
}

interface Props {
  onProjektGewaehlt: (info: ProjektInfo, lvPfad: string) => void;
}

export function ProjektStarten({ onProjektGewaehlt }: Props): React.JSX.Element {
  const [projektInfo, setProjektInfo] = useState<ProjektInfo | null>(null);
  const [gewaehlteLV, setGewaehlteLV] = useState<string>("");
  const [fehler, setFehler] = useState<string | null>(null);

  const handleOrdnerWaehlen = useCallback(async () => {
    try {
      const info = await window.baukalk.projektOrdnerWaehlen();
      if (!info) return;
      setProjektInfo(info);
      setFehler(null);
      // Erste LV-Datei automatisch vorauswählen
      if (info.lvDateien.length === 1) {
        setGewaehlteLV(info.lvDateien[0]!);
      } else if (info.lvDateien.length > 0) {
        // Bevorzuge .x83 Dateien
        const x83 = info.lvDateien.find((f) => f.toLowerCase().endsWith(".x83"));
        setGewaehlteLV(x83 ?? info.lvDateien[0]!);
      }
    } catch (err) {
      setFehler(String(err));
    }
  }, []);

  const handleStarten = useCallback(() => {
    if (!projektInfo || !gewaehlteLV) return;
    onProjektGewaehlt(projektInfo, gewaehlteLV);
  }, [projektInfo, gewaehlteLV, onProjektGewaehlt]);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, marginBottom: 20 }}>Neues Projekt starten</h2>

      {/* Schritt 1: Ordner wählen */}
      <div style={karteStyle}>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>1. Ausschreibungsordner wählen</h3>
        <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
          Wähle den Projektordner auf OneDrive (z.B. 260410_Grundschule_Pfaffenwoog).
          Das Tool erkennt automatisch den Kunden, das LV und die Angebote.
        </p>
        <button onClick={handleOrdnerWaehlen} style={btnStyle}>
          Ordner wählen...
        </button>
      </div>

      {/* Erkannte Informationen */}
      {projektInfo && (
        <div style={{ ...karteStyle, borderColor: "#86efac" }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Erkannt:</h3>

          <div style={infoZeileStyle}>
            <span style={labelStyle}>Projekt:</span>
            <strong>{projektInfo.ordnerName}</strong>
          </div>
          <div style={infoZeileStyle}>
            <span style={labelStyle}>Kunde:</span>
            <strong style={{ color: projektInfo.kundenName ? "#059669" : "#dc2626" }}>
              {projektInfo.kundenName || "Nicht erkannt — bitte manuell wählen"}
            </strong>
          </div>
          <div style={infoZeileStyle}>
            <span style={labelStyle}>LV-Dateien:</span>
            <span>{projektInfo.lvDateien.length} gefunden</span>
          </div>
          <div style={infoZeileStyle}>
            <span style={labelStyle}>Angebote:</span>
            <span style={{ color: projektInfo.angeboteAnzahl > 0 ? "#059669" : "#dc2626" }}>
              {projektInfo.angeboteAnzahl > 0
                ? `${projektInfo.angeboteAnzahl} Lieferanten (${projektInfo.lieferanten.slice(0, 5).join(", ")}${projektInfo.lieferanten.length > 5 ? "..." : ""})`
                : "Keine Angebote gefunden"}
            </span>
          </div>

          {/* LV-Datei auswählen */}
          {projektInfo.lvDateien.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <span style={labelStyle}>LV-Datei wählen:</span>
              <select
                value={gewaehlteLV}
                onChange={(e) => setGewaehlteLV(e.target.value)}
                style={{ marginLeft: 8, padding: "4px 8px", fontSize: 13, borderRadius: 4, border: "1px solid #e2e8f0" }}
              >
                {projektInfo.lvDateien.map((f) => (
                  <option key={f} value={f}>
                    {f.split("/").pop()}
                  </option>
                ))}
              </select>
            </div>
          )}

          {projektInfo.lvDateien.length === 1 && (
            <div style={infoZeileStyle}>
              <span style={labelStyle}>LV:</span>
              <code style={{ fontSize: 12, background: "#f1f5f9", padding: "2px 6px", borderRadius: 3 }}>
                {projektInfo.lvDateien[0]!.split("/").pop()}
              </code>
            </div>
          )}

          {projektInfo.lvDateien.length === 0 && (
            <div style={{ ...infoZeileStyle, color: "#dc2626" }}>
              Kein LV gefunden in 01_Pläne_u_Gaeb — bitte manuell importieren
            </div>
          )}
        </div>
      )}

      {/* Starten-Button */}
      {projektInfo && gewaehlteLV && (
        <button onClick={handleStarten} style={{ ...btnStyle, background: "#059669", fontSize: 15, padding: "12px 32px", width: "100%" }}>
          Kalkulation starten — LV importieren + Angebote scannen + Regeln anwenden
        </button>
      )}

      {fehler && (
        <div style={{ marginTop: 12, padding: 12, background: "#fef2f2", borderRadius: 8, color: "#dc2626", fontSize: 13 }}>
          {fehler}
        </div>
      )}
    </div>
  );
}

/** Fortschrittsanzeige für den Kalkulations-Ablauf */
export function KalkulationsFortschritt(props: {
  schritte: Array<{ label: string; status: "warten" | "aktiv" | "fertig" | "fehler"; detail?: string }>;
}): React.JSX.Element {
  return (
    <div style={{ maxWidth: 600, margin: "40px auto" }}>
      <h2 style={{ fontSize: 18, marginBottom: 20, textAlign: "center" }}>Kalkulation wird vorbereitet...</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {props.schritte.map((s, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 16px", borderRadius: 8,
              background: s.status === "aktiv" ? "#eff6ff" : s.status === "fertig" ? "#f0fdf4" : s.status === "fehler" ? "#fef2f2" : "#f8fafc",
              border: s.status === "aktiv" ? "1px solid #93c5fd" : "1px solid #e2e8f0",
            }}
          >
            <span style={{ fontSize: 18, width: 24 }}>
              {s.status === "fertig" ? "✅" : s.status === "aktiv" ? "⏳" : s.status === "fehler" ? "❌" : "⬜"}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: s.status === "aktiv" ? 600 : 400 }}>{s.label}</div>
              {s.detail && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const karteStyle: React.CSSProperties = {
  padding: 20, marginBottom: 16, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff",
};
const infoZeileStyle: React.CSSProperties = {
  display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 13,
};
const labelStyle: React.CSSProperties = { color: "#64748b", width: 100, flexShrink: 0 };
const btnStyle: React.CSSProperties = {
  padding: "10px 20px", background: "#2563eb", color: "#fff", border: "none",
  borderRadius: 8, fontSize: 14, cursor: "pointer",
};
