import React, { useState } from "react";

type Seite = "projekte" | "kalkulation" | "vorgaben";

export function App(): React.JSX.Element {
  const [seite, setSeite] = useState<Seite>("projekte");

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Seitenleiste */}
      <nav
        style={{
          width: 220,
          background: "#1e293b",
          color: "#e2e8f0",
          padding: "20px 0",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "0 20px 20px",
            fontSize: 18,
            fontWeight: 700,
            borderBottom: "1px solid #334155",
          }}
        >
          BauKalk Pro
        </div>
        <NavItem
          label="Projekte"
          aktiv={seite === "projekte"}
          onClick={() => setSeite("projekte")}
        />
        <NavItem
          label="Kalkulation"
          aktiv={seite === "kalkulation"}
          onClick={() => setSeite("kalkulation")}
        />
        <NavItem
          label="Vorgaben"
          aktiv={seite === "vorgaben"}
          onClick={() => setSeite("vorgaben")}
        />
        <div style={{ flex: 1 }} />
        <div
          style={{
            padding: "10px 20px",
            fontSize: 11,
            color: "#64748b",
          }}
        >
          v0.1.0 — kalku.de
        </div>
      </nav>

      {/* Hauptbereich */}
      <main
        style={{
          flex: 1,
          padding: 32,
          overflow: "auto",
          background: "#f8fafc",
        }}
      >
        {seite === "projekte" && <ProjekteListe />}
        {seite === "kalkulation" && <KalkulationsPlatzhalter />}
        {seite === "vorgaben" && <VorgabenPlatzhalter />}
      </main>
    </div>
  );
}

function NavItem(props: {
  label: string;
  aktiv: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      onClick={props.onClick}
      style={{
        display: "block",
        width: "100%",
        padding: "12px 20px",
        textAlign: "left",
        border: "none",
        background: props.aktiv ? "#334155" : "transparent",
        color: props.aktiv ? "#fff" : "#94a3b8",
        fontSize: 14,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {props.label}
    </button>
  );
}

function ProjekteListe(): React.JSX.Element {
  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Projekte</h1>
      <p style={{ color: "#64748b", marginBottom: 24 }}>
        Hier werden deine Kalkulationsprojekte angezeigt. Importiere ein LV, um
        ein neues Projekt zu starten.
      </p>
      <button
        style={{
          padding: "10px 20px",
          background: "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        + Neues Projekt anlegen
      </button>
    </div>
  );
}

function KalkulationsPlatzhalter(): React.JSX.Element {
  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Kalkulation</h1>
      <p style={{ color: "#64748b" }}>
        Wähle ein Projekt aus der Projekt-Liste, um die Kalkulation zu öffnen.
      </p>
    </div>
  );
}

function VorgabenPlatzhalter(): React.JSX.Element {
  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Vorgaben</h1>
      <p style={{ color: "#64748b", marginBottom: 16 }}>
        Admin-Panel für Gewerk-Defaults, Kalkulationsprofile, Modifier-Keywords
        und Plausi-Regeln.
      </p>
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 20,
          border: "1px solid #e2e8f0",
        }}
      >
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Geladene Vorgaben</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          <li style={{ padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
            6 Gewerk-Kategorien (Rohbau → Sondergewerke)
          </li>
          <li style={{ padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
            54 Default-Zeitwerte (Rohbau)
          </li>
          <li style={{ padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
            3 Kalkulationsprofile (Scharf / Normal / Großzügig)
          </li>
          <li style={{ padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
            10 Plausi-Regeln (R001-R010)
          </li>
          <li style={{ padding: "6px 0" }}>
            4 Modifier-Kategorien (NU-Trigger, Erschwernis, Vorhalte, Arbeitsleistung)
          </li>
        </ul>
      </div>
    </div>
  );
}
