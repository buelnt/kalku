# BauKalk Pro — Spezifikation

**Version 0.1 — Interview-Ergebnis**
**Stand:** 2026-04-09
**Autor:** Claude (auf Basis Interview mit Master)
**Status:** Entwurf, zur Review durch Senior-Kalkulator

---

## 0. Leitprinzip

> *„Ich brauche so schnell es geht meine automatisierten Kalkulationen, damit ich wieder Luft zum Atmen bekomme."*

Das ist der Nordstern dieser Spezifikation. Jede Entscheidung in Phase 1 wird daran gemessen, ob sie dem Kalkulator **aktiv Zeit spart**. Features, die nur „nice to have" sind, wandern explizit in Phase 2 oder später. Konsistenz, Korrektheit und Automatisierung schlagen Funktionsumfang.

---

## 1. Vision

**BauKalk Pro** ersetzt die heute bei **kalku.de** eingesetzten Excel-Kalkulationstabellen für Baukalkulationen. Die Software übernimmt den kompletten Weg von der eingehenden GAEB-/Excel-/PDF-Ausschreibung bis zum fertig bepreisten LV, mit maximaler Automatisierung, konsistenter Regel-Anwendung und rechtssicherer Dokumentation.

**Geschäftsmodell:**

1. **Phase 1 — kalku.de intern:** Ablösung der Excel-Workflow für die beiden aktiven Senior-Kalkulatoren.
2. **Phase 2 und später — externer Verkauf:** Lizenzierung an Baufirmen, die ihre eigenen Kalkulationen selbst erstellen wollen. Das Geschäftsmodell basiert auf dem Verkauf von Software **plus** dem kalku.de-Vorgabenpaket (Zeitwerte, Erschwernis-Regeln, Modifier-Keywords) als separatem, geschütztem Wertgegenstand.

**Drei nicht verhandelbare Konventionen** (aus `CLAUDE.md`, gelten für jeden Code-Change):

1. **Sprache:** Die gesamte Benutzeroberfläche (Labels, Meldungen, Fehler, Tooltips, Menüs) ist auf Deutsch. User-facing Strings niemals auf Englisch.
2. **Zahlenformat:** Darstellung immer als `1.234,56 €`. Parsing und Formatierung konsistent über `de-DE`-Locale. Niemals JavaScript-Default (`toString`, `toLocaleString()` ohne Locale).
3. **Rechenergebnisse müssen exakt mit Excel übereinstimmen.** Das ist die wichtigste Korrektheitsgarantie. Jede Änderung an der Berechnungslogik wird gegen Referenz-Excel-Werte getestet. Rundungsregeln (kaufmännisch, Stellenzahl, Reihenfolge) entsprechen Excel 1:1.
4. **MwSt. ist immer konfigurierbar, niemals hardcoded.** Kein `* 1.19`, kein `VAT = 0.19`. Der Satz kommt aus der Konfiguration und ist pro Kalkulation einstellbar.

---

## 2. Scope-Lock

### 2.1 Phase 1 — Was gebaut wird

Eine **native macOS-Desktop-App** (Electron + React + TypeScript + lokales SQLite als Cache + JSON-Source-of-Truth auf OneDrive), die folgenden End-zu-End-Flow abdeckt:

1. **Projekt anlegen**
   - Kunde auswählen (Baufirma, für die kalkuliert wird; z.B. Gesellchen GmbH)
   - Kalkulationsprofil auswählen (Scharf / Normal / Großzügig)
   - Basisparameter vorausfüllen: Verrechnungslohn, Material-Zuschlag, NU-Zuschlag, Geräte-Grundzuschlag, Zeitwert-Faktor, Gerätezulage-Default
   - Alle Parameter nachjustierbar

2. **LV-Import**
   - **GAEB DA 1990 Flat** (`.d83` Leistungsbeschreibung, `.d84` Angebotsabgabe)
   - **GAEB DA XML** (`.x83`, `.x84`, `.x86`)
   - **Excel LV** im Format `OZ | PosArt | Kurztext | Menge | Einheit | EP | GP` (wie in Gesellchen/Riegelsberg gesehen)
   - **PDF-LV** als Notnagel (Text-Extraktion + heuristisches Parsing + manueller Review-Schritt)
   - Beim Import: Lang-/Kurztext-Split (bei `\n` in Excel oder separater GAEB-Text), STLB-Code-Erfassung falls vorhanden

3. **Automatische Gewerk-Zuweisung** pro LV-Abschnitt über Bereichstitel (z.B. „Waldfriedhof" → GaLaBau, „Straßenbau" → Tiefbau)

4. **Automatische Vorausfüllung aller Positionen** über Match-Kaskade:
   1. STLB-Code-Match (wenn vorhanden) gegen internen Katalog
   2. Exakter Textmatch gegen Stammdatenbank
   3. Fuzzy-Text-Match
   4. Semantisches Embedding-Match gegen Alt-LV-Korpus (*nur* als Referenz, nie als Wahrheit)
   5. Gewerk-Default aus Admin-Panel
   6. Fallback: leer lassen, manuell füllen

5. **Modifier-Keyword-Scan** im Langtext
   - NU-Trigger (*Fallschutz, Markierung, TÜV, Sachverständig, DIN 1176, Spielplatz-Prüfung* → `M>0`, `Y=0`, `X=leer`)
   - Erschwernis-Trigger (*Leibung, schmaler Streifen, inkl. Fundament und Rückenstütze, anpassen, wechselfeucht, Sonderform, befahrbar*)
   - Vorhalte-Trigger (*StWo, mWo, StMt, StTag + „vorhalten"* → X leer, Y=0, AA als Override)
   - Alle Treffer werden transparent im UI angezeigt und können vom Kalkulator bestätigt/verworfen werden

6. **Positions-Gruppen-Sperre** (Mischkalkulations-Vermeidung)
   - Positionen mit normalisiertem identischen Text werden beim Import zu einer Gruppe zusammengefasst
   - Ein EP pro Gruppe — Änderung an einer Position propagiert auf alle
   - Automatische Kleinmengen-Erschwernis (unter Schwellwert pro Gewerk: eigene Gruppe, Pflicht-Begründung „Kleinmenge, erschwerter Zugang/Anfahrt")
   - Explizite Entkopplung bei echten Erschwernis-Unterschieden (Hanglage, besondere Tiefe) mit Pflicht-Begründung; entkoppelter EP *muss* höher sein als Gruppen-EP

7. **Rechenkern** exakt wie Excel LV3
   - `AC = Y + (Y/100) × Zeitwert_Faktor` → bidirektional (negativ = Reduktion, positiv = Erhöhung)
   - `AA = (AC/60) × Z` → Geräte-EP je Einheit
   - `AB = (AC/60) × Verrechnungslohn` → Lohn-EP je Einheit
   - `AJ = X × (1 + Material_Zuschlag)` → Stoffe-VK
   - `AK = M × (1 + NU_Zuschlag)` → NU-VK
   - `EP = AA + AB + AJ + AK`
   - `GP = Menge × EP`

8. **Mengenermittlung — Hybrid**
   - **Typisierte Bausteine** (Standardfall):
     - *Volumen-pro-Einheit* (Breite × Höhe × Tiefe → m³, × Preis/m³, × Zeit/m³)
     - *Dicke-pro-Fläche* (Dicke → m³/m², × Preis, × Zeit)
     - *Gewicht-pro-Volumen* (m³ × Dichte → t, × Preis/t)
     - *Direkt* (EP und Zeit direkt eintragen)
   - **Custom-Formel** als Expertenmodus-Fallback, mit Warnung „Plausi und Lernpfad eingeschränkt"

9. **Erschwernis-Zuschläge** als erstklassige Entität
   - Form: `Zeit_gesamt = Grundzeit × Menge + Aufschlag(Trigger)`
   - Beispiele aus Interview: Leibung +1 min/lfm, Pflaster-Streifen +5 min/lfm, Einzelfundament +10 min/Stück
   - Pro Gewerk im Admin-Panel editierbar

10. **Plausi-Check nach jeder Position**
    - Regel-Engine aus `rules.json` (Baseline: Leitfaden v1.3)
    - `FAIL` blockiert weitere Bearbeitung bis behoben
    - `WARN` muss vom Kalkulator mit Freitext begründet werden
    - `PASS` läuft durch

11. **Korrektur-Workflow**
    - Beim Projektabschluss zeigt ein Sammel-Dialog alle geänderten Default-Werte
    - Pro Zeile zwei Häkchen: `[ ] Für diesen Kunden als Vorgabe speichern` / `[ ] Global als neuen Default speichern`
    - Kein Häkchen = nur in diesem Projekt wirksam
    - Alle Entscheidungen landen im Audit-Log

12. **Rollen**
    - **Senior Kalkulator:** Vollzugriff, schreibt Defaults direkt, genehmigt Junior-Vorschläge
    - **Junior Kalkulator:** Arbeitet in seinem Projekt, Projekt-Werte sofort aktiv; Default-Änderungen landen in einer Approval-Queue, werden erst nach Senior-Freigabe persistent
    - **Admin** (implizit = Senior): Konfiguration von Gewerken, Profilen, Regeln

13. **Admin-Panel**
    - Gewerke-Struktur (Kategorien, Gewerke, Default-Zeitwerte, Erschwernis-Schwellwerte)
    - Kalkulationsprofile (Scharf / Normal / Großzügig mit allen Parametersätzen)
    - Modifier-Keywords (Trigger + Aktion)
    - Erschwernis-Zuschläge (Tabelle editierbar)
    - Plausi-Regeln (deklarativ, editierbar)
    - Umrechnungs-Konstanten (Schüttdichten, Asphalt 2,4 t/m³, etc.)
    - Preisquellen-Waterfall (Reihenfolge konfigurierbar)
    - Kunden-Stammdaten mit Override-Sicht (zeigt, welche Werte vom Globalen abweichen)
    - Lieferanten-Stammdaten (Stammdaten für Angebots-Zuordnung)

14. **Excel-Export** im heutigen LV3-Spalten-Layout
    - Spalten A-M sichtbar für Kunde, N-T ausblendbar, Rechnungs-Spalten identisch zu Excel heute
    - Keine Umstellung für den Kunden, der die Excel bekommt

15. **GAEB-Export** (D81/X81, D84/X84)
    - **D81/X81** — Leistungsbeschreibung: für den Spezialkunden, der die Kalkulation in diesem Format haben will
    - **D84/X84** — Angebotsabgabe: für alle anderen GAEB-Rückgaben
    - Nachgezogen aus Phase 2, weil der Schreib-Code für beide fast identisch ist sobald der Parser steht

16. **Audit-Log**
    - Append-only JSONL-Datei in OneDrive
    - Jedes Ereignis: Zeitstempel, Nutzer, Entität, alter Wert, neuer Wert, Kommentar
    - Unveränderlich (neue Zeilen angehängt, alte nicht modifiziert)
    - Bei Rollen-Approval: Status-Änderungen getrennt geloggt

17. **Alt-LV-Indexierung** (einmaliger Import-Lauf, danach inkrementell)
    - Durchsucht `OneDrive/KT01/*/_abgeschlossen`, `*/_gewonnen`, `*/_evtl._gewonnen`
    - Parsed Excel-Kalkulationen, extrahiert Positionen mit Werten
    - Erzeugt pro Position ein semantisches Embedding (lokales Modell, kein Cloud-Call)
    - Speichert in lokaler SQLite als Index für schnelles Matching
    - Wichtig: **Alt-LVs sind Referenz, nicht Wahrheit** — der User sieht bei einem Match die Verteilung („5 LVs 45 min/m³ + Stückzuschlag, 4 LVs 120 min/m³ pauschal"), nicht einen Mittelwert

### 2.2 Phase 2 — Was explizit NICHT in Phase 1 gebaut wird

Das folgende wird in Phase 1 weggelassen, auch wenn es nützlich wäre, um den Bauumfang beherrschbar zu halten:

- **PDF-Export** des bepreisten LV (Phase 1 = nur Excel)
- **Formblätter 221 und 223** (Preisermittlung / Aufgliederung der Einheitspreise)
- **BGK/AGK/W&G-Kalkulation** (K3/K6-Blatt nach KLR-Bau)
- **Material-Anfrage-Generierung** & Integration mit dem Python-Tool des IT-Studenten
- **Web-Kundenportal** mit Freigabe-Link (Phase 1b — direkt nach Phase 1, ca. 1-2 Wochen zusätzlich)
- **80/20-Ansicht mit Top-Positionen-Sortierung** (Teil des Kundenportals → Phase 1b)
- **Nachtragsmanagement** & EP-Override-Spalte (Excel-AA)
- **Submissionsvergleich** (Ergebnis der Vergabe importieren und gegen eigene Kalk vergleichen)
- **Mandantenfähigkeit mit verschlüsselten Vorgabenpaketen** (für externen Verkauf; Architektur wird aber schon jetzt vorbereitet)
- **Hosted SaaS** (Modell B — bleibt möglich, wird aber nicht gebaut)
- **Windows/Linux-Builds** (Phase 1 = macOS-only)
- **Gewerke „Reinigung" und „Sicherheitsleistungen"** (weniger Umsatz, später)
- **Cross-Project-Konsistenz-Warnungen** („Baustelleneinrichtung war im letzten LV anders")
- **Sirados/STLB-Inhalte** als Preis-/Zeit-Quelle (wird nie automatisch verwendet; Sirados bleibt nur als manueller Notnagel mit rotem Warn-Flag)

### 2.3 Phase 1b — Der erste Nachschub nach Phase 1

Direkt nach dem Phase-1-Launch wird das **Web-Kundenportal** gebaut. Begründung: größter Zeit-Einsparer nach der Grundautomatisierung, technisch gut abgrenzbar, und die Architektur wird von Anfang an so gebaut, dass der Web-Aufsatz passt.

Phase 1b umfasst:

- Ein kleiner gehosteter Dienst (Hetzner 5 €/Monat oder Cloudflare Pages/Workers im Free-Tier)
- Magic-Link-Auth: Kunde bekommt signierten Link per Mail, 14 Tage gültig
- Read-mostly-Sicht auf seine Kalkulation mit Änderungs-Möglichkeit pro Position
- **80/20-Ansicht**: Positionen nach GP absteigend sortiert, kumulative Prozentanzeige, bis 80 % des Gesamtbetrags erreicht sind (für den „Nur-Top-Positionen"-Kunden)
- Freigabe-Button: Kunde klickt „freigegeben zur Einreichung", wird als signiertes Event mit Checksum der aktuellen Kalkulation im Audit-Log festgehalten
- Konflikt-Management: Last-Write-Wins mit Warnung, falls Kalkulator und Kunde parallel an derselben Position arbeiten

---

## 3. Domänenmodell

### 3.1 Entitäten im Überblick

```
Mandant
  └── Kunde (z.B. Gesellchen GmbH)
        └── Projekt (z.B. Friedhöfe Riegelsberg 2026)
              ├── Auftraggeber (z.B. Gemeinde Riegelsberg)
              ├── Kalkulationsprofil-Snapshot (Scharf/Normal/Großzügig + Parameter)
              ├── LV
              │     └── LV-Abschnitt (z.B. "01 Waldfriedhof")
              │           └── LV-Unterabschnitt (z.B. "01.02 Grabfeld 59")
              │                 └── Position (z.B. "01.02.0010 Schicht aufnehmen")
              │                       ├── Mengenermittlung (U/V/W-Äquivalent)
              │                       ├── EP-Bestandteile (X, Y, M, Z, Y₀/Zeitwert, Auto-Flags)
              │                       ├── Modifier-Treffer (z.B. „Leibung erkannt, +1 min/lfm")
              │                       └── Plausi-Ergebnis (PASS/WARN/FAIL + Begründungen)
              ├── Positions-Gruppen (Mischkalk-Sperre)
              ├── Lieferanten-Angebote (Material-Preise mit Metadaten)
              └── Audit-Events

Vorgaben-Hierarchie (separate Entität, global gültig)
  ├── Kategorie (Rohbau, Technik, Ausbau, Holz/Metall, Hülle, Sondergewerke)
  │     └── Gewerk (z.B. GaLaBau, HLS, Trockenbau)
  │           ├── Default-Zeitwerte (z.B. Aushub 2 min/m³)
  │           ├── Default-Gerätezulagen
  │           ├── Modifier-Keywords
  │           ├── Erschwernis-Zuschläge
  │           ├── Plausi-Regeln
  │           └── Kleinmengen-Schwellwerte
  ├── Globale Konstanten (Schüttdichten, Asphalt-Dichte, Beton-pro-lfm-Bord etc.)
  └── Preisquellen-Waterfall (Reihenfolge)

Nutzer
  ├── Rolle (Senior | Junior | Admin)
  ├── Email, Name
  └── Audit-Historie (welche Defaults hat dieser Nutzer geändert)

Approval-Queue (für Junior-Änderungen)
  └── PendingDefaultChange
        ├── Vorgeschlagen von (Junior)
        ├── Geändert am
        ├── Entität (z.B. Gewerk.GaLaBau.Default.Pflaster_min_pro_m²)
        ├── Alter Wert, Neuer Wert
        ├── Begründung (Freitext)
        ├── Status (pending | approved | rejected)
        └── Entschieden von (Senior) + Begründung
```

### 3.2 Begriffsklärung

Drei Rollen im Beziehungsgeflecht, die nicht verwechselt werden dürfen:

- **Mandant** = Software-Nutzer (Phase 1: kalku.de; Phase 2: zusätzlich externe Baufirmen, die die Software lizenzieren).
- **Kunde** = Baufirma, *für die* der Mandant kalkuliert (im kalku.de-Fall: Baufirmen wie Gesellchen GmbH). Bei externem Verkauf an eine Baufirma, die für sich selbst kalkuliert, ist das Kunde-Feld leer und Defaults kommen direkt vom globalen Mandanten-Standard.
- **Auftraggeber** = Vergabestelle, die die Ausschreibung veröffentlicht (im Gesellchen-Beispiel: Gemeinde Riegelsberg). Der Auftraggeber ist für die Kalkulation eine reine Metadaten-Information, er beeinflusst keine Parameter.

**Vererbungskette für Parameter und Default-Werte:**

```
Global (kalku.de-Standard)
  ↓ wird automatisch vererbt
Kunde (z.B. Gesellchen) — kann einzelne Werte "sticky" überschreiben
  ↓ wird automatisch vererbt
Projekt (z.B. Friedhöfe Riegelsberg) — kann einzelne Werte temporär überschreiben
  ↓
Position (einzelne EP-Berechnung)
```

Wichtige Regel: Wenn der globale Wert geändert wird, folgen *alle* Kunden automatisch mit — außer sie haben für dieses konkrete Feld einen sticky Override gesetzt. Das Override wird im UI immer sichtbar markiert („⚠ abweichend von Global: 15 → 18 min/lfm, geändert am 2026-03-12 von Max Mustermann").

### 3.3 Kalkulationsprofile

Drei vordefinierte Parametersätze, die den Einstieg in eine Kalkulation beschleunigen. Nach dem Auswählen sind alle Werte frei nachjustierbar, sowohl global als auch pro Position.

```
Profil "Scharf"       Profil "Normal"        Profil "Großzügig"
(engster Preis)       (Standard)             (komfortabel)
─────────────────     ─────────────────      ─────────────────
Verrechnungslohn      Verrechnungslohn       Verrechnungslohn
  z.B. 75 €/h           z.B. 90 €/h            z.B. 105 €/h
Material-Zuschlag     Material-Zuschlag      Material-Zuschlag
  z.B. 20 %             z.B. 30 %              z.B. 40 %
NU-Zuschlag           NU-Zuschlag            NU-Zuschlag
  z.B. 20 %             z.B. 30 %              z.B. 40 %
Geräte-Grundzuschlag  Geräte-Grundzuschlag   Geräte-Grundzuschlag
  z.B. 5 %              z.B. 10 %              z.B. 15 %
Zeitwert-Faktor       Zeitwert-Faktor        Zeitwert-Faktor
  z.B. -15 %            z.B. 0 %               z.B. +10 %
Gerätezulage-Default  Gerätezulage-Default   Gerätezulage-Default
  z.B. 0,30 €/h         z.B. 0,50 €/h          z.B. 0,75 €/h
```

*Diese Beispielwerte sind Platzhalter. Die echten Startwerte werden beim ersten Start der Software aus dem Leitfaden v1.3 übernommen und können im Admin-Panel angepasst werden.*

Der **Zeitwert-Faktor** ist bidirektional (−100 % bis beliebig positiv). `−25 %` bedeutet: alle berechneten Zeiten werden um 25 % reduziert. `+100 %` bedeutet: Zeiten werden verdoppelt. Anwendung: der Kunde sieht die von kalku.de kalkulierten Leistungen pro Stunde (in den Spalten K/L des Excel-Layouts) und sagt zurück „meine Truppe ist 30 % schneller" — der Kalkulator dreht am Zeitwert-Faktor auf −30 %, alle EPs werden automatisch neuberechnet.

---

## 4. Architektur

### 4.1 Deployment-Modell

**Entscheidung:** Native macOS-Desktop-App (Electron), lokaler SQLite-Cache, Source-of-Truth als strukturierte JSON-Dateien in `OneDrive/BauKalkPro/`.

**Begründung:**

- Aktuell zwei Kalkulatoren mit eigenen Kunden → kein paralleles Schreiben an denselben Dateien.
- Beide arbeiten auf MacBooks mit OneDrive-Sync aktiv → vorhandene Infrastruktur nutzen, keine neue aufbauen.
- SQLite direkt auf OneDrive ist fehleranfällig (Sync-Konflikte, DB-Korruption) → wird *explizit vermieden*.
- JSON-Dateien sind sync-robust, menschenlesbar, diff-bar, OneDrive-versioniert.
- SQLite-Cache wird lokal pro Mac gehalten, bei Bedarf aus den JSON-Dateien regeneriert — wenn der Cache korrupt ist, reicht Löschen.
- Trennung `Vorgaben (read-only für spätere Kunden)` vs `Kalkulationsdaten (read/write)` bereits in Phase 1 angelegt, damit Modell A (IP-Schutz beim Verkauf) ohne Architekturumbau später möglich ist.

**Dateistruktur auf OneDrive:**

```
OneDrive/BauKalkPro/
├── vorgaben/                          # Source of Truth für alle Defaults
│   ├── kategorien.json                # Rohbau, Technik, Ausbau, ...
│   ├── gewerke/
│   │   ├── galabau.json               # Default-Zeitwerte, Modifier, Erschwernis
│   │   ├── tiefbau.json
│   │   ├── ...
│   ├── profile.json                   # Scharf / Normal / Großzügig
│   ├── modifier-keywords.json         # NU-Trigger, Erschwernis-Trigger
│   ├── plausi-regeln.json             # Deklarative Regel-Engine
│   ├── konstanten.json                # Schüttdichten, Umrechnungen
│   └── waterfall.json                 # Preisquellen-Reihenfolge
├── kunden/
│   ├── gesellchen-gmbh/
│   │   ├── stammdaten.json            # Name, Adresse, Kontakte
│   │   ├── overrides.json             # Sticky Überschreibungen
│   │   └── projekte/
│   │       ├── 260319_friedhoefe_riegelsberg/
│   │       │   ├── projekt.json       # Metadaten, Profil-Snapshot
│   │       │   ├── lv.json            # Positionen mit Werten
│   │       │   ├── import/            # Original GAEB/Excel/PDF
│   │       │   ├── angebote/          # Eingehende Lieferanten-Angebote
│   │       │   └── export/            # Erzeugte Excel/GAEB-Dateien
│   │       └── ...
├── nutzer/
│   ├── master@kalku.de.json
│   └── senior2@kalku.de.json
├── approval-queue/
│   └── pending-YYYY-MM-DD-xxx.json
├── audit-log/
│   └── 2026-04.jsonl                  # Append-only, eine Datei pro Monat
└── alt-lv-index/                      # Wird lokal aus OneDrive-Daten aufgebaut
    └── (nur Metadaten, Embeddings bleiben lokal in SQLite-Cache)
```

### 4.2 Technologie-Stack

**Frontend & App-Hülle:**
- **Electron** (aktuelle LTS) — Desktop-Shell, native macOS-Integration
- **React 18** mit **TypeScript strict** — UI
- **Vite** — Dev-Server und Build-Tool
- **TanStack Router** oder **React Router** — Navigation
- **Zustand** (lightweight state) oder **Jotai** — App-State-Management
- **TanStack Query** — Server-State / Sync-Handling
- **Tailwind CSS** + **shadcn/ui** — UI-Komponenten (schnell, konsistent, accessible)
- **@tanstack/react-table** — Tabellen mit virtueller Scrollung für große LVs
- **react-hook-form** + **zod** — Formulare und Validation
- **date-fns** mit `de` Locale — Datumsformatierung

**Geschäftslogik (pure TypeScript):**
- **Rechenkern** als reine, testbare TypeScript-Module (keine UI-Abhängigkeiten)
- **decimal.js** oder **big.js** — für Geldbeträge und Zeiten, um Floating-Point-Drift gegenüber Excel zu vermeiden
- **Regel-Engine** für Plausi-Checks (deklarativ, JSON-basiert)

**Datenhaltung:**
- **SQLite** via **better-sqlite3** — lokaler Cache (schnell, synchron, keine Promise-Hölle)
- **JSON** auf OneDrive — Source of Truth, gelesen/geschrieben über Node.js fs/promises
- **JSONL** für Audit-Log (Append-only, jeder Eintrag eine Zeile)

**Python-Sidecar** (als Electron-gebündelter Hintergrundprozess):
- **Python 3.11+**
- **FastAPI** oder **Starlette** — HTTP-Interface zur Electron-App (auf localhost)
- **pygaeb** oder eigene Implementierung — GAEB DA 1990 Flat + DA XML Parser und Writer
- **openpyxl** — Excel-Parsing und Schreiben (im Bedarfsfall zur Erzeugung von Excel mit komplexen Features)
- **pdfplumber** oder **pypdf** — PDF-LV-Parsing (Notnagel)
- **sentence-transformers** mit einem kleinen deutschen Modell — lokale Embeddings für semantisches Alt-LV-Matching (läuft offline auf CPU)
- **Rationale:** GAEB-Parser in Python sind deutlich reifer als in TypeScript; das Python-Tool des IT-Studenten für Materialpreise ist ebenfalls Python, Integration in Phase 2 wird einfacher; Embedding-Modelle haben in Python das beste Ökosystem.

**Tests:**
- **Vitest** — Unit-Tests für Rechenkern, Regel-Engine, Parser
- **Playwright** — E2E-Tests für den Haupt-Flow (Import → Kalkulation → Export)
- **Gold-Standard-Tests:** Für jeden bekannten LV-Typ gibt es Referenz-Excel-Dateien (z.B. `260319_Friedhoefe_Riegelsberg/LV3.xlsx`), deren Werte nach Import → Export Cent-genau wieder herauskommen müssen.

**Build & Distribution:**
- **electron-builder** — macOS DMG-Build, Code Signing (Apple Developer ID), Notarization
- **pnpm** als Paketmanager
- **Biome** oder **ESLint+Prettier** — Linting/Formatting

### 4.3 Datenfluss

```
                             ┌─────────────────────────────────┐
                             │  OneDrive (Source of Truth)     │
                             │  JSON-Dateien + JSONL-Audit     │
                             └───────────────┬─────────────────┘
                                             │ read/write
                                             ▼
┌──────────────┐     ┌─────────────────────────────────────┐
│  OS File     │────▶│  Electron Main Process (Node.js)    │
│  Watcher     │     │  - File I/O                         │
└──────────────┘     │  - SQLite Cache Management          │
                     │  - Python Sidecar Supervisor        │
                     └─────┬───────────────────┬───────────┘
                           │ IPC               │ HTTP (localhost)
                           ▼                   ▼
              ┌────────────────────┐  ┌─────────────────────┐
              │  Electron Renderer │  │  Python Sidecar     │
              │  (React UI)        │  │  - GAEB Parser      │
              │  - Projekt-Liste   │  │  - PDF Parser       │
              │  - LV-Editor       │  │  - Embeddings       │
              │  - Admin-Panel     │  │  - Excel R/W        │
              │  - Plausi-Anzeige  │  └─────────────────────┘
              └────────────────────┘
```

**Kernprinzip:** Die UI liest und schreibt nie direkt auf OneDrive oder SQLite. Alle Daten-Operationen laufen über den Main-Prozess, der eine saubere API für die UI bereitstellt. Das macht den Code testbar und erlaubt später den Austausch des Backends (z.B. gegen HTTP-API für SaaS-Modell).

---

## 5. Datenmodell

### 5.1 JSON-Schemas (Kernstück)

Alle JSON-Dateien werden mit **zod**-Schemas validiert beim Laden und vor dem Schreiben. Das schützt vor stillen Datenkorruptionen.

#### `vorgaben/gewerke/<gewerk>.json`

```typescript
{
  "id": "galabau",
  "name": "GaLaBau",
  "kategorie": "rohbau",
  "aktiv": true,
  "default_zeitwerte": [
    {
      "key": "aushub_grossmaschine_m3",
      "label": "Aushub Großmaschine",
      "einheit": "min/m³",
      "wert": 2.0,
      "geraetezulage_eur_h": 25.0,
      "kommentar": "Leitfaden §2, Standard",
      "geaendert_am": "2026-04-09T12:00:00+02:00",
      "geaendert_von": "master@kalku.de"
    },
    // ... viele weitere
  ],
  "erschwernis_zuschlaege": [
    {
      "id": "leibung_wandanstrich",
      "name": "Schmalform Leibung bei Wandanstrich",
      "trigger": {
        "typ": "text_match",
        "muster": ["leibung", "laibung", "schmal", "streifen"],
        "min_breite_cm": 30
      },
      "aufschlag": {
        "zeit_min_pro_lfm": 1.0
      },
      "aktiv": true
    }
  ],
  "modifier_keywords": [
    {
      "keyword": "inkl. Fundament und Rückenstütze",
      "aktion": "material_beton_0_10_m3_pro_lfm + aushub_7_min_pro_lfm",
      "gilt_fuer": ["bordstein_setzen"],
      "kommentar": "Leitfaden §4.2"
    }
  ],
  "kleinmengen_schwellwerte": {
    "m2": 10.0,
    "lfm": 5.0,
    "m3": 0.1,
    "stueck": 1
  }
}
```

#### `vorgaben/plausi-regeln.json`

```typescript
{
  "version": "1.0.0",
  "regeln": [
    {
      "id": "R001_asphalt_ist_belag",
      "name": "Asphalt ist Belag, nicht Erdmasse",
      "gewerk": "tiefbau",
      "bedingung": {
        "langtext_enthaelt": ["asphalt"],
        "einheit": "t",
        "position_typ": "abbruch"
      },
      "aktion": "WARN",
      "nachricht": "Asphalt wird in m² oder t abgerechnet, nicht in m³ Erdmasse. Bitte Mengenermittlung prüfen.",
      "referenz": "Leitfaden §5.4"
    },
    {
      "id": "R002_boden_einbauen_mindestens_8",
      "name": "Boden einbauen/verdichten ≥ 8 min/m³",
      "gewerk": "tiefbau",
      "bedingung": {
        "langtext_enthaelt_eines": ["einbauen", "verdichten", "lagenweise"],
        "zeit_min_pro_einheit_kleiner_als": 8.0
      },
      "aktion": "FAIL",
      "nachricht": "Boden einbauen und verdichten braucht mindestens 8 min/m³ (Laden + Transport + lagenweiser Einbau + Verdichten + Höhenkontrolle). Aktuell: {wert} min/m³.",
      "referenz": "Gemini v8 Regel 4, Leitfaden §2"
    },
    // ... alle Regeln aus Leitfaden v1.3 und Gemini v8
  ]
}
```

#### `kunden/<kunde>/projekte/<projekt>/lv.json`

```typescript
{
  "projekt_id": "260319_friedhoefe_riegelsberg",
  "import_meta": {
    "quelle": "gaeb_d83",
    "original_datei": "Friedhöfe_Wegebau_2026_1_LV.D83",
    "importiert_am": "2026-04-09T14:22:00+02:00",
    "importiert_von": "master@kalku.de"
  },
  "abschnitte": [
    {
      "oz": "01",
      "titel": "Waldfriedhof Riegelsberg",
      "erkanntes_gewerk": "galabau",
      "unterabschnitte": [
        {
          "oz": "01.01",
          "titel": "Allgemein",
          "positionen": [
            {
              "oz": "01.01.0010",
              "kurztext": "Baustelle einrichten",
              "langtext": "...",
              "stlb_code": null,
              "menge": 1,
              "einheit": "Psch",
              "position_gruppe_id": null,
              "gewerk": "galabau",
              "mengenermittlung": {
                "typ": "direkt",
                "stoffe_eur_einheit": 0,
                "zeit_min_einheit": 1800
              },
              "ep_bestandteile": {
                "stoffe_ek": 0,
                "zeit_min": 1800,
                "geraetezulage_eur_h": 30,
                "nachunternehmer_ek": 0
              },
              "berechnet": {
                "zeit_mit_faktor": 1800,
                "geraete_ep": 900,
                "lohn_ep": 3073.50,
                "stoffe_vk": 0,
                "nu_vk": 0,
                "ep": 3973.50,
                "gp": 3973.50
              },
              "modifier_treffer": [],
              "plausi_ergebnisse": [
                { "regel_id": "R015", "status": "PASS" }
              ],
              "quelle_kommentar": "Gewerk-Default GaLaBau Y=1800 Z=30 (Leitfaden §1)",
              "geaendert_am": "2026-04-09T14:25:11+02:00",
              "geaendert_von": "master@kalku.de"
            }
          ]
        }
      ]
    }
  ],
  "positions_gruppen": [
    {
      "id": "grp_schicht_ohne_bindemittel",
      "normalisierter_text": "schicht ohne bindemittel aufnehmen dicke u 5 10cm friedhofsweg",
      "mitglieder_oz": ["01.02.0010", "01.03.0010", "01.04.0010"],
      "gesperrt": true,
      "ep_synchron": true,
      "entkoppelte": []
    }
  ]
}
```

### 5.2 SQLite-Cache-Schema

Der SQLite-Cache spiegelt die JSON-Welt und ergänzt sie um Indizes für schnelle Abfragen, Volltextsuche und Embedding-Suche.

```sql
-- Projekte und Positionen (für UI-Tabellen und schnelle Filter)
CREATE TABLE projekte (
  id TEXT PRIMARY KEY,
  kunde_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,         -- entwurf | in_arbeit | abgeschlossen | archiviert
  gewerk_haupt TEXT,
  erstellt_am TEXT NOT NULL,
  geaendert_am TEXT NOT NULL,
  json_pfad TEXT NOT NULL       -- relativer Pfad in OneDrive
);

CREATE TABLE positionen (
  id TEXT PRIMARY KEY,
  projekt_id TEXT NOT NULL REFERENCES projekte(id),
  oz TEXT NOT NULL,
  kurztext TEXT NOT NULL,
  langtext TEXT,
  stlb_code TEXT,
  menge REAL NOT NULL,
  einheit TEXT NOT NULL,
  gewerk TEXT,
  ep REAL,
  gp REAL,
  position_gruppe_id TEXT,
  plausi_status TEXT,           -- PASS | WARN | FAIL | OFFEN
  normalisierter_text TEXT,     -- für Gruppen-Matching
  embedding BLOB,               -- 384-dim float32, für semantisches Matching
  geaendert_am TEXT NOT NULL
);

CREATE INDEX idx_positionen_normalisiert ON positionen(normalisierter_text);
CREATE INDEX idx_positionen_stlb ON positionen(stlb_code);
CREATE INDEX idx_positionen_projekt ON positionen(projekt_id);

-- Volltextsuche (FTS5)
CREATE VIRTUAL TABLE positionen_fts USING fts5(
  kurztext, langtext,
  content='positionen', content_rowid='rowid'
);

-- Alt-LV-Korpus (für Matching gegen abgeschlossene Projekte)
CREATE TABLE alt_lv_positionen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alt_projekt_pfad TEXT NOT NULL,
  alt_projekt_datum TEXT,
  kunde_name TEXT,
  oz TEXT,
  kurztext TEXT,
  langtext TEXT,
  stlb_code TEXT,
  menge REAL,
  einheit TEXT,
  zeit_min_pro_einheit REAL,
  stoffe_ek_pro_einheit REAL,
  geraete_zulage_eur_h REAL,
  ep_final REAL,
  rechen_methode TEXT,          -- "grundzeit_plus_stueck" | "pauschal" | "unklar"
  embedding BLOB NOT NULL
);

CREATE INDEX idx_alt_lv_stlb ON alt_lv_positionen(stlb_code);

-- Approval-Queue (Junior-Änderungen)
CREATE TABLE approval_queue (
  id TEXT PRIMARY KEY,
  vorgeschlagen_von TEXT NOT NULL,
  vorgeschlagen_am TEXT NOT NULL,
  entitaet_pfad TEXT NOT NULL,    -- z.B. "vorgaben/gewerke/galabau.json#/default_zeitwerte/aushub_m3"
  alter_wert TEXT NOT NULL,       -- JSON-String
  neuer_wert TEXT NOT NULL,
  begruendung TEXT,
  status TEXT NOT NULL,           -- pending | approved | rejected
  entschieden_von TEXT,
  entschieden_am TEXT,
  entscheidung_kommentar TEXT
);

-- Audit-Log-Spiegel (Append-only, wird aus JSONL nachgeladen)
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zeitstempel TEXT NOT NULL,
  nutzer TEXT NOT NULL,
  aktion TEXT NOT NULL,
  entitaet TEXT NOT NULL,
  alter_wert TEXT,
  neuer_wert TEXT,
  kommentar TEXT
);

CREATE INDEX idx_audit_zeitstempel ON audit_log(zeitstempel);
CREATE INDEX idx_audit_entitaet ON audit_log(entitaet);
```

---

## 6. Rechenkern

Der Rechenkern ist eine **pure TypeScript-Bibliothek**, die exakt die Excel-Formelkette aus `LV3.xlsx` nachbildet. Er hat keine Abhängigkeit zur UI, zur Datenbank oder zu React — nur reine Funktionen, maximal testbar.

### 6.1 EP-Formel (Referenz: LV3.xlsx Zeilen 17-24)

Gegeben sei eine Position mit folgenden Eingaben:

| Excel-Spalte | Bedeutung | Typ |
|---|---|---|
| `C` | Menge (mengenabhängig) | Decimal |
| `X` | Stoffe EK pro Einheit (€) | Decimal |
| `Y` | Zeit pro Einheit (min), roh | Decimal |
| `Z` | Gerätezulage €/h (pro Position) | Decimal |
| `M` | Nachunternehmer EK pro Einheit (€) | Decimal |

Plus Projekt-Parameter:

| Name | Excel-Referenz | Typ |
|---|---|---|
| `verrechnungslohn` | `M2` (heute 102,40 €/h bei Riegelsberg) | Decimal |
| `material_zuschlag` | `K4` (heute 0,35) | Decimal (Anteil) |
| `nu_zuschlag` | `K5` (heute 0,35) | Decimal (Anteil) |
| `zeitwert_faktor` | `AP5` / `zeitabzug` (heute −25 bei Riegelsberg) | Decimal (Prozent bidirektional) |
| `geraete_grundzuschlag` | `K6` / `gzuschlag` (heute 0,10) | Decimal (Anteil) |
| `geraetezulage_default` | `AP3` (heute 0) | Decimal (€/h) |

**Berechnungsschritte:**

```typescript
import Decimal from "decimal.js";

export interface Position {
  menge: Decimal;
  stoffe_ek: Decimal;             // X
  zeit_min_roh: Decimal;          // Y
  geraetezulage_eur_h: Decimal;   // Z (oder Default aus AP3)
  nu_ek: Decimal;                 // M
}

export interface Parameter {
  verrechnungslohn: Decimal;
  material_zuschlag: Decimal;
  nu_zuschlag: Decimal;
  zeitwert_faktor: Decimal;       // z.B. -25 für -25%
  geraetezulage_default: Decimal;
}

export interface Berechnung {
  zeit_mit_faktor: Decimal;       // AC = Y + (Y/100) * zeitwert_faktor
  geraete_ep: Decimal;            // AA = (AC/60) * Z
  lohn_ep: Decimal;               // AB = (AC/60) * verrechnungslohn
  stoffe_vk: Decimal;             // AJ = X * (1 + material_zuschlag)
  nu_vk: Decimal;                 // AK = M * (1 + nu_zuschlag)
  ep: Decimal;                    // E = AA + AB + AJ + AK
  gp: Decimal;                    // F = C * E
}

export function berechne(pos: Position, params: Parameter): Berechnung {
  const hundert = new Decimal(100);
  const sechzig = new Decimal(60);

  // AC: Zeit mit Zeitwert-Faktor
  const zeitAnpassung = pos.zeit_min_roh.div(hundert).mul(params.zeitwert_faktor);
  const zeit_mit_faktor = pos.zeit_min_roh.plus(zeitAnpassung);

  // Geräte: wenn Position-eigene Zulage 0, Default verwenden
  const zulage_effektiv = pos.geraetezulage_eur_h.isZero()
    ? params.geraetezulage_default
    : pos.geraetezulage_eur_h;

  const geraete_ep = zeit_mit_faktor.div(sechzig).mul(zulage_effektiv);
  const lohn_ep = zeit_mit_faktor.div(sechzig).mul(params.verrechnungslohn);
  const stoffe_vk = pos.stoffe_ek.mul(new Decimal(1).plus(params.material_zuschlag));
  const nu_vk = pos.nu_ek.mul(new Decimal(1).plus(params.nu_zuschlag));
  const ep = geraete_ep.plus(lohn_ep).plus(stoffe_vk).plus(nu_vk);
  const gp = pos.menge.mul(ep);

  return { zeit_mit_faktor, geraete_ep, lohn_ep, stoffe_vk, nu_vk, ep, gp };
}
```

**Rundung:** Die Excel-Rundung ist implizit (Anzeige vs. tatsächlich gespeicherter Wert). Wir rechnen intern mit voller Decimal-Präzision und runden **ausschließlich für die Anzeige** (2 Nachkommastellen, kaufmännisch). Das vermeidet Rundungsdrift bei Aggregationen.

**Test-Strategie:** Für jedes Feature ein Regressions-Test gegen den Referenz-LV3.xlsx:

```typescript
test("Riegelsberg Pos 01.01.0010 EP = 3.973,50 €", () => {
  const pos = {
    menge: new Decimal(1),
    stoffe_ek: new Decimal(0),
    zeit_min_roh: new Decimal(1800),
    geraetezulage_eur_h: new Decimal(30),
    nu_ek: new Decimal(0),
  };
  const params = {
    verrechnungslohn: new Decimal("102.40"),
    material_zuschlag: new Decimal("0.35"),
    nu_zuschlag: new Decimal("0.35"),
    zeitwert_faktor: new Decimal("-25"),
    geraetezulage_default: new Decimal(0),
  };
  const ergebnis = berechne(pos, params);
  expect(ergebnis.ep.toFixed(2)).toBe("2980.13");  // aus Excel
});
```

Für jedes Referenz-LV wird beim Einchecken der erwartete Wert fest hinterlegt; Änderungen am Rechenkern, die Referenz-Werte verschieben würden, scheitern im CI.

---

## 7. Import-Pipeline

### 7.1 GAEB DA 1990 Flat (D81/D83/D84/D86)

Format-Details:
- 80-Zeichen-Satz, fixed-width
- CR+LF Zeilenende
- Encoding: CP850 (DOS Latin-1), Umlaute als Escape-Sequenzen (`M-^A` = ä, `M-^U` = Ü, etc.)
- Record-Typen:
  - `T0` — Deckblatt (Projektname, Vergabenummer, Auftraggeber)
  - `T1` — Vorbemerkungen / freier Text
  - `T2` — OZ-Position Header (OZ, Einheit, Menge)
  - `T3` — Positions-Langtext (mehrzeilig, durchnummeriert)
  - `T9` — Preis-Record (bei D84: EP)

**Parser-Strategie (Python-Sidecar):**

1. Datei als Bytes lesen, CP850 dekodieren
2. Zeilenweise verarbeiten, Record-Typ aus Spalten 1-2 extrahieren
3. Für jeden `T2`-Record eine Position anlegen
4. Nachfolgende `T3`-Records dem letzten `T2` als Langtext anhängen
5. Bereichs-Hierarchie aus der OZ-Struktur ableiten (`01` → Abschnitt, `01.02` → Unterabschnitt, `01.02.0010` → Position)
6. Umlaute zurück-mappen (Lookup-Tabelle)
7. Ergebnis als JSON an die Electron-App liefern

### 7.2 GAEB DA XML (X81/X83/X84/X86)

Deutlich einfacher — XML mit einer dokumentierten Schema-Hierarchie. `lxml` in Python parst das sauber, die Schemas sind öffentlich verfügbar. Parser liefert das gleiche JSON-Zwischenformat wie der Flat-Parser, damit nachgelagerte Verarbeitung einheitlich ist.

### 7.3 Excel-LV-Import

Referenz-Format (wie in `LV.xlsx` bei Gesellchen):

| Spalte | Inhalt |
|---|---|
| A | OZ |
| B | PosArt (`BEREICH` | `NORMAL` | `ZULAGE` | `WAHL`) |
| C | Kurztext, ggf. mit `\n` und Langtext-Folge |
| D | Menge |
| E | Einheit |
| F | EP (kann leer sein beim Import) |
| G | GP (kann leer sein) |

**Parser-Schritte (TypeScript mit SheetJS/ExcelJS):**

1. Erste Zeile ignorieren (Header), ab Zeile 3 beginnen (Zeile 2 oft leer)
2. `BEREICH` = Abschnitt, OZ-Tiefe aus Anzahl Punkte ableiten
3. `NORMAL` = Position
4. `ZULAGE` = Zulage-Position, merkt sich Referenz-OZ (meist direkt darüber)
5. Kurztext = erste Zeile von `C`, Langtext = alles ab der zweiten Zeile
6. Gleiche Normalisierung und Ausgabe wie GAEB-Import

### 7.4 PDF-LV (Notnagel)

**Nur für den Fall, dass keine GAEB- und keine Excel-Datei vorliegt.** Nicht verlässlich, braucht immer einen manuellen Review.

**Strategie:**

1. PDF mit `pdfplumber` in Text-Blöcke zerlegen
2. Heuristik für OZ-Erkennung: Regex wie `^\s*(\d{2}(?:\.\d{2,4})*)\s+` am Zeilenanfang
3. Mengen und Einheiten via Regex: `(\d+[,.]?\d*)\s+(m²|m³|m|lfm|Stck|St|Psch|t|kg)`
4. Langtext als Fließtext zwischen zwei OZ-Erkennungen sammeln
5. Ergebnis als JSON liefern mit `import_meta.quelle = "pdf_heuristisch"`
6. UI zeigt beim Öffnen einen gelben Banner: *„PDF-Import — bitte jede Position prüfen, OCR/Heuristik kann Fehler enthalten."*

### 7.5 Matching-Kaskade nach Import

Für jede importierte Position wird automatisch eine Vorbefüllung versucht, in dieser Reihenfolge:

1. **STLB-Code-Match** — wenn im GAEB ein STLB-Code vorhanden ist, Match gegen Alt-LV-Korpus und gegen interne Stammdaten. Höchste Konfidenz.
2. **Exakter Textmatch** — nach Normalisierung (lowercase, Whitespace-Kollaps, Sonderzeichen raus). Hohe Konfidenz.
3. **Fuzzy-Match** — Levenshtein oder n-gram Overlap gegen den Korpus. Mittlere Konfidenz.
4. **Semantisches Embedding-Match** — Embedding der Position gegen den vorindexierten Korpus, Cosine-Similarity, Top-5-Kandidaten. Niedrige bis mittlere Konfidenz.
5. **Gewerk-Default** — aus dem Admin-Panel, nach erkanntem Gewerk des Abschnitts. Generischer Fallback.
6. **Leer lassen** — wenn nichts greift, rote Markierung im LV-Editor, manuelle Befüllung nötig.

**Wichtig:** Das Ergebnis wird als *Vorschlag* angezeigt, nicht blind übernommen. Der Kalkulator bestätigt mit einem Klick oder passt an. Alt-LV-Treffer zeigen die **Verteilung** der gefundenen Werte („5 Treffer: 3× 45 min/m³, 2× 50 min/m³"), nicht einen Mittelwert.

---

## 8. Export-Pipeline

### 8.1 Excel-Export (Phase 1, Pflicht)

Ziel: die exportierte Datei sieht für den Kalkulator und den Kunden (= Baufirma) identisch aus wie die heutigen LV3.xlsx-Dateien. Kein Umgewöhnungs-Effekt.

**Implementierung:** Template-Datei `export_template_lv.xlsx` liegt im Repo mit den festen Spalten, Formeln und Formatierungen. Der Exporter öffnet das Template, trägt die Werte der Positionen ein, speichert unter dem Zielpfad. So bleiben Formatierungen, Zellkommentare und das Layout exakt gleich.

Spezielle Punkte:
- Kommentare pro Zelle (Quelle, Regel-ID) werden als Excel-Zellkommentare gespeichert
- Ausgeblendete Spalten bleiben ausgeblendet
- Zahlenformat `#.##0,00 €` konsistent
- Formelbezüge (`AA17 = AC17/60*Z17`) bleiben als Excel-Formeln erhalten, damit der Kunde im Excel noch live rechnen kann, wenn er will

### 8.2 GAEB-Export (Phase 1, Pflicht)

**D81/X81** für den Spezialkunden, **D84/X84** als Standard-Angebotsabgabe.

**Implementierung:** Python-Sidecar, gleicher Parser rückwärts. Für D81 wird nur die Leistungsbeschreibung geschrieben (ohne Preise), für D84 mit Preisen. Der Prüfcode prüft die Datei mit einem GAEB-Validator (z.B. `GAEB Online Converter` als Referenz) beim Build, damit wir keine kaputten Dateien ausliefern.

### 8.3 PDF-Export (Phase 2)

Nicht Teil von Phase 1. Wird später mit `playwright-chromium` (HTML → PDF) oder `weasyprint` gebaut.

---

## 9. Auto-Kalkulations-Flow (End-to-End)

Der zentrale Workflow, der dem Kalkulator Zeit spart. Schritt für Schritt:

```
[1] Projekt anlegen
     │ Kunde wählen → Projekt-Name → Profil (Scharf/Normal/Großzügig)
     │ Projekt-Parametersatz aus Profil vorausfüllen, frei nachjustierbar
     ▼
[2] LV-Datei importieren (GAEB oder Excel oder PDF)
     │ Python-Sidecar parsed, liefert Positionen als JSON
     │ Abschnitte-Bereichstitel → automatische Gewerk-Zuweisung
     ▼
[3] Matching-Kaskade pro Position
     │ STLB → exakt → fuzzy → semantisch → Gewerk-Default → leer
     │ Vorgeschlagene Werte mit Konfidenz-Score im Editor anzeigen
     ▼
[4] Modifier-Keyword-Scan
     │ Langtext auf NU-Trigger, Erschwernis-Trigger, Vorhalte-Trigger prüfen
     │ Treffer transparent markieren, Default-Werte entsprechend anpassen
     ▼
[5] Positions-Gruppen bilden
     │ Identische Textschlüssel → Gruppe, ein EP für alle
     │ Kleinmengen (< Schwellwert) automatisch als eigene Gruppe
     ▼
[6] Rechenkern läuft über alle Positionen
     │ Alle EPs und GPs berechnet
     │ Kopfsummen (Stoffe-GP, Lohn-GP, Geräte-GP, NU-GP, netto, brutto) aktualisiert
     ▼
[7] Plausi-Check pro Position
     │ Alle aktiven Regeln auswerten
     │ PASS/WARN/FAIL als Statusanzeige neben jeder Position
     │ WARN braucht Begründung, FAIL blockiert
     ▼
[8] Kalkulator review und nachjustiert
     │ Klickt Positionen an, ändert Werte, sieht Plausi live
     │ Modifier-Treffer bestätigen oder verwerfen
     │ Gruppen entkoppeln wenn echt unterschiedlich
     ▼
[9] Korrektur-Dialog beim Projektabschluss
     │ "Du hast 23 Default-Werte geändert. Welche davon willst du speichern?"
     │ Pro Zeile: [ ] für diesen Kunden | [ ] global
     │ Junior: Default-Änderungen landen in Approval-Queue
     ▼
[10] Export als Excel (immer) und/oder GAEB D81/D84 (auf Wunsch)
     │ Original-Import-Datei bleibt im projekt/import/ liegen
     │ Export unter projekt/export/ mit Datum und Version
```

**Ziel-Kennzahl:** Ein durchschnittliches LV mit 150 Positionen soll vom Import bis zum fertigen Excel-Export **unter 30 Minuten** aktive Arbeit kosten, statt heute (mit Excel) mehrere Stunden bis Tage.

---

## 10. Admin-Panel

Das Admin-Panel ist eine eigene Sektion der App (Menüpunkt „Vorgaben"). Nur Senior-Rolle hat Vollzugriff, Junior sieht alles lesend und kann Änderungen vorschlagen (landen in der Approval-Queue).

### 10.1 Struktur der Oberfläche

```
Vorgaben
├── Gewerke & Kategorien
│   ├── Baum-Ansicht (Rohbau, Technik, Ausbau, ...)
│   └── pro Gewerk: Default-Zeitwerte, Gerätezulagen, Kleinmengen-Schwellwerte
├── Kalkulationsprofile
│   ├── Scharf
│   ├── Normal
│   └── Großzügig
│       └── pro Profil: alle sechs Parameter editierbar
├── Modifier-Keywords
│   └── Tabelle: Keyword | Gilt für | Aktion | Gewerk | Aktiv
├── Erschwernis-Zuschläge
│   └── Tabelle: Name | Trigger | Aufschlag | Gewerk | Aktiv
├── Plausi-Regeln
│   └── Tabelle mit JSON-Editor pro Regel (Bedingung, Aktion, Nachricht)
├── Konstanten
│   └── Tabelle: Name | Wert | Einheit | Kommentar (Schüttdichten etc.)
├── Preisquellen-Waterfall
│   └── Drag-and-Drop-Liste, erste Quelle = höchste Priorität
├── Kunden
│   └── Liste aller Kunden mit Override-Indikator (wieviel weicht von Global ab)
├── Nutzer & Rollen
│   └── Liste mit Senior/Junior/Admin, Audit-Statistik pro Nutzer
└── Approval-Queue
    └── Ausstehende Junior-Änderungen, mit Genehmigen/Ablehnen-Buttons
```

### 10.2 UX-Prinzipien

- **Keine versteckten Overrides:** Jedes Feld zeigt, woher sein aktueller Wert kommt (global / kunde / projekt / manuell) und wer ihn wann zuletzt geändert hat.
- **Inline-Editing:** Werte direkt in der Tabelle ändern, kein Extra-Dialog für kleine Änderungen.
- **Änderungs-Begründung optional, aber empfohlen:** Eine kleine Kommentar-Box bei jeder Änderung, landet im Audit-Log.
- **Undo/Historie:** Jeder Default hat einen „Verlauf anzeigen"-Button, der die letzten 10 Änderungen mit Zeitstempel und Nutzer anzeigt.

---

## 11. Positions-Gruppen & Mischkalkulations-Vermeidung

### 11.1 Gruppenbildung beim Import

**Algorithmus:**

1. Für jede Position `p`, normalisiere den Text:
   ```
   n(p) = lowercase(trim(collapse_whitespace(remove_punctuation(p.kurztext + " " + p.langtext))))
   ```
2. Wenn `p.stlb_code` gesetzt ist, ist der **STLB-Code der primäre Schlüssel** (Text wird ignoriert).
3. Alle Positionen mit gleichem Schlüssel (STLB oder normalisierter Text) bilden eine **Positions-Gruppe**.
4. Innerhalb einer Gruppe werden Positionen mit Menge unterhalb des Gewerk-Kleinmengen-Schwellwerts in eine **eigene Kleinmengen-Subgruppe** verschoben, mit Auto-Begründung „Kleinmenge, erschwerter Zugang/Anfahrt".
5. Beim Speichern bekommt jede Gruppe eine `position_gruppe_id` in der Datenbank.

### 11.2 Sperre und Synchronisation

- In einer gesperrten Gruppe ist die Änderung eines Werts in einer Position automatisch eine Änderung für alle anderen Mitglieder.
- Die UI zeigt eine **Gruppen-Karte** an: „3 Positionen dieser Gruppe: 01.02.0010, 01.03.0010, 01.04.0010 — alle mit EP 28,50 €".
- Änderungen werden im Gruppen-Kontext gespeichert, nicht pro Position.

### 11.3 Entkopplung

Wenn eine Position wirklich anders ist (echte Erschwernis jenseits von Kleinmenge, z.B. „Grabfeld 61 in Hanglage"):

1. Kalkulator klickt **„aus Gruppe lösen"** auf der betroffenen Position.
2. **Pflicht-Begründung** (Freitext, mindestens 10 Zeichen) muss eingegeben werden.
3. Der entkoppelte EP muss **höher** sein als der Gruppen-EP, sonst blockt die Software mit Fehlermeldung: *„Entkoppelter EP (25,00 €) ist niedriger als Gruppen-EP (28,50 €). Bei echter Erschwernis muss der Preis steigen, nicht sinken."*
4. Die Begründung wandert in den Export als Excel-Zellkommentar und als Fußnote in den PDF-Export (Phase 2).
5. Im Audit-Log wird das Entkopplungs-Event separat gespeichert.

### 11.4 Beispiel

```
Gruppe: "schicht ohne bindemittel aufnehmen dicke ue 5 10cm friedhofsweg"
  ├── 01.02.0010 (Grabfeld 59, 90 m²)   → Gruppen-EP 12,50 €/m²
  ├── 01.03.0010 (Grabfeld 61, 55 m²)   → Gruppen-EP 12,50 €/m²
  └── 01.04.0010 (Grabfeld 4, 8 m²)     → Kleinmengen-Subgruppe
                                           → EP 18,00 €/m² (automatisch)
                                           → Begründung: "Kleinmenge <10 m², erschwerter Zugang"
```

---

## 12. Rollen & Approval-Workflow

### 12.1 Rollen-Definitionen

**Senior Kalkulator** (Vollrechte):
- Vollzugriff auf alle Projekte, Kunden, Vorgaben
- Kann Default-Werte direkt ändern (mit Audit-Log-Eintrag)
- Kann Profile, Gewerke, Regeln, Konstanten bearbeiten
- Kann Approval-Queue bearbeiten (genehmigen/ablehnen)
- Kann Nutzer anlegen und Rollen vergeben
- Ist implizit Admin

**Junior Kalkulator** (eingeschränkte Rechte):
- Vollzugriff auf seine zugewiesenen Projekte (Projekt-Werte sofort aktiv)
- Lese-Zugriff auf alle Vorgaben, Profile, Regeln
- **Schreib-Zugriff auf Default-Werte nur über die Approval-Queue:** Eine Default-Änderung durch einen Junior wirkt im aktuellen Projekt sofort, der Vorschlag landet aber in der Queue und wird erst nach Senior-Freigabe als neuer globaler oder kundenspezifischer Default übernommen.
- Kann eigene Kunden anlegen, aber nicht fremde Kunden sehen (optional, konfigurierbar)
- Kann keine Profile/Gewerke/Regeln direkt bearbeiten
- Kann keine Nutzer verwalten

**Admin** (für Phase 1 = gleiche Rolle wie Senior):
- In Phase 2 evtl. eine separate Rolle für rein administrative Aufgaben (Lizenzen, Kunden-Zugänge, DSGVO-Löschungen), ohne fachliche Kalkulationsrechte.

### 12.2 Approval-Queue-Flow

```
[Junior ändert in Projekt einen Wert, der vom Default abweicht]
     │
     ▼
[Junior klickt am Projektende "Korrekturen sichten"]
     │
     ▼
[Dialog: "23 Werte wurden geändert. Welche sollen Defaults werden?"]
     │ Junior hakt an: "Für diesen Kunden speichern"
     │ oder: "Als globalen Default vorschlagen"
     ▼
[Jeder Haken erzeugt einen Eintrag in approval_queue]
     │ Status = pending, begründung = Freitext
     ▼
[Senior öffnet Approval-Queue-Ansicht]
     │ Sieht alle pending Vorschläge chronologisch
     │ Kann jeden einzeln bewerten:
     │   → "Ja, übernehmen als Kunden-Default"
     │   → "Ja, übernehmen als globaler Default"
     │   → "Nein, ablehnen" (mit Begründung)
     ▼
[Bei Genehmigung: Änderung wird auf die Zielebene angewendet]
     │ Junior bekommt Benachrichtigung in der App ("Dein Vorschlag X wurde übernommen")
     ▼
[Bei Ablehnung: Vorschlag bleibt als "rejected" im Log]
     │ Junior sieht die Senior-Begründung, kann daraus lernen
```

Die Projekt-Änderung des Juniors bleibt in jedem Fall im Projekt wirksam — das ist wichtig, damit der Junior arbeiten kann, ohne auf Freigaben zu warten.

---

## 13. IP-Schutz & Modell A für späteren Verkauf

**Entscheidung für Phase 1:** Modell A wird als Schema-Grundlage gelegt, aber nicht aktiv gebaut (kein externer Verkauf in Phase 1). Das Datenmodell wird aber so geschnitten, dass Modell A ohne Umbau möglich ist.

**Was Modell A bedeutet (für Phase 2+):**

- **Vorgaben-Paket als immutable Lesestand für externe Kunden.** Der externe Kunde hat keine direkte Sichtbarkeit auf `vorgaben/gewerke/*.json` — die Werte werden zur Laufzeit auf seine Positionen angewendet, aber die Tabelle bleibt ihm verborgen.
- **Kunde als Junior-Rolle:** Ein externer Kunde ist aus Software-Sicht ein Nutzer mit Junior-Rechten — er kann seine eigenen Projekte kalkulieren, Werte in Positionen ändern (wirken in seinem Projekt sofort), aber Default-Änderungen landen in einer Approval-Queue, die an kalku.de geht. kalku.de entscheidet, ob die Änderung als globaler Update zurück in alle Kundensysteme gespielt wird, nur für diesen Kunden, oder gar nicht.
- **Vorgaben-Paket verschlüsselt auf der Festplatte:** SQLite-Cache mit AES-256 verschlüsselt, Schlüssel aus Lizenzdatei abgeleitet. Stoppt keinen Reverse-Engineering-Angriff, aber macht „mal eben Datei aufmachen und Werte abschreiben" unmöglich.
- **Audit-Log der Kunden-Nutzung:** Jeder externe Kunden-Client loggt lokal, wie oft er welche Defaults genutzt hat — diese Telemetrie kann optional an kalku.de zurückgespielt werden, damit kalku.de sieht, welche Positionen bei welchem Kunden besonders häufig abweichen (Optimierungs-Hinweis).

**Was Phase 1 dafür schon vorbereitet:**

- `vorgaben/`-Ordner ist logisch getrennt von `kunden/` und `projekte/`.
- Alle Lese-Operationen auf `vorgaben/` laufen durch eine zentrale `VorgabenRepository`-Klasse, die später transparent durch eine verschlüsselte Variante ersetzt werden kann.
- Die UI hat keinen direkten Dateizugriff — alle Vorgaben kommen über die Repository-API.

---

## 14. Baseline-Regelwerk

Das initiale Vorgaben-Paket wird aus den folgenden Quellen importiert, **ohne dass wir jede einzelne Regel im Interview nochmal durchgehen**:

1. **`Claude/Kalkulations_Leitfaden.md` v1.3** — Verbindliches Regelwerk mit Zeitwerten und Zuschlägen pro Gewerk
2. **`Claude/kalk_feedback.md`** — Neue Regeln aus Master-Reviews (Runde 1-5)
3. **`Claude/knowledge_base.json`** — Schüttdichten, Erfahrungspreise
4. **`Claude/rules/rules.json`** — Plausi-Regeln v1.2
5. **`plausi.py`** — Prüfcode, der in eine TypeScript-Regel-Engine übersetzt wird
6. **Gemini Master-Prompt v8** — Langtext-Modifier-Strategie, Hierarchie-Prüfung, Konsistenz-Regeln

### 14.1 Initiale Gewerk-Defaults (Auszug aus Leitfaden v1.3)

**Baustelleneinrichtung (§1):**
- Einrichten GaLaBau: Y=1800 min, Z=50 €/h
- Räumen: Y=600 min, Z=15 €/h
- Vorhalten: 10 min/Arbeitstag, Z=30 €/h (oder AA=750 €/Monat)
- Dixi aufstellen: Y=120 min, Z=100 €/h, Vorhalten AA=75 €/StWo
- WC-Container aufstellen: Y=1200 min, Z=50 €/h, Vorhalten AA=1000 €/StMt
- Bauzaun herstellen: Y=10 min/m, Z=15 €/h; Versetzen: Y=5 min/m, Z=5 €/h; Vorhalten: AA=0,45 €/mWo; Tor Z=30 €/h bzw. AA=35 €/StMt

**Erdarbeiten Großmaschine (§2):**
- Aushub: 2 min/m³, Z=25 €/h
- Oberboden flächig: +0,5 min/m² je 10 cm
- Einbau: 2 min/m³ + 1 min je Verdichtungsschicht (Standard 33 cm)
- Transport innerhalb BS: +3 min/m³
- Planieren: 0,5 min/m²
- Verdichten: 0,5 min/m²
- Kombiniert: 1 min/m³

**Erdarbeiten Handarbeit / Minibagger (§2.3-2.4):**
- Handarbeit BK 1-4: 240-360 min/m³, Z=0
- Minibagger: 10 min/m³ Aushub, 10 min/m³ Einbau, Z=15 €/h

**Schüttgüter (§3):**
- Großflächig (>200 m²): 3 min/m³ + 1/Schicht, Z=25 €/h
- Kleinmenge (<200 m²): 20 min/m³ oder 3 min/m², Z=15 €/h
- X berechnet aus `dicke × dichte × 1,15 × 1,05 × €/t`

**Pflaster & Bord (§4.2):**
- Pflaster: Y ≥ 25 min/m², Z=5 €/h
- Bord setzen: 15 min/lfm (Tiefbord 12), Z=5 €/h
- Rückenbeton einseitig: 0,05 m³/lfm × 200 €/m³ = 10 €/lfm Material
- Inkl. Fundament und Rückenstütze: 0,10 m³/lfm = 20 €/lfm Beton + 7 min Aushub
- X als Excel-Formel `=Stein+Beton` (lesbar)

**Schneidarbeiten (§4.3-4.5, §5.5):**
- Pflaster/Beton: 187 min/m² Schnittfläche, Z=15 €/h (bei 8 cm Dicke = 14,96 min/lfm)
- Stahlbeton: 300 min/m², Z=15 €/h
- Asphalt: 120 min/m², Z=15 €/h
- X bei Schnitten **immer leer**
- Trigger „anpassen" im Langtext ⇒ Schneidearbeit, Z=15 €/h zwingend

**Beton (§5.1-5.3):**
- Kleinmenge 1-2 m³: 200 €/m³
- LKW-Menge 8 m³: 120 + 30 Pumpe = 150 €/m³ (Pumpe immer)
- Betonieren rein: 30 min/m³
- Inkl. Aushub: 60 min/m³ + 25 min/Stelle
- Inkl. Schalung: 300 min/m³ + 25 min/Stelle
- Schalung: 25 min/m², Z=25 €/h; Sichtbeton +20 min +15 €/h

**Abbruch (§5.4):**
- Mauerwerk: 30 min/m³
- Asphalt: 15 min/m² (Belag!)
- Beton unbewehrt: 45 min/m³
- Stahlbeton: 90 min/m³
- Fels BK5-9: 45-90 min/m³
- Z=25 €/h
- Warnung-Regel: Asphalt ist Belag, nicht Erdmasse

**Schwere Bauteile im Fundament (§5.6):**
- Schacht: 150 min/St
- Doppelstabmatte: 35 min/lfm
- Zaunpfosten: 90 min/St
- Drehflügeltür / Tor: 300 min/St
- Rinne im Beton: 60 min/lfm

**Pflanzen/Bäume (§6):**
- Hochstamm pflanzen: +120 min/Baum (Grube separat)
- Hecke: 4 min/St
- Strauch: 6 min/St
- Rasen ansäen: 0,5 min/m²; Saatbett: 1,5 min/m²
- Spielgerät aufbauen: Z=5 €/h (nicht 0,50 Default)

### 14.2 NU-Trigger (§0.7)

Bei folgenden Stichworten im Langtext wird automatisch `M>0`, `Y=0`, `X=leer` gesetzt, und die Position als NU-Komplettleistung markiert:

- Fallschutz
- Markierung
- TÜV / Sachverständig
- DIN 1176
- Spielplatz-Prüfung

### 14.3 Meta-Regel Langtext-Modifikatoren (§0.8, höchste Priorität)

Beim Import wird jeder Langtext aktiv nach folgenden Stichworten gescannt und die Zeit-/Preis-Werte entsprechend angepasst, mit sichtbarem Kommentar in der Zelle:

- `inkl. …` — weitere Leistungen mitgerechnet
- `wechselfeucht` — Bodenzustand, verlangt erhöhte Verdichtung
- `Höhe XX` — Absturzsicherung, Arbeit auf Höhe (Zuschlag)
- `Sonderform` — erhöhter Aufwand
- `Spezialprofil` — erhöhter Aufwand
- `verkehrslast / befahrbar` — verstärkter Unterbau
- `DIN 1176` / `TÜV-pflichtig` — NU-Trigger
- `anpassen` — Schneidearbeit, Z=15 zwingend
- `inkl. Fundament und Rückenstütze` — Bord mit doppeltem Beton (siehe §4.2)

### 14.4 Vorhalte-Positionen (§0.9)

Bei Einheit `StWo` / `mWo` / `StMt` / `StTag` und Text „vorhalten":
- X leer
- Y = 0
- AA als Override (gelb markiert im UI)
- Quelle im Zellkommentar

### 14.5 Preisquellen-Waterfall (§7)

1. **Aktuelle Projekt-Angebote** (grün) — Lieferanten-Angebote aus dem aktuellen Projekt
2. **Preisdatenbank** (gelb) — interne Stammdaten-Preise
3. **Sirados** — manuell auf Knopfdruck, mit rotem Warn-Flag, **nie automatisch**
4. **knowledge_base.json → erfahrungspreise_eur** — interne Erfahrungswerte
5. **Web-Recherche** (rot) — über Browser-Tool, mit Quelle im Kommentar, **nie automatisch**

### 14.6 Gemini-v8-Regeln (Auszug)

**Regel 1 — X = 0 bei reinen Arbeitsleistungen:**
Bauzaun aufstellen/umsetzen, Schutzzaun, Ausbau zum Wiedereinbau, Wiedereinbau vorhandener Teile, Mähen, Fräsen, Boden lösen/laden/fördern, Planum herstellen, Profilieren, Nachverdichten, Abbrucharbeiten, Auflockern, Planieren, Geräte umsetzen → `X = 0`.

**Regel 2 — Alle Nebenmaterialien einrechnen:**
- Bordstein setzen: + Frischbeton (Fundament + Rückenstütze)
- Pflaster/Platten: + Splitt/Brechsand-Bettung + Fugenmaterial
- Rohr/Kanal: + Sandbett + Sandabdeckung (nur wenn nicht separate Position im LV)
- Asphalt einbauen: Mischgut = Dicke × Dichte (2,4 t/m³)
- Zaun setzen: Matten + Pfosten + Befestigung + ggf. Beton
- Entwässerungsrinne: + Rinne + Rost + Bettung
- Schotter/Kies: Schüttgut (Preis/t → Preis/m³ mit Schüttdichte)
- Beton einbauen: + Frischbeton + ggf. Schalung
- Vlies/Folie: Material pro m² (Rolle umrechnen)
- Baum pflanzen: + Substrat + Verankerung + Stammschutz

**Doppelzähl-Verbot:** Wenn Sandbett/Bettung/Beton als eigene LV-Position existiert, dort buchen, nicht in der Hauptposition nochmal. Im Kommentar immer vermerken: „Sand in sep. Pos. X.X.X" oder „Sand hier eingerechnet, keine sep. Pos."

**Regel 3 — Zulage-Positionen = nur Differenz:**
Erkennungsmerkmale: „Zulage zu…", „Wie vor, jedoch…", „Abweichend von…", „Aufpreis für…", „Mehr-/Minderkosten gegenüber…"

- Absoluter Aufpreis: direkt übernehmen
- Zwei vollständige Preise: Differenz = Variante − Basis
- Prozentuale Zulage: Basis × Prozentsatz
- `X = NUR Mehrkostenwert` (nie den Gesamtpreis)
- `Y = NUR Zusatzminuten` (0 bei reinem Materialtausch, negativ bei Maschineneinsatz statt Handarbeit)

**Regel 4 — Arbeitszeit-Hierarchie (zwingende Plausibilität):**
- Boden lösen + transportieren (3-5 min/m³) < Boden einbauen + verdichten (≥ 8 min/m³)
- Planum grob (1 min/m²) < Feinplanum Rasen (≥ 2 min/m²) < Feinplanum Böschung
- Abbruch Pflaster (3-5 min/m²) < Pflaster NEU verlegen (≥ 25 min/m²)
- Abbruch Bord (3-5 min/lfm) < Bord NEU setzen (≥ 8 min/lfm)
- Ausbau eines Elements (30-60 min/St) < Wiedereinbau desselben (≥ 60-120 min/St)
- Bauzaun aufstellen (2-3 min/m) < Bauzaun umsetzen (4-5 min/m)
- Tieferer Aushub > Flacherer Aushub (gleiche Bedingungen)

**Regel 5 — Konsistenz:**
Identische Leistungstexte → identischer Preis überall. Typische Wiederholungen: „Unterlage profilieren", „Nachverdichten", „Planum", „Sauberkeitsschicht", „Boden lösen". Vorgehen: nach Erstbefüllung gruppieren, bei unterschiedlichen EPs auf einheitlichen Wert korrigieren. **Diese Regel ist die Basis der Positions-Gruppen-Sperre in Kapitel 11.**

**Regel 6 — Gerätekosten:**
Die Excel-Version ignoriert Gerätekosten als eigene Summe (K6 ist nur Grundzuschlag-Prozent). In BauKalk Pro werden Gerätekosten nicht als separate Position geführt, sondern immer als `Z`-Wert (€/h) je Position mit der Zeit multipliziert.

### 14.7 Orientierungswerte Arbeitsminuten (Mindestzeiten)

| Tätigkeit | Richtwert | Tätigkeit | Richtwert |
|---|---|---|---|
| Boden lösen & laden (leicht) | ≥ 3 min/m³ | Plattenbelag verlegen | ≥ 20 min/m² |
| Boden lösen & laden (schwer) | ≥ 8 min/m³ | Natursteinmauer setzen | ≥ 45 min/m² |
| Boden einbauen & verdichten | ≥ 8 min/m³ | Bordstein setzen | ≥ 8 min/lfm |
| Schotter/Kies einbauen & verd. | ≥ 5 min/m³ | Asphalt einbauen (Fertiger) | ≥ 2 min/m² |
| Planum herstellen (grob) | ≥ 1 min/m² | Rohrleitung verlegen | ≥ 5 min/lfm |
| Feinplanum | ≥ 2 min/m² | Zaun setzen (Doppelstabmatte) | ≥ 10 min/lfm |
| Pflaster verlegen | ≥ 25 min/m² | Betonfertigteile versetzen | ≥ 15 min/St |
| Abbruch Pflaster | 3-5 min/m² | Baumpflanzung | ≥ 30 min/St |
| Abbruch Bordstein | 3-5 min/lfm | Rasen ansäen | ≥ 2 min/m² |
| Bauzaun aufstellen | 2-3 min/m | Bauzaun umsetzen | 4-5 min/m |

*Diese Werte sind Untergrenzen für Plausi-FAIL/WARN. Nach oben anpassen bei höherem Aufwand im Langtext.*

### 14.8 Umrechnungs-Konstanten

| Von → Nach | Faktor | Von → Nach | Faktor |
|---|---|---|---|
| t → m³ Schotter | ÷ 1,8 | Stück → lfm Bordstein | × Elementlänge |
| t → m³ Sand | ÷ 1,6 | m³ lose → m³ eingebaut | × 1,2–1,3 |
| t → m³ Mutterboden | ÷ 1,5 | Rolle → m² Vlies/Folie | Rollenmaß beachten |
| t → m³ Asphalt | ÷ 2,4 | Palette → m² Pflaster | Paletteninhalt |
| kg → m² Bewehrungsmatte | lt. Mattentyp | Frischbeton → €/lfm Bordstein | Querschnitt × Preis/m³ |

---

## 15. Projektstruktur (Repository-Layout)

```
BauKalkPro/
├── .claude/                        # Claude Code Konfiguration
├── .github/                        # CI/CD (später)
├── CLAUDE.md                       # Projekt-Vorgaben (unverändert)
├── lessons.md                      # Fehlerlog (unverändert)
├── README.md                       # Kurzübersicht für Entwickler
├── docs/
│   ├── spezifikation.md            # Diese Datei
│   ├── architektur.md              # (später separat, wenn nötig)
│   ├── datenmodell.md              # (später separat, wenn nötig)
│   └── regelwerk-baseline.md       # Übertragung aus Leitfaden v1.3
├── packages/
│   ├── app/                        # Electron + React + Vite
│   │   ├── electron/
│   │   │   ├── main.ts             # Electron Main Process
│   │   │   ├── preload.ts
│   │   │   └── python-sidecar.ts   # Python-Prozess-Verwaltung
│   │   ├── src/
│   │   │   ├── main.tsx            # React Entry
│   │   │   ├── App.tsx
│   │   │   ├── routes/             # Seiten (Projekte, LV-Editor, Admin)
│   │   │   ├── components/
│   │   │   ├── stores/             # Zustand
│   │   │   ├── hooks/
│   │   │   └── lib/
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   ├── kern/                       # Rechenkern + Regel-Engine (pure TS)
│   │   ├── src/
│   │   │   ├── rechnen.ts
│   │   │   ├── plausi.ts
│   │   │   ├── modifier-scan.ts
│   │   │   ├── mengenermittlung.ts
│   │   │   ├── positions-gruppen.ts
│   │   │   └── __tests__/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── datenmodell/                # Zod-Schemas + TS-Typen
│   │   ├── src/
│   │   │   ├── vorgaben.ts
│   │   │   ├── projekt.ts
│   │   │   ├── position.ts
│   │   │   ├── approval.ts
│   │   │   └── audit.ts
│   │   └── package.json
│   ├── storage/                    # JSON-I/O + SQLite-Cache
│   │   ├── src/
│   │   │   ├── vorgaben-repo.ts
│   │   │   ├── projekt-repo.ts
│   │   │   ├── sqlite-cache.ts
│   │   │   ├── audit-log.ts
│   │   │   └── file-watcher.ts
│   │   └── package.json
│   └── sidecar/                    # Python-Seite
│       ├── pyproject.toml
│       ├── baukalk_sidecar/
│       │   ├── __init__.py
│       │   ├── main.py             # FastAPI entry
│       │   ├── gaeb_parser.py
│       │   ├── gaeb_writer.py
│       │   ├── excel_parser.py
│       │   ├── excel_writer.py
│       │   ├── pdf_parser.py
│       │   └── embeddings.py
│       └── tests/
├── test-daten/                     # Gold-Standard-Referenzen
│   ├── riegelsberg/
│   │   ├── LV3.xlsx                # Referenz
│   │   ├── LV3.expected.json       # Erwartete Werte nach Import
│   │   └── lv3.d83                 # Original GAEB
│   └── ...
├── package.json                    # pnpm workspace root
├── pnpm-workspace.yaml
└── .gitignore
```

**Warum Monorepo?** Weil Rechenkern, Datenmodell und UI getrennt entwickelt und getestet werden sollen. `@baukalk/kern` ist ohne UI importierbar und kann im CI ohne Electron getestet werden. `@baukalk/datenmodell` wird von Kern, Storage und UI gleichermaßen genutzt — Single Source of Truth für Typen.

---

## 16. Roadmap & Meilensteine

**Hinweis zu Zeitangaben:** Diese Roadmap ist in Arbeitsphasen gegliedert, nicht in Kalenderwochen — wie schnell eine Phase abgeschlossen ist, hängt von Verfügbarkeit, Feedback-Zyklen und unvorhergesehenen Problemen ab. Ich vermeide bewusst Kalender-Schätzungen, weil sie in Software-Projekten selten halten.

### M1 — Grundgerüst & Rechenkern
- Monorepo-Setup mit pnpm
- Electron-App startbar, zeigt leeres Hauptfenster
- `@baukalk/datenmodell` mit den Kern-Zod-Schemas
- `@baukalk/kern` mit Rechenkern-Funktion `berechne()`
- Erste Unit-Tests gegen Riegelsberg-Referenzwerte
- Python-Sidecar-Skeleton, FastAPI startet aus Electron heraus

**Akzeptanzkriterium:** App startet auf dem Master-Mac, Rechenkern-Tests laufen grün gegen mindestens 10 manuell aus Excel übernommene Riegelsberg-Positionen.

### M2 — LV-Import (Excel + GAEB)
- Excel-Parser im Sidecar (oder TS), liest Gesellchen-LV.xlsx-Format
- GAEB-D83-Parser im Sidecar
- GAEB-X83-Parser im Sidecar
- Gewerk-Erkennung aus Bereichstiteln (Heuristik)
- Erste einfache LV-Editor-Ansicht in der App: Tabelle mit Positionen, EP/GP zur Anzeige

**Akzeptanzkriterium:** Riegelsberg-D83 wird importiert und alle Positionen erscheinen im LV-Editor mit korrekter Hierarchie.

### M3 — Projekt-Management & Vorgaben-Grundstruktur
- Projekt anlegen (Kunde wählen, Profil wählen, Parameter)
- Vorgaben-Repository liest JSON von OneDrive
- Erste Gewerk-Defaults aus Leitfaden v1.3 als JSON angelegt
- Matching-Kaskade: STLB → exakt → Gewerk-Default (ohne fuzzy/semantisch)
- Speichern/Laden eines Projekts als JSON

**Akzeptanzkriterium:** Neues Projekt anlegen, LV importieren, Default-Werte werden automatisch vorgeschlagen, Projekt speichert und lädt korrekt.

### M4 — Modifier-Scan & Plausi-Engine
- Modifier-Keyword-Liste aus Leitfaden v1.3
- Langtext-Scan mit visuellen Treffer-Markierungen
- Erschwernis-Zuschläge als erste Entität
- Plausi-Regel-Engine mit den wichtigsten Regeln (Arbeitszeit-Hierarchie, Minimum-Zeiten, NU-Trigger)
- PASS/WARN/FAIL-Anzeige pro Position

**Akzeptanzkriterium:** Riegelsberg-LV wird importiert, Modifier-Treffer werden erkannt, Plausi-Check läuft über alle Positionen.

### M5 — Positions-Gruppen & Mischkalkulations-Sperre
- Normalisierungs-Logik
- Gruppen-Erkennung beim Import
- Gruppen-Sperre in der UI mit Karten-Anzeige
- Kleinmengen-Auto-Subgruppe
- Explizite Entkopplung mit Pflicht-Begründung

**Akzeptanzkriterium:** Bei identischen Positionen wird automatisch eine Gruppe gebildet, Änderung in einer Position propagiert, Entkopplung funktioniert mit höherer-Preis-Prüfung.

### M6 — Excel-Export
- Template-basierter Export (Python mit openpyxl oder TS mit exceljs)
- Layout 1:1 wie heutige LV3-Dateien
- Zellkommentare mit Quellen
- Gold-Standard-Test: Import → Export → Vergleich mit Original-Werten

**Akzeptanzkriterium:** Exportierte Excel-Datei ist in Layout und Werten ununterscheidbar von einer manuell erstellten Excel-Kalkulation.

### M7 — Admin-Panel
- Gewerk-Editor (Default-Zeitwerte, Kleinmengen-Schwellwerte)
- Profil-Editor (Scharf/Normal/Großzügig)
- Modifier-Keyword-Tabelle
- Plausi-Regeln-Tabelle (JSON-Editor)
- Änderungen werden in OneDrive geschrieben

**Akzeptanzkriterium:** Alle relevanten Vorgaben können ohne Code-Änderung im Admin-Panel gepflegt werden. Änderungen wirken im nächsten Projekt.

### M8 — Rollen, Approval-Queue, Audit-Log
- Nutzer-Verwaltung (lokal, ohne Passwort in Phase 1 — einfach Nutzer-Auswahl beim Start)
- Senior vs. Junior Rollen
- Approval-Queue-UI
- Audit-Log-Viewer

**Akzeptanzkriterium:** Junior kann Projekt kalkulieren, Default-Änderungen landen in Queue, Senior kann genehmigen/ablehnen, Audit-Log zeigt alle Events.

### M9 — Korrektur-Workflow beim Projektabschluss
- Sammel-Dialog mit allen geänderten Werten
- Pro-Zeile-Häkchen (Kunde / global)
- Integration mit Approval-Queue
- Benachrichtigungen bei Genehmigung

**Akzeptanzkriterium:** Beim Klick auf „Projekt abschließen" erscheint Dialog mit allen Abweichungen, Entscheidungen werden korrekt gespeichert.

### M10 — Semantisches Alt-LV-Matching
- Indexierungs-Lauf über OneDrive-Alt-LV-Ordner (SharePoint-Freigabe-Link)
- Embedding-Generierung im Python-Sidecar
- Ähnlichkeitssuche mit Top-5-Anzeige
- Verteilungs-Anzeige statt Mittelwert

**Akzeptanzkriterium:** Beim Import eines neuen LV findet die Software relevante Alt-Treffer und zeigt sie mit Verteilung an.

### M11 — GAEB-Export (D81/X81 + D84/X84)
- GAEB-Writer im Python-Sidecar
- Validierung gegen Schema
- Round-Trip-Test: GAEB importieren → mit Preisen → GAEB exportieren → erneut parsen → Werte stimmen

**Akzeptanzkriterium:** Gleichwertige GAEB-Datei wird erzeugt, die eine externe AVA (z.B. California oder GAEB Online Converter) als gültig akzeptiert.

### M12 — Feinschliff, Gold-Standard-Tests, Release Candidate
- Alle Akzeptanzkriterien der vorigen Meilensteine erfüllt
- Riegelsberg-LV und 2-3 weitere Referenz-LVs komplett durchgerechnet
- Vergleich mit manuell erstellter Excel-Kalkulation: Cent-genau
- DMG-Build für macOS, signiert und notarisiert
- Installations-Anleitung für die beiden Senior-Kalkulatoren
- Pilot-Betrieb mit einem echten Live-Projekt

### Phase 1b — Web-Kundenportal
Nach dem erfolgreichen Pilot-Betrieb von Phase 1 (M12):
- Hosted-Dienst-Setup (Hetzner oder Cloudflare)
- Magic-Link-Auth
- Read-mostly-Projekt-Sicht mit Änderungs-Erfassung
- 80/20-Ansicht
- Freigabe-Button mit Signatur
- Sync zwischen Desktop-App und Web-Portal

---

## 17. Offene Punkte für spätere Klärung

Diese Punkte sind nicht blockierend für den Start, müssen aber vor den jeweiligen Meilensteinen geklärt werden:

1. **Gerüstbau-Position in der Kategorie:** Aktuell unter „Gebäudehülle" — ggf. eigene Kategorie? Entscheidung: wird beim Admin-Panel-Aufbau (M7) geprüft, leicht umhängbar.

2. **Solar bei „Technik":** Manche Elektrobetriebe machen Solar, andere nicht — ggf. eigener Lizenz-Baustein bei Verkauf. Entscheidung: erst in Phase 2 relevant.

3. **Nachtrags-Workflow & EP-Override-Spalte:** Im Interview offen gelassen („frage ich später nochmal im Zusammenhang mit Nachträgen"). Für Phase 1 nicht nötig, weil Nachträge dort nicht abgebildet werden. Vor Phase 2 klären.

4. **Studenten-Tool für Materialanfragen — konkrete Integration:** Sobald Phase-1-Pilot läuft, Code des Studenten ansehen, Datenschnittstelle definieren, in Phase 2 einbauen.

5. **DSGVO-Anforderungen für Phase 1b (Kundenportal):** Datenschutzerklärung, Auftragsverarbeitung, Einwilligungen. Muss rechtlich abgeklärt werden, bevor Phase 1b live geht.

6. **Backup-Strategie für OneDrive:** OneDrive hat Versionshistorie, aber zusätzlich sollte einmal pro Woche eine ZIP-Backup-Datei automatisch erzeugt werden, die in einen separaten OneDrive-Ordner wandert. Details in M7.

7. **Konkrete Lizenz-Daten-Struktur für externen Verkauf (Modell A):** Nicht in Phase 1 gebaut, aber die Datenmodell-Trennung bereits angelegt.

8. **Plausi-Regeln für Nicht-Tiefbau-Gewerke:** Der Leitfaden v1.3 ist stark auf Tiefbau/GaLaBau fokussiert. Für Ausbau (Trockenbau, Maler, Fliesen), HLS, Dachdecker, Zimmerer fehlen noch detaillierte Regeln. Diese werden iterativ beim Kalkulieren von Projekten in diesen Gewerken ergänzt. Die Software startet mit den Tiefbau/GaLaBau-Regeln als vollständigem Set und sammelt in den anderen Gewerken per Projekt-Erfahrung Erschwernis- und Plausi-Regeln.

9. **Sync-Mechanismus bei gleichzeitigem Arbeiten:** Phase 1 vertraut auf „jeder hat seine Kunden, keine parallelen Schreibvorgänge". Falls das später nicht mehr stimmt (z.B. neue Junioren), braucht es eine Locking- oder Konflikt-Auflöse-Strategie. Anfangs reicht eine einfache „letzter Speichert gewinnt"-Regel mit Warnung.

---

## 18. Anhang

### 18.1 Glossar

- **AVA** — Ausschreibung, Vergabe, Abrechnung (Software-Kategorie)
- **BGK** — Baustellengemeinkosten
- **AGK** — Allgemeine Geschäftskosten
- **W&G** — Wagnis & Gewinn
- **EP** — Einheitspreis
- **GP** — Gesamtpreis (Menge × EP)
- **LV** — Leistungsverzeichnis
- **OZ** — Ordnungszahl (Positionsnummer im LV)
- **GAEB** — Gemeinsamer Ausschuss Elektronik im Bauwesen (Datenaustausch-Standard)
- **STLB-Bau** — Standardleistungsbuch Bau (Textbaustein-Katalog)
- **VOB** — Vergabe- und Vertragsordnung für Bauleistungen
- **K3/K6** — Kalkulationsformblätter nach KLR-Bau
- **Formblatt 221** — Preisermittlung bei Zuschlagskalkulation
- **Formblatt 223** — Aufgliederung der Einheitspreise
- **NU** — Nachunternehmer
- **Mischkalkulation** — verbotene Praxis, Gewinn aus einzelnen Positionen zu verlagern; führt zum Angebots-Ausschluss
- **Zeitwert-Faktor** — bidirektionaler Prozentsatz, mit dem alle Zeiten einer Kalkulation pauschal angepasst werden (Excel-Feld `zeitabzug` / AP5)

### 18.2 Referenz-Projekt für Tests

`260319_Friedhoefe_Riegelsberg` (Gesellchen GmbH) ist der Gold-Standard. Alle Rechenkern-Tests referenzieren diese Excel-Datei. Bei Änderungen am Rechenkern werden die erwarteten Werte durchgerechnet und als Testdaten hinterlegt.

### 18.3 Interview-Log

Das Interview, aus dem diese Spec entstanden ist, umfasst die Fragen F1 bis F14 mit vollständigen Antworten des Masters. Die wichtigsten Entscheidungen:

- **F1:** Excel-Formelkette 1:1 nachgebildet (EP = AA+AB+AJ+AK mit Zeitwert-Faktor bidirektional)
- **F2:** Verrechnungslohn und Zuschläge frei eingebbar; Formblätter 221/223 erst Phase 2
- **F3:** Import GAEB (d83/d84/x83/x86) + Excel + PDF-Notnagel; Export Phase 1 = Excel + GAEB D81/X81/D84/X84
- **F4:** Eigene Vorgaben als Wahrheit; Sirados nicht im Auto-Pfad; STLB-Code nur als Matching-Schlüssel; Matching-Kaskade STLB → exakt → fuzzy → semantisch → Default
- **F5:** Gewerke in 7 Kategorien, Auto-Zuweisung per Bereichstitel (Variante A); Reinigung/Sicherheit Phase 2
- **F6:** Profil-Modell Scharf/Normal/Großzügig plus freie Nachjustierung; Zeitwert-Faktor bidirektional; Vererbungskette global → kunde → projekt
- **F7:** Rollen Senior/Junior mit Approval-Queue; Korrektur-Dialog beim Projektabschluss
- **F8:** Positions-Gruppen-Sperre mit Auto-Kleinmengen-Erschwernis und expliziter Entkopplung
- **F9:** Mengenermittlung als Hybrid (typisierte Bausteine + Custom-Formel-Fallback)
- **F10:** Materialpreis-Workflow in Phase 2, Integration mit Studenten-Tool
- **F11:** IP-Schutz Modell A (Black Box für Kunden) mit Junior-ähnlichem Zugang beim Verkauf
- **F12:** Desktop-first mit JSON-Source-of-Truth auf OneDrive, SQLite nur als Cache, Python-Sidecar für GAEB/PDF/Embeddings
- **F13:** Phase-1-Scope gelockt; GAEB D81-Export aus Phase 2 nach Phase 1 hochgezogen
- **F14:** Leitfaden v1.3 + knowledge_base.json + rules.json + Gemini v8 als Baseline übernommen

---

**Ende der Spezifikation**

*Diese Datei ist der aktuelle Stand des Interviews und wird aktualisiert, sobald offene Punkte geklärt werden. Jede wesentliche Änderung landet im Audit-Log der Spezifikation selbst (git-Historie von `docs/spezifikation.md`).*
