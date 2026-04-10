/**
 * Test-Skript: Alle Gesellchen-Ausschreibungen durch Parser + Regel-Engine
 *
 * Prüft systematisch auf:
 * 1. X > 0 bei reinen Arbeitsleistungen
 * 2. Fehlende Entsorgungskosten bei Entsorgungspositionen
 * 3. X > 0 bei Abbruch-Positionen (Entsorgung gehört in separate Position)
 * 4. Falsche/fehlende Y-Werte
 * 5. Parser-Fehler (0 Positionen gefunden)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";

// ─── GAEB Parser (inline, da ESM-Import aus packages komplex) ───

function nsTagPattern(tag) {
  return `(?:[a-zA-Z0-9_]+:)?${tag}`;
}

function findTopLevelBlocks(xml, tag) {
  const blocks = [];
  // Optimiert: alle < Positionen vorab finden statt char-by-char
  const openRe = new RegExp(`<${nsTagPattern(tag)}[\\s>/]`, "g");
  const tagLower = tag.toLowerCase();

  let match;
  while ((match = openRe.exec(xml)) !== null) {
    const startIdx = match.index;
    let nestLevel = 1;
    let pos = startIdx + match[0].length;
    let endIdx = -1;

    // Suche alle < ab hier
    while (pos < xml.length) {
      const ltIdx = xml.indexOf("<", pos);
      if (ltIdx === -1) break;
      pos = ltIdx;

      // Prüfe ob es ein open oder close tag ist
      const ch = xml[pos + 1];
      if (ch === "/") {
        // Close tag: </tag> oder </ns:tag>
        const closeEnd = xml.indexOf(">", pos);
        if (closeEnd === -1) break;
        const closeTag = xml.slice(pos + 2, closeEnd);
        const colonIdx = closeTag.indexOf(":");
        const localName = colonIdx >= 0 ? closeTag.slice(colonIdx + 1) : closeTag;
        if (localName === tag) {
          nestLevel--;
          if (nestLevel === 0) {
            endIdx = closeEnd + 1;
            break;
          }
        }
        pos = closeEnd + 1;
      } else if (ch !== "!" && ch !== "?") {
        // Open tag: check if it matches our tag
        const spaceEnd = xml.indexOf(">", pos);
        if (spaceEnd === -1) break;
        // Get tag name (between < and first space or > or /)
        let nameEnd = pos + 1;
        while (nameEnd < spaceEnd && xml[nameEnd] !== " " && xml[nameEnd] !== "/" && xml[nameEnd] !== ">") nameEnd++;
        const fullTagName = xml.slice(pos + 1, nameEnd);
        const colonIdx = fullTagName.indexOf(":");
        const localName = colonIdx >= 0 ? fullTagName.slice(colonIdx + 1) : fullTagName;
        if (localName === tag) {
          // Self-closing?
          if (xml[spaceEnd - 1] === "/") {
            // Self-closing, don't change nesting
          } else {
            nestLevel++;
          }
        }
        pos = spaceEnd + 1;
      } else {
        pos = pos + 1;
      }
    }

    if (endIdx === -1) break;
    blocks.push(xml.slice(startIdx, endIdx));
    openRe.lastIndex = endIdx;
  }
  return blocks;
}

function getTagContent(xml, tag) {
  const re = new RegExp(`<${nsTagPattern(tag)}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function getAttr(xml, tag, attr) {
  const re = new RegExp(`<${nsTagPattern(tag)}[^>]*\\s${attr}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function ozTiefe(oz) { return oz.split(".").length; }

function findParentIndex(eintraege, tiefe) {
  for (let i = eintraege.length - 1; i >= 0; i--) {
    if (eintraege[i].tiefe < tiefe && eintraege[i].art === "BEREICH") return i;
  }
  return null;
}

function stripOuterTag(block, tag) {
  const openRe = new RegExp(`^<${nsTagPattern(tag)}[^>]*>`);
  const closeRe = new RegExp(`<\\/(?:[a-zA-Z0-9_]+:)?${tag}>$`);
  return block.replace(openRe, "").replace(closeRe, "").trim();
}

function parseGaebXml(filePath) {
  const xmlStr = readFileSync(filePath, "utf-8");
  const name = basename(filePath);
  const eintraege = [];
  let anzahlPositionen = 0;

  function parseBoQBody(bodyContent, ozPrefix, depth) {
    const ctgyBlocks = findTopLevelBlocks(bodyContent, "BoQCtgy");
    let bodyOhneCtgy = bodyContent;
    for (const cb of ctgyBlocks) bodyOhneCtgy = bodyOhneCtgy.replace(cb, "");

    let ctgyIndex = 0;
    for (const ctgyBlock of ctgyBlocks) {
      ctgyIndex++;
      const rno = getAttr(ctgyBlock, "BoQCtgy", "RNoPart") ?? String(ctgyIndex).padStart(2, "0");
      const oz = ozPrefix ? `${ozPrefix}.${rno}` : rno;
      const lblTx = getTagContent(ctgyBlock, "LblTx") ?? "";
      const tiefe = ozTiefe(oz);
      eintraege.push({ oz, art: "BEREICH", kurztext: stripTags(lblTx), tiefe, parent_index: findParentIndex(eintraege, tiefe) });

      const innerContent = stripOuterTag(ctgyBlock, "BoQCtgy");
      const innerBodies = findTopLevelBlocks(innerContent, "BoQBody");
      for (const ib of innerBodies) parseBoQBody(stripOuterTag(ib, "BoQBody"), oz, depth + 1);
    }

    const itemlistBlocks = findTopLevelBlocks(bodyOhneCtgy, "Itemlist");
    for (const ilBlock of itemlistBlocks) {
      const ilContent = stripOuterTag(ilBlock, "Itemlist");
      const items = findTopLevelBlocks(ilContent, "Item");
      let itemIndex = 0;
      for (const itemBlock of items) {
        itemIndex++;
        const itemContent = stripOuterTag(itemBlock, "Item");
        const rno = getAttr(itemBlock, "Item", "RNoPart") ?? String(itemIndex).padStart(4, "0");
        const oz = ozPrefix ? `${ozPrefix}.${rno}` : rno;
        const qty = getTagContent(itemContent, "Qty");
        const qu = getTagContent(itemContent, "QU");

        let kurztext = "";
        let langtext;
        const outlineTxt = getTagContent(itemContent, "OutlTxt");
        if (outlineTxt) {
          const textOutl = getTagContent(outlineTxt, "TextOutlTxt");
          kurztext = stripTags(textOutl ?? outlineTxt);
        }
        if (!kurztext) {
          const textOutlTxt = getTagContent(itemContent, "TextOutlTxt");
          if (textOutlTxt) kurztext = stripTags(textOutlTxt);
        }
        const detailTxt = getTagContent(itemContent, "DetailTxt");
        if (detailTxt) langtext = stripTags(detailTxt);
        if (!langtext) {
          const dt2 = getTagContent(itemContent, "DetailText");
          if (dt2) langtext = stripTags(dt2);
        }

        const menge = qty ? parseFloat(qty.replace(",", ".")) : 0;
        const tiefe = ozTiefe(oz);
        eintraege.push({
          oz, art: "NORMAL", kurztext: kurztext || `Position ${oz}`,
          langtext, menge, einheit: qu ?? undefined, tiefe,
          parent_index: findParentIndex(eintraege, tiefe),
        });
        anzahlPositionen++;
      }
    }
  }

  const boqBlocks = findTopLevelBlocks(xmlStr, "BoQ");
  if (boqBlocks.length > 0) {
    const boqContent = stripOuterTag(boqBlocks[0], "BoQ");
    const bodyBlocks = findTopLevelBlocks(boqContent, "BoQBody");
    if (bodyBlocks.length > 0) parseBoQBody(stripOuterTag(bodyBlocks[0], "BoQBody"), "", 0);
  } else {
    const bodyBlocks = findTopLevelBlocks(xmlStr, "BoQBody");
    if (bodyBlocks.length > 0) parseBoQBody(stripOuterTag(bodyBlocks[0], "BoQBody"), "", 0);
  }

  return { name, eintraege, anzahlPositionen };
}

// ─── Regel-Engine (inline) ───

const REINE_ARBEIT_KEYWORDS = [
  // BE & Schutzmaßnahmen
  "bauzaun aufstellen", "bauzaun umsetzen", "bauzaun herstellen",
  "bauzaun", "baumschutzzaun", "schutzzaun", "absperrung",
  "baustelle einrichten", "baustelle räumen",
  "bereitstellungsfläche",
  "abstecken", "vermessung", "einmessen",
  "verkehrszeichen", "verkehrssicherung",
  "überweg",
  // Abbruch & Demontage
  "ausbau", "ausbauen", "abbrechen", "aufbrechen", "aufnehmen",
  "abtragen", "abbruch", "roden", "entfernen", "demontage", "rückbau",
  // Erdarbeiten (reine Bewegung, kein Material)
  "boden lösen", "boden laden", "boden fördern",
  "oberboden abtragen", "oberboden gelagert", "oberboden lösen",
  "oberboden abschieben",
  "lösen laden fördern", "lösen lagern", "lösen und laden",
  "boden separieren",
  "andecken",
  "planum herstellen", "profilieren", "nachverdichten", "planieren",
  "feinplanum",
  "auflockern", "baugrund auflockern",
  "saugbagger",
  // Vegetationsarbeiten (reine Arbeit)
  "mähen", "fräsen", "vegetationsfläche", "vegetationsflächen",
  "vegetationsschicht fräsen",
  "geräte umsetzen",
  // Sonstiges
  "sichern", "umsetzen", "verschließen",
  "schneiden",
];

const ENTSORGUNGS_KEYWORDS = [
  "entsorgen", "entsorgung", "verwerten", "abfahren",
  "laden und abfahren", "abtransport",
  "bm-0", "bm-f", "abbruchabfälle", "abfälle",
];

const KEINE_ENTSORGUNG_IN_X_KEYWORDS = [
  "ausbauen", "entfernen", "roden", "demontage", "rückbau",
  "sichern", "seitlich lagern",
  "abbrechen", "aufbrechen", "aufnehmen", "abtragen",
  "maltafel", "klettergerät", "spielgerät", "tischtennisplatte",
  "fahrradständer", "holzbarriere", "bänke", "abfallbehälter",
  "rankgitter", "toranlage", "zugang",
  "schneiden",
  "saugbagger",
];

// Lade kalk-regeln.json und preisdatenbank.json
const regeln = JSON.parse(readFileSync("vorgaben/kalk-regeln.json", "utf-8")).regeln;
const preisdatenbank = JSON.parse(readFileSync("vorgaben/preisdatenbank.json", "utf-8")).eintraege;

function regelMatcht(gesamttext, kurztext, regel) {
  const t = gesamttext.toLowerCase();
  const kt = kurztext.toLowerCase();
  for (const kw of regel.keywords) {
    if (!t.includes(kw.toLowerCase())) return false;
  }
  if (regel.keywords_oder?.length > 0) {
    if (!regel.keywords_oder.some(kw => kt.includes(kw.toLowerCase()))) return false;
  }
  if (regel.keywords_nicht?.length > 0) {
    if (regel.keywords_nicht.some(kw => kt.includes(kw.toLowerCase()))) return false;
  }
  return true;
}

function wendeRegelnAn(positionen) {
  const ergebnisse = [];

  for (const pos of positionen) {
    if (pos.art !== "NORMAL") continue;

    const text = (pos.kurztext + " " + (pos.langtext ?? "")).toLowerCase();
    const kurztext = pos.kurztext.toLowerCase();
    const quellen = [];
    const input = {};

    // 1. Keyword-Match
    for (const regel of regeln) {
      if (regelMatcht(text, kurztext, regel)) {
        if (regel.Y !== undefined) input.Y = regel.Y;
        if (regel.Z !== undefined) input.Z = regel.Z;
        if (regel.X !== undefined) input.X = regel.X;
        if (regel.M !== undefined) input.M = regel.M;
        quellen.push({ regel_id: regel.id, begruendung: regel.begruendung });
        break;
      }
    }

    // 2. Preisdatenbank für X
    if (input.X === undefined) {
      // WICHTIG: Reine-Arbeit ZUERST prüfen — hat Vorrang
      const istReineArbeit = REINE_ARBEIT_KEYWORDS.some(kw => kurztext.includes(kw));
      // Entsorgung NUR im KURZTEXT (Langtext enthält oft "entsorgen" bei Arbeitspositionen)
      const istEntsorgungImKurztext = ENTSORGUNGS_KEYWORDS.some(kw => kurztext.includes(kw));
      const istAusbau = KEINE_ENTSORGUNG_IN_X_KEYWORDS.some(kw => kurztext.includes(kw));

      if (istEntsorgungImKurztext && !istAusbau && !istReineArbeit) {
        // Echte Entsorgungsposition → Preis aus PDB
        const sortedPdb = [...preisdatenbank].sort((a, b) => b.suchbegriff.length - a.suchbegriff.length);
        for (const pd of sortedPdb) {
          if (text.includes(pd.suchbegriff)) {
            input.X = pd.preis_pro_einheit;
            quellen.push({ pdb: pd.suchbegriff, preis: pd.preis_pro_einheit });
            break;
          }
        }
        if (input.X === undefined) {
          input.X = 18; // Standard-Entsorgung
          quellen.push({ fallback: "Standard-Entsorgung 18€/t" });
        }
      } else if (istReineArbeit || istAusbau) {
        input.X = 0;
        input._reineArbeit = true;
      } else {
        // PDB Materialsuche
        for (const pd of preisdatenbank) {
          if (!pd.suchbegriff.includes("entsorgung") && kurztext.includes(pd.suchbegriff)) {
            input.X = pd.preis_pro_einheit;
            quellen.push({ pdb: pd.suchbegriff, preis: pd.preis_pro_einheit });
            break;
          }
        }
      }
    }

    const hatZeit = input.Y !== undefined;
    const hatNU = input.M !== undefined;

    ergebnisse.push({
      oz: pos.oz,
      kurztext: pos.kurztext,
      langtext: pos.langtext,
      einheit: pos.einheit,
      menge: pos.menge,
      input,
      quellen,
      abgedeckt: hatZeit || hatNU,
    });
  }

  return ergebnisse;
}

// ─── DA83 Parser (Festformat) ───

function parseGaebDa83(filePath) {
  const buf = readFileSync(filePath);
  const content = buf.toString("latin1");
  const name = basename(filePath);
  const zeilen = content.split(/\r?\n/);
  const eintraege = [];
  let anzahlPositionen = 0;

  let aktuellePositionOz = "";
  let kurztextZeilen = [];
  let langtextZeilen = [];

  function abschliessen() {
    if (!aktuellePositionOz) return;
    const pos = eintraege[eintraege.length - 1];
    if (!pos || pos.oz !== aktuellePositionOz) return;
    if (kurztextZeilen.length > 0) {
      pos.kurztext = kurztextZeilen[0].trim();
      if (pos.kurztext.match(/^-+$/)) {
        pos.kurztext = kurztextZeilen.length > 1 ? kurztextZeilen[1].trim() : `Position ${pos.oz}`;
      }
    }
    if (langtextZeilen.length > 0) {
      pos.langtext = langtextZeilen.map(z => z.trim()).join("\n").trim();
    }
    aktuellePositionOz = "";
    kurztextZeilen = [];
    langtextZeilen = [];
  }

  function ozTiefe2(oz) { return oz.split(".").filter(Boolean).length; }
  function findParent2(tiefe) {
    for (let i = eintraege.length - 1; i >= 0; i--) {
      if (eintraege[i].tiefe < tiefe && eintraege[i].art === "BEREICH") return i;
    }
    return null;
  }

  for (const zeile of zeilen) {
    if (zeile.length < 2) continue;
    const st = zeile.slice(0, 2);
    const rest = zeile.slice(2);

    if (st === "11") {
      abschliessen();
      const ozRaw = rest.slice(0, 9).trim();
      const oz = ozRaw.split(/\s+/).filter(Boolean).join(".");
      const tiefe = ozTiefe2(oz);
      eintraege.push({ oz, art: "BEREICH", kurztext: "", tiefe, parent_index: findParent2(tiefe) });
    } else if (st === "12") {
      const text = rest.replace(/\d{6}\r?$/, "").trim();
      if (eintraege.length > 0 && eintraege[eintraege.length - 1].art === "BEREICH") {
        const b = eintraege[eintraege.length - 1];
        b.kurztext = b.kurztext ? b.kurztext + " " + text : text;
      }
    } else if (st === "21") {
      abschliessen();
      const ozRaw = rest.slice(0, 9).trim();
      const oz = ozRaw.split(/\s+/).filter(Boolean).join(".");
      const nachOz = rest.slice(9);
      const posMatch = nachOz.match(/([NZABE])[NZABE]*\s+(\d{8,11})(\S+)/);
      let menge = 0, einheit;
      if (posMatch) {
        menge = parseInt(posMatch[2], 10) / 1000;
        einheit = posMatch[3].replace(/\.$/, "").trim() || undefined;
      }
      const tiefe = ozTiefe2(oz);
      aktuellePositionOz = oz;
      kurztextZeilen = [];
      langtextZeilen = [];
      eintraege.push({ oz, art: "NORMAL", kurztext: `Position ${oz}`, langtext: undefined, menge, einheit, tiefe, parent_index: findParent2(tiefe) });
      anzahlPositionen++;
    } else if (st === "25" && aktuellePositionOz) {
      const text = rest.replace(/\d{6}\r?$/, "").trim();
      if (!text.match(/^-+$/) || kurztextZeilen.length === 0) kurztextZeilen.push(text);
    } else if (st === "26" && aktuellePositionOz) {
      langtextZeilen.push(rest.replace(/\d{6}\r?$/, "").trim());
    }
  }
  abschliessen();
  return { name, eintraege, anzahlPositionen };
}

function istDa83Format(filePath) {
  try {
    const buf = readFileSync(filePath);
    const start = buf.slice(0, 20).toString("latin1");
    return start.startsWith("00") && !start.startsWith("<?xml") && !start.startsWith("<");
  } catch { return false; }
}

// ─── Dateien finden ───

const BASE = "/Users/admin/Library/CloudStorage/OneDrive-kalku/KT01/1695_Gesellchen_GmbH";

function findGaebFiles(dir) {
  const files = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          // Skip Vorkalkulation und alte Dateien
          if (entry === "08_Vorkalkulation" || entry === "00_Alte_Dateien") continue;
          files.push(...findGaebFiles(full));
        } else {
          const ext = extname(entry).toLowerCase();
          if ([".x83", ".d83", ".x84", ".d84"].includes(ext)) {
            files.push(full);
          }
        }
      } catch {}
    }
  } catch {}
  return files;
}

// ─── Haupt-Test ───

const gaebFiles = findGaebFiles(BASE);
console.log(`\n═══════════════════════════════════════════════════`);
console.log(`  BAUKALK PRO — Massentest Regel-Engine`);
console.log(`  ${gaebFiles.length} GAEB-Dateien gefunden`);
console.log(`═══════════════════════════════════════════════════\n`);

const fehler = {
  parserFehler: [],      // 0 Positionen
  xBeiArbeit: [],        // X > 0 bei reiner Arbeit
  xBeiAbbruch: [],       // X > 0 bei Abbruch
  entsorgungFehlt: [],   // Entsorgungsposition ohne X
  nichtAbgedeckt: [],    // Keine Regel gefunden
};

let totalPositionen = 0;
let totalAbgedeckt = 0;
let totalDateien = 0;
let totalFehler = 0;

for (const datei of gaebFiles) {
  try {
    const result = istDa83Format(datei) ? parseGaebDa83(datei) : parseGaebXml(datei);
    const shortName = datei.replace(BASE + "/", "");

    if (result.anzahlPositionen === 0) {
      fehler.parserFehler.push({ datei: shortName });
      continue;
    }

    totalDateien++;
    totalPositionen += result.anzahlPositionen;

    const regelErgebnisse = wendeRegelnAn(result.eintraege);

    for (const erg of regelErgebnisse) {
      if (erg.abgedeckt) totalAbgedeckt++;

      const kt = erg.kurztext.toLowerCase();
      const text = (erg.kurztext + " " + (erg.langtext ?? "")).toLowerCase();

      // Prüfung 1: X > 0 bei reiner Arbeitsleistung?
      if (erg.input.X > 0 && !erg.input._reineArbeit) {
        const sollReineArbeit = REINE_ARBEIT_KEYWORDS.some(kw => kt.includes(kw));
        if (sollReineArbeit) {
          fehler.xBeiArbeit.push({ datei: shortName, oz: erg.oz, kurztext: erg.kurztext, X: erg.input.X });
          totalFehler++;
        }
      }

      // Prüfung 2: X > 0 bei Abbruch-Positionen?
      if (erg.input.X > 0) {
        const istAbbruch = KEINE_ENTSORGUNG_IN_X_KEYWORDS.some(kw => kt.includes(kw));
        if (istAbbruch) {
          fehler.xBeiAbbruch.push({ datei: shortName, oz: erg.oz, kurztext: erg.kurztext, X: erg.input.X });
          totalFehler++;
        }
      }

      // Prüfung 3: Entsorgungsposition ohne X?
      // NUR Kurztext prüfen (gleiche Logik wie Regel-Engine)
      const istEntsorgung = ENTSORGUNGS_KEYWORDS.some(kw => kt.includes(kw));
      const istAusbauCheck = KEINE_ENTSORGUNG_IN_X_KEYWORDS.some(kw => kt.includes(kw));
      const istReineArbeitCheck = REINE_ARBEIT_KEYWORDS.some(kw => kt.includes(kw));
      if (istEntsorgung && !istAusbauCheck && !istReineArbeitCheck && (erg.input.X === undefined || erg.input.X === 0)) {
        fehler.entsorgungFehlt.push({ datei: shortName, oz: erg.oz, kurztext: erg.kurztext });
        totalFehler++;
      }

      // Prüfung 4: Nicht abgedeckt (kein Y, kein M)
      if (!erg.abgedeckt) {
        fehler.nichtAbgedeckt.push({ datei: shortName, oz: erg.oz, kurztext: erg.kurztext, einheit: erg.einheit });
      }
    }
  } catch (e) {
    fehler.parserFehler.push({ datei: datei.replace(BASE + "/", ""), error: e.message });
  }
}

// ─── Ergebnis-Report ───

console.log(`\n══════════════════════════════════════════════════`);
console.log(`  ERGEBNIS-ZUSAMMENFASSUNG`);
console.log(`══════════════════════════════════════════════════`);
console.log(`  Dateien verarbeitet:  ${totalDateien}`);
console.log(`  Positionen gesamt:    ${totalPositionen}`);
console.log(`  Davon abgedeckt:      ${totalAbgedeckt} (${(totalAbgedeckt/totalPositionen*100).toFixed(1)}%)`);
console.log(`  Nicht abgedeckt:      ${totalPositionen - totalAbgedeckt} → gehen an KI`);
console.log(`  Kritische Fehler:     ${totalFehler}`);
console.log(`══════════════════════════════════════════════════\n`);

if (fehler.parserFehler.length > 0) {
  console.log(`\n⚠ PARSER-FEHLER (${fehler.parserFehler.length} Dateien):`);
  for (const f of fehler.parserFehler) {
    console.log(`  - ${f.datei}${f.error ? `: ${f.error}` : " (0 Positionen)"}`);
  }
}

if (fehler.xBeiArbeit.length > 0) {
  console.log(`\n❌ X > 0 BEI REINER ARBEIT (${fehler.xBeiArbeit.length}):`);
  for (const f of fehler.xBeiArbeit) {
    console.log(`  - [${f.oz}] "${f.kurztext}" → X=${f.X}€`);
    console.log(`    Datei: ${f.datei}`);
  }
}

if (fehler.xBeiAbbruch.length > 0) {
  console.log(`\n❌ X > 0 BEI ABBRUCH/AUSBAU (${fehler.xBeiAbbruch.length}):`);
  for (const f of fehler.xBeiAbbruch) {
    console.log(`  - [${f.oz}] "${f.kurztext}" → X=${f.X}€`);
    console.log(`    Datei: ${f.datei}`);
  }
}

if (fehler.entsorgungFehlt.length > 0) {
  console.log(`\n⚠ ENTSORGUNG OHNE X-WERT (${fehler.entsorgungFehlt.length}):`);
  for (const f of fehler.entsorgungFehlt) {
    console.log(`  - [${f.oz}] "${f.kurztext}"`);
    console.log(`    Datei: ${f.datei}`);
  }
}

// Nicht-abgedeckt: nur Zusammenfassung, nicht jede einzelne Position
const nichtAbgedecktNachDatei = {};
for (const f of fehler.nichtAbgedeckt) {
  if (!nichtAbgedecktNachDatei[f.datei]) nichtAbgedecktNachDatei[f.datei] = [];
  nichtAbgedecktNachDatei[f.datei].push(f);
}

console.log(`\n📋 NICHT ABGEDECKTE POSITIONEN (→ KI nötig): ${fehler.nichtAbgedeckt.length}`);
for (const [datei, posis] of Object.entries(nichtAbgedecktNachDatei)) {
  console.log(`  ${datei}: ${posis.length} Positionen offen`);
  // Zeige erste 3 als Beispiel
  for (const p of posis.slice(0, 3)) {
    console.log(`    - [${p.oz}] "${p.kurztext}" (${p.einheit ?? "?"})`);
  }
  if (posis.length > 3) console.log(`    ... und ${posis.length - 3} weitere`);
}

console.log(`\n═══════════════════════════════════════════════════`);
console.log(`  TEST ABGESCHLOSSEN`);
console.log(`═══════════════════════════════════════════════════\n`);
