import { VORGABEN_PFAD } from "./pfade.js";
/**
 * BauKalk Pro — Haupt-App-Komponente
 *
 * Verkabelt alle Module: Import → Rechenkern → LV-Editor → Export.
 * Drei Seiten: Projekte, Kalkulation, Vorgaben.
 */
import React, { useState, useCallback, useMemo } from "react";
import { Decimal } from "@baukalk/datenmodell";
import type { LvImport, PositionRechenInput, Parameter } from "@baukalk/datenmodell";
import { LvEditor } from "./components/LvEditor.js";
import { wendeModifierAn, scanModifier, bildePositionsGruppen, extrahierePreise, wendeRegelnAn, type ModifierKeywords, type PositionsGruppe, type PreisdatenbankEintrag, type KalkRegel } from "@baukalk/kern";
import type { WertQuelle } from "@baukalk/datenmodell";
import { VorgabenEditor } from "./components/VorgabenEditor.js";
import { KalkRegelnEditor } from "./components/KalkRegelnEditor.js";
import { PreisdatenbankEditor } from "./components/PreisdatenbankEditor.js";
import { ProjektStarten, KalkulationsFortschritt } from "./components/ProjektStarten.js";
import { ProjektSpeichern } from "./components/ProjektSpeichern.js";
import { KorrekturDialog } from "./components/KorrekturDialog.js";
import { KundenVerwaltung } from "./components/KundenVerwaltung.js";
import { NutzerAuswahl, type Nutzer } from "./components/NutzerAuswahl.js";
import { ApprovalQueue } from "./components/ApprovalQueue.js";

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
  const [quellenDetailsState, setQuellenDetailsState] = useState<Map<string, WertQuelle[]>>(new Map());
  const [positionsGruppen, setPositionsGruppen] = useState<PositionsGruppe[]>([]);
  const [aktuellerNutzer, setAktuellerNutzer] = useState<Nutzer | null>(null);
  const [aktivePositionOz, setAktivePositionOz] = useState<string | null>(null);
  const [vergleichPositionOz, setVergleichPositionOz] = useState<string | null>(null);
  const [vergleichText, setVergleichText] = useState<string | null>(null);
  const [vergleichLaedt, setVergleichLaedt] = useState(false);
  const [fortschritt, setFortschritt] = useState<Array<{ label: string; status: "warten" | "aktiv" | "fertig" | "fehler"; detail?: string }>>([]);
  const [zeigeWizard, setZeigeWizard] = useState(false);
  const [_projektOrdner, setProjektOrdner] = useState<string>("");

  // Langtext der aktiven Position für Sidebar
  const aktivePosition = useMemo(() => {
    if (!aktivePositionOz || !projekt) return null;
    return projekt.lv.eintraege.find((e) => e.oz === aktivePositionOz) ?? null;
  }, [aktivePositionOz, projekt]);

  const vergleichPosition = useMemo(() => {
    if (!vergleichPositionOz || !projekt) return null;
    return projekt.lv.eintraege.find((e) => e.oz === vergleichPositionOz) ?? null;
  }, [vergleichPositionOz, projekt]);

  // Position-Klick-Handler: Normal = aktive Position, Shift = Vergleich
  const handlePositionKlick = useCallback((oz: string, shift?: boolean) => {
    if (shift && aktivePositionOz && oz !== aktivePositionOz) {
      setVergleichPositionOz(oz);
      setVergleichText(null);
      setVergleichLaedt(true);
      // KI-Vergleich starten
      const posA = projekt?.lv.eintraege.find((e) => e.oz === aktivePositionOz);
      const posB = projekt?.lv.eintraege.find((e) => e.oz === oz);
      if (posA && posB) {
        window.baukalk.kiAnalysieren(
          [{ oz: "vergleich", kurztext: "VERGLEICH", langtext: "" }],
          {
            gewerk: "vergleich",
            verrechnungslohn: 0,
            material_zuschlag: 0,
            nu_zuschlag: 0,
            // Spezial-Modus: Vergleichsdaten in den Kontext packen
            vergleich: {
              posA: { oz: posA.oz, kurztext: posA.kurztext, langtext: posA.langtext, einheit: posA.einheit, menge: posA.menge != null ? Number(posA.menge) : undefined },
              posB: { oz: posB.oz, kurztext: posB.kurztext, langtext: posB.langtext, einheit: posB.einheit, menge: posB.menge != null ? Number(posB.menge) : undefined },
            },
          } as unknown as Parameters<typeof window.baukalk.kiAnalysieren>[1],
        ).then((result) => {
          if (result?.ergebnisse?.[0]) {
            setVergleichText(String((result.ergebnisse[0] as unknown as Record<string, unknown>).vergleich_text ?? "Kein Vergleich verfügbar"));
          } else if (result?.fehler) {
            setVergleichText(`Fehler: ${result.fehler}`);
          }
          setVergleichLaedt(false);
        }).catch(() => {
          setVergleichText("KI-Vergleich fehlgeschlagen");
          setVergleichLaedt(false);
        });
      }
    } else {
      setAktivePositionOz(oz);
      setVergleichPositionOz(null);
      setVergleichText(null);
    }
  }, [aktivePositionOz, projekt]);

  // Profil-Presets
  const profile = {
    scharf: { verrechnungslohn: 75, material_zuschlag: 20, nu_zuschlag: 20, zeitwert_faktor: -15, geraetezulage_default: 0.3 },
    normal: { verrechnungslohn: 90, material_zuschlag: 30, nu_zuschlag: 30, zeitwert_faktor: 0, geraetezulage_default: 0.5 },
    grosszuegig: { verrechnungslohn: 105, material_zuschlag: 40, nu_zuschlag: 40, zeitwert_faktor: 10, geraetezulage_default: 0.75 },
  };

  // Parameter-State (editierbar)
  const [parameterForm, setParameterForm] = useState(profile.normal);
  const [aktivProfil, setAktivProfil] = useState<"scharf" | "normal" | "grosszuegig">("normal");

  // ─── Wizard: Projekt aus Ordner starten ───
  const handleWizardStart = useCallback(async (info: { ordnerPfad: string; kundenName: string; angeboteOrdner: string | null; lieferanten: string[] }, lvPfad: string) => {
    // Kunde setzen
    if (info.kundenName) setKunde(info.kundenName);
    setProjektOrdner(info.ordnerPfad);
    setZeigeWizard(false);

    type SchrittStatus = "warten" | "aktiv" | "fertig" | "fehler";
    const schritte: Array<{ label: string; status: SchrittStatus; detail?: string }> = [
      { label: "LV importieren", status: "aktiv", detail: lvPfad.split("/").pop() },
      { label: "Angebote scannen", status: "warten", detail: `${info.lieferanten.length} Lieferanten` },
      { label: "Preisdatenbank laden", status: "warten" },
      { label: "Leitfaden-Regeln anwenden (Schicht 1)", status: "warten" },
      { label: "KI berechnet verbleibende Positionen (Schicht 2)", status: "warten" },
      { label: "Fertig — Kalkulation bereit", status: "warten" },
    ];
    setFortschritt([...schritte]);
    setSeite("kalkulation");

    try {
      // Schritt 1: LV importieren
      const lv = await window.baukalk.lvImportierenDatei(lvPfad);
      if (!lv) { setFortschritt([]); return; }
      schritte[0]!.status = "fertig";
      schritte[0]!.detail = `${lv.anzahl_positionen} Positionen, ${lv.anzahl_bereiche} Bereiche`;
      schritte[1]!.status = "aktiv";
      setFortschritt([...schritte]);

      // Schritt 2: Angebote scannen
      let angebotePreise: PreisdatenbankEintrag[] = [];
      if (info.angeboteOrdner) {
        try {
          const angeboteDateien = await window.baukalk.angeboteScannen(info.angeboteOrdner);
          for (const ag of angeboteDateien) {
            const extPreise = extrahierePreise(ag.text, ag.lieferant);
            for (const ep of extPreise) {
              angebotePreise.push({
                suchbegriff: ep.material.toLowerCase().slice(0, 60),
                material: ep.material,
                preis_pro_einheit: ep.preis,
                einheit: ep.einheit,
                quelle: `Angebot ${ag.lieferant} (${ep.angebots_nr ?? ag.datei})`,
                datum: ep.datum ?? new Date().toISOString().slice(0, 10),
                lieferant: ag.lieferant,
              });
            }
          }
          schritte[1]!.detail = `${angeboteDateien.length} PDFs gelesen, ${angebotePreise.length} Preise extrahiert`;
        } catch { schritte[1]!.detail = "Keine Angebote lesbar"; }
      } else {
        schritte[1]!.detail = "Kein Angebote-Ordner";
      }
      schritte[1]!.status = "fertig";
      schritte[2]!.status = "aktiv";
      setFortschritt([...schritte]);

      // Schritt 3: Preisdatenbank laden
      let preisdatenbank: PreisdatenbankEintrag[] = [...angebotePreise];
      try {
        const pdRaw = await window.baukalk.vorgabenLaden(`${VORGABEN_PFAD}/preisdatenbank.json`);
        if (pdRaw && typeof pdRaw === "object" && "eintraege" in (pdRaw as Record<string, unknown>)) {
          const dbEintraege = (pdRaw as { eintraege: typeof preisdatenbank }).eintraege;
          preisdatenbank = [...angebotePreise, ...dbEintraege];
        }
      } catch {}
      schritte[2]!.status = "fertig";
      schritte[2]!.detail = `${preisdatenbank.length} Einträge (${angebotePreise.length} Angebote + ${preisdatenbank.length - angebotePreise.length} Stammdaten)`;
      schritte[3]!.status = "aktiv";
      setFortschritt([...schritte]);

      // Schritt 4: Regeln anwenden (Schicht 1)
      let kalkRegeln: KalkRegel[] = [];
      try {
        const regelRaw = await window.baukalk.vorgabenLaden(`${VORGABEN_PFAD}/kalk-regeln.json`);
        if (regelRaw && typeof regelRaw === "object" && "regeln" in (regelRaw as Record<string, unknown>)) {
          kalkRegeln = (regelRaw as { regeln: KalkRegel[] }).regeln;
        }
      } catch {}

      const werte = new Map<string, PositionRechenInput>();
      const quellenMap = new Map<string, { quelle: string; farbe: string; beschreibung: string }>();
      const quellenDetails = new Map<string, WertQuelle[]>();
      let befuellt = 0;

      const regelErgebnisse = wendeRegelnAn(lv.eintraege, kalkRegeln, preisdatenbank);
      for (const re of regelErgebnisse) {
        if (re.quellen.length > 0) {
          werte.set(re.oz, re.input);
          quellenDetails.set(re.oz, re.quellen);
          const hatAngebot = re.quellen.some((q) => q.quelle.toLowerCase().includes("angebot"));
          const hatFest = re.quellen.some((q) => q.konfidenz === "fest");
          quellenMap.set(re.oz, {
            quelle: re.quellen[0]?.quelle ?? "Leitfaden",
            farbe: hatAngebot ? "gruen" : hatFest ? "gelb" : "gelb",
            beschreibung: re.quellen.map((q) => `${q.feld}: ${q.begruendung}`).join(" | "),
          });
          if (re.abgedeckt) befuellt++;
        }
      }

      schritte[3]!.status = "fertig";
      schritte[3]!.detail = `${befuellt} Positionen durch ${kalkRegeln.length} Regeln abgedeckt (${Math.round(befuellt / lv.anzahl_positionen * 100)}%)`;
      schritte[4]!.status = "aktiv";
      setFortschritt([...schritte]);

      // Schritt 5: KI für Lücken
      const unbepreist = lv.eintraege.filter((e) => {
        if (e.art !== "NORMAL") return false;
        const re = regelErgebnisse.find((r) => r.oz === e.oz);
        return !re?.abgedeckt;
      });

      if (unbepreist.length > 0) {
        schritte[4]!.detail = `${unbepreist.length} Positionen an Claude API...`;
        setFortschritt([...schritte]);

        try {
          const kiPositionen = unbepreist.map((e) => ({
            oz: e.oz, kurztext: e.kurztext, langtext: e.langtext, einheit: e.einheit,
            menge: e.menge != null ? Number(e.menge) : undefined,
          }));
          const referenzPositionen = regelErgebnisse
            .filter((re) => re.abgedeckt)
            .slice(0, 30)
            .map((re) => {
              const pos = lv.eintraege.find((e) => e.oz === re.oz);
              const y = re.input.zeit_min_roh ? Number(re.input.zeit_min_roh) : 0;
              const x = re.input.stoffe_ek ? Number(re.input.stoffe_ek) : 0;
              const z = re.input.geraetezulage_eur_h ? Number(re.input.geraetezulage_eur_h) : 0;
              return `${re.oz}: ${pos?.kurztext ?? ""} → Y=${y} X=${x} Z=${z} (${re.quellen[0]?.quelle ?? ""})`;
            });

          const kiErgebnis = await window.baukalk.kiAnalysieren(kiPositionen, {
            verrechnungslohn: parameterForm.verrechnungslohn,
            material_zuschlag: parameterForm.material_zuschlag,
            nu_zuschlag: parameterForm.nu_zuschlag,
            referenz_positionen: referenzPositionen,
          } as unknown as Parameters<typeof window.baukalk.kiAnalysieren>[1]);

          if (kiErgebnis?.ergebnisse) {
            for (const ki of kiErgebnis.ergebnisse) {
              const kiTyped = ki as unknown as Record<string, unknown>;
              const oz = String(kiTyped.oz);

              // WICHTIG: Schicht-1-Werte haben Vorrang — KI darf nur Lücken füllen!
              const schicht1 = werte.get(oz) ?? {};
              const schicht1Q = quellenDetails.get(oz) ?? [];
              const s1X = schicht1Q.some((q) => q.feld === "stoffe_ek");
              const s1Y = schicht1Q.some((q) => q.feld === "zeit_min_roh");
              const s1Z = schicht1Q.some((q) => q.feld === "geraetezulage_eur_h");
              const s1M = schicht1Q.some((q) => q.feld === "nu_ek");

              werte.set(oz, {
                stoffe_ek: s1X ? schicht1.stoffe_ek : (kiTyped.stoffe_ek ? new Decimal(Number(kiTyped.stoffe_ek)) : undefined),
                zeit_min_roh: s1Y ? schicht1.zeit_min_roh : (kiTyped.zeit_min_roh ? new Decimal(Number(kiTyped.zeit_min_roh)) : undefined),
                geraetezulage_eur_h: s1Z ? schicht1.geraetezulage_eur_h : (kiTyped.geraetezulage_eur_h ? new Decimal(Number(kiTyped.geraetezulage_eur_h)) : undefined),
                nu_ek: s1M ? schicht1.nu_ek : (kiTyped.nu_ek ? new Decimal(Number(kiTyped.nu_ek)) : undefined),
              });
              quellenMap.set(oz, {
                quelle: "KI-Berechnung",
                farbe: "orange",
                beschreibung: String(kiTyped.zeit_begruendung ?? "") + " | " + String(kiTyped.stoffe_begruendung ?? ""),
              });
              // Quellen-Details pro Feld für Tooltips (nur für KI-Felder, nicht Schicht-1)
              const kiQuellen: WertQuelle[] = [...schicht1Q]; // Schicht-1-Quellen behalten!
              if (!s1Y && kiTyped.zeit_min_roh) kiQuellen.push({ feld: "zeit_min_roh", wert: Number(kiTyped.zeit_min_roh), quelle: "KI-Berechnung", begruendung: String(kiTyped.zeit_begruendung ?? ""), konfidenz: "geschaetzt" });
              if (!s1X && kiTyped.stoffe_ek) kiQuellen.push({ feld: "stoffe_ek", wert: Number(kiTyped.stoffe_ek), quelle: "KI-Berechnung", begruendung: String(kiTyped.stoffe_begruendung ?? ""), konfidenz: "geschaetzt" });
              if (!s1Z && kiTyped.geraetezulage_eur_h) kiQuellen.push({ feld: "geraetezulage_eur_h", wert: Number(kiTyped.geraetezulage_eur_h), quelle: "KI-Berechnung", begruendung: String(kiTyped.geraete_begruendung ?? ""), konfidenz: "geschaetzt" });
              if (!s1M && kiTyped.nu_ek) kiQuellen.push({ feld: "nu_ek", wert: Number(kiTyped.nu_ek), quelle: "KI-Berechnung", begruendung: String(kiTyped.nu_begruendung ?? ""), konfidenz: "geschaetzt" });
              if (kiQuellen.length > 0) quellenDetails.set(oz, kiQuellen);
              befuellt++;
            }
            schritte[4]!.detail = `${kiErgebnis.ergebnisse.length} Positionen berechnet in ${Math.round((kiErgebnis.dauer_ms ?? 0) / 1000)}s`;
          }
        } catch (kiErr) {
          schritte[4]!.detail = `Fehler: ${kiErr instanceof Error ? kiErr.message : String(kiErr)}`;
        }
      } else {
        schritte[4]!.detail = "Keine Lücken — alle durch Regeln abgedeckt!";
      }
      schritte[4]!.status = "fertig";
      schritte[5]!.status = "fertig";
      schritte[5]!.detail = `${befuellt} von ${lv.anzahl_positionen} Positionen kalkuliert`;
      setFortschritt([...schritte]);

      // Parameter + Projekt setzen
      const parameter: Parameter = {
        verrechnungslohn: new Decimal(parameterForm.verrechnungslohn),
        material_zuschlag: new Decimal(parameterForm.material_zuschlag).div(100),
        nu_zuschlag: new Decimal(parameterForm.nu_zuschlag).div(100),
        zeitwert_faktor: new Decimal(parameterForm.zeitwert_faktor),
        geraetezulage_default: new Decimal(parameterForm.geraetezulage_default),
      };

      setInitialWerte(new Map(werte));
      setQuellenMapState(quellenMap);
      setQuellenDetailsState(quellenDetails);
      setPositionsGruppen(bildePositionsGruppen(lv.eintraege));
      setProjekt({ name: lv.meta.original_datei, kunde: info.kundenName, lv, werte, parameter });

      // Fortschritt nach 3s ausblenden
      setTimeout(() => setFortschritt([]), 3000);

    } catch (err) {
      setMeldung(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
      setFortschritt([]);
    }
  }, [parameterForm]);

  // ─── LV Importieren (alter Flow, Fallback) ───
  const handleImport = useCallback(async () => {
    try {
      setMeldung("Importiere LV...");
      const lv = await window.baukalk.lvImportieren();
      if (!lv) {
        setMeldung(null);
        return;
      }

      // Schritt 1: Angebote aus Projekt-Ordner scannen (höchste Priorität)
      // Angebote liegen im gleichen Projektordner wie die LV-Datei, unter 04_Angebote
      let angebotePreise: PreisdatenbankEintrag[] = [];
      const importPfad = (lv as unknown as Record<string, unknown>)._importPfad as string | undefined;
      {
        // Projekt-Ordner ableiten: LV liegt in .../01_Pläne_u_Gaeb/ → Angebote in .../04_Angebote/
        let angeboteOrdner = "";
        if (importPfad) {
          const projektOrdner = importPfad.replace(/\/[^/]+\/[^/]+$/, ""); // 2 Ebenen hoch
          angeboteOrdner = `${projektOrdner}/04_Angebote`;
        } else if (kunde) {
          // Fallback: Kunden-Ordner aus kunden.json
          try {
            const kundenRaw = await window.baukalk.vorgabenLaden(`${VORGABEN_PFAD}/kunden.json`);
            if (kundenRaw) {
              const kunden = (kundenRaw as { kunden: Array<{ name: string; ordner: string; angebote_unterordner: string }> }).kunden;
              const aktuellerKunde = kunden.find((k) => k.name === kunde);
              if (aktuellerKunde?.ordner) {
                angeboteOrdner = `${aktuellerKunde.ordner}/${aktuellerKunde.angebote_unterordner || "04_Angebote"}`;
              }
            }
          } catch { /* Kunden nicht verfügbar */ }
        }
        if (angeboteOrdner) {
          setMeldung("Scanne Angebote aus Projekt-Ordner...");
          console.log("[APP] Angebote-Ordner:", angeboteOrdner);
          try {
            const angeboteDateien = await window.baukalk.angeboteScannen(angeboteOrdner);
            console.log("[APP] Angebote gefunden:", angeboteDateien.length, "PDFs");
            for (const ag of angeboteDateien) {
              const extPreise = extrahierePreise(ag.text, ag.lieferant);
              for (const ep of extPreise) {
                angebotePreise.push({
                  suchbegriff: ep.material.toLowerCase().slice(0, 60),
                  material: ep.material,
                  preis_pro_einheit: ep.preis,
                  einheit: ep.einheit,
                  quelle: `Angebot ${ag.lieferant} (${ep.angebots_nr ?? ag.datei})`,
                  datum: ep.datum ?? new Date().toISOString().slice(0, 10),
                  lieferant: ag.lieferant,
                });
              }
            }
            console.log("[APP] Extrahierte Preise aus Angeboten:", angebotePreise.length);
          } catch (angErr) {
            console.error("[APP] Angebote-Scan-Fehler:", angErr);
          }
        }
      }

      // Schritt 2: Preisdatenbank laden (zweite Priorität)
      let preisdatenbank: PreisdatenbankEintrag[] = [...angebotePreise];
      try {
        const pdRaw = await window.baukalk.vorgabenLaden(
          `${VORGABEN_PFAD}/preisdatenbank.json`,
        );
        if (pdRaw && typeof pdRaw === "object" && "eintraege" in (pdRaw as Record<string, unknown>)) {
          preisdatenbank = (pdRaw as { eintraege: typeof preisdatenbank }).eintraege;
        }
      } catch { /* Preisdatenbank nicht verfügbar */ }

      // ══════════════════════════════════════════════════════════════
      // SCHICHT 1: DETERMINISTISCHE REGEL-ENGINE (kein KI, kein Spielraum)
      // ══════════════════════════════════════════════════════════════
      const werte = new Map<string, PositionRechenInput>();
      const quellenMap = new Map<string, { quelle: string; farbe: string; beschreibung: string }>();
      const quellenDetails = new Map<string, WertQuelle[]>();
      let befuellt = 0;

      // Lade Kalkulationsregeln aus kalk-regeln.json
      let kalkRegeln: KalkRegel[] = [];
      try {
        const regelRaw = await window.baukalk.vorgabenLaden(`${VORGABEN_PFAD}/kalk-regeln.json`);
        if (regelRaw && typeof regelRaw === "object" && "regeln" in (regelRaw as Record<string, unknown>)) {
          kalkRegeln = (regelRaw as { regeln: KalkRegel[] }).regeln;
        }
      } catch { /* Regeln nicht verfügbar */ }

      // Angebote-Preise haben höchste Priorität → in Preisdatenbank vorne einfügen
      const vollePDB = [...angebotePreise, ...preisdatenbank];

      setMeldung(`Wende ${kalkRegeln.length} Leitfaden-Regeln an...`);
      console.log("[APP] Schicht 1: " + kalkRegeln.length + " Regeln, " + vollePDB.length + " PDB-Einträge");

      const regelErgebnisse = wendeRegelnAn(lv.eintraege, kalkRegeln, vollePDB);

      for (const re of regelErgebnisse) {
        if (re.quellen.length > 0) {
          werte.set(re.oz, re.input);
          quellenDetails.set(re.oz, re.quellen);

          // Farbe bestimmen
          const hatAngebot = re.quellen.some((q) => q.quelle.toLowerCase().includes("angebot"));
          const hatFest = re.quellen.some((q) => q.konfidenz === "fest");
          quellenMap.set(re.oz, {
            quelle: re.quellen[0]?.quelle ?? "Leitfaden",
            farbe: hatAngebot ? "gruen" : hatFest ? "gelb" : "gelb",
            beschreibung: re.quellen.map((q) => `${q.feld}: ${q.begruendung}`).join(" | "),
          });

          if (re.abgedeckt) befuellt++;
        }
      }

      console.log("[APP] Schicht 1 fertig: " + befuellt + " vollständig abgedeckt");

      // ══════════════════════════════════════════════════════════════
      // SCHICHT 2: KI nur für Positionen die Schicht 1 NICHT abdeckt
      // ══════════════════════════════════════════════════════════════
      const unbepreist = lv.eintraege.filter((e) => {
        if (e.art !== "NORMAL") return false;
        const re = regelErgebnisse.find((r) => r.oz === e.oz);
        return !re?.abgedeckt;
      });

      console.log("[APP] Schicht 2: " + unbepreist.length + " Positionen an KI");
      if (unbepreist.length > 0) {
        setMeldung(`Schicht 1: ${befuellt} Positionen aus Leitfaden. KI berechnet ${unbepreist.length} verbleibende...`);
        try {
          const kiPositionen = unbepreist.map((e) => ({
            oz: e.oz,
            kurztext: e.kurztext,
            langtext: e.langtext,
            einheit: e.einheit,
            menge: e.menge != null ? Number(e.menge) : undefined,
          }));

          // Bereits berechnete Positionen als Referenz für die KI mitgeben
          const referenzPositionen = regelErgebnisse
            .filter((re) => re.abgedeckt && re.quellen.length > 0)
            .slice(0, 30) // Max 30 Referenzen (Token sparen)
            .map((re) => {
              const pos = lv.eintraege.find((e) => e.oz === re.oz);
              const y = re.input.zeit_min_roh ? Number(re.input.zeit_min_roh) : 0;
              const x = re.input.stoffe_ek ? Number(re.input.stoffe_ek) : 0;
              const z = re.input.geraetezulage_eur_h ? Number(re.input.geraetezulage_eur_h) : 0;
              const quelle = re.quellen[0]?.quelle ?? "";
              return `${re.oz}: ${pos?.kurztext ?? ""} → Y=${y} X=${x} Z=${z} (${quelle})`;
            });

          const kiKontext = {
            gewerk: undefined as string | undefined,
            verrechnungslohn: parameterForm.verrechnungslohn,
            material_zuschlag: parameterForm.material_zuschlag,
            nu_zuschlag: parameterForm.nu_zuschlag,
            referenz_positionen: referenzPositionen,
          } as unknown as Parameters<typeof window.baukalk.kiAnalysieren>[1];

          const kiErgebnis = await window.baukalk.kiAnalysieren(kiPositionen, kiKontext);
          console.log("[APP] KI-Ergebnis:", JSON.stringify(kiErgebnis).substring(0, 200));

          if (kiErgebnis && kiErgebnis.ergebnisse) {
            for (const ki of kiErgebnis.ergebnisse) {
              // WICHTIG: KI-Werte mit Schicht-1-Werten MERGEN, nicht überschreiben!
              // Wenn Schicht 1 bereits X=0 (reine Arbeit) gesetzt hat, darf die KI das NICHT überschreiben.
              const schicht1 = werte.get(ki.oz) ?? {};
              const schicht1Quellen = quellenDetails.get(ki.oz) ?? [];
              const schicht1HatX = schicht1Quellen.some((q) => q.feld === "stoffe_ek");
              const schicht1HatY = schicht1Quellen.some((q) => q.feld === "zeit_min_roh");
              const schicht1HatZ = schicht1Quellen.some((q) => q.feld === "geraetezulage_eur_h");
              const schicht1HatM = schicht1Quellen.some((q) => q.feld === "nu_ek");

              werte.set(ki.oz, {
                // Schicht 1 hat Vorrang: wenn bereits ein Wert gesetzt wurde, NICHT überschreiben
                stoffe_ek: schicht1HatX ? schicht1.stoffe_ek : (ki.stoffe_ek ? new Decimal(ki.stoffe_ek) : undefined),
                zeit_min_roh: schicht1HatY ? schicht1.zeit_min_roh : (ki.zeit_min_roh ? new Decimal(ki.zeit_min_roh) : undefined),
                geraetezulage_eur_h: schicht1HatZ ? schicht1.geraetezulage_eur_h : (ki.geraetezulage_eur_h ? new Decimal(ki.geraetezulage_eur_h) : undefined),
                nu_ek: schicht1HatM ? schicht1.nu_ek : (ki.nu_ek ? new Decimal(ki.nu_ek) : undefined),
              });
              befuellt++;

              // Begründungen als Quellen-Info speichern
              const begruendungTeile = [];
              if (ki.zeit_begruendung) begruendungTeile.push(`Zeit: ${ki.zeit_begruendung}`);
              if (ki.stoffe_begruendung && ki.stoffe_begruendung !== "-") begruendungTeile.push(`Material: ${ki.stoffe_begruendung}`);
              if (ki.nu_begruendung && ki.nu_begruendung !== "-") begruendungTeile.push(`NU: ${ki.nu_begruendung}`);
              if (ki.geraete_begruendung) begruendungTeile.push(`Geräte: ${ki.geraete_begruendung}`);

              quellenMap.set(ki.oz, {
                quelle: "KI-Schätzung (Claude)",
                farbe: "orange",
                beschreibung: begruendungTeile.join(" | "),
              });
            }
          }
          if (kiErgebnis?.fehler) {
            setMeldung(`KI-Hinweis: ${kiErgebnis.fehler}`);
          }
        } catch (kiErr) {
          setMeldung(`KI nicht verfügbar: ${kiErr instanceof Error ? kiErr.message : String(kiErr)}. Positionen bleiben unbepreist.`);
        }
      }

      // Modifier-Keywords anwenden (NU-Trigger, Vorhalte etc.)
      try {
        const kwRaw = await window.baukalk.vorgabenLaden(
          `${VORGABEN_PFAD}/modifier-keywords.json`,
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
      setQuellenDetailsState(quellenDetails);
      setPositionsGruppen(bildePositionsGruppen(lv.eintraege));

      setProjekt({
        name: lv.meta.original_datei,
        kunde: kunde,
        lv,
        werte,
        parameter,
      });
      setSeite("kalkulation");

      const kiCount = quellenMap.size > 0 ? Array.from(quellenMap.values()).filter((q) => q.farbe === "orange").length : 0;
      const meldungTeile = [`${lv.anzahl_positionen} Positionen importiert, ${befuellt} automatisch kalkuliert`];
      if (kiCount > 0) meldungTeile.push(`(davon ${kiCount} via KI-Analyse)`);
      if (angebotePreise.length > 0) meldungTeile.push(`${angebotePreise.length} Preise aus Angeboten`);
      setMeldung(meldungTeile.join(". ") + ".");
      setTimeout(() => setMeldung(null), 5000);
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

    // Plausi-Hinweis: Null-Positionen warnen, aber Export erlauben
    let failCount = 0;
    for (const e of projekt.lv.eintraege) {
      if (e.art === "BEREICH") continue;
      const input = projekt.werte.get(e.oz) ?? {};
      const stoffe = input.stoffe_ek != null ? Number(input.stoffe_ek) : 0;
      const zeit = input.zeit_min_roh != null ? Number(input.zeit_min_roh) : 0;
      const nu = input.nu_ek != null ? Number(input.nu_ek) : 0;
      if (stoffe === 0 && zeit === 0 && nu === 0) failCount++;
    }
    if (failCount > 0) {
      setMeldung(
        `Hinweis: ${failCount} Positionen haben keine Werte (EP = 0,00 €) — werden rot markiert im Export.`,
      );
    }

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
        {/* Langtext der aktiven Position + Vergleich */}
        {aktivePosition && seite === "kalkulation" && (
          <div style={{
            margin: "8px 10px",
            padding: "10px 12px",
            background: "#1e293b",
            borderRadius: 6,
            fontSize: 11,
            lineHeight: 1.5,
            color: "#e2e8f0",
            overflow: "auto",
            flex: 1,
            minHeight: 0,
          }}>
            {/* Position A (aktiv — blau) */}
            <div style={{ fontWeight: 700, color: "#60a5fa", marginBottom: 4, fontSize: 12 }}>
              {aktivePosition.oz} — {aktivePosition.kurztext}
            </div>
            <div style={{ color: "#94a3b8", marginBottom: 4, fontSize: 10 }}>
              {aktivePosition.menge != null ? Number(aktivePosition.menge) : "–"} {aktivePosition.einheit ?? ""}
            </div>
            {aktivePosition.langtext ? (
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 8 }}>
                {aktivePosition.langtext}
              </div>
            ) : (
              <div style={{ color: "#64748b", fontStyle: "italic", marginBottom: 8 }}>Kein Langtext</div>
            )}

            {/* Vergleichs-Position B (Shift+Klick — gelb) */}
            {vergleichPosition && (
              <>
                <div style={{ borderTop: "1px solid #334155", paddingTop: 8, marginTop: 4 }}>
                  <div style={{ fontWeight: 700, color: "#fbbf24", marginBottom: 4, fontSize: 12 }}>
                    ↔ {vergleichPosition.oz} — {vergleichPosition.kurztext}
                  </div>
                  <div style={{ color: "#94a3b8", marginBottom: 4, fontSize: 10 }}>
                    {vergleichPosition.menge != null ? Number(vergleichPosition.menge) : "–"} {vergleichPosition.einheit ?? ""}
                  </div>
                  {vergleichPosition.langtext ? (
                    <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 8 }}>
                      {vergleichPosition.langtext}
                    </div>
                  ) : (
                    <div style={{ color: "#64748b", fontStyle: "italic", marginBottom: 8 }}>Kein Langtext</div>
                  )}
                </div>

                {/* KI-Vergleichsergebnis */}
                <div style={{ borderTop: "1px solid #334155", paddingTop: 8, marginTop: 4 }}>
                  <div style={{ fontWeight: 700, color: "#a78bfa", marginBottom: 4, fontSize: 11 }}>
                    🤖 KI-Analyse der Unterschiede
                  </div>
                  {vergleichLaedt ? (
                    <div style={{ color: "#94a3b8", fontStyle: "italic" }}>Analysiere Unterschiede...</div>
                  ) : vergleichText ? (
                    <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#c4b5fd" }}>
                      {vergleichText}
                    </div>
                  ) : null}
                </div>
              </>
            )}

            {/* Hinweis Shift+Klick */}
            {!vergleichPosition && (
              <div style={{ borderTop: "1px solid #334155", paddingTop: 6, marginTop: 4, color: "#475569", fontSize: 10 }}>
                💡 Shift+Klick auf eine andere Position für KI-Vergleich
              </div>
            )}
          </div>
        )}
        {!aktivePosition && seite === "kalkulation" && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
            <div style={{ fontSize: 11, color: "#475569", textAlign: "center" }}>
              Klicke auf eine Position um den Langtext hier anzuzeigen
              <br /><br />
              <span style={{ fontSize: 10 }}>Shift+Klick für Vergleich zweier Positionen</span>
            </div>
          </div>
        )}
        {seite !== "kalkulation" && <div style={{ flex: 1 }} />}
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

        {seite === "projekte" && !zeigeWizard && (
          <div>
            {/* Wizard-Start */}
            <div style={{ marginBottom: 24, padding: 20, background: "#eff6ff", borderRadius: 12, border: "2px solid #3b82f6" }}>
              <h2 style={{ fontSize: 18, margin: "0 0 8px", color: "#1e40af" }}>Projekt aus Ausschreibungsordner starten</h2>
              <p style={{ fontSize: 13, color: "#3b82f6", margin: "0 0 12px" }}>
                Wähle den Projektordner auf OneDrive — das Tool erkennt automatisch Kunde, LV und Angebote.
              </p>
              <button
                onClick={() => setZeigeWizard(true)}
                style={{ padding: "12px 24px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, cursor: "pointer" }}
              >
                Ausschreibungsordner wählen...
              </button>
            </div>

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
          </div>
        )}
        {seite === "projekte" && zeigeWizard && (
          <ProjektStarten onProjektGewaehlt={handleWizardStart} />
        )}
        {/* Fortschrittsanzeige während Kalkulation */}
        {fortschritt.length > 0 && !projekt && (
          <KalkulationsFortschritt schritte={fortschritt} />
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
              quellenDetails={quellenDetailsState}
              onPositionKlick={handlePositionKlick}
              aktivePositionOz={aktivePositionOz}
              vergleichPositionOz={vergleichPositionOz}
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
                          `${VORGABEN_PFAD}/preisdatenbank.json`,
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
                          `${VORGABEN_PFAD}/preisdatenbank.json`,
                          { version: "1.0.0", beschreibung: "Interne Preisdatenbank", eintraege: pd.eintraege },
                        );
                      } catch (err) {
                        console.error("Preisdatenbank-Update fehlgeschlagen:", err);
                      }
                    }

                    // Gehirn-Übernahmen in kalk-regeln.json schreiben
                    const gehirnCount = entscheidungen.filter((e) => e.insGehirn).length;
                    if (gehirnCount > 0) {
                      try {
                        const regelRaw = await window.baukalk.vorgabenLaden(`${VORGABEN_PFAD}/kalk-regeln.json`);
                        const regelData = (regelRaw as { version: string; beschreibung: string; regeln: Array<Record<string, unknown>> } | null)
                          ?? { version: "1.0.0", beschreibung: "Kalkulationsregeln", regeln: [] };

                        for (const ent of entscheidungen) {
                          if (!ent.insGehirn) continue;
                          const pos = projekt.lv.eintraege.find((p) => p.oz === ent.oz);
                          if (!pos) continue;
                          const aktuelleWerte = projekt.werte.get(ent.oz);
                          if (!aktuelleWerte) continue;

                          // Suchbegriffe aus Kurztext extrahieren
                          const keywords = pos.kurztext.toLowerCase()
                            .replace(/[^a-zäöüß0-9\s]/gi, "")
                            .split(/\s+/)
                            .filter((w: string) => w.length > 2)
                            .slice(0, 3);

                          const neueRegel: Record<string, unknown> = {
                            id: `R_korrektur_${Date.now()}`,
                            keywords,
                          };

                          // Alle aktuellen Werte in die Regel übernehmen
                          if (aktuelleWerte.stoffe_ek) neueRegel.X = Number(aktuelleWerte.stoffe_ek);
                          if (aktuelleWerte.zeit_min_roh) neueRegel.Y = Number(aktuelleWerte.zeit_min_roh);
                          if (aktuelleWerte.geraetezulage_eur_h) neueRegel.Z = Number(aktuelleWerte.geraetezulage_eur_h);
                          if (aktuelleWerte.nu_ek) neueRegel.M = Number(aktuelleWerte.nu_ek);

                          neueRegel.quelle = `Korrektur ${projekt.name}, ${new Date().toISOString().slice(0, 10)}`;
                          neueRegel.begruendung = `Korrektur durch Senior: ${pos.kurztext} — ${ent.feld} geändert`;

                          // Neue Regel an den ANFANG setzen (hat Vorrang vor alten Regeln)
                          regelData.regeln.unshift(neueRegel);
                        }

                        (regelData as Record<string, unknown>).letzte_aenderung = new Date().toISOString().slice(0, 10);
                        (regelData as Record<string, unknown>).geaendert_von = "Senior Kalkulator (Korrektur-Dialog)";

                        await window.baukalk.vorgabenSpeichern(`${VORGABEN_PFAD}/kalk-regeln.json`, regelData);
                      } catch (err) {
                        console.error("Gehirn-Update fehlgeschlagen:", err);
                      }
                    }

                    const teile = [];
                    if (kundeCount > 0) teile.push(`${kundeCount} für Kunde`);
                    if (globalCount > 0) teile.push(`${globalCount} in Preisdatenbank`);
                    if (gehirnCount > 0) teile.push(`${gehirnCount} neue Regeln im Gehirn 🧠`);
                    setMeldung(
                      `Projekt abgeschlossen. ${teile.join(", ") || "Keine Übernahmen."}`
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
        {seite === "vorgaben" && <VorgabenSeite nutzer={aktuellerNutzer} />}
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
function VorgabenSeite(props: { nutzer: Nutzer | null }): React.JSX.Element {
  const [tab, setTab] = useState<"zeitwerte" | "kalkregeln" | "preisdatenbank" | "plausi" | "modifier" | "profile" | "freigaben" | "uebersicht">("kalkregeln");

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Vorgaben (Admin-Panel)</h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <TabBtn label="Kalk-Regeln (Gehirn)" aktiv={tab === "kalkregeln"} onClick={() => setTab("kalkregeln")} />
        <TabBtn label="Preisdatenbank" aktiv={tab === "preisdatenbank"} onClick={() => setTab("preisdatenbank")} />
        <TabBtn label="Zeitwerte" aktiv={tab === "zeitwerte"} onClick={() => setTab("zeitwerte")} />
        <TabBtn label="Plausi-Regeln" aktiv={tab === "plausi"} onClick={() => setTab("plausi")} />
        <TabBtn label="Modifier" aktiv={tab === "modifier"} onClick={() => setTab("modifier")} />
        <TabBtn label="Profile" aktiv={tab === "profile"} onClick={() => setTab("profile")} />
        <TabBtn label="Freigaben" aktiv={tab === "freigaben"} onClick={() => setTab("freigaben")} />
        <TabBtn label="Übersicht" aktiv={tab === "uebersicht"} onClick={() => setTab("uebersicht")} />
      </div>

      {tab === "kalkregeln" && (
        <KalkRegelnEditor pfad={`${VORGABEN_PFAD}/kalk-regeln.json`} istSenior={props.nutzer?.rolle === "senior"} />
      )}

      {tab === "preisdatenbank" && (
        <PreisdatenbankEditor pfad={`${VORGABEN_PFAD}/preisdatenbank.json`} istSenior={props.nutzer?.rolle === "senior"} />
      )}

      {tab === "zeitwerte" && (
        <VorgabenEditor vorgabenPfad={`${VORGABEN_PFAD}/gewerke/rohbau.json`} />
      )}

      {tab === "plausi" && (
        <JsonEditor
          titel="Plausi-Regeln"
          pfad={`${VORGABEN_PFAD}/plausi-regeln.json`}
          beschreibung="Deklarative Regeln die nach jeder Position geprüft werden (FAIL/WARN)."
        />
      )}

      {tab === "modifier" && (
        <JsonEditor
          titel="Modifier-Keywords"
          pfad={`${VORGABEN_PFAD}/modifier-keywords.json`}
          beschreibung="NU-Trigger, Erschwernis-Trigger, Vorhalte-Trigger, Reine-Arbeitsleistung-Keywords."
        />
      )}

      {tab === "profile" && (
        <JsonEditor
          titel="Kalkulationsprofile"
          pfad={`${VORGABEN_PFAD}/profile.json`}
          beschreibung="Scharf / Normal / Großzügig mit allen Parametersätzen."
        />
      )}

      {tab === "freigaben" && (
        <ApprovalQueue
          istSenior={props.nutzer?.rolle === "senior"}
          nutzerName={props.nutzer?.name ?? "Unbekannt"}
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
  width: 300, background: "#1e293b", color: "#e2e8f0", padding: "20px 0",
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
