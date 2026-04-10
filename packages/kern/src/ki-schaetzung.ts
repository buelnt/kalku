/**
 * KI-gestützte Positionsanalyse via Claude API
 *
 * Wird als Fallback im Preis-Waterfall verwendet, wenn weder Angebote
 * noch Preisdatenbank noch Keyword-Regeln einen Treffer liefern.
 *
 * Analysiert den Positionstext (Kurztext + Langtext) und schätzt:
 * - zeit_min_roh (Minuten pro Einheit)
 * - stoffe_ek (Materialkosten Netto-EK pro Einheit in €)
 * - nu_ek (Nachunternehmer-EK pro Einheit in €, falls NU-Position)
 *
 * Jeder Wert wird mit einer 1-Satz-Begründung zurückgegeben.
 * Ergebnisse werden in der Preisdatenbank gespeichert (Lerneffekt).
 */

/** Eingabe-Position für die KI-Analyse */
export interface KiPosition {
  oz: string;
  kurztext: string;
  langtext?: string;
  einheit?: string;
  menge?: number;
}

/** KI-Ergebnis pro Position */
export interface KiSchaetzungErgebnis {
  oz: string;
  zeit_min_roh: number;
  zeit_begruendung: string;
  stoffe_ek: number;
  stoffe_begruendung: string;
  nu_ek: number;
  nu_begruendung: string;
  geraetezulage_eur_h: number;
  geraete_begruendung: string;
  konfidenz: "hoch" | "mittel" | "niedrig";
  ist_nu_position: boolean;
}

/** Kontext für die KI-Analyse */
export interface KiKontext {
  gewerk?: string;
  verrechnungslohn: number;
  material_zuschlag: number;
  nu_zuschlag: number;
}

/** Konfiguration für die KI */
export interface KiConfig {
  provider: "anthropic";
  api_key: string;
  model: string;
  max_positionen_pro_call: number;
}

/** Gesamtergebnis der KI-Analyse */
export interface KiAnalyseErgebnis {
  ergebnisse: KiSchaetzungErgebnis[];
  fehler?: string;
  dauer_ms: number;
  positionen_analysiert: number;
}

/**
 * Bau-Kalkulations-System-Prompt für Claude.
 * Enthält alle Regeln und Kontext für präzise Schätzungen.
 */
function buildSystemPrompt(kontext: KiKontext): string {
  return `Du bist ein erfahrener deutscher Baukalkulator mit 20+ Jahren Erfahrung in allen Gewerken (GaLaBau, Tiefbau, Rohbau, Straßenbau, Kanalbau, Abbruch).

DEINE AUFGABE:
Für jede Bauposition schätzt du die Kalkulationswerte. Jeder Wert muss LOGISCH NACHVOLLZIEHBAR sein.

KALKULATIONSPARAMETER:
- Verrechnungslohn: ${kontext.verrechnungslohn} €/h (inkl. aller Lohnnebenkosten)
- Material-Zuschlag: ${kontext.material_zuschlag}% auf Netto-EK
- NU-Zuschlag: ${kontext.nu_zuschlag}% auf Netto-EK
${kontext.gewerk ? `- Gewerk: ${kontext.gewerk}` : ""}

WERTE DIE DU SCHÄTZEN MUSST:

1. **zeit_min_roh** (Y) — Arbeitszeit in MINUTEN pro Einheit
   - Das ist die reine Arbeitszeit eines Arbeiters/Kolonnenführers
   - Bei Maschinenarbeit: Zeit die der Bediener braucht
   - IMMER pro Einheit (m², m³, Stk, lfm, psch, etc.)
   - Beispiel: Pflaster verlegen = 12-18 min/m², Boden ausheben mit Bagger = 2-4 min/m³

2. **stoffe_ek** (X) — Material-Einkaufspreis Netto in € pro Einheit
   - NUR der reine Materialpreis (ohne Zuschläge, ohne Einbau)
   - Bei reiner Arbeitsleistung: 0
   - Beispiel: Betonpflaster 8cm = 15-22 €/m², Schotter 0/32 = 12-18 €/t

3. **nu_ek** (M) — Nachunternehmer-EK Netto in € pro Einheit
   - NUR wenn die Leistung komplett an einen NU vergeben wird
   - DIESE Positionen sind IMMER NU (ist_nu_position=true, Y=0, X=0):
     • Spielgeräte (Schaukel, Rutsche, Klettergerüst, Wippe, Karussell etc.)
     • Vermessung, Absteckung, Einmessung
     • Prüfungen, Gutachten, TÜV-Abnahme
     • Schilder, Beschilderung
     • Elektroarbeiten, Sanitärarbeiten
     • Laborprüfungen, Verdichtungsprüfungen
   - Bei Eigenleistung: 0
   - WICHTIG: Wenn NU, dann Y=0, X=0, nur M setzen! Der Bauunternehmer macht bei NU-Positionen NICHTS selbst.

4. **geraetezulage_eur_h** (Z) — Gerätezulage in €/Stunde
   - Kosten für Geräte/Maschinen pro Arbeitsstunde
   - Standard ohne schwere Geräte: 0,50 €/h
   - Mit Minibagger: 25-35 €/h
   - Mit Bagger 20t+: 45-65 €/h
   - Mit LKW: 35-50 €/h

REGELN:
- Zeitwerte müssen REALISTISCH sein — nicht zu optimistisch, nicht zu pessimistisch
- Materialpreise sind NETTO-EINKAUFSPREISE (deutsche Marktpreise 2024/2025)
- Bei "pauschal" (psch) Positionen: Gesamtzeit/-kosten für die Pauschale schätzen
- NU-Positionen erkennst du an: Vermessung, Prüfung, Gutachten, Spielgerät, Schild, Elektro, Sanitär
- JEDER Wert braucht eine kurze Begründung (1 Satz, max 80 Zeichen)
- Konfidenz: "hoch" wenn Standardleistung, "mittel" wenn Erfahrungswert, "niedrig" wenn unsicher

ANTWORTFORMAT — NUR gültiges JSON, kein anderer Text:
{
  "positionen": [
    {
      "oz": "01.0010",
      "zeit_min_roh": 25,
      "zeit_begruendung": "Bodenaushub 30cm mit Minibagger, leichter Boden",
      "stoffe_ek": 0,
      "stoffe_begruendung": "Reine Arbeitsleistung ohne Material",
      "nu_ek": 0,
      "nu_begruendung": "-",
      "geraetezulage_eur_h": 30,
      "geraete_begruendung": "Minibagger 3,5t erforderlich",
      "konfidenz": "hoch",
      "ist_nu_position": false
    }
  ]
}`;
}

/**
 * Baut den User-Prompt mit allen zu analysierenden Positionen.
 */
function buildUserPrompt(positionen: KiPosition[]): string {
  const posListe = positionen.map((p, i) => {
    let text = `${i + 1}. OZ: ${p.oz} | Einheit: ${p.einheit ?? "psch"} | Menge: ${p.menge ?? 1}\n`;
    text += `   Kurztext: ${p.kurztext}\n`;
    if (p.langtext) {
      // Langtext auf max 300 Zeichen kürzen (Token sparen)
      const lt = p.langtext.length > 300 ? p.langtext.slice(0, 300) + "..." : p.langtext;
      text += `   Langtext: ${lt}\n`;
    }
    return text;
  }).join("\n");

  return `Analysiere diese ${positionen.length} Baupositionen und gib für JEDE die Kalkulationswerte zurück:\n\n${posListe}\n\nAntworte NUR mit dem JSON-Objekt, kein anderer Text.`;
}

/**
 * Führt die KI-Schätzung via Claude API durch.
 *
 * Wird im Electron Main-Prozess aufgerufen (hat Zugriff auf Node.js APIs).
 * Batch-Verarbeitung: Alle unbepreisten Positionen in einem API-Call.
 * Bei > max_positionen_pro_call wird in Chunks aufgeteilt.
 */
export async function kiSchaetzung(
  positionen: KiPosition[],
  kontext: KiKontext,
  config: KiConfig,
): Promise<KiAnalyseErgebnis> {
  const start = Date.now();

  if (!config.api_key) {
    return {
      ergebnisse: [],
      fehler: "Kein API-Key konfiguriert. Bitte in Vorgaben → KI-Einstellungen hinterlegen.",
      dauer_ms: 0,
      positionen_analysiert: 0,
    };
  }

  if (positionen.length === 0) {
    return {
      ergebnisse: [],
      dauer_ms: 0,
      positionen_analysiert: 0,
    };
  }

  // In Chunks aufteilen falls nötig
  const chunkSize = config.max_positionen_pro_call || 50;
  const chunks: KiPosition[][] = [];
  for (let i = 0; i < positionen.length; i += chunkSize) {
    chunks.push(positionen.slice(i, i + chunkSize));
  }

  const alleErgebnisse: KiSchaetzungErgebnis[] = [];

  try {
    // Dynamischer Import der Anthropic SDK (nur im Electron Main-Prozess verfügbar)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AnthropicModule = await (Function('return import("@anthropic-ai/sdk")')() as Promise<any>);
    const Anthropic = AnthropicModule.default ?? AnthropicModule.Anthropic;
    const client = new Anthropic({ apiKey: config.api_key });

    const systemPrompt = buildSystemPrompt(kontext);

    for (const chunk of chunks) {
      const userPrompt = buildUserPrompt(chunk);

      const response = await client.messages.create({
        model: config.model || "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      // Antwort parsen
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textBlock = (response.content as any[]).find((b: any) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        continue;
      }

      // JSON aus der Antwort extrahieren (auch wenn in ```json ... ``` gewrappt)
      let jsonStr = textBlock.text.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1]!.trim();
      }

      const parsed = JSON.parse(jsonStr) as { positionen: KiSchaetzungErgebnis[] };

      if (parsed.positionen && Array.isArray(parsed.positionen)) {
        for (const p of parsed.positionen) {
          alleErgebnisse.push({
            oz: p.oz,
            zeit_min_roh: Number(p.zeit_min_roh) || 0,
            zeit_begruendung: p.zeit_begruendung || "",
            stoffe_ek: Number(p.stoffe_ek) || 0,
            stoffe_begruendung: p.stoffe_begruendung || "",
            nu_ek: Number(p.nu_ek) || 0,
            nu_begruendung: p.nu_begruendung || "-",
            geraetezulage_eur_h: Number(p.geraetezulage_eur_h) || 0.5,
            geraete_begruendung: p.geraete_begruendung || "",
            konfidenz: p.konfidenz || "mittel",
            ist_nu_position: Boolean(p.ist_nu_position),
          });
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ergebnisse: alleErgebnisse,
      fehler: `KI-Analyse fehlgeschlagen: ${msg}`,
      dauer_ms: Date.now() - start,
      positionen_analysiert: alleErgebnisse.length,
    };
  }

  return {
    ergebnisse: alleErgebnisse,
    dauer_ms: Date.now() - start,
    positionen_analysiert: alleErgebnisse.length,
  };
}
