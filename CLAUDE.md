# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

**BauKalk Pro** ist eine Baukalkulations-Software der Firma **kalku.de**. Sie ersetzt die bisherigen Excel-Kalkulationstabellen, mit denen kalku.de Baukalkulationen für Baufirmen über alle Gewerke hinweg erstellt. Die Software soll später auch an andere Baufirmen vermarktet werden.

## Tech Stack

- **Electron** + **React** + **TypeScript** (Desktop-App)
- **SQLite** als lokale Datenbank

Hinweis: Das Repository ist noch leer (nur `.git`). Wenn Build-/Test-/Lint-Befehle etabliert sind, sollten sie hier ergänzt werden.

## Zwingende Projekt-Konventionen

Diese Regeln sind nicht verhandelbar und gelten für jeden Code-Change:

1. **Sprache: Deutsch.** Die gesamte Benutzeroberfläche (Labels, Meldungen, Fehler, Tooltips, Menüs) ist auf Deutsch. User-facing Strings niemals auf Englisch einführen.

2. **Zahlenformat: deutsch.** Darstellung immer als `1.234,56 €` (Punkt als Tausendertrenner, Komma als Dezimaltrenner, Euro-Zeichen nachgestellt). Für Parsing und Formatierung konsistent `de-DE` Locale verwenden — niemals JavaScript-Default (`toString`, `toLocaleString()` ohne Locale), da dies plattformabhängig ist.

3. **Rechenergebnisse müssen exakt mit Excel übereinstimmen.** Dies ist die wichtigste Korrektheitsgarantie des Produkts — kalku.de validiert Ergebnisse gegen die Excel-Bestandskalkulationen.
   - Keine naive `number`-Arithmetik für Geldbeträge, wenn dadurch Rundungsdrift entsteht. Rundungsregeln (kaufmännisch, Stellenzahl, Reihenfolge) müssen Excel 1:1 entsprechen.
   - Bei jeder Änderung an Berechnungslogik: gegen Referenz-Excel-Werte testen.

4. **Mehrwertsteuer ist immer konfigurierbar, niemals hardcoded.** Kein `* 1.19`, kein `VAT = 0.19`. Der MwSt.-Satz kommt aus Konfiguration/Datenbank und ist pro Kalkulation einstellbar (verschiedene Sätze, reduzierte Sätze, steuerfreie Positionen müssen möglich bleiben).

## Domäne (Kontext für Entscheidungen)

- **Gewerke**: Die Kalkulation deckt alle Bau-Gewerke ab (nicht auf ein einzelnes spezialisiert). Datenmodelle und UI müssen gewerkübergreifend funktionieren.
- **Zielnutzer heute**: kalku.de-interne Kalkulatoren, die heute mit Excel arbeiten — Workflows und Begriffe sollten für diese Nutzer vertraut bleiben.
- **Zielnutzer später**: externe Baufirmen — deshalb früh auf saubere Mandanten-/Nutzer-Trennung und verständliche Defaults achten.

## Workflow-Pflicht (verschärft)
- Nach JEDER kalkulierten Position sofort `plausi.py` laufen lassen.
- NICHT erst am Ende der gesamten Kalkulation sammeln und dann prüfen.
- Schlägt die Plausibilitätsprüfung fehl: Position korrigieren, bevor zur nächsten übergegangen wird. Fehler in `lessons.md` festhalten.

## PFLICHT-LEKTÜRE BEI JEDEM SESSIONSTART (nicht verhandelbar)

Bei JEDER neuen Session, bei JEDEM `/clear`, bei JEDER Compaction — diese Dateien ZUERST lesen:

1. **`lessons.md`** — Alle bisherigen Fehler und Korrekturen. NIEMALS einen dort dokumentierten Fehler wiederholen.
2. **`vorgaben/kalk-regeln.json`** — Die 32 deterministischen Kalkulationsregeln (nur vom Senior bestätigte Leitfaden-Werte)
3. **`vorgaben/preisdatenbank.json`** — Alle Material- und Entsorgungspreise
4. **`vorgaben/ki-config.json`** — KI-Konfiguration (API-Key, Modell)

## KALKULATIONSREGELN (Zusammenfassung der wichtigsten Fehlerquellen)

Diese Regeln wurden aus konkreten Fehlern gelernt und dürfen NIEMALS verletzt werden:

1. **X = 0 bei reinen Arbeitsleistungen:** Bauzaun, Abbruch, Ausbau, Boden lösen, Planum, Sichern, Lagern — KEIN Material
2. **Entsorgungspreise NUR bei Masse-Entsorgung:** Bodenaushub/Schotter/Asphalt entsorgen → X > 0. NICHT bei Spielgerät/Fahrradständer/Möbel entsorgen (das ist Ausbau = X=0)
3. **Gräben = 20 min/m³** (schmaler Baggerlöffel), NICHT 3 min
4. **Handarbeit = 240 min/m³ Minimum**, bei felsig bis 600
5. **Asphalt schneiden = 120 min/m² Schnittfläche × Dicke**, Z=15 (Nasschneider). Bei 9cm → 10,8 min/m
6. **Keine erfundenen NU-Werte:** M darf nur aus Angeboten oder NU-Trigger-Keywords kommen
7. **Keine erfundenen Stoffe-Werte:** X darf nur aus Angeboten, Preisdatenbank, oder dem Leitfaden kommen
8. **BM-Klassen:** BM-0=18€/t, BM-0*=25€/t, BM-F0*=35€/t, BM-F1=45€/t, BM-F2=55€/t

## Drei-Schichten-Architektur (IMMER einhalten)

```
Schicht 1: DETERMINISTISCHE REGELN (kalk-regeln.json) — kein Spielraum
    → Nur vom Senior bestätigte Leitfaden-Werte
    → Jeder Wert mit Quellen-Annotation
Schicht 2: KI BERECHNUNG — nur für Lücken, KEIN Schätzen
    → Muss auf Referenz-Positionen aus Schicht 1 verweisen
    → Wert darf NICHT niedriger sein als vergleichbare Position
Schicht 3: LERNENDES GEHIRN — Korrekturen werden als neue Regeln gespeichert
    → Senior ändert Wert → Häkchen "Im Gehirn speichern"
    → Nächste Kalkulation: Schicht 1 findet die Regel → KI wird nicht gefragt
```

## Fehlerlog
- Siehe @lessons.md für alle bisherigen Korrekturen
- LIES lessons.md VOR jeder Kalkulations-Aufgabe

## Workflow-Pflicht (verschärft)
- Nach JEDER kalkulierten Position sofort `plausi.py` laufen lassen.
- NICHT erst am Ende der gesamten Kalkulation sammeln und dann prüfen.
- Schlägt die Plausibilitätsprüfung fehl: Position korrigieren, bevor zur nächsten übergegangen wird. Fehler in `lessons.md` festhalten.

## Bei Compaction bewahren
- Alle Kalkulationsformeln der aktuellen Session
- Alle Fehlerkorrekturen
- Aktuelle Dateistruktur
- Architektur-Entscheidungen
- PFLICHT-LEKTÜRE Liste oben
