/**
 * CP850 (DOS Latin-1) Decoder
 *
 * GAEB DA 1990 Flat-Files verwenden CP850 als Encoding. Node.js'
 * TextDecoder unterstützt CP850 nicht nativ (nur utf-8 und diverse
 * iso/win-Encodings).
 *
 * Statt einer schweren Dependency (iconv-lite) verwenden wir eine
 * vollständige Lookup-Tabelle für die oberen 128 Zeichen (0x80-0xFF).
 * Die unteren 128 Zeichen sind identisch mit ASCII.
 *
 * Quelle: https://en.wikipedia.org/wiki/Code_page_850
 */

// prettier-ignore
const CP850_UPPER: string[] = [
  // 0x80-0x8F
  'Ç','ü','é','â','ä','à','å','ç','ê','ë','è','ï','î','ì','Ä','Å',
  // 0x90-0x9F
  'É','æ','Æ','ô','ö','ò','û','ù','ÿ','Ö','Ü','ø','£','Ø','×','ƒ',
  // 0xA0-0xAF
  'á','í','ó','ú','ñ','Ñ','ª','º','¿','®','¬','½','¼','¡','«','»',
  // 0xB0-0xBF
  '░','▒','▓','│','┤','Á','Â','À','©','╣','║','╗','╝','¢','¥','┐',
  // 0xC0-0xCF
  '└','┴','┬','├','─','┼','ã','Ã','╚','╔','╩','╦','╠','═','╬','¤',
  // 0xD0-0xDF
  'ð','Ð','Ê','Ë','È','ı','Í','Î','Ï','┘','┌','█','▄','¦','Ì','▀',
  // 0xE0-0xEF
  'Ó','ß','Ô','Ò','õ','Õ','µ','þ','Þ','Ú','Û','Ù','ý','Ý','¯','´',
  // 0xF0-0xFF
  '\u00AD','±','‗','¾','¶','§','÷','¸','°','¨','·','¹','³','²','■',' ',
];

/**
 * Dekodiert einen Buffer von CP850 nach Unicode-String.
 *
 * @param buffer Der CP850-kodierte Buffer
 * @returns Der dekodierte Unicode-String
 */
export function decodeCp850(buffer: Buffer): string {
  const chars: string[] = new Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i]!;
    if (byte < 0x80) {
      chars[i] = String.fromCharCode(byte);
    } else {
      chars[i] = CP850_UPPER[byte - 0x80]!;
    }
  }
  return chars.join("");
}
