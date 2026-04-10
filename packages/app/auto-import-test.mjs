import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASISPFAD = "/Users/admin/BauKalkPro";
const X83_PFAD = "/Users/admin/Library/CloudStorage/OneDrive-kalku/KT01/1695_Gesellchen_GmbH/260410_Grundschule_Pfaffenwoog/01_Pläne_u_Gaeb/LV Schulhofneugestaltung Grundschule Pfaffenwoog Erfenbach.X83";

async function main() {
  // 1. Parse X83
  const { parseGaebXml } = await import("@baukalk/import");
  console.log("[TEST] Parsing X83...");
  const lv = parseGaebXml(X83_PFAD);
  console.log(`[TEST] ${lv.anzahl_positionen} Positionen geparst`);

  // 2. Preisdatenbank
  const { Decimal } = await import("@baukalk/datenmodell");
  let preisdatenbank = [];
  try {
    const pdRaw = JSON.parse(readFileSync(join(BASISPFAD, "vorgaben/preisdatenbank.json"), "utf-8"));
    preisdatenbank = pdRaw.eintraege || [];
  } catch {}

  const werte = new Map();
  for (const e of lv.eintraege) {
    if (e.art === "BEREICH") continue;
    const suchtext = (e.kurztext + " " + (e.langtext ?? "")).toLowerCase();
    for (const pd of preisdatenbank) {
      if (suchtext.includes(pd.suchbegriff)) {
        werte.set(e.oz, { stoffe_ek: new Decimal(pd.preis_pro_einheit) });
        break;
      }
    }
  }
  console.log(`[TEST] ${werte.size} aus Preisdatenbank`);

  // 3. Unbepreiste → KI
  const unbepreist = lv.eintraege.filter(e => e.art !== "BEREICH" && !werte.has(e.oz));
  console.log(`[TEST] ${unbepreist.length} Positionen an KI...`);

  // 4. KI Call — genau wie IPC-Handler
  const cfg = JSON.parse(readFileSync(join(BASISPFAD, "vorgaben/ki-config.json"), "utf-8"));
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: cfg.api_key });

  const systemPrompt = `Du bist ein erfahrener deutscher Baukalkulator. Verrechnungslohn: 90 €/h, Material-Zuschlag: 30%, NU-Zuschlag: 30%.
Schätze für JEDE Position: zeit_min_roh (Min/Einheit), stoffe_ek (€/Einheit Netto-EK), nu_ek (€/Einheit, 0=Eigenleistung), geraetezulage_eur_h (€/h).
NU-Positionen (Spielgeräte, Vermessung, TÜV, Prüfungen): ist_nu_position=true, Y=0, X=0, nur M.
Antwort NUR JSON: { "positionen": [{ "oz": "...", "zeit_min_roh": 0, "zeit_begruendung": "...", "stoffe_ek": 0, "stoffe_begruendung": "...", "nu_ek": 0, "nu_begruendung": "-", "geraetezulage_eur_h": 0.5, "geraete_begruendung": "...", "konfidenz": "mittel", "ist_nu_position": false }] }`;

  const maxProCall = 30;
  let kiErfolg = 0;
  const start = Date.now();

  for (let i = 0; i < unbepreist.length; i += maxProCall) {
    const chunk = unbepreist.slice(i, i + maxProCall);
    const chunkNr = Math.floor(i / maxProCall) + 1;
    const total = Math.ceil(unbepreist.length / maxProCall);

    const posListe = chunk.map((p, idx) => {
      let t = `${idx+1}. OZ: ${p.oz} | Einheit: ${p.einheit || "psch"} | Menge: ${Number(p.menge || 1)}\n   Kurztext: ${p.kurztext}`;
      if (p.langtext) t += `\n   Langtext: ${p.langtext.slice(0, 200)}`;
      return t;
    }).join("\n\n");

    console.log(`[KI] Chunk ${chunkNr}/${total}: ${chunk.length} Positionen...`);

    const response = await client.messages.create({
      model: cfg.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: `Analysiere:\n\n${posListe}\n\nNUR JSON.` }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    let jsonStr = textBlock.text.trim();
    const m = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) jsonStr = m[1].trim();

    const parsed = JSON.parse(jsonStr);
    for (const ki of parsed.positionen) {
      werte.set(ki.oz, {
        stoffe_ek: ki.stoffe_ek ? new Decimal(ki.stoffe_ek) : undefined,
        zeit_min_roh: ki.zeit_min_roh ? new Decimal(ki.zeit_min_roh) : undefined,
        geraetezulage_eur_h: ki.geraetezulage_eur_h ? new Decimal(ki.geraetezulage_eur_h) : undefined,
        nu_ek: ki.nu_ek ? new Decimal(ki.nu_ek) : undefined,
      });
      kiErfolg++;
    }
    console.log(`[KI] → ${parsed.positionen.length} Ergebnisse`);
  }

  // 5. Berechne
  const { berechne } = await import("@baukalk/kern");
  const parameter = {
    verrechnungslohn: new Decimal(90),
    material_zuschlag: new Decimal(0.30),
    nu_zuschlag: new Decimal(0.30),
    zeitwert_faktor: new Decimal(0),
    geraetezulage_default: new Decimal(0.5),
  };

  let nettoSumme = new Decimal(0);
  let bepreist = 0;
  for (const e of lv.eintraege) {
    if (e.art === "BEREICH") continue;
    const input = werte.get(e.oz) ?? {};
    const menge = new Decimal(Number(e.menge || 0));
    const erg = berechne(input, menge, parameter);
    nettoSumme = nettoSumme.plus(erg.gp);
    if (!erg.ep.isZero()) bepreist++;
  }

  const dauer = Math.round((Date.now() - start) / 1000);
  console.log(`\n═══ ERGEBNIS ═══`);
  console.log(`Bepreist: ${bepreist}/${lv.anzahl_positionen}`);
  console.log(`Netto: ${nettoSumme.toFixed(2)} €`);
  console.log(`Dauer: ${dauer}s`);
  console.log(`${bepreist === lv.anzahl_positionen ? "✓ ALLE BEPREIST" : "⚠ LÜCKEN"}`);
}

main().catch(e => console.error("[FEHLER]", e.message));
