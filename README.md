# BauKalk Pro

Baukalkulations-Software für **kalku.de**. Ersetzt die bisherigen Excel-Kalkulationstabellen, mit denen kalku.de Baukalkulationen für Baufirmen über alle Gewerke hinweg erstellt.

## Stand

**Version 0.1.0 — Entwicklung (Phase 1)**

- ✅ Interview-Phase abgeschlossen, Spezifikation fertig ([docs/spezifikation.md](docs/spezifikation.md))
- ✅ Rechenkern mit Excel-kompatibler Rundung — **48/48 Tests** gegen Riegelsberg LV3
- ✅ LV-Import: Excel + GAEB D83 — **25/25 Tests**
- ✅ Excel-Export im LV3-Layout mit End-to-End-Verifikation
- ✅ Modifier-Scan (NU/Erschwernis/Vorhalte/Arbeitsleistung) + Plausi-Engine (10 Regeln)
- ✅ Positions-Gruppen (Mischkalkulations-Vermeidung)
- ✅ Vorgaben-Datenbank: 54 Zeitwerte, 3 Profile, 4 Modifier-Kategorien
- ✅ Electron + React Desktop-Shell mit LV-Editor und IPC-Brücke
- ⏭️ Nächste Schritte: UI-Verkabelung, Projekt-Flow, Admin-Panel

**90 Tests, 13 Commits, ~3.500 Zeilen TypeScript.**

## Setup

```bash
# pnpm installieren (standalone, kein sudo)
curl -fsSL https://get.pnpm.io/install.sh | sh -
export PNPM_HOME="$HOME/Library/pnpm"
export PATH="$PNPM_HOME:$PATH"

# Dependencies installieren
pnpm install

# Tests (90 Tests, alle grün)
pnpm -r test

# Typecheck
pnpm -r typecheck
```

## Projektstruktur

```
BauKalkPro/
├── docs/spezifikation.md              # 18 Kapitel, vollständig
├── packages/
│   ├── datenmodell/                   # Zod-Schemas + TS-Typen
│   ├── kern/                          # Rechenkern, Modifier, Plausi, Gruppen (64 Tests)
│   ├── import/                        # Excel + GAEB D83 Parser (25 Tests)
│   ├── export/                        # Excel-Export LV3-Layout (1 E2E-Test)
│   └── app/                           # Electron + React Desktop-App
│       ├── electron/                  # Main Process + IPC-Handler
│       └── src/                       # React UI (Projekte, Kalkulation, Vorgaben)
├── vorgaben/                          # Editierbare JSON-Vorgaben
│   ├── kategorien.json                # 6 Gewerk-Kategorien
│   ├── profile.json                   # Scharf / Normal / Großzügig
│   ├── gewerke/rohbau.json            # 54 Default-Zeitwerte
│   ├── modifier-keywords.json         # NU/Erschwernis/Vorhalte/Arbeitsleistung
│   └── plausi-regeln.json             # 10 deklarative Regeln
├── test-daten/riegelsberg/            # Gold-Standard (46 Positionen aus LV3.xlsx)
├── scripts/extract-referenz.py        # Fixture-Regenerator
├── CLAUDE.md                          # Verbindliche Projekt-Vorgaben
└── lessons.md                         # Fehlerlog
```

## Konventionen (CLAUDE.md, nicht verhandelbar)

1. **UI-Sprache Deutsch.** Niemals englische Strings im User-Facing-Code.
2. **Zahlenformat deutsch.** `1.234,56 €` mit `de-DE`-Locale.
3. **Rechenergebnisse exakt wie Excel.** ROUND_HALF_UP + Precision-as-displayed.
4. **MwSt. konfigurierbar.** Nie hardcoded.

## Rechenkern-Validierung

Der Rechenkern wird gegen **46 reale Positionen aus Riegelsberg LV3** geprüft. Cent-genau. Abweichungen blockieren.

```bash
pnpm --filter @baukalk/kern test    # 64 Tests (Rechnen + Modifier + Plausi)
pnpm --filter @baukalk/import test  # 25 Tests (Excel + GAEB D83)
pnpm --filter @baukalk/export test  # 1 E2E-Test (Import → Calc → Export → Verify)
```
