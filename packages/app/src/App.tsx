/**
 * BauKalk Pro — Haupt-App-Komponente
 *
 * Verkabelt alle Module: Import → Rechenkern → LV-Editor → Export.
 * Drei Seiten: Projekte, Kalkulation, Vorgaben.
 */
import React, { useState, useCallback } from "react";
import { Decimal } from "@baukalk/datenmodell";
import type { LvImport, PositionRechenInput, Parameter } from "@baukalk/datenmodell";
import { LvEditor } from "./components/LvEditor.js";
import { VorgabenEditor } from "./components/VorgabenEditor.js";

type Seite = "projekte" | "kalkulation" | "vorgaben";

type ParamFeld = "verrechnungslohn" | "material_zuschlag" | "nu_zuschlag" | "zeitwert_faktor" | "geraetezulage_default";

interface ProjektState {
  name: string;
  kunde: string;
  lv: LvImport;
  werte: Map<string, PositionRechenInput>;
  parameter: Parameter;
}

export function App(): React.JSX.Element {
  const [seite, setSeite] = useState<Seite>("projekte");
  const [projekt, setProjekt] = useState<ProjektState | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  // Parameter-State (editierbar)
  const [parameterForm, setParameterForm] = useState({
    verrechnungslohn: 90,
    material_zuschlag: 30,
    nu_zuschlag: 30,
    zeitwert_faktor: 0,
    geraetezulage_default: 0.5,
  });

  // ─── LV Importieren ───
  const handleImport = useCallback(async () => {
    try {
      setMeldung("Importiere LV...");
      const lv = await window.baukalk.lvImportieren();
      if (!lv) {
        setMeldung(null);
        return;
      }

      // Leere Werte-Map erstellen
      const werte = new Map<string, PositionRechenInput>();

      const parameter: Parameter = {
        verrechnungslohn: new Decimal(parameterForm.verrechnungslohn),
        material_zuschlag: new Decimal(parameterForm.material_zuschlag).div(100),
        nu_zuschlag: new Decimal(parameterForm.nu_zuschlag).div(100),
        zeitwert_faktor: new Decimal(parameterForm.zeitwert_faktor),
        geraetezulage_default: new Decimal(parameterForm.geraetezulage_default),
      };

      setProjekt({
        name: lv.meta.original_datei,
        kunde: "",
        lv,
        werte,
        parameter,
      });
      setSeite("kalkulation");
      setMeldung(
        `${lv.anzahl_positionen} Positionen importiert aus ${lv.meta.original_datei}`,
      );
      setTimeout(() => setMeldung(null), 3000);
    } catch (err) {
      setMeldung(`Fehler beim Import: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [parameterForm]);

  // ─── Wert in einer Position ändern ───
  const handleWertAendern = useCallback(
    (oz: string, feld: keyof PositionRechenInput, wert: number | undefined) => {
      setProjekt((prev) => {
        if (!prev) return prev;
        const neueWerte = new Map(prev.werte);
        const existing = neueWerte.get(oz) ?? {};
        neueWerte.set(oz, {
          ...existing,
          [feld]: wert !== undefined ? new Decimal(wert) : undefined,
        });
        return { ...prev, werte: neueWerte };
      });
    },
    [],
  );

  // ─── Excel Export ───
  const handleExport = useCallback(async () => {
    if (!projekt) return;
    try {
      setMeldung("Exportiere Excel...");

      // Werte für IPC serialisieren (Decimal → number)
      const werteRaw: Record<string, Record<string, number | null>> = {};
      for (const [oz, input] of projekt.werte) {
        werteRaw[oz] = {
          stoffe_ek: input.stoffe_ek?.toNumber() ?? null,
          zeit_min_roh: input.zeit_min_roh?.toNumber() ?? null,
          geraetezulage_eur_h: input.geraetezulage_eur_h?.toNumber() ?? null,
          nu_ek: input.nu_ek?.toNumber() ?? null,
        };
      }

      const pfad = await window.baukalk.lvExportieren({
        lv: projekt.lv,
        parameter: {
          verrechnungslohn: projekt.parameter.verrechnungslohn.toNumber(),
          material_zuschlag: projekt.parameter.material_zuschlag.toNumber(),
          nu_zuschlag: projekt.parameter.nu_zuschlag.toNumber(),
          zeitwert_faktor: projekt.parameter.zeitwert_faktor.toNumber(),
          geraetezulage_default: projekt.parameter.geraetezulage_default.toNumber(),
        },
        werte_raw: werteRaw,
        meta: {
          auftraggeber: "",
          leistung: "",
          bauvorhaben: projekt.name,
          bieter: projekt.kunde || "kalku.de",
          mwst_satz: 0.19,
          personal: 3,
        },
      });

      if (pfad) {
        setMeldung(`Exportiert nach: ${pfad}`);
        setTimeout(() => setMeldung(null), 5000);
      } else {
        setMeldung(null);
      }
    } catch (err) {
      setMeldung(`Export-Fehler: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [projekt]);

  // ─── Parameter-Änderung ───
  const handleParameterAendern = useCallback(
    (feld: ParamFeld, wert: number) => {
      setParameterForm((prev) => ({ ...prev, [feld]: wert }));
      // Live-Update im Projekt
      setProjekt((prev) => {
        if (!prev) return prev;
        const neuerWert = feld === "material_zuschlag" || feld === "nu_zuschlag"
          ? new Decimal(wert).div(100)
          : new Decimal(wert);
        return {
          ...prev,
          parameter: { ...prev.parameter, [feld]: neuerWert },
        };
      });
    },
    [],
  );

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Seitenleiste */}
      <nav style={navStyle}>
        <div style={logoStyle}>BauKalk Pro</div>
        <NavItem label="Projekte" aktiv={seite === "projekte"} onClick={() => setSeite("projekte")} />
        <NavItem
          label="Kalkulation"
          aktiv={seite === "kalkulation"}
          onClick={() => setSeite("kalkulation")}
          deaktiviert={!projekt}
        />
        <NavItem label="Vorgaben" aktiv={seite === "vorgaben"} onClick={() => setSeite("vorgaben")} />
        <div style={{ flex: 1 }} />
        {projekt && (
          <div style={{ padding: "10px 20px", fontSize: 11, color: "#94a3b8", borderTop: "1px solid #334155" }}>
            Projekt: {projekt.name}
          </div>
        )}
        <div style={{ padding: "10px 20px", fontSize: 11, color: "#64748b" }}>
          v0.1.0 — kalku.de
        </div>
      </nav>

      {/* Hauptbereich */}
      <main style={mainStyle}>
        {/* Meldungsleiste */}
        {meldung && (
          <div style={meldungStyle}>
            {meldung}
            <button onClick={() => setMeldung(null)} style={meldungCloseStyle}>×</button>
          </div>
        )}

        {seite === "projekte" && (
          <ProjekteSeite
            onImport={handleImport}
            parameterForm={parameterForm}
            onParameterAendern={handleParameterAendern}
          />
        )}
        {seite === "kalkulation" && projekt && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h1 style={{ fontSize: 20 }}>
                Kalkulation — {projekt.name}
              </h1>
              <button onClick={handleExport} style={exportBtnStyle}>
                Als Excel exportieren
              </button>
            </div>
            <LvEditor
              eintraege={projekt.lv.eintraege}
              parameter={projekt.parameter}
              werte={projekt.werte}
              onWertAendern={handleWertAendern}
            />
          </div>
        )}
        {seite === "kalkulation" && !projekt && (
          <div>
            <h1 style={{ fontSize: 20, marginBottom: 16 }}>Kalkulation</h1>
            <p style={{ color: "#64748b" }}>
              Importiere zuerst ein LV unter „Projekte", um mit der Kalkulation zu beginnen.
            </p>
          </div>
        )}
        {seite === "vorgaben" && <VorgabenSeite />}
      </main>
    </div>
  );
}

// ─── Projekte-Seite ───
function ProjekteSeite(props: {
  onImport: () => void;
  parameterForm: { verrechnungslohn: number; material_zuschlag: number; nu_zuschlag: number; zeitwert_faktor: number; geraetezulage_default: number };
  onParameterAendern: (feld: ParamFeld, wert: number) => void;
}): React.JSX.Element {
  const { parameterForm, onParameterAendern } = props;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Neues Projekt</h1>

      {/* Parameter-Eingabe */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>Kalkulationsparameter</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <ParamInput
            label="Verrechnungslohn (€/h)"
            wert={parameterForm.verrechnungslohn}
            onChange={(v) => onParameterAendern("verrechnungslohn", v)}
          />
          <ParamInput
            label="Material-Zuschlag (%)"
            wert={parameterForm.material_zuschlag}
            onChange={(v) => onParameterAendern("material_zuschlag", v)}
          />
          <ParamInput
            label="NU-Zuschlag (%)"
            wert={parameterForm.nu_zuschlag}
            onChange={(v) => onParameterAendern("nu_zuschlag", v)}
          />
          <ParamInput
            label="Zeitwert-Faktor (%)"
            wert={parameterForm.zeitwert_faktor}
            onChange={(v) => onParameterAendern("zeitwert_faktor", v)}
          />
          <ParamInput
            label="Gerätezulage Default (€/h)"
            wert={parameterForm.geraetezulage_default}
            onChange={(v) => onParameterAendern("geraetezulage_default", v)}
            step={0.1}
          />
        </div>
      </div>

      {/* Import-Button */}
      <div style={{ marginTop: 24 }}>
        <button onClick={props.onImport} style={importBtnStyle}>
          LV importieren (Excel / GAEB)
        </button>
        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
          Unterstützt: .xlsx, .d83, .d84
        </p>
      </div>
    </div>
  );
}

// ─── Vorgaben-Seite ───
function VorgabenSeite(): React.JSX.Element {
  const [tab, setTab] = useState<"zeitwerte" | "uebersicht">("zeitwerte");

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Vorgaben (Admin-Panel)</h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <TabBtn label="Zeitwerte editieren" aktiv={tab === "zeitwerte"} onClick={() => setTab("zeitwerte")} />
        <TabBtn label="Übersicht" aktiv={tab === "uebersicht"} onClick={() => setTab("uebersicht")} />
      </div>

      {tab === "zeitwerte" && (
        <VorgabenEditor vorgabenPfad={`${process.cwd()}/vorgaben/gewerke/rohbau.json`} />
      )}

      {tab === "uebersicht" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <VorgabenKarte titel="Gewerk-Defaults" beschreibung="54 Zeitwerte für Rohbau/GaLaBau/Tiefbau" />
          <VorgabenKarte titel="Kalkulationsprofile" beschreibung="Scharf / Normal / Großzügig" />
          <VorgabenKarte titel="Modifier-Keywords" beschreibung="NU-Trigger, Erschwernis, Vorhalte, Arbeitsleistung" />
          <VorgabenKarte titel="Plausi-Regeln" beschreibung="10 deklarative Regeln (R001-R010)" />
          <VorgabenKarte titel="Konstanten" beschreibung="Schüttdichten, Beton-Preise, Umrechnungsfaktoren" />
          <VorgabenKarte titel="Preisquellen" beschreibung="Waterfall: Angebote → Stammdaten → Erfahrung → Web" />
        </div>
      )}
    </div>
  );
}

function TabBtn(p: { label: string; aktiv: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={p.onClick}
      style={{
        padding: "6px 16px", border: "1px solid #e2e8f0",
        borderRadius: 6, fontSize: 13, cursor: "pointer",
        background: p.aktiv ? "#2563eb" : "#fff",
        color: p.aktiv ? "#fff" : "#475569",
        fontFamily: "inherit",
      }}
    >
      {p.label}
    </button>
  );
}

function VorgabenKarte(props: { titel: string; beschreibung: string }): React.JSX.Element {
  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>{props.titel}</h3>
      <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>{props.beschreibung}</p>
    </div>
  );
}

// ─── Hilfs-Komponenten ───
function NavItem(p: { label: string; aktiv: boolean; onClick: () => void; deaktiviert?: boolean }): React.JSX.Element {
  return (
    <button
      onClick={p.onClick}
      disabled={p.deaktiviert}
      style={{
        display: "block", width: "100%", padding: "12px 20px", textAlign: "left",
        border: "none", background: p.aktiv ? "#334155" : "transparent",
        color: p.deaktiviert ? "#475569" : p.aktiv ? "#fff" : "#94a3b8",
        fontSize: 14, cursor: p.deaktiviert ? "default" : "pointer", fontFamily: "inherit",
        opacity: p.deaktiviert ? 0.5 : 1,
      }}
    >
      {p.label}
    </button>
  );
}

function ParamInput(p: { label: string; wert: number; onChange: (v: number) => void; step?: number }): React.JSX.Element {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
        {p.label}
      </label>
      <input
        type="number"
        step={p.step ?? 1}
        value={p.wert}
        onChange={(e) => p.onChange(parseFloat(e.target.value) || 0)}
        style={inputStyle}
      />
    </div>
  );
}

// ─── Styles ───
const navStyle: React.CSSProperties = {
  width: 220, background: "#1e293b", color: "#e2e8f0", padding: "20px 0",
  display: "flex", flexDirection: "column", flexShrink: 0,
};
const logoStyle: React.CSSProperties = {
  padding: "0 20px 20px", fontSize: 18, fontWeight: 700, borderBottom: "1px solid #334155",
};
const mainStyle: React.CSSProperties = {
  flex: 1, padding: 32, overflow: "auto", background: "#f8fafc",
};
const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 8, padding: 20, border: "1px solid #e2e8f0",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0",
  borderRadius: 6, fontSize: 14,
};
const importBtnStyle: React.CSSProperties = {
  padding: "12px 24px", background: "#2563eb", color: "#fff", border: "none",
  borderRadius: 6, fontSize: 15, cursor: "pointer", fontWeight: 600,
};
const exportBtnStyle: React.CSSProperties = {
  padding: "8px 16px", background: "#059669", color: "#fff", border: "none",
  borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 500,
};
const meldungStyle: React.CSSProperties = {
  padding: "10px 16px", background: "#dbeafe", borderRadius: 6, marginBottom: 16,
  fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center",
};
const meldungCloseStyle: React.CSSProperties = {
  background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#64748b",
};
