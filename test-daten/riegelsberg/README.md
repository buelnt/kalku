# Test-Daten: Riegelsberg LV3

Gold-Standard-Testdaten für den Rechenkern.

## Herkunft

`referenz.json` wurde am 2026-04-09 aus der Original-Kalkulations-Excel
gewonnen:

```
/Users/admin/Library/CloudStorage/OneDrive-kalku/
  KT01/1695_Gesellchen_GmbH/_abgeschlossen/
  260319_Friedhoefe_Riegelsberg/LV3.xlsx
```

Mit dem Script `scripts/extract-referenz.py` gelesen (`openpyxl`
`data_only=True`), das die von Excel gecachten Berechnungsergebnisse
ausliest. Diese Werte sind die Wahrheit, gegen die unser Rechenkern
validiert wird.

## Inhalt

`referenz.json`:

- `parameter` — die Projekt-Parameter (Verrechnungslohn, Zuschläge,
  Zeitwert-Faktor usw.) aus den Excel-Kopfzellen.
- `positionen` — 46 Positionen mit allen Rohwerten (X, Y, Z, M) und allen
  berechneten Ergebnissen (AC, AA, AB, AJ, AK, EP, GP).

## Wann aktualisieren

**Nie ohne triftigen Grund.** Diese Werte sind der Goldstandard. Wenn sich
herausstellt, dass unsere Rechnung abweicht, gilt die Vermutung, dass
*unsere Rechnung* falsch ist, nicht die Referenz.

Nur wenn die Original-Excel selbst geändert wird (z.B. weil der Master
dort eine Korrektur einspielt), sollte `referenz.json` neu erzeugt werden.
Dann das Extraktions-Script nochmal laufen lassen und den Diff im Commit
kommentieren.
