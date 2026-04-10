/**
 * GAEB DA XML Parser (X83/X84/X86/X81)
 *
 * Parser für GAEB DA XML Dateien. Liest die Hierarchie und
 * Positionen aus dem XML-Format. Unterstützt XML-Namespaces
 * und tief verschachtelte BoQCtgy-Strukturen.
 *
 * GAEB DA XML Struktur:
 * <GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.2">
 *   <Award>
 *     <BoQ>
 *       <BoQBody>
 *         <BoQCtgy RNoPart="01">
 *           <LblTx>Baustelleneinrichtung</LblTx>
 *           <BoQBody>
 *             <BoQCtgy RNoPart="01">   <!-- verschachtelt! -->
 *               <LblTx>Unter-Bereich</LblTx>
 *               <BoQBody>
 *                 <Itemlist>
 *                   <Item RNoPart="0010">
 *                     <Qty>90</Qty>
 *                     <QU>m2</QU>
 *                     <Description>
 *                       <CompleteText>
 *                         <OutlineText><OutlTxt><TextOutlTxt>...</TextOutlTxt></OutlTxt></OutlineText>
 *                       </CompleteText>
 *                     </Description>
 *                   </Item>
 *                 </Itemlist>
 *               </BoQBody>
 *             </BoQCtgy>
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

// ─── Namespace-tolerante XML-Hilfsfunktionen ──────────────────────────

/**
 * Erzeugt ein Regex-Pattern das Tags mit oder ohne Namespace-Prefix matcht.
 * z.B. "BoQCtgy" matcht sowohl <BoQCtgy> als auch <ns:BoQCtgy> oder <gaeb:BoQCtgy>
 */
function nsTagPattern(tag: string): string {
  return `(?:[a-zA-Z0-9_]+:)?${tag}`;
}

/**
 * Findet alle top-level Vorkommen eines Tags (nesting-sicher).
 * Berücksichtigt XML-Namespaces.
 */
function findTopLevelBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const openRe = new RegExp(`<${nsTagPattern(tag)}[\\s>/]`, "g");

  let match: RegExpExecArray | null;
  while ((match = openRe.exec(xml)) !== null) {
    const startIdx = match.index;
    let nestLevel = 0;
    let pos = startIdx;
    let endIdx = -1;

    while (pos < xml.length) {
      const openM = xml.slice(pos).match(new RegExp(`^<${nsTagPattern(tag)}[\\s>/]`));
      if (openM) {
        nestLevel++;
        pos += openM[0].length;
        continue;
      }

      const closeM = xml.slice(pos).match(new RegExp(`^<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`));
      if (closeM) {
        nestLevel--;
        if (nestLevel === 0) {
          endIdx = pos + closeM[0].length;
          break;
        }
        pos += closeM[0].length;
        continue;
      }

      pos++;
    }

    if (endIdx === -1) break;
    blocks.push(xml.slice(startIdx, endIdx));
    openRe.lastIndex = endIdx;
  }

  return blocks;
}

/**
 * Holt den Inhalt des ERSTEN Vorkommens eines Tags (namespace-tolerant).
 * Für einfache, nicht verschachtelte Tags wie LblTx, Qty, QU etc.
 */
function getTagContent(xml: string, tag: string): string | null {
  const re = new RegExp(`<${nsTagPattern(tag)}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1]!.trim() : null;
}

/**
 * Holt ein Attribut aus dem öffnenden Tag (namespace-tolerant).
 */
function getAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${nsTagPattern(tag)}[^>]*\\s${attr}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1]! : null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
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
 * Entfernt den äußeren Tag und gibt den Inhalt zurück.
 */
function stripOuterTag(block: string, tag: string): string {
  const openRe = new RegExp(`^<${nsTagPattern(tag)}[^>]*>`);
  const closeRe = new RegExp(`<\\/(?:[a-zA-Z0-9_]+:)?${tag}>$`);
  return block.replace(openRe, "").replace(closeRe, "").trim();
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

  if (typeof input === "string" && !input.startsWith("<?xml") && !input.startsWith("<GAEB") && !input.startsWith("<gaeb")) {
    // Es ist ein Dateipfad
    xmlStr = readFileSync(input, "utf-8");
    name = dateiname ?? basename(input);
  } else if (Buffer.isBuffer(input)) {
    xmlStr = input.toString("utf-8");
    name = dateiname ?? "unbekannt.x83";
  } else {
    xmlStr = input as string;
    name = dateiname ?? "unbekannt.x83";
  }

  const eintraege: LvEintrag[] = [];
  let anzahlPositionen = 0;
  let anzahlBereiche = 0;

  /**
   * Rekursiv durch BoQCtgy (Bereiche) und Item (Positionen) gehen.
   * Nesting-sicher: findet top-level BoQCtgy und Itemlist-Blöcke korrekt.
   */
  function parseBoQBody(bodyContent: string, ozPrefix: string, depth: number): void {
    // 1. Top-level BoQCtgy-Blöcke in diesem Body finden
    const ctgyBlocks = findTopLevelBlocks(bodyContent, "BoQCtgy");

    // BoQCtgy-Blöcke aus dem Body entfernen, damit wir danach nur noch
    // die Itemlists finden, die DIREKT in diesem Body liegen (nicht in Sub-BoQCtgy)
    let bodyOhneCtgy = bodyContent;
    for (const ctgyBlock of ctgyBlocks) {
      bodyOhneCtgy = bodyOhneCtgy.replace(ctgyBlock, "");
    }

    let ctgyIndex = 0;
    for (const ctgyBlock of ctgyBlocks) {
      ctgyIndex++;
      const rno = getAttr(ctgyBlock, "BoQCtgy", "RNoPart") ?? String(ctgyIndex).padStart(2, "0");
      const oz = ozPrefix ? `${ozPrefix}.${rno}` : rno;

      // LblTx aus dem BoQCtgy (nicht aus verschachtelten!)
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

      // Innere BoQBody-Blöcke suchen (es kann mehrere geben)
      const innerContent = stripOuterTag(ctgyBlock, "BoQCtgy");
      const innerBodies = findTopLevelBlocks(innerContent, "BoQBody");

      for (const innerBodyBlock of innerBodies) {
        const innerBodyContent = stripOuterTag(innerBodyBlock, "BoQBody");
        parseBoQBody(innerBodyContent, oz, depth + 1);
      }
    }

    // 2. Top-level Itemlist-Blöcke finden — NUR die, die direkt in diesem Body
    //    liegen, nicht in verschachtelten BoQCtgy
    const itemlistBlocks = findTopLevelBlocks(bodyOhneCtgy, "Itemlist");

    for (const itemlistBlock of itemlistBlocks) {
      const itemlistContent = stripOuterTag(itemlistBlock, "Itemlist");

      // Remark-Blöcke als HINWEIS-Einträge importieren
      const remarkBlocks = findTopLevelBlocks(itemlistContent, "Remark");
      for (const remarkBlock of remarkBlocks) {
        const remarkContent = stripOuterTag(remarkBlock, "Remark");
        let hinweisText = "";
        const outlineTxt = getTagContent(remarkContent, "OutlTxt");
        if (outlineTxt) {
          const textOutl = getTagContent(outlineTxt, "TextOutlTxt");
          hinweisText = stripTags(textOutl ?? outlineTxt);
        }
        if (!hinweisText) {
          const textOutlTxt = getTagContent(remarkContent, "TextOutlTxt");
          if (textOutlTxt) hinweisText = stripTags(textOutlTxt);
        }
        // Langtext aus DetailTxt
        let hinweisLang: string | undefined;
        const detailTxt = getTagContent(remarkContent, "DetailTxt");
        if (detailTxt) hinweisLang = stripTags(detailTxt);
        if (!hinweisLang) {
          const textEl = getTagContent(remarkContent, "Text");
          if (textEl) hinweisLang = stripTags(textEl);
        }

        if (hinweisText || hinweisLang) {
          const tiefe = ozTiefe(ozPrefix || "0") + 1;
          eintraege.push({
            oz: "",
            art: "HINWEIS",
            kurztext: hinweisText || "Hinweis",
            langtext: hinweisLang,
            menge: undefined,
            einheit: undefined,
            ep: undefined,
            gp: undefined,
            tiefe,
            parent_index: findParentIndex(eintraege, tiefe),
          });
        }
      }

      // Items als Positionen
      const items = findTopLevelBlocks(itemlistContent, "Item");

      let itemIndex = 0;
      for (const itemBlock of items) {
        itemIndex++;
        const itemContent = stripOuterTag(itemBlock, "Item");

        const rno = getAttr(itemBlock, "Item", "RNoPart") ?? String(itemIndex).padStart(4, "0");
        const oz = ozPrefix ? `${ozPrefix}.${rno}` : rno;

        const qty = getTagContent(itemContent, "Qty");
        const qu = getTagContent(itemContent, "QU");

        // Texte extrahieren
        let kurztext = "";
        let langtext: string | undefined;

        // OutlineText → OutlTxt → TextOutlTxt
        const outlineTxt = getTagContent(itemContent, "OutlTxt");
        if (outlineTxt) {
          const textOutl = getTagContent(outlineTxt, "TextOutlTxt");
          kurztext = stripTags(textOutl ?? outlineTxt);
        }
        if (!kurztext) {
          const textOutlTxt = getTagContent(itemContent, "TextOutlTxt");
          if (textOutlTxt) kurztext = stripTags(textOutlTxt);
        }

        // DetailText / DetailTxt / Text
        const detailTxt = getTagContent(itemContent, "DetailTxt");
        if (detailTxt) {
          langtext = stripTags(detailTxt);
        }
        if (!langtext) {
          const detailText = getTagContent(itemContent, "DetailText");
          if (detailText) langtext = stripTags(detailText);
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

  // Einstiegspunkt: Erstes BoQBody im Award/BoQ finden
  // (das äußerste BoQBody, das die gesamte Struktur enthält)
  const boqBlocks = findTopLevelBlocks(xmlStr, "BoQ");
  if (boqBlocks.length > 0) {
    const boqContent = stripOuterTag(boqBlocks[0]!, "BoQ");
    const bodyBlocks = findTopLevelBlocks(boqContent, "BoQBody");
    if (bodyBlocks.length > 0) {
      const bodyContent = stripOuterTag(bodyBlocks[0]!, "BoQBody");
      parseBoQBody(bodyContent, "", 0);
    }
  } else {
    // Fallback: direkt nach BoQBody suchen
    const bodyBlocks = findTopLevelBlocks(xmlStr, "BoQBody");
    if (bodyBlocks.length > 0) {
      const bodyContent = stripOuterTag(bodyBlocks[0]!, "BoQBody");
      parseBoQBody(bodyContent, "", 0);
    }
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
