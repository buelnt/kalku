# BauKalk Pro

Baukalkulations-Software für **kalku.de**. Ersetzt die bisherigen Excel-Kalkulationstabellen, mit denen kalku.de Baukalkulationen für Baufirmen über alle Gewerke hinweg erstellt.

## Stand

**Version 0.1.0 — Entwicklung**

- ✅ Interview-Phase abgeschlossen
- ✅ Vollständige Spezifikation ([docs/spezifikation.md](docs/spezifikation.md))
- ✅ **Meilenstein M1** abgeschlossen: Monorepo + Datenmodell + Rechenkern + 48 Gold-Standard-Tests gegen Riegelsberg LV3
- ⏭️ Meilenstein M2: LV-Import (GAEB + Excel)

## Setup

```bash
# pnpm installieren, falls nicht vorhanden (standalone, kein sudo nötig)
curl -fsSL https://get.pnpm.io/install.sh | sh -
export PNPM_HOME="$HOME/Library/pnpm"
export PATH="$PNPM_HOME:$PATH"

# Dependencies installieren
pnpm install

# Tests laufen lassen (48 Tests, alle grün)
pnpm -r test

# Typecheck
pnpm -r typecheck
```

## Projektstruktur

```
BauKalkPro/
├── docs/
│   └── spezifikation.md           # Vollständige Spec (18 Kapitel)
├── packages/
│   ├── datenmodell/               # @baukalk/datenmodell
│   │   └── Zod-Schemas + TS-Typen (Position, Parameter, Berechnung)
│   └── kern/                      # @baukalk/kern
│       └── Rechenkern mit berechne(), 48 Gold-Standard-Tests
├── test-daten/
│   └── riegelsberg/
│       └── referenz.json          # Gold-Standard aus LV3.xlsx
├── scripts/
│   └── extract-referenz.py        # Regeneriert referenz.json aus Excel
├── CLAUDE.md                      # Projekt-Vorgaben (nicht verhandelbar)
└── lessons.md                     # Fehlerlog
```

## Konventionen

Alle Regeln aus `CLAUDE.md` sind verbindlich:

1. **UI-Sprache Deutsch.** Niemals englische Strings im User-Facing-Code.
2. **Zahlenformat deutsch.** `1.234,56 €` mit `de-DE`-Locale.
3. **Rechenergebnisse exakt wie Excel.** Validiert gegen 46 Riegelsberg-Positionen.
4. **MwSt. konfigurierbar.** Nie hardcoded.

## Rechenkern-Validierung

Der Rechenkern wird bei jeder Änderung gegen **46 reale Positionen aus Riegelsberg LV3** geprüft. Jede Position muss Cent-genau wie Excel rauskommen. Abweichungen blockieren den Merge/Release.

```bash
pnpm --filter @baukalk/kern test
```

Aktueller Stand: **48/48 Tests grün.**
