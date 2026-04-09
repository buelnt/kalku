import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scanModifier, type ModifierKeywords } from "./modifier-scan.js";

const KEYWORDS_PATH = resolve(__dirname, "../../../vorgaben/modifier-keywords.json");
const keywords = JSON.parse(readFileSync(KEYWORDS_PATH, "utf-8")) as ModifierKeywords;

describe("Modifier-Scan", () => {
  it("erkennt NU-Trigger (Fallschutz)", () => {
    const treffer = scanModifier(
      "Fallschutzplatten liefern und verlegen",
      "gem. DIN EN 1177",
      "m²",
      keywords,
    );
    const nu = treffer.filter((t) => t.typ === "nu_trigger");
    expect(nu.length).toBeGreaterThan(0);
    expect(nu[0]!.keyword).toBe("fallschutz");
  });

  it("erkennt NU-Trigger (DIN 1176 im Langtext)", () => {
    const treffer = scanModifier(
      "Spielgerät prüfen",
      "Prüfung nach DIN 1176 durch Sachverständigen",
      "St",
      keywords,
    );
    const nu = treffer.filter((t) => t.typ === "nu_trigger");
    expect(nu.length).toBeGreaterThanOrEqual(2); // DIN 1176 + sachverständig
  });

  it("erkennt Erschwernis (Leibung)", () => {
    const treffer = scanModifier(
      "Wände streichen",
      "inkl. Leibungen der Fenster",
      "m²",
      keywords,
    );
    const erschwernis = treffer.filter((t) => t.typ === "erschwernis");
    expect(erschwernis.length).toBeGreaterThan(0);
    expect(erschwernis[0]!.keyword).toBe("leibung");
  });

  it("erkennt Erschwernis (anpassen = Schneidearbeit)", () => {
    const treffer = scanModifier(
      "Pflastersteine zuarbeiten",
      "Pflastersteine anpassen",
      "m",
      keywords,
    );
    const erschwernis = treffer.filter((t) => t.typ === "erschwernis");
    expect(erschwernis.length).toBeGreaterThan(0);
    expect(erschwernis.some((t) => t.keyword === "anpassen")).toBe(true);
  });

  it("erkennt Vorhalte-Position (StWo + vorhalten)", () => {
    const treffer = scanModifier(
      "Bauzaun vorhalten",
      "",
      "StWo",
      keywords,
    );
    const vorhalte = treffer.filter((t) => t.typ === "vorhalte");
    expect(vorhalte.length).toBe(1);
  });

  it("erkennt KEINE Vorhalte bei normaler Einheit", () => {
    const treffer = scanModifier(
      "Bauzaun vorhalten",
      "",
      "m",
      keywords,
    );
    const vorhalte = treffer.filter((t) => t.typ === "vorhalte");
    expect(vorhalte.length).toBe(0);
  });

  it("erkennt reine Arbeitsleistung (Boden lösen)", () => {
    const treffer = scanModifier(
      "Boden lösen, laden, fördern",
      "",
      "m³",
      keywords,
    );
    const rein = treffer.filter((t) => t.typ === "reine_arbeitsleistung");
    expect(rein.length).toBe(1);
  });

  it("erkennt Bordstein mit Fundament und Rückenstütze", () => {
    const treffer = scanModifier(
      "Bordstein setzen",
      "inkl. Fundament und Rückenstütze aus Beton C20/25",
      "m",
      keywords,
    );
    const erschwernis = treffer.filter((t) => t.typ === "erschwernis");
    expect(
      erschwernis.some((t) => t.keyword === "inkl. fundament und rückenstütze"),
    ).toBe(true);
  });

  it("gibt leere Liste bei Position ohne Modifier", () => {
    const treffer = scanModifier(
      "Naturschotter 0/32 liefern",
      "",
      "t",
      keywords,
    );
    expect(treffer.length).toBe(0);
  });
});
