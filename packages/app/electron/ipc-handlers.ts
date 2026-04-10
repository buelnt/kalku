/**
 * IPC-Handler für Electron
 *
 * Brücke zwischen dem React-Frontend (Renderer) und Node.js (Main).
 * Hier laufen alle Datei-Operationen: Import, Export, Speichern, Laden.
 */
import { ipcMain, dialog, BrowserWindow } from "electron";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { execSync } from "node:child_process";
import { parseExcelLv, parseGaebD83, parseGaebXml } from "@baukalk/import";
import { exportGaebD84 } from "@baukalk/export";
import { exportExcelLv3 } from "@baukalk/export";
import type { ExportOptionen } from "@baukalk/export";
import { Decimal } from "@baukalk/datenmodell";
import type { LvImport, PositionRechenInput } from "@baukalk/datenmodell";

export function registerIpcHandlers(): void {
  // ─── Ausschreibungsordner wählen und analysieren ───
  ipcMain.handle("projekt:ordnerWaehlen", async (_event) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      title: "Ausschreibungsordner wählen",
      properties: ["openDirectory"],
      message: "Wähle den Projektordner der Ausschreibung (z.B. 260410_Grundschule_Pfaffenwoog)",
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const ordnerPfad = result.filePaths[0]!;
    const ordnerName = ordnerPfad.split("/").pop() ?? "";

    // Auto-Erkennung: Kundenname aus Ordnerstruktur
    // Pfad: .../KT01/1695_Gesellchen_GmbH/260410_Grundschule_Pfaffenwoog
    const pfadTeile = ordnerPfad.split("/");
    let kundenName = "";
    for (let i = 0; i < pfadTeile.length; i++) {
      // Kundenordner hat Format: 1234_Firmenname
      if (/^\d{4}_/.test(pfadTeile[i]!) && i < pfadTeile.length - 1) {
        kundenName = pfadTeile[i]!.replace(/^\d+_/, "").replace(/_/g, " ");
      }
    }

    // GAEB/LV-Dateien in 01_Pläne_u_Gaeb suchen
    const gaebOrdner = join(ordnerPfad, "01_Pläne_u_Gaeb");
    let lvDateien: string[] = [];
    if (existsSync(gaebOrdner)) {
      lvDateien = readdirSync(gaebOrdner)
        .filter((f) => /\.(x83|x84|x86|d83|d84|d81|xlsx)$/i.test(f))
        .map((f) => join(gaebOrdner, f));
    }

    // Angebote-Ordner prüfen
    const angeboteOrdner = join(ordnerPfad, "04_Angebote");
    let angeboteAnzahl = 0;
    let lieferanten: string[] = [];
    if (existsSync(angeboteOrdner)) {
      lieferanten = readdirSync(angeboteOrdner, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      angeboteAnzahl = lieferanten.length;
    }

    return {
      ordnerPfad,
      ordnerName,
      kundenName,
      lvDateien,
      angeboteOrdner: existsSync(angeboteOrdner) ? angeboteOrdner : null,
      angeboteAnzahl,
      lieferanten,
    };
  });

  // ─── LV Importieren (Datei direkt) ───
  ipcMain.handle("lv:importieren:datei", async (_event, pfad: string) => {
    const ext = extname(pfad).toLowerCase();
    let lv: LvImport;
    if (ext === ".xlsx" || ext === ".xls") {
      lv = parseExcelLv(pfad);
    } else if (ext === ".d83" || ext === ".d84" || ext === ".d81" || ext === ".d86") {
      lv = parseGaebD83(pfad);
    } else if (ext === ".x83" || ext === ".x84" || ext === ".x86" || ext === ".x81") {
      lv = parseGaebXml(pfad);
    } else {
      throw new Error(`Dateiformat "${ext}" wird nicht unterstützt.`);
    }
    const result2 = JSON.parse(JSON.stringify(lv, (_key, value) => {
      if (value && typeof value === "object" && value.constructor?.name === "Decimal") return Number(value.toString());
      return value;
    }));
    result2._importPfad = pfad;
    return result2;
  });

  // ─── LV Importieren (mit Dialog) ───
  ipcMain.handle("lv:importieren", async (_event) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      title: "Leistungsverzeichnis importieren",
      filters: [
        {
          name: "LV-Dateien",
          extensions: ["xlsx", "xls", "d83", "d84", "x83", "x84", "x86", "d81", "x81"],
        },
        { name: "Excel-Dateien", extensions: ["xlsx", "xls"] },
        { name: "GAEB-Dateien", extensions: ["d83", "d84", "x83", "x84", "x86"] },
        { name: "Alle Dateien", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const pfad = result.filePaths[0]!;
    const ext = extname(pfad).toLowerCase();

    let lv: LvImport;

    if (ext === ".xlsx" || ext === ".xls") {
      lv = parseExcelLv(pfad);
    } else if (ext === ".d83" || ext === ".d84" || ext === ".d81" || ext === ".d86") {
      lv = parseGaebD83(pfad);
    } else if (ext === ".x83" || ext === ".x84" || ext === ".x86" || ext === ".x81") {
      lv = parseGaebXml(pfad);
    } else {
      throw new Error(
        `Dateiformat "${ext}" wird noch nicht unterstützt. Unterstützt: .xlsx, .d83, .d84, .x83, .x84, .x86`,
      );
    }

    // Decimal-Instanzen in plain numbers konvertieren für IPC (structured clone)
    const result2 = JSON.parse(JSON.stringify(lv, (_key, value) => {
      if (value && typeof value === "object" && value.constructor?.name === "Decimal") {
        return Number(value.toString());
      }
      return value;
    }));
    // Dateipfad mitgeben damit der Renderer den Angebote-Ordner finden kann
    result2._importPfad = pfad;
    return result2;
  });

  // ─── Excel Exportieren ───
  ipcMain.handle(
    "lv:exportieren",
    async (_event, optionen: ExportOptionen & { werte_raw: Record<string, Record<string, number | null>> }) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return null;

      const result = await dialog.showSaveDialog(win, {
        title: "Kalkulation als Excel exportieren",
        defaultPath: `Kalkulation_${new Date().toISOString().slice(0, 10)}.xlsx`,
        filters: [{ name: "Excel-Dateien", extensions: ["xlsx"] }],
      });

      if (result.canceled || !result.filePath) return null;

      // Werte von rohen Zahlen zu Decimal konvertieren
      const werte = new Map<string, PositionRechenInput>();
      for (const [oz, raw] of Object.entries(optionen.werte_raw)) {
        werte.set(oz, {
          stoffe_ek: raw.stoffe_ek != null ? new Decimal(raw.stoffe_ek) : undefined,
          zeit_min_roh: raw.zeit_min_roh != null ? new Decimal(raw.zeit_min_roh) : undefined,
          geraetezulage_eur_h: raw.geraetezulage_eur_h != null ? new Decimal(raw.geraetezulage_eur_h) : undefined,
          nu_ek: raw.nu_ek != null ? new Decimal(raw.nu_ek) : undefined,
        });
      }

      // Parameter konvertieren
      const p = optionen.parameter as unknown as Record<string, number>;
      const parameter = {
        verrechnungslohn: new Decimal(p.verrechnungslohn ?? 90),
        lohn_ek: p.lohn_ek != null ? new Decimal(p.lohn_ek) : undefined,
        material_zuschlag: new Decimal(p.material_zuschlag ?? 0.3),
        nu_zuschlag: new Decimal(p.nu_zuschlag ?? 0.3),
        geraete_grundzuschlag: p.geraete_grundzuschlag != null ? new Decimal(p.geraete_grundzuschlag) : undefined,
        zeitwert_faktor: new Decimal(p.zeitwert_faktor ?? 0),
        geraetezulage_default: new Decimal(p.geraetezulage_default ?? 0.5),
      };

      const wb = await exportExcelLv3({
        lv: optionen.lv,
        parameter,
        werte,
        meta: optionen.meta,
      });

      await wb.xlsx.writeFile(result.filePath);
      return result.filePath;
    },
  );

  // ─── GAEB Exportieren ───
  ipcMain.handle(
    "lv:gaebExportieren",
    async (_event, optionen: { lv: LvImport; parameter: Record<string, number>; werte_raw: Record<string, Record<string, number | null>>; mitPreisen: boolean; projektName?: string; bieter?: string }) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return null;

      const ext = optionen.mitPreisen ? "d84" : "d81";
      const result = await dialog.showSaveDialog(win, {
        title: `Kalkulation als GAEB ${ext.toUpperCase()} exportieren`,
        defaultPath: `Kalkulation_${new Date().toISOString().slice(0, 10)}.${ext}`,
        filters: [{ name: `GAEB ${ext.toUpperCase()}`, extensions: [ext] }],
      });

      if (result.canceled || !result.filePath) return null;

      const werte = new Map<string, PositionRechenInput>();
      for (const [oz, raw] of Object.entries(optionen.werte_raw)) {
        werte.set(oz, {
          stoffe_ek: raw.stoffe_ek != null ? new Decimal(raw.stoffe_ek) : undefined,
          zeit_min_roh: raw.zeit_min_roh != null ? new Decimal(raw.zeit_min_roh) : undefined,
          geraetezulage_eur_h: raw.geraetezulage_eur_h != null ? new Decimal(raw.geraetezulage_eur_h) : undefined,
          nu_ek: raw.nu_ek != null ? new Decimal(raw.nu_ek) : undefined,
        });
      }

      const p = optionen.parameter;
      const parameter = {
        verrechnungslohn: new Decimal(p.verrechnungslohn ?? 90),
        material_zuschlag: new Decimal(p.material_zuschlag ?? 0.3),
        nu_zuschlag: new Decimal(p.nu_zuschlag ?? 0.3),
        zeitwert_faktor: new Decimal(p.zeitwert_faktor ?? 0),
        geraetezulage_default: new Decimal(p.geraetezulage_default ?? 0.5),
      };

      const gaebStr = exportGaebD84({
        lv: optionen.lv,
        parameter,
        werte,
        mitPreisen: optionen.mitPreisen,
        projektName: optionen.projektName,
        bieter: optionen.bieter,
      });

      writeFileSync(result.filePath, gaebStr, "latin1");
      return result.filePath;
    },
  );

  // ─── Angebote aus Ordner scannen ───
  ipcMain.handle(
    "angebote:scannen",
    async (_event, angeboteOrdner: string) => {
      if (!existsSync(angeboteOrdner)) return [];

      const ergebnisse: Array<{ datei: string; lieferant: string; text: string }> = [];
      const BASISPFAD = "/Users/admin/BauKalkPro";
      const scriptPfad = join(BASISPFAD, "scripts", "pdf-text-extract.py");

      // Alle Unterordner durchgehen (ein Ordner pro Lieferant)
      const unterordner = readdirSync(angeboteOrdner, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const lieferant of unterordner) {
        const lieferantPfad = join(angeboteOrdner, lieferant);
        const dateien = readdirSync(lieferantPfad)
          .filter((f) => {
            const fl = f.toLowerCase();
            if (!fl.endsWith(".pdf")) return false;
            // Mail-PDFs und Datenblätter ausfiltern — enthalten keine Preise
            if (fl.includes("mail") || fl.includes("datenblatt") || fl.includes("anleitung") || fl.includes("präsentation") || fl.includes("montageskizze")) return false;
            return true;
          });

        for (const datei of dateien) {
          const pdfPfad = join(lieferantPfad, datei);
          try {
            const text = execSync(`python3 "${scriptPfad}" "${pdfPfad}"`, {
              timeout: 15000,
              encoding: "utf-8",
            });
            ergebnisse.push({ datei, lieferant, text });
          } catch {
            // PDF nicht lesbar — überspringen
          }
        }
      }

      return ergebnisse;
    },
  );

  // ─── KI-Analyse (Claude API) ───
  ipcMain.handle(
    "ki:analysieren",
    async (_event, positionen: Array<{ oz: string; kurztext: string; langtext?: string; einheit?: string; menge?: number }>, kontext: { gewerk?: string; verrechnungslohn: number; material_zuschlag: number; nu_zuschlag: number }) => {
      const BASISPFAD = "/Users/admin/BauKalkPro";
      const configPfad = join(BASISPFAD, "vorgaben", "ki-config.json");
      let apiKey = "";
      let model = "claude-sonnet-4-20250514";
      let maxProCall = 50;
      try {
        if (existsSync(configPfad)) {
          const cfg = JSON.parse(readFileSync(configPfad, "utf-8"));
          apiKey = cfg.api_key || "";
          model = cfg.model || model;
          maxProCall = cfg.max_positionen_pro_call || maxProCall;
        }
      } catch { /* Defaults */ }

      if (!apiKey) {
        return { ergebnisse: [], fehler: "Kein API-Key in vorgaben/ki-config.json", dauer_ms: 0, positionen_analysiert: 0 };
      }

      // ─── Spezial-Modus: Positionsvergleich ───
      const vergleichDaten = (kontext as Record<string, unknown>).vergleich as { posA: Record<string, unknown>; posB: Record<string, unknown> } | undefined;
      if (vergleichDaten) {
        const start = Date.now();
        try {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const client = new Anthropic({ apiKey });

          const posA = vergleichDaten.posA;
          const posB = vergleichDaten.posB;

          const prompt = `Vergleiche diese zwei Baupositionen aus einem Leistungsverzeichnis. Erkläre kurz und präzise die Unterschiede — was macht Position B teurer/günstiger oder aufwändiger/einfacher als Position A?

POSITION A:
OZ: ${posA.oz}
Kurztext: ${posA.kurztext}
Einheit: ${posA.einheit ?? "psch"} | Menge: ${posA.menge ?? 1}
${posA.langtext ? `Langtext: ${String(posA.langtext).slice(0, 500)}` : "Kein Langtext"}

POSITION B:
OZ: ${posB.oz}
Kurztext: ${posB.kurztext}
Einheit: ${posB.einheit ?? "psch"} | Menge: ${posB.menge ?? 1}
${posB.langtext ? `Langtext: ${String(posB.langtext).slice(0, 500)}` : "Kein Langtext"}

Antworte auf Deutsch, maximal 5 Sätze. Nenne konkret: Materialunterschiede, Aufwandsunterschiede, Einheitenunterschiede. Keine JSON-Antwort, nur Fließtext.`;

          const response = await client.messages.create({
            model,
            max_tokens: 500,
            messages: [{ role: "user", content: prompt }],
          });

          const textBlock = (response.content as Array<{ type: string; text?: string }>).find((b) => b.type === "text");
          return {
            ergebnisse: [{ vergleich_text: textBlock?.text ?? "Kein Vergleich möglich" }],
            dauer_ms: Date.now() - start,
            positionen_analysiert: 1,
          };
        } catch (err) {
          return {
            ergebnisse: [],
            fehler: `Vergleich fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
            dauer_ms: Date.now() - start,
            positionen_analysiert: 0,
          };
        }
      }

      if (positionen.length === 0) {
        return { ergebnisse: [], dauer_ms: 0, positionen_analysiert: 0 };
      }

      const start = Date.now();

      // Referenz-Positionen aus Schicht 1 (als Kontext für die KI)
      const referenzPositionen = (kontext as Record<string, unknown>).referenz_positionen as string[] | undefined;

      // System-Prompt für Baukalkulation
      const systemPrompt = `Du bist ein erfahrener deutscher Baukalkulator. Du darfst NICHT schätzen — du musst RECHNEN und jeden Wert logisch herleiten.

KALKULATIONSPARAMETER:
- Verrechnungslohn: ${kontext.verrechnungslohn} €/h
- Material-Zuschlag: ${kontext.material_zuschlag}% auf Netto-EK
- NU-Zuschlag: ${kontext.nu_zuschlag}% auf Netto-EK

${referenzPositionen && referenzPositionen.length > 0 ? `
BEREITS BERECHNETE POSITIONEN (aus dem Leitfaden — als Referenz für deine Berechnung):
${referenzPositionen.join("\n")}

PFLICHT: Vergleiche jede deiner Berechnungen mit den obigen Referenz-Positionen!
- Dein Y-Wert darf NICHT niedriger sein als eine vergleichbare Referenz, es sei denn du erklärst warum.
- Wenn eine Position aufwändiger ist als eine Referenz, MUSS dein Y-Wert höher sein.
` : ""}

WERTE DIE DU BERECHNEN MUSST (nicht schätzen!):

1. **zeit_min_roh** (Y) — Arbeitszeit in MINUTEN pro Einheit
   - Reine Arbeitszeit eines Arbeiters/Kolonnenführers
   - IMMER pro Einheit (m², m³, Stk, lfm, psch, etc.)

2. **stoffe_ek** (X) — Material-EK Netto in € pro Einheit
   - WICHTIGSTE REGEL: Im Zweifel X = 0! Die MEISTEN Baupositionen sind reine Arbeitsleistung!
   - X > 0 NUR wenn Material GEKAUFT und DAUERHAFT EINGEBAUT wird (z.B. Pflastersteine, Beton, Rohre, Pflanzen)
   - X = 0 bei ALLEN Arbeitsleistungen ohne Materialeinkauf
   - DIESE Positionen haben IMMER X = 0 (kein Material!):
     • JEDE Position mit "abbrechen", "aufbrechen", "aufnehmen", "abtragen" → X = 0 IMMER!
     • Entsorgungskosten bei Abbruch werden in SEPARATEN LV-Positionen abgerechnet, NIE in der Abbruch-Position!
     • Bauzaun aufstellen/umsetzen/vorhalten → X = 0
     • Schutzzaun, Absperrung aufstellen/umsetzen → X = 0
     • Ausbau, ausbauen, entfernen, roden, demontage → X = 0
     • Boden lösen/laden/fördern/transportieren/lagern/andecken → X = 0
     • Oberboden abtragen, lagern, andecken → X = 0 (Boden wird nur bewegt, nicht gekauft!)
     • Planum herstellen, Profilieren, Nachverdichten, Planieren → X = 0
     • Mähen, Fräsen, Auflockern, Schneiden → X = 0
     • Geräte umsetzen, Saugbagger → X = 0
     • Baustelle einrichten/räumen → X = 0
     • Abstecken, Vermessung → X = 0 (oder NU)
     • Verkehrszeichen aufstellen/umsetzen → X = 0 (Mietequipment)
     • Überweg herstellen/umsetzen → X = 0
     • Bereitstellungsfläche herstellen → X = 0
     • Findling/Stein versetzen (vorhandener!) → X = 0
   - NEBENMATERIAL einrechnen NUR wenn es NEU VERBAUT wird: Beton bei Bordsteinen, Splitt bei Pflaster
   - Vorhalten-Positionen (mMt/StMt): X = Mietpreis pro Monat, Y = 0
   - WARNUNG: Wenn du unsicher bist ob X > 0 sein soll, setze X = 0 und schreibe in die Begründung "Prüfen: Material unklar"

3. **nu_ek** (M) — Nachunternehmer-EK Netto in € pro Einheit
   - DIESE Positionen sind IMMER NU (ist_nu_position=true, Y=0, X=0):
     • Spielgeräte, Vermessung, Prüfungen, Gutachten, TÜV, Schilder, Elektro, Sanitär
   - Bei Eigenleistung: 0
   - WICHTIG: Wenn NU, dann Y=0, X=0, nur M setzen!

4. **geraetezulage_eur_h** (Z) — Gerätezulage in €/Stunde
   - Standard: 0,50 €/h. Minibagger: 25-35. Bagger 20t+: 45-65.

REFERENZ-ZEITWERTE (Leitfaden kalku.de):
- Baustelle einrichten: Y=1800 min/psch, Z=50
- Baustelle räumen: Y=600 min/psch, Z=15
- Bauzaun aufstellen: Y=10 min/m, Z=15, X=0!
- Bauzaun umsetzen: Y=5 min/m, Z=5, X=0!
- Bodenaushub Großmaschine: Y=2 min/m³, Z=25
- Bodenaushub Minibagger: Y=10 min/m³, Z=15
- Boden einbauen+verdichten: Y=8 min/m³ (IMMER mehr als Aushub!)
- Pflaster verlegen: Y=25-30 min/m², Z=5
- Bordstein setzen: Y=15 min/lfm, Z=5
- Betonabbruch unbewehrt: Y=45 min/m³, Z=25
- Asphaltabbruch: Y=15 min/m³, Z=25
- Rasen ansäen: Y=2 min/m², X=Saatgut
- Hochstamm pflanzen: Y=120 min/Stk (Grube separat)
- Schotter einbauen: Y=3-5 min/m³, Z=25

ENTSORGUNGSPREISE (in X als Stoffe eintragen!):
WICHTIG: Bei JEDER Position die "entsorgen", "Entsorgung", "verwerten", "laden und abfahren" enthält, MUSS X > 0 sein!
- Grünschnitt: 50 €/t
- Holz unbehandelt: 80 €/m³
- Holz behandelt/beschichtet: 150 €/m³
- Beton/RC-Material/Schotter: 10 €/t (oder 20 €/m³)
- Asphalt ohne Schadstoffe: 15 €/t
- Asphalt mit Schadstoffen (teerhaltig): 70 €/t
- Erdmassen BM-0: 18 €/t
- Erdmassen BM-F2 (belastet): 55 €/t
- Kunststoff: 300 €/t
- Hausmüll/Mischabfall: 300 €/t
- Bei unbekannter Schadstoffklasse: Standard 18 €/t, Konfidenz "niedrig"
- Umrechnung: 1 m³ Boden ≈ 1,5 t, 1 m³ Schotter ≈ 1,8 t, 1 m³ Asphalt ≈ 2,4 t

REGELN:
- Du darfst NICHT schätzen — leite jeden Wert logisch aus den Referenzwerten und Entsorgungspreisen ab
- Materialpreise sind NETTO-EINKAUFSPREISE (Deutschland 2024/2025)
- Jeder Wert mit Begründung die die RECHNUNG zeigt (z.B. "45 min/m³ × 0,06 m³/lfm = 2,7 min/lfm")
- Nenne die Vergleichs-Position wenn vorhanden (z.B. "vgl. Pos 1.2.18 Asphalt abbrechen = 2 min/m²")
- Arbeitszeit-Hierarchie ZWINGEND: Einbauen > Aushub, Neu verlegen > Abbruch, Umsetzen > Aufstellen
- Wenn dein Wert NIEDRIGER ist als eine vergleichbare Referenz-Position: setze warnung = true

ANTWORTFORMAT — NUR gültiges JSON, KEIN anderer Text:
{
  "positionen": [
    {
      "oz": "01.0010",
      "zeit_min_roh": 25,
      "zeit_begruendung": "Berechnung: 45 min/m³ × 0,06 m³/lfm = 2,7 min/lfm (vgl. Pos 1.2.18)",
      "stoffe_ek": 0,
      "stoffe_begruendung": "Reine Arbeitsleistung, kein Material",
      "nu_ek": 0,
      "nu_begruendung": "-",
      "geraetezulage_eur_h": 0.5,
      "geraete_begruendung": "Standard, keine schweren Geräte",
      "konfidenz": "hoch",
      "ist_nu_position": false,
      "warnung": false
    }
  ]
}`;

      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey });

        // In Chunks aufteilen — max 15 Positionen pro Call für zuverlässiges JSON
        const chunkSize = Math.min(maxProCall, 15);
        const alleErgebnisse: Array<Record<string, unknown>> = [];
        for (let i = 0; i < positionen.length; i += chunkSize) {
          const chunk = positionen.slice(i, i + chunkSize);

          const posListe = chunk.map((p, idx) => {
            let text = `${idx + 1}. OZ: ${p.oz} | Einheit: ${p.einheit ?? "psch"} | Menge: ${p.menge ?? 1}\n`;
            text += `   Kurztext: ${p.kurztext}\n`;
            if (p.langtext) {
              text += `   Langtext: ${p.langtext.slice(0, 300)}\n`;
            }
            return text;
          }).join("\n");

          const userPrompt = `Analysiere diese ${chunk.length} Baupositionen und gib für JEDE die Kalkulationswerte zurück:\n\n${posListe}\n\nAntworte NUR mit dem JSON-Objekt.`;

          const chunkNr = Math.floor(i / chunkSize) + 1;
          const totalChunks = Math.ceil(positionen.length / chunkSize);
          console.log(`[KI] Sende ${chunk.length} Positionen an Claude API (Chunk ${chunkNr}/${totalChunks})...`);

          const response = await client.messages.create({
            model,
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          });

          const textBlock = (response.content as Array<{ type: string; text?: string }>).find((b) => b.type === "text");
          if (!textBlock?.text) continue;

          let jsonStr = textBlock.text.trim();
          // Markdown-Code-Block entfernen (```json ... ```)
          if (jsonStr.startsWith("```")) {
            // Erste Zeile (```json) entfernen
            jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "");
            // Letzte ``` entfernen
            jsonStr = jsonStr.replace(/\n?```\s*$/, "");
          }
          // Falls noch ein { ... } drin steckt, extrahieren
          const braceStart = jsonStr.indexOf("{");
          const braceEnd = jsonStr.lastIndexOf("}");
          if (braceStart !== -1 && braceEnd > braceStart) {
            jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
          }

          let parsed: { positionen: Array<Record<string, unknown>> };
          try {
            parsed = JSON.parse(jsonStr);
          } catch (parseErr) {
            // JSON abgeschnitten — versuche bis zum letzten vollständigen Objekt zu parsen
            console.log(`[KI] JSON-Reparatur für Chunk ${chunkNr}...`);
            const lastComplete = jsonStr.lastIndexOf("},");
            if (lastComplete > 0) {
              const repaired = jsonStr.slice(0, lastComplete + 1) + "]}";
              try {
                parsed = JSON.parse(repaired);
              } catch {
                console.error(`[KI] JSON-Reparatur fehlgeschlagen für Chunk ${chunkNr}`);
                continue;
              }
            } else {
              console.error(`[KI] JSON nicht reparierbar für Chunk ${chunkNr}`);
              continue;
            }
          }
          if (parsed.positionen) {
            alleErgebnisse.push(...parsed.positionen);
          }

          console.log(`[KI] Chunk ${chunkNr}: ${parsed.positionen?.length ?? 0} Ergebnisse`);
        }

        return {
          ergebnisse: alleErgebnisse,
          dauer_ms: Date.now() - start,
          positionen_analysiert: alleErgebnisse.length,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[KI] Fehler:", msg);
        return {
          ergebnisse: [],
          fehler: `KI-Analyse fehlgeschlagen: ${msg}`,
          dauer_ms: Date.now() - start,
          positionen_analysiert: 0,
        };
      }
    },
  );

  // ─── Audit-Log ───
  ipcMain.handle("audit:schreiben", async (_event, jsonlZeile: string) => {
    const logPfad = join(process.cwd(), "vorgaben", "audit-log.jsonl");
    const dir = join(logPfad, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const { appendFileSync } = await import("node:fs");
    appendFileSync(logPfad, jsonlZeile, "utf-8");
    return true;
  });

  // ─── Vorgaben laden ───
  ipcMain.handle("vorgaben:laden", async (_event, pfad: string) => {
    if (!existsSync(pfad)) return null;
    const inhalt = readFileSync(pfad, "utf-8");
    return JSON.parse(inhalt);
  });

  // ─── Vorgaben speichern ───
  ipcMain.handle(
    "vorgaben:speichern",
    async (_event, pfad: string, daten: unknown) => {
      const dir = join(pfad, "..");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(pfad, JSON.stringify(daten, null, 2), "utf-8");
      return true;
    },
  );

  // ─── Projekt speichern ───
  ipcMain.handle(
    "projekt:speichern",
    async (_event, pfad: string, daten: unknown) => {
      const dir = join(pfad, "..");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(pfad, JSON.stringify(daten, null, 2), "utf-8");
      return true;
    },
  );

  // ─── Projekt laden ───
  ipcMain.handle("projekt:laden", async (_event, pfad: string) => {
    if (!existsSync(pfad)) return null;
    return JSON.parse(readFileSync(pfad, "utf-8"));
  });
}
