/**
 * GAEB DA XML Parser (X83/X84/X86/X81)
 *
 * Minimaler Parser für GAEB DA XML Dateien. Liest die Hierarchie und
 * Positionen aus dem XML-Format.
 *
 * GAEB DA XML Struktur (vereinfacht):
 * <GAEB>
 *   <GAEBInfo>...</GAEBInfo>
 *   <Award>
 *     <BoQ>
 *       <BoQBody>
 *         <BoQCtgy>              <!-- Bereich/Abschnitt -->
 *           <LblTx>Text</LblTx>
 *           <BoQBody>
 *             <Itemlist>
 *               <Item>           <!-- Position -->
 *                 <Qty>90</Qty>
 *                 <QU>m2</QU>
 *                 <Description>
 *                   <CompleteText>
 *                     <OutlineText><OutlTxt><TextOutlTxt>Kurztext</TextOutlTxt></OutlTxt></OutlineText>
 *                     <DetailText><Text><TextOutlTxt>Langtext</TextOutlTxt></Text></DetailText>
 *                   </CompleteText>
 *                 </Description>
 *               </Item>
 *             </Itemlist>
 *           </BoQBody>
 *         </BoQCtgy>
 *       </BoQBody>
 *     </BoQ>
 *   </Award>
 * </GAEB>
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Decimal } from "@baukalk/datenmodell";
import type { LvImport, LvEintrag, ImportMeta } from "@baukalk/datenmodell";

/**
 * Sehr einfacher XML-Tag-Extraktor (kein vollständiger XML-Parser).
 * Für GAEB-XML reicht das, weil die Struktur konsistent ist.
 */
function getTagContent(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1]!.trim() : null;
}

function getAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]!);
  }
  return results;
}

function getAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1]! : null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function ozTiefe(oz: string): number {
  return oz.split(".").length;
}

function findParentIndex(eintraege: LvEintrag[], tiefe: number): number | null {
  for (let i = eintraege.length - 1; i >= 0; i--) {
    if (eintraege[i]!.tiefe < tiefe && eintraege[i]!.art === "BEREICH") return i;
  }
  return null;
}

/**
 * Parst eine GAEB DA XML Datei (X83/X84/X86/X81).
 */
export function parseGaebXml(
  input: string | Buffer,
  dateiname?: string,
): LvImport {
  let xmlStr: string;
  let name: string;

  if (typeof input === "string" && !input.startsWith("<?xml") && !input.startsWith("<GAEB")) {
    // Es ist ein Dateipfad
    xmlStr = readFileSync(input, "utf-8");
    name = dateiname ?? basename(input);
  } else if (Buffer.isBuffer(input)) {
    xmlStr = input.toString("utf-8");
    name = dateiname ?? "unbekannt.x83";
  } else {
    xmlStr = input;
    name = dateiname ?? "unbekannt.x83";
  }

  const eintraege: LvEintrag[] = [];
  let anzahlPositionen = 0;
  let anzahlBereiche = 0;

  // Rekursiv durch BoQCtgy (Bereiche) und Item (Positionen) gehen
  function parseBoQBody(xml: string, ozPrefix: string, depth: number): void {
    // Bereiche (BoQCtgy)
    const ctgyPattern = /<BoQCtgy[^>]*>([\s\S]*?)<\/BoQCtgy>/gi;
    let ctgyMatch: RegExpExecArray | null;
    let ctgyIndex = 0;

    // Wir müssen vorsichtig sein mit verschachtelten BoQCtgy
    // Einfacher Ansatz: top-level BoQCtgy in diesem Body finden
    const ctgyBlocks: string[] = [];
    let searchPos = 0;
    while (true) {
      const startIdx = xml.indexOf("<BoQCtgy", searchPos);
      if (startIdx === -1) break;

      // Finde das passende Ende
      let nestLevel = 0;
      let pos = startIdx;
      let endIdx = -1;
      while (pos < xml.length) {
        if (xml.startsWith("<BoQCtgy", pos)) {
          nestLevel++;
          pos += 8;
        } else if (xml.startsWith("</BoQCtgy>", pos)) {
          nestLevel--;
          if (nestLevel === 0) {
            endIdx = pos + 10;
            break;
          }
          pos += 10;
        } else {
          pos++;
        }
      }
      if (endIdx === -1) break;
      ctgyBlocks.push(xml.slice(startIdx, endIdx));
      searchPos = endIdx;
    }

    for (const ctgyBlock of ctgyBlocks) {
      ctgyIndex++;
      const rno = getAttr(ctgyBlock, "BoQCtgy", "RNoPart") ?? String(ctgyIndex).padStart(2, "0");
      const oz = ozPrefix ? `${ozPrefix}.${rno}` : rno;
      const lblTx = getTagContent(ctgyBlock, "LblTx") ?? "";

      const tiefe = ozTiefe(oz);
      const parentIndex = findParentIndex(eintraege, tiefe);

      eintraege.push({
        oz,
        art: "BEREICH",
        kurztext: stripTags(lblTx),
        langtext: undefined,
        menge: undefined,
        einheit: undefined,
        ep: undefined,
        gp: undefined,
        tiefe,
        parent_index: parentIndex,
      });
      anzahlBereiche++;

      // Inneren BoQBody suchen
      const innerBody = getTagContent(ctgyBlock, "BoQBody");
      if (innerBody) {
        parseBoQBody(innerBody, oz, depth + 1);
      }
    }

    // Positionen (Item) in Itemlist
    const itemlistContent = getTagContent(xml, "Itemlist");
    if (itemlistContent) {
      const items = getAllTags(itemlistContent, "Item");
      for (const item of items) {
        const rno = getAttr(`<Item ${item}`, "Item", "RNoPart") ??
          getTagContent(item, "RNoPart") ?? String(items.indexOf(item) + 1).padStart(4, "0");
        const oz = ozPrefix ? `${ozPrefix}.${rno}` : rno;

        const qty = getTagContent(item, "Qty");
        const qu = getTagContent(item, "QU");

        // Texte extrahieren
        let kurztext = "";
        let langtext: string | undefined;

        const outlineTxt = getTagContent(item, "OutlTxt");
        if (outlineTxt) {
          kurztext = stripTags(outlineTxt);
        }
        const textOutlTxt = getTagContent(item, "TextOutlTxt");
        if (textOutlTxt && !kurztext) {
          kurztext = stripTags(textOutlTxt);
        }

        const detailText = getTagContent(item, "DetailTxt");
        if (detailText) {
          langtext = stripTags(detailText);
        }
        if (!langtext) {
          const detText = getTagContent(item, "Text");
          if (detText) langtext = stripTags(detText);
        }

        const menge = qty ? new Decimal(qty.replace(",", ".")) : new Decimal(0);
        const tiefe = ozTiefe(oz);
        const parentIndex = findParentIndex(eintraege, tiefe);

        eintraege.push({
          oz,
          art: "NORMAL",
          kurztext: kurztext || `Position ${oz}`,
          langtext,
          menge,
          einheit: qu ?? undefined,
          ep: undefined,
          gp: undefined,
          tiefe,
          parent_index: parentIndex,
        });
        anzahlPositionen++;
      }
    }
  }

  // Einstiegspunkt: BoQBody im Award/BoQ
  const boqBody = getTagContent(xmlStr, "BoQBody");
  if (boqBody) {
    parseBoQBody(boqBody, "", 0);
  }

  // Quelle bestimmen
  const ext = name.toLowerCase();
  let quelle: ImportMeta["quelle"] = "gaeb_x83";
  if (ext.endsWith(".x84")) quelle = "gaeb_x84";
  else if (ext.endsWith(".x86")) quelle = "gaeb_x86";
  else if (ext.endsWith(".x81")) quelle = "gaeb_x81";

  const meta: ImportMeta = {
    quelle,
    original_datei: name,
    importiert_am: new Date().toISOString(),
  };

  return {
    meta,
    eintraege,
    anzahl_positionen: anzahlPositionen,
    anzahl_bereiche: anzahlBereiche,
  };
}
