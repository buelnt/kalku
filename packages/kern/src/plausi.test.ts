import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Decimal } from "@baukalk/datenmodell";
import { pruefePlausi, type PlausiRegel } from "./plausi.js";

const REGELN_PATH = resolve(__dirname, "../../../vorgaben/plausi-regeln.json");
const regelnData = JSON.parse(readFileSync(REGELN_PATH, "utf-8")) as {
  regeln: PlausiRegel[];
};
const regeln = regelnData.regeln;

describe("Plausi-Engine", () => {
  it("FAIL bei Pflaster mit nur 15 min/m²", () => {
    const ergebnisse = pruefePlausi(
      regeln,
      {
        kurztext: "Betonverbundsteinpflaster herstellen",
        langtext: "St.100/200/80/F Farbe: grau",
        einheit: "m²",
        input: {
          stoffe_ek: new Decimal(17),
          zeit_min_roh: new Decimal(15),
          geraetezulage_eur_h: new Decimal(5),
        },
      },
      "rohbau",
    );
    const fail = ergebnisse.find((e) => e.regel_id === "R002");
    expect(fail).toBeDefined();
    expect(fail!.status).toBe("FAIL");
    expect(fail!.nachricht).toContain("25 min/m²");
  });

  it("PASS bei Pflaster mit 30 min/m²", () => {
    const ergebnisse = pruefePlausi(
      regeln,
      {
        kurztext: "Betonverbundsteinpflaster herstellen",
        einheit: "m²",
        input: { zeit_min_roh: new Decimal(30), geraetezulage_eur_h: new Decimal(5) },
      },
      "rohbau",
    );
    const fail = ergebnisse.find((e) => e.regel_id === "R002");
    expect(fail).toBeUndefined();
  });

  it("FAIL bei Bordstein setzen mit nur 5 min/lfm", () => {
    const ergebnisse = pruefePlausi(
      regeln,
      {
        kurztext: "Einfassungssteine aus Beton setzen",
        langtext: "Gartenbeetplatte 5/25 setzen",
        einheit: "m",
        input: { zeit_min_roh: new Decimal(5), geraetezulage_eur_h: new Decimal(5) },
      },
      "rohbau",
    );
    const fail = ergebnisse.find((e) => e.regel_id === "R003");
    expect(fail).toBeDefined();
    expect(fail!.status).toBe("FAIL");
  });

  it("WARN bei NU-Position mit Eigenzeit > 0", () => {
    const ergebnisse = pruefePlausi(
      regeln,
      {
        kurztext: "Fallschutzplatten verlegen",
        einheit: "m²",
        input: {
          nu_ek: new Decimal(45),
          zeit_min_roh: new Decimal(10),
        },
      },
      "rohbau",
    );
    const warn = ergebnisse.find((e) => e.regel_id === "R007");
    expect(warn).toBeDefined();
    expect(warn!.status).toBe("WARN");
  });

  it("FAIL bei Position ohne jegliche Werte", () => {
    const ergebnisse = pruefePlausi(
      regeln,
      {
        kurztext: "Irgendeine Position",
        einheit: "m²",
        input: {},
      },
      "rohbau",
    );
    const fail = ergebnisse.find((e) => e.regel_id === "R008");
    expect(fail).toBeDefined();
    expect(fail!.status).toBe("FAIL");
  });

  it("WARN bei Asphalt in m³ (soll m² sein)", () => {
    const ergebnisse = pruefePlausi(
      regeln,
      {
        kurztext: "Asphaltschicht aufnehmen",
        einheit: "m³",
        input: { zeit_min_roh: new Decimal(10) },
      },
      "rohbau",
    );
    const warn = ergebnisse.find((e) => e.regel_id === "R005");
    expect(warn).toBeDefined();
    expect(warn!.status).toBe("WARN");
  });

  it("kein Match bei korrekter Position", () => {
    const ergebnisse = pruefePlausi(
      regeln,
      {
        kurztext: "Naturschotter 0/32 liefern",
        einheit: "t",
        input: { stoffe_ek: new Decimal(19) },
      },
      "rohbau",
    );
    // Nur R008 könnte matchen (keine Zeit), aber stoffe_ek > 0, also kein alle_null
    const fails = ergebnisse.filter((e) => e.status === "FAIL");
    expect(fails.length).toBe(0);
  });
});
