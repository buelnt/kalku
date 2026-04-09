/**
 * Audit-Log — Append-only Protokoll aller Änderungen
 *
 * Jedes Ereignis wird als eine Zeile (JSONL) gespeichert.
 * Die Datei wird nie modifiziert, nur angehängt.
 *
 * Erfasst:
 * - Wer hat was wann geändert
 * - Alter und neuer Wert
 * - Entität (z.B. "vorgaben/gewerke/rohbau.json#pflaster_verlegen")
 * - Optionaler Kommentar
 */

export interface AuditEvent {
  zeitstempel: string;
  nutzer: string;
  aktion: "geaendert" | "erstellt" | "geloescht" | "genehmigt" | "abgelehnt" | "importiert" | "exportiert";
  entitaet: string;
  alter_wert?: string;
  neuer_wert?: string;
  kommentar?: string;
}

/**
 * Erstellt einen JSONL-String für ein Audit-Event.
 * Wird an die Audit-Log-Datei angehängt.
 */
export function auditEventZuJsonl(event: AuditEvent): string {
  return JSON.stringify(event) + "\n";
}

/**
 * Erstellt ein Audit-Event.
 */
export function erstelleAuditEvent(
  nutzer: string,
  aktion: AuditEvent["aktion"],
  entitaet: string,
  alterWert?: string,
  neuerWert?: string,
  kommentar?: string,
): AuditEvent {
  return {
    zeitstempel: new Date().toISOString(),
    nutzer,
    aktion,
    entitaet,
    alter_wert: alterWert,
    neuer_wert: neuerWert,
    kommentar,
  };
}
