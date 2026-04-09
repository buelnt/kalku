/**
 * Approval-Queue — Senior genehmigt/lehnt Junior-Vorschläge ab
 *
 * Zeigt alle ausstehenden Default-Änderungsvorschläge von Junior-Kalkulatoren.
 * Senior kann pro Vorschlag:
 * - Genehmigen → Wert wird in die Vorgaben/Preisdatenbank übernommen
 * - Ablehnen → Vorschlag wird archiviert mit Begründung
 */
import React, { useState, useEffect, useCallback } from "react";

interface Vorschlag {
  id: string;
  vorgeschlagen_von: string;
  vorgeschlagen_am: string;
  oz: string;
  kurztext: string;
  feld: string;
  alter_wert: number | null;
  neuer_wert: number | null;
  begruendung: string;
  status: "pending" | "approved" | "rejected";
  entschieden_von?: string;
  entschieden_am?: string;
  entscheidung_kommentar?: string;
}

interface ApprovalQueueProps {
  istSenior: boolean;
  nutzerName: string;
}

const QUEUE_PFAD = `${typeof process !== "undefined" && process.cwd ? process.cwd() : "."}/vorgaben/approval-queue.json`;

export function ApprovalQueue(props: ApprovalQueueProps): React.JSX.Element {
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[]>([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await window.baukalk.vorgabenLaden(QUEUE_PFAD);
        if (raw && typeof raw === "object" && "vorschlaege" in (raw as Record<string, unknown>)) {
          setVorschlaege((raw as { vorschlaege: Vorschlag[] }).vorschlaege);
        }
      } catch { /* */ }
      finally { setLaden(false); }
    })();
  }, []);

  const handleEntscheidung = useCallback(async (id: string, genehmigt: boolean, kommentar?: string) => {
    const neueVorschlaege = vorschlaege.map((v) => {
      if (v.id !== id) return v;
      return {
        ...v,
        status: genehmigt ? "approved" as const : "rejected" as const,
        entschieden_von: props.nutzerName,
        entschieden_am: new Date().toISOString(),
        entscheidung_kommentar: kommentar ?? (genehmigt ? "Genehmigt" : "Abgelehnt"),
      };
    });
    setVorschlaege(neueVorschlaege);
    await window.baukalk.vorgabenSpeichern(QUEUE_PFAD, {
      version: "1.0.0",
      vorschlaege: neueVorschlaege,
    });
  }, [vorschlaege, props.nutzerName]);

  if (laden) return <p>Lade Approval-Queue...</p>;

  const ausstehend = vorschlaege.filter((v) => v.status === "pending");
  const abgeschlossen = vorschlaege.filter((v) => v.status !== "pending");

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>
        Freigabe-Warteschlange
        {ausstehend.length > 0 && (
          <span style={{ marginLeft: 8, padding: "2px 8px", background: "#fef3c7", color: "#92400e", borderRadius: 10, fontSize: 12 }}>
            {ausstehend.length} ausstehend
          </span>
        )}
      </h2>

      {!props.istSenior && (
        <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 16 }}>
          Als Junior-Kalkulator kannst du Änderungsvorschläge einsehen. Nur Senior-Kalkulatoren können genehmigen oder ablehnen.
        </p>
      )}

      {ausstehend.length === 0 && (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>Keine ausstehenden Vorschläge.</p>
      )}

      {ausstehend.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: 24 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                <th style={thStyle}>Position</th>
                <th style={thStyle}>Feld</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Alt</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Neu</th>
                <th style={thStyle}>Von</th>
                <th style={thStyle}>Datum</th>
                {props.istSenior && <th style={{ ...thStyle, textAlign: "center" }}>Aktion</th>}
              </tr>
            </thead>
            <tbody>
              {ausstehend.map((v) => (
                <tr key={v.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{v.oz}</div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{v.kurztext.slice(0, 30)}</div>
                  </td>
                  <td style={tdStyle}>{v.feld}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8" }}>{v.alter_wert?.toFixed(2) ?? "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{v.neuer_wert?.toFixed(2) ?? "—"}</td>
                  <td style={tdStyle}>{v.vorgeschlagen_von}</td>
                  <td style={{ ...tdStyle, fontSize: 10 }}>{new Date(v.vorgeschlagen_am).toLocaleDateString("de-DE")}</td>
                  {props.istSenior && (
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <button onClick={() => handleEntscheidung(v.id, true)} style={{ ...btnStyle, background: "#059669", marginRight: 4 }}>✓</button>
                      <button onClick={() => handleEntscheidung(v.id, false)} style={{ ...btnStyle, background: "#dc2626" }}>✗</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abgeschlossen.length > 0 && (
        <details>
          <summary style={{ fontSize: 13, color: "#64748b", cursor: "pointer", marginBottom: 8 }}>
            {abgeschlossen.length} abgeschlossene Vorschläge anzeigen
          </summary>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            {abgeschlossen.map((v) => (
              <div key={v.id} style={{ padding: "4px 0", borderBottom: "1px solid #f8fafc" }}>
                {v.oz} {v.feld}: {v.alter_wert} → {v.neuer_wert} —
                <span style={{ color: v.status === "approved" ? "#059669" : "#dc2626", fontWeight: 600 }}>
                  {v.status === "approved" ? " Genehmigt" : " Abgelehnt"}
                </span>
                {" von "}{v.entschieden_von} ({v.entscheidung_kommentar})
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Erstellt einen Vorschlag für die Queue (wird vom Korrektur-Dialog aufgerufen). */
export function erstelleVorschlag(
  nutzerName: string,
  oz: string,
  kurztext: string,
  feld: string,
  alterWert: number | null,
  neuerWert: number | null,
  begruendung: string,
): Vorschlag {
  return {
    id: `${Date.now()}_${oz}_${feld}`,
    vorgeschlagen_von: nutzerName,
    vorgeschlagen_am: new Date().toISOString(),
    oz,
    kurztext,
    feld,
    alter_wert: alterWert,
    neuer_wert: neuerWert,
    begruendung,
    status: "pending",
  };
}

const thStyle: React.CSSProperties = {
  padding: "8px 8px", textAlign: "left", fontWeight: 600, fontSize: 11,
  color: "#475569", borderBottom: "2px solid #e2e8f0",
};
const tdStyle: React.CSSProperties = { padding: "6px 8px" };
const btnStyle: React.CSSProperties = {
  padding: "4px 10px", color: "#fff", border: "none",
  borderRadius: 4, fontSize: 12, cursor: "pointer",
};
