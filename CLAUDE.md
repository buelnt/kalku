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

## Fehlerlog
- Siehe @lessons.md für alle bisherigen Korrekturen
- LIES lessons.md VOR jeder Kalkulations-Aufgabe

## Bei Compaction bewahren
- Alle Kalkulationsformeln der aktuellen Session
- Alle Fehlerkorrekturen
- Aktuelle Dateistruktur
- Architektur-Entscheidungen
