/**
 * TypeScript-Deklaration für die Electron-Brücke (window.baukalk)
 */
interface BaukalkApi {
  platform: string;
  version: string;
  lvImportieren: () => Promise<import("@baukalk/datenmodell").LvImport | null>;
  lvExportieren: (optionen: unknown) => Promise<string | null>;
  vorgabenLaden: (pfad: string) => Promise<unknown>;
  vorgabenSpeichern: (pfad: string, daten: unknown) => Promise<boolean>;
  projektSpeichern: (pfad: string, daten: unknown) => Promise<boolean>;
  projektLaden: (pfad: string) => Promise<unknown>;
}

declare global {
  interface Window {
    baukalk: BaukalkApi;
  }
}

export {};
