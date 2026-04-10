# Lessons – Fehler und Korrekturen

WICHTIG: Lies diese Datei IMMER bevor du an Kalkulationen oder Berechnungen arbeitest.

## Regeln aus Fehlern

### 2026-04-10: Entsorgungspreise fehlten bei Titel 1.2
- **Problem:** KI hat bei Positionen mit "entsorgen", "roden", "entfernen" keine Entsorgungskosten (X) eingetragen
- **Regel:** Bei JEDER Position die Entsorgung beinhaltet MUSS X > 0 sein (Entsorgungskosten)
- **Fix:** Entsorgungspreise in preisdatenbank.json UND im KI-Prompt fest hinterlegt
- **Preise:** Grünschnitt 50€/t, Holz unbeh. 80€/m³, Holz beh. 150€/m³, Beton/RC 10€/t, Asphalt 15€/t, Asphalt+Schadstoff 70€/t, Erde BM-0 18€/t, Erde BM-F2 55€/t, Kunststoff 300€/t, Hausmüll 300€/t

### 2026-04-10: Bauzaun hatte falschen Materialpreis (X > 0)
- **Problem:** KI hat bei "Bauzaun" Materialkosten eingetragen — Bauzaun ist Mietequipment
- **Regel:** Bauzaun, Abbruch, Ausbau, Boden lösen etc. haben IMMER X = 0
- **Fix:** Explizite X=0-Regeln im KI-Prompt

### 2026-04-10: require() im ESM-Bundle fehlgeschlagen
- **Problem:** `require("@anthropic-ai/sdk")` in Vite ESM-Bundle → "require is not defined"
- **Fix:** `await import("@anthropic-ai/sdk")` statt `require()`, SDK in vite.config.ts als external

### 2026-04-10: kalk-regeln.json enthielt erfundene Werte
- **Problem:** 178 Regeln aus auto-befuellung.ts exportiert — viele davon waren NICHT vom Master bestätigt (z.B. M=15 für Fahrradständer, M=10 für Bänke, Y=3 für Gräben)
- **Regel:** kalk-regeln.json darf NUR Werte enthalten die explizit vom Senior-Kalkulator bestätigt wurden
- **Fix:** Bereinigung auf nur die Leitfaden v1.3 bestätigten Werte. Alles andere → KI berechnet

### 2026-04-10: Entsorgung 18€ als Stoffe bei Ausbaupositionen
- **Problem:** "Maltafel ausbauen", "Klettergerät ausbauen" etc. bekamen X=18€ Entsorgung — Ausbau ist reine Arbeitsleistung
- **Regel:** "ausbauen" ist KEINE Entsorgung. Nur wenn explizit "entsorgen" oder "verwerten" im Text steht UND es keine reine Ausbau-Position ist
- **Fix:** Entsorgungserkennung prüft ob Position primär Ausbau ist → dann X=0

### 2026-04-10: Gräben/Kanalbau mit 3 min statt 20 min
- **Problem:** Gräben für Leitungen brauchen schmalen Baggerlöffel = 20 min/m³ laut Master, nicht 3 min
- **Regel:** Gräben/Kanalbau = Minibagger-Arbeit = 20 min/m³, Z=15
- **Fix:** Regel in kalk-regeln.json korrigiert

### 2026-04-10: NU-Werte ohne Angebot erfunden
- **Problem:** Keyword-Regeln hatten M-Werte (NU) ohne dass Angebote vorlagen
- **Regel:** M (NU) darf NUR gesetzt werden wenn: (1) ein echtes Angebot vorliegt, (2) es ein NU-Trigger-Keyword ist (Fallschutz, TÜV etc.), oder (3) der Master es explizit vorgegeben hat
- **Fix:** Alle erfundenen M-Werte aus kalk-regeln.json entfernt

### 2026-04-10: KI setzt Entsorgungspreise bei Abbruch-Positionen in X
- **Problem:** "Schotterunterbau abbrechen" bekam X=45 (Entsorgung), "Betonplatten abbrechen" X=20 etc.
- **Regel:** Abbruch = IMMER X=0. Entsorgungskosten werden in SEPARATEN LV-Positionen abgerechnet, NIEMALS in der Abbruch-Position selbst
- **Betrifft:** ALLE Positionen mit "abbrechen", "aufbrechen", "aufnehmen", "abtragen", "schneiden", "Saugbagger"
- **Fix:** KEINE_ENTSORGUNG_IN_X_KEYWORDS in regel-engine.ts erweitert, KI-Prompt verschärft

### 2026-04-10: KI erfindet X-Werte für reine Arbeitsleistungen
- **Problem:** "Abstecken" X=18, "Oberboden andecken" X=18,75, "Baustellenabsperrung" X=120 — alles reine Arbeit
- **Regel:** Die MEISTEN Baupositionen sind reine Arbeitsleistung! X > 0 NUR wenn Material GEKAUFT und DAUERHAFT EINGEBAUT wird
- **Erweiterte X=0 Liste:** Oberboden lagern/andecken, Abstecken, Verkehrszeichen, Absperrung, Bereitstellungsfläche, Überweg, Feinplanum, vorhandene Steine versetzen
- **Fix:** REINE_ARBEIT_KEYWORDS massiv erweitert, KI-Prompt: "Im Zweifel X=0"

### 2026-04-10: KI-Begründungen waren nicht sichtbar
- **Problem:** Tooltips zeigten nur für Schicht-1-Positionen die Quelle, nicht für KI-berechnete
- **Fix:** KI-Ergebnisse werden jetzt auch in quellenDetails gespeichert → Hover zeigt Begründung

### 2026-04-10: Langtext-Entsorgungswörter lösten falsch X=18€ aus
- **Problem:** Mäh-Positionen wie "Rasen mähen" hatten im Langtext "Schnittgut entsorgen" — die Regel-Engine suchte Entsorgungskeywords im GESAMTTEXT (Kurztext+Langtext) und vergab dann fälschlicherweise X=18€
- **Betrifft:** "mähen", "fräsen", "Baustelle einrichten/räumen", "Abstecken", "Schutzzaun", "Feinplanum" — alle diese hatten im Langtext Wörter wie "entsorgen", "abfahren" etc.
- **Umfang:** 497 Positionen über 132 Dateien betroffen
- **Regel:** Entsorgungskeywords NUR im KURZTEXT suchen, NIEMALS im Langtext! Der Langtext enthält bei fast allen Positionen irgendwo "entsorgen" in der Leistungsbeschreibung.
- **Fix:** (1) Reine-Arbeit-Check wird ZUERST gemacht (Vorrang vor Entsorgung), (2) Entsorgungskeywords werden NUR im Kurztext gesucht, (3) Wenn Position als reine Arbeit erkannt → Entsorgung wird ignoriert
- **Verifizierung:** Massentest über 191 GAEB-Dateien (30.988 Positionen) → 0 kritische Fehler

### 2026-04-10: REINE_ARBEIT_KEYWORDS unvollständig
- **Problem:** Viele reine Arbeitspositionen fehlten in der Keyword-Liste
- **Ergänzte Keywords:** "bauzaun" (allgemein), "baumschutzzaun", "oberboden lösen", "oberboden abschieben", "lösen und laden", "boden separieren", "baugrund auflockern", "vegetationsfläche", "vegetationsflächen", "vegetationsschicht fräsen"
- **Fix:** Liste systematisch erweitert und in Kategorien gegliedert (BE, Abbruch, Erdarbeiten, Vegetation, Sonstiges)

### 2026-04-10: KI (Schicht 2) überschrieb Schicht-1-Werte komplett
- **Problem:** Die KI hat `werte.set(oz, {...})` gemacht statt Merge — wenn Schicht 1 z.B. X=0 (reine Arbeit) gesetzt hat, hat die KI das mit X=36 (Entsorgungskosten) oder X=280 (Bauzaun-Mietkosten) überschrieben
- **Beispiele:** "Bitumenhaltige Befestigung abbrechen" X=36 statt X=0, "Bauzaun Stahlrohrrahmen" X=280 statt X=0
- **Regel:** Schicht-1-Werte haben IMMER Vorrang! Die KI darf NUR Felder füllen die Schicht 1 NICHT gesetzt hat
- **Fix:** Merge-Logik in App.tsx: Vor dem Setzen prüfen ob quellenDetails bereits einen Eintrag für das Feld hat. Wenn ja → Schicht-1-Wert behalten, wenn nein → KI-Wert nehmen
- **Betrifft:** BEIDE Code-Pfade in App.tsx (handleStart und handleWizardStart)

### 2026-04-10: GAEB DA 83 Festformat (D83) wurde nicht geparst
- **Problem:** 59 von 191 Dateien hatten 0 Positionen — sie waren GAEB DA 83 Festformat (kein XML), aber der Parser konnte nur XML
- **Fix:** Neuen DA83-Parser geschrieben mit Satztyp-Erkennung (00=Kopf, 11=Bereich, 21=Position, 25=Kurztext, 26=Langtext), Regex-basierte Mengen/Einheit-Extraktion, Latin1-Encoding
- **Ergebnis:** 16 weitere Dateien erfolgreich geparst (von 132 auf 148), restliche 43 sind Baubeschreibungen (T0-Format) oder D84-Angebotsdateien
