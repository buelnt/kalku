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
import { autoBefuellung, wendeModifierAn, scanModifier, bildePositionsGruppen, type ModifierKeywords, type PositionsGruppe } from "@baukalk/kern";
import { VorgabenEditor } from "./components/VorgabenEditor.js";
import { ProjektSpeichern } from "./components/ProjektSpeichern.js";
import { KorrekturDialog } from "./components/KorrekturDialog.js";
import { KundenVerwaltung } from "./components/KundenVerwaltung.js";
import { NutzerAuswahl, type Nutzer } from "./components/NutzerAuswahl.js";

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
  const [zeigeKorrekturDialog, setZeigeKorrekturDialog] = useState(false);
  const [initialWerte, setInitialWerte] = useState<Map<string, PositionRechenInput>>(new Map());
  const [kunde, setKunde] = useState("");
  const [quellenMapState, setQuellenMapState] = useState<Map<string, { quelle: string; farbe: string; beschreibung: string }>>(new Map());
  const [positionsGruppen, setPositionsGruppen] = useState<PositionsGruppe[]>([]);
  const [aktuellerNutzer, setAktuellerNutzer] = useState<Nutzer | null>(null);

  // Profil-Presets
  const profile = {
    scharf: { verrechnungslohn: 75, material_zuschlag: 20, nu_zuschlag: 20, zeitwert_faktor: -15, geraetezulage_default: 0.3 },
    normal: { verrechnungslohn: 90, material_zuschlag: 30, nu_zuschlag: 30, zeitwert_faktor: 0, geraetezulage_default: 0.5 },
    grosszuegig: { verrechnungslohn: 105, material_zuschlag: 40, nu_zuschlag: 40, zeitwert_faktor: 10, geraetezulage_default: 0.75 },
  };

  // Parameter-State (editierbar)
  const [parameterForm, setParameterForm] = useState(profile.normal);
  const [aktivProfil, setAktivProfil] = useState<"scharf" | "normal" | "grosszuegig">("normal");

  // ─── LV Importieren ───
  const handleImport = useCallback(async () => {
    try {
      setMeldung("Importiere LV...");
      const lv = await window.baukalk.lvImportieren();
      if (!lv) {
        setMeldung(null);
        return;
      }

      // Preisdatenbank laden
      let preisdatenbank: Array<{ suchbegriff: string; material: string; preis_pro_einheit: number; einheit: string; quelle: string; datum: string; lieferant?: string }> = [];
      try {
        const pdRaw = await window.baukalk.vorgabenLaden(
          `${process.cwd()}/vorgaben/preisdatenbank.json`,
        );
        if (pdRaw && typeof pdRaw === "object" && "eintraege" in (pdRaw as Record<string, unknown>)) {
          preisdatenbank = (pdRaw as { eintraege: typeof preisdatenbank }).eintraege;
        }
      } catch { /* Preisdatenbank nicht verfügbar */ }

      // Auto-Befüllung mit Waterfall: Preisdatenbank → Vorgaben
      const werte = new Map<string, PositionRechenInput>();
      const quellenMap = new Map<string, { quelle: string; farbe: string; beschreibung: string }>();
      const treffer = autoBefuellung(lv.eintraege, preisdatenbank);
      let befuellt = 0;
      for (const t of treffer) {
        if (t.konfidenz !== "niedrig") {
          werte.set(t.oz, t.input);
          befuellt++;
          if (t.stoffe_quelle) {
            quellenMap.set(t.oz, {
              quelle: t.stoffe_quelle,
              farbe: t.stoffe_farbe ?? "grau",
              beschreibung: t.stoffe_beschreibung ?? t.quelle,
            });
          }
        }
      }

      // Modifier-Keywords anwenden (NU-Trigger, Vorhalte etc.)
      try {
        const kwRaw = await window.baukalk.vorgabenLaden(
          `${process.cwd()}/vorgaben/modifier-keywords.json`,
        );
        if (kwRaw) {
          const keywords = kwRaw as ModifierKeywords;
          for (const e of lv.eintraege) {
            if (e.art === "BEREICH") continue;
            const modTreffer = scanModifier(e.kurztext, e.langtext, e.einheit, keywords);
            if (modTreffer.length > 0) {
              const bestehendeWerte = werte.get(e.oz) ?? {};
              const ergebnis = wendeModifierAn(bestehendeWerte, modTreffer);
              if (ergebnis.aenderungen.length > 0) {
                werte.set(e.oz, ergebnis.input);
              }
            }
          }
        }
      } catch {
        // Modifier-Keywords nicht verfügbar — kein Fehler
      }

      const parameter: Parameter = {
        verrechnungslohn: new Decimal(parameterForm.verrechnungslohn),
        material_zuschlag: new Decimal(parameterForm.material_zuschlag).div(100),
        nu_zuschlag: new Decimal(parameterForm.nu_zuschlag).div(100),
        zeitwert_faktor: new Decimal(parameterForm.zeitwert_faktor),
        geraetezulage_default: new Decimal(parameterForm.geraetezulage_default),
      };

      // Initial-Werte, Quellen und Gruppen merken
      setInitialWerte(new Map(werte));
      setQuellenMapState(quellenMap);
      setPositionsGruppen(bildePositionsGruppen(lv.eintraege));

      setProjekt({
        name: lv.meta.original_datei,
        kunde: kunde,
        lv,
        werte,
        parameter,
      });
      setSeite("kalkulation");
      setMeldung(
        `${lv.anzahl_positionen} Positionen importiert, ${befuellt} automatisch kalkuliert aus Leitfaden-Vorgaben.`,
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
        const decimalWert = wert !== undefined ? new Decimal(wert) : undefined;

        // Wert für die geänderte Position setzen
        const existing = neueWerte.get(oz) ?? {};
        neueWerte.set(oz, { ...existing, [feld]: decimalWert });

        // Positions-Gruppen-Sperre: Auf alle Gruppenmitglieder propagieren
        for (const gruppe of positionsGruppen) {
          if (gruppe.mitglieder_oz.includes(oz)) {
            // Diese Position ist in einer Gruppe — Wert auf alle Mitglieder übertragen
            for (const mitgliedOz of gruppe.mitglieder_oz) {
              if (mitgliedOz === oz) continue; // sich selbst überspringen
              const mitgliedExisting = neueWerte.get(mitgliedOz) ?? {};
              neueWerte.set(mitgliedOz, { ...mitgliedExisting, [feld]: decimalWert });
            }
            break;
          }
        }

        return { ...prev, werte: neueWerte };
      });
    },
    [positionsGruppen],
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
          stoffe_ek: input.stoffe_ek != null ? Number(input.stoffe_ek) : null,
          zeit_min_roh: input.zeit_min_roh != null ? Number(input.zeit_min_roh) : null,
          geraetezulage_eur_h: input.geraetezulage_eur_h != null ? Number(input.geraetezulage_eur_h) : null,
          nu_ek: input.nu_ek != null ? Number(input.nu_ek) : null,
        };
      }

      const pfad = await window.baukalk.lvExportieren({
        lv: projekt.lv,
        parameter: {
          verrechnungslohn: Number(projekt.parameter.verrechnungslohn),
          material_zuschlag: Number(projekt.parameter.material_zuschlag),
          nu_zuschlag: Number(projekt.parameter.nu_zuschlag),
          zeitwert_faktor: Number(projekt.parameter.zeitwert_faktor),
          geraetezulage_default: Number(projekt.parameter.geraetezulage_default),
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

  // ─── GAEB Export ───
  const handleGaebExport = useCallback(async (mitPreisen: boolean) => {
    if (!projekt) return;
    try {
      setMeldung(`Exportiere GAEB ${mitPreisen ? "D84" : "D81"}...`);
      const werteRaw: Record<string, Record<string, number | null>> = {};
      for (const [oz, input] of projekt.werte) {
        werteRaw[oz] = {
          stoffe_ek: input.stoffe_ek != null ? Number(input.stoffe_ek) : null,
          zeit_min_roh: input.zeit_min_roh != null ? Number(input.zeit_min_roh) : null,
          geraetezulage_eur_h: input.geraetezulage_eur_h != null ? Number(input.geraetezulage_eur_h) : null,
          nu_ek: input.nu_ek != null ? Number(input.nu_ek) : null,
        };
      }
      const pfad = await window.baukalk.lvGaebExportieren({
        lv: projekt.lv,
        parameter: {
          verrechnungslohn: Number(projekt.parameter.verrechnungslohn),
          material_zuschlag: Number(projekt.parameter.material_zuschlag),
          nu_zuschlag: Number(projekt.parameter.nu_zuschlag),
          zeitwert_faktor: Number(projekt.parameter.zeitwert_faktor),
          geraetezulage_default: Number(projekt.parameter.geraetezulage_default),
        },
        werte_raw: werteRaw,
        mitPreisen,
        projektName: projekt.name,
        bieter: projekt.kunde || "kalku.de",
      });
      if (pfad) {
        setMeldung(`GAEB exportiert: ${pfad}`);
        setTimeout(() => setMeldung(null), 5000);
      } else { setMeldung(null); }
    } catch (err) {
      setMeldung(`GAEB-Export-Fehler: ${err instanceof Error ? err.message : String(err)}`);
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
      {/* Nutzer-Auswahl beim Start */}
      {!aktuellerNutzer && (
        <NutzerAuswahl onGewaehlt={setAktuellerNutzer} />
      )}

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
          {aktuellerNutzer ? `${aktuellerNutzer.name} (${aktuellerNutzer.rolle === "senior" ? "Senior" : "Junior"})` : ""}
          <br />v0.1.0 — kalku.de
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
            aktivProfil={aktivProfil}
            onProfilWaehlen={(p) => {
              setAktivProfil(p);
              setParameterForm(profile[p]);
            }}
            kunde={kunde}
            onKundeAendern={setKunde}
          />
        )}
        {seite === "kalkulation" && projekt && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h1 style={{ fontSize: 20 }}>
                Kalkulation — {projekt.name}
              </h1>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <ProjektSpeichern
                  projektName={projekt.name}
                  kunde={projekt.kunde}
                  lv={projekt.lv}
                  werte={projekt.werte}
                  parameter={projekt.parameter}
                  onGeladen={(lv, w, p, n) => {
                    setProjekt({ name: n, kunde: "", lv, werte: w, parameter: p });
                  }}
                  onMeldung={setMeldung}
                />
                <button onClick={handleExport} style={exportBtnStyle}>
                  Excel
                </button>
                <button onClick={() => handleGaebExport(true)} style={{ ...exportBtnStyle, background: "#0891b2" }}>
                  GAEB D84
                </button>
                <button onClick={() => handleGaebExport(false)} style={{ ...exportBtnStyle, background: "#6366f1" }}>
                  GAEB D81
                </button>
                <button
                  onClick={() => setZeigeKorrekturDialog(true)}
                  style={{ ...exportBtnStyle, background: "#7c3aed" }}
                >
                  Abschließen
                </button>
              </div>
            </div>
            <LvEditor
              eintraege={projekt.lv.eintraege}
              parameter={projekt.parameter}
              werte={projekt.werte}
              onWertAendern={handleWertAendern}
              quellenMap={quellenMapState}
            />
            {/* Korrektur-Dialog */}
            {zeigeKorrekturDialog && (() => {
              // Abweichungen berechnen
              const abweichungen: Array<{
                oz: string; kurztext: string; feld: string;
                alterWert: number | undefined; neuerWert: number | undefined;
              }> = [];
              for (const e of projekt.lv.eintraege) {
                if (e.art === "BEREICH") continue;
                const init = initialWerte.get(e.oz) ?? {};
                const aktuell = projekt.werte.get(e.oz) ?? {};
                const felder = ["stoffe_ek", "zeit_min_roh", "geraetezulage_eur_h", "nu_ek"] as const;
                for (const feld of felder) {
                  const alt = init[feld] != null ? Number(init[feld]) : undefined;
                  const neu = aktuell[feld] != null ? Number(aktuell[feld]) : undefined;
                  if (alt !== neu && (alt !== undefined || neu !== undefined)) {
                    const feldLabel = feld === "stoffe_ek" ? "X Stoffe" : feld === "zeit_min_roh" ? "Y Zeit" : feld === "geraetezulage_eur_h" ? "Z Geräte" : "M NU";
                    abweichungen.push({
                      oz: e.oz, kurztext: e.kurztext, feld: feldLabel,
                      alterWert: alt, neuerWert: neu,
                    });
                  }
                }
              }
              return (
                <KorrekturDialog
                  abweichungen={abweichungen}
                  onAbschliessen={async (entscheidungen) => {
                    setZeigeKorrekturDialog(false);
                    const kundeCount = entscheidungen.filter((e) => e.fuerKunde).length;
                    const globalCount = entscheidungen.filter((e) => e.fuerGlobal).length;

                    // Global-Übernahmen in die Preisdatenbank schreiben
                    if (globalCount > 0) {
                      try {
                        const pdRaw = await window.baukalk.vorgabenLaden(
                          `${process.cwd()}/vorgaben/preisdatenbank.json`,
                        );
                        const pd = (pdRaw as { eintraege: Array<Record<string, unknown>> } | null) ?? { eintraege: [] };

                        for (const ent of entscheidungen) {
                          if (!ent.fuerGlobal) continue;
                          // Position finden
                          const pos = projekt.lv.eintraege.find((p) => p.oz === ent.oz);
                          if (!pos) continue;
                          const aktuelleWerte = projekt.werte.get(ent.oz);
                          if (!aktuelleWerte) continue;

                          // Neuen Eintrag in die Preisdatenbank
                          if (ent.feld === "X Stoffe" && aktuelleWerte.stoffe_ek) {
                            const woerter = pos.kurztext.toLowerCase().replace(/[^a-zäöüß0-9\s]/gi, "").split(/\s+/).filter((w: string) => w.length > 2).slice(0, 4);
                            pd.eintraege.push({
                              suchbegriff: woerter.join(" "),
                              material: pos.kurztext,
                              preis_pro_einheit: Number(aktuelleWerte.stoffe_ek),
                              einheit: pos.einheit ?? "",
                              quelle: `Kalkulation ${projekt.name}, ${new Date().toISOString().slice(0, 10)}`,
                              datum: new Date().toISOString().slice(0, 10),
                              lieferant: projekt.kunde,
                            });
                          }
                        }

                        await window.baukalk.vorgabenSpeichern(
                          `${process.cwd()}/vorgaben/preisdatenbank.json`,
                          { version: "1.0.0", beschreibung: "Interne Preisdatenbank", eintraege: pd.eintraege },
                        );
                      } catch (err) {
                        console.error("Preisdatenbank-Update fehlgeschlagen:", err);
                      }
                    }

                    setMeldung(
                      `Projekt abgeschlossen. ${kundeCount} Werte für Kunde übernommen, ${globalCount} in Preisdatenbank gespeichert.`,
                    );
                  }}
                  onAbbrechen={() => setZeigeKorrekturDialog(false)}
                />
              );
            })()}
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
  aktivProfil: "scharf" | "normal" | "grosszuegig";
  onProfilWaehlen: (p: "scharf" | "normal" | "grosszuegig") => void;
  kunde: string;
  onKundeAendern: (v: string) => void;
}): React.JSX.Element {
  const { parameterForm, onParameterAendern, aktivProfil, onProfilWaehlen, kunde, onKundeAendern } = props;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Neues Projekt</h1>

      {/* Kunde */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <KundenVerwaltung
          aktuellerKunde={kunde}
          onKundeGewaehlt={(k) => onKundeAendern(k.name)}
        />
      </div>

      {/* Profil-Auswahl */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Kalkulationsprofil</h2>
        <div style={{ display: "flex", gap: 12 }}>
          <ProfilBtn name="Scharf" id="scharf" aktiv={aktivProfil === "scharf"} beschreibung="Engster Preis — um den Auftrag zu gewinnen" onClick={() => onProfilWaehlen("scharf")} farbe="#dc2626" />
          <ProfilBtn name="Normal" id="normal" aktiv={aktivProfil === "normal"} beschreibung="Ausgewogener Standardansatz" onClick={() => onProfilWaehlen("normal")} farbe="#2563eb" />
          <ProfilBtn name="Großzügig" id="grosszuegig" aktiv={aktivProfil === "grosszuegig"} beschreibung="Komfortabler Preis — hohe Gewinnerwartung" onClick={() => onProfilWaehlen("grosszuegig")} farbe="#059669" />
        </div>
      </div>

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
  const [tab, setTab] = useState<"zeitwerte" | "plausi" | "modifier" | "profile" | "uebersicht">("zeitwerte");

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Vorgaben (Admin-Panel)</h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <TabBtn label="Zeitwerte" aktiv={tab === "zeitwerte"} onClick={() => setTab("zeitwerte")} />
        <TabBtn label="Plausi-Regeln" aktiv={tab === "plausi"} onClick={() => setTab("plausi")} />
        <TabBtn label="Modifier" aktiv={tab === "modifier"} onClick={() => setTab("modifier")} />
        <TabBtn label="Profile" aktiv={tab === "profile"} onClick={() => setTab("profile")} />
        <TabBtn label="Übersicht" aktiv={tab === "uebersicht"} onClick={() => setTab("uebersicht")} />
      </div>

      {tab === "zeitwerte" && (
        <VorgabenEditor vorgabenPfad={`${process.cwd()}/vorgaben/gewerke/rohbau.json`} />
      )}

      {tab === "plausi" && (
        <JsonEditor
          titel="Plausi-Regeln"
          pfad={`${process.cwd()}/vorgaben/plausi-regeln.json`}
          beschreibung="Deklarative Regeln die nach jeder Position geprüft werden (FAIL/WARN)."
        />
      )}

      {tab === "modifier" && (
        <JsonEditor
          titel="Modifier-Keywords"
          pfad={`${process.cwd()}/vorgaben/modifier-keywords.json`}
          beschreibung="NU-Trigger, Erschwernis-Trigger, Vorhalte-Trigger, Reine-Arbeitsleistung-Keywords."
        />
      )}

      {tab === "profile" && (
        <JsonEditor
          titel="Kalkulationsprofile"
          pfad={`${process.cwd()}/vorgaben/profile.json`}
          beschreibung="Scharf / Normal / Großzügig mit allen Parametersätzen."
        />
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

/** Einfacher JSON-Editor für beliebige Vorgaben-Dateien. */
function JsonEditor(props: { titel: string; pfad: string; beschreibung: string }): React.JSX.Element {
  const [json, setJson] = useState<string>("");
  const [laden, setLaden] = useState(true);
  const [gespeichert, setGespeichert] = useState(false);

  React.useEffect(() => {
    (async () => {
      const raw = await window.baukalk.vorgabenLaden(props.pfad);
      if (raw) setJson(JSON.stringify(raw, null, 2));
      setLaden(false);
    })();
  }, [props.pfad]);

  const handleSpeichern = async () => {
    try {
      const parsed = JSON.parse(json);
      await window.baukalk.vorgabenSpeichern(props.pfad, parsed);
      setGespeichert(true);
      setTimeout(() => setGespeichert(false), 2000);
    } catch (err) {
      alert(`JSON-Fehler: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (laden) return <p>Lade...</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, margin: 0 }}>{props.titel}</h2>
          <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>{props.beschreibung}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {gespeichert && <span style={{ color: "#059669", fontSize: 13 }}>Gespeichert!</span>}
          <button onClick={handleSpeichern} style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
            Speichern
          </button>
        </div>
      </div>
      <textarea
        value={json}
        onChange={(e) => { setJson(e.target.value); setGespeichert(false); }}
        style={{
          width: "100%", height: "calc(100vh - 280px)", padding: 12,
          fontFamily: "monospace", fontSize: 12, border: "1px solid #e2e8f0",
          borderRadius: 8, resize: "vertical", background: "#fafafa",
        }}
        spellCheck={false}
      />
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

function ProfilBtn(p: { name: string; id: string; aktiv: boolean; beschreibung: string; onClick: () => void; farbe: string }): React.JSX.Element {
  return (
    <button
      onClick={p.onClick}
      style={{
        flex: 1, padding: "12px 16px", border: `2px solid ${p.aktiv ? p.farbe : "#e2e8f0"}`,
        borderRadius: 8, background: p.aktiv ? `${p.farbe}10` : "#fff", cursor: "pointer",
        textAlign: "left", fontFamily: "inherit",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, color: p.aktiv ? p.farbe : "#1e293b" }}>{p.name}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{p.beschreibung}</div>
    </button>
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
