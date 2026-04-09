/**
 * LV-Editor — Haupt-Kalkulationsansicht
 *
 * Zeigt alle Positionen eines LVs in einer Tabelle, mit editierbaren
 * Feldern für X (Stoffe), Y (Zeit), Z (Geräte) und M (NU).
 * EP und GP werden live berechnet. Plausi-Status als Ampel pro Position.
 *
 * Bereiche werden als fettgedruckte Zeilen ohne Eingabefelder dargestellt.
 */
import React, { useMemo } from "react";
import { Decimal, runden } from "@baukalk/datenmodell";
import type { LvEintrag, Parameter, PositionRechenInput } from "@baukalk/datenmodell";
import { berechne } from "@baukalk/kern";

interface LvEditorProps {
  eintraege: LvEintrag[];
  parameter: Parameter;
  werte: Map<string, PositionRechenInput>;
  onWertAendern: (oz: string, feld: keyof PositionRechenInput, wert: number | undefined) => void;
}

const NULL = new Decimal(0);

function formatEuro(d: Decimal): string {
  return runden(d).toNumber().toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function LvEditor(props: LvEditorProps): React.JSX.Element {
  const { eintraege, parameter, werte, onWertAendern } = props;

  // EP/GP für alle Positionen berechnen
  const berechnungen = useMemo(() => {
    const map = new Map<string, ReturnType<typeof berechne>>();
    for (const e of eintraege) {
      if (e.art === "BEREICH") continue;
      const input = werte.get(e.oz) ?? {};
      const menge = e.menge ?? NULL;
      map.set(e.oz, berechne(input, menge, parameter));
    }
    return map;
  }, [eintraege, parameter, werte]);

  // Netto-Summe
  const nettoSumme = useMemo(() => {
    let sum = new Decimal(0);
    for (const [, b] of berechnungen) {
      sum = sum.plus(b.gp);
    }
    return sum;
  }, [berechnungen]);

  return (
    <div style={{ fontSize: 13 }}>
      {/* Zusammenfassung */}
      <div
        style={{
          display: "flex",
          gap: 24,
          marginBottom: 16,
          padding: "12px 16px",
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
        }}
      >
        <InfoBox label="Positionen" wert={String(eintraege.filter((e) => e.art !== "BEREICH").length)} />
        <InfoBox label="Netto-Summe" wert={`${formatEuro(nettoSumme)} €`} hervorheben />
        <InfoBox label="Verrechnungslohn" wert={`${parameter.verrechnungslohn.toFixed(2)} €/h`} />
        <InfoBox label="Material-Zuschlag" wert={`${runden(parameter.material_zuschlag.mul(100), 0).toFixed(0)} %`} />
        <InfoBox label="Zeitwert-Faktor" wert={`${parameter.zeitwert_faktor.toFixed(0)} %`} />
      </div>

      {/* Tabelle */}
      <div style={{ overflow: "auto", background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
              <Th w={100}>Pos.</Th>
              <Th w={250}>Bezeichnung</Th>
              <Th w={60} right>Menge</Th>
              <Th w={40}>Einh.</Th>
              <Th w={75} right>X Stoffe €</Th>
              <Th w={60} right>Y min</Th>
              <Th w={55} right>Z €/h</Th>
              <Th w={75} right>M NU €</Th>
              <Th w={85} right>EP €</Th>
              <Th w={90} right>GP €</Th>
            </tr>
          </thead>
          <tbody>
            {eintraege.map((e, idx) => {
              if (e.art === "BEREICH") {
                return (
                  <tr key={`b-${idx}`} style={{ background: "#f8fafc" }}>
                    <td colSpan={10} style={{ padding: "8px 12px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid #e2e8f0" }}>
                      {e.oz} — {e.kurztext}
                    </td>
                  </tr>
                );
              }

              const input = werte.get(e.oz) ?? {};
              const b = berechnungen.get(e.oz);
              if (!b) return null;

              return (
                <tr key={e.oz} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <Td>{e.oz}</Td>
                  <Td title={e.langtext}>{e.kurztext}</Td>
                  <Td right>{e.menge?.toNumber()}</Td>
                  <Td>{e.einheit}</Td>
                  <Td right>
                    <NumInput
                      wert={input.stoffe_ek?.toNumber()}
                      onChange={(v) => onWertAendern(e.oz, "stoffe_ek", v)}
                    />
                  </Td>
                  <Td right>
                    <NumInput
                      wert={input.zeit_min_roh?.toNumber()}
                      onChange={(v) => onWertAendern(e.oz, "zeit_min_roh", v)}
                    />
                  </Td>
                  <Td right>
                    <NumInput
                      wert={input.geraetezulage_eur_h?.toNumber()}
                      onChange={(v) => onWertAendern(e.oz, "geraetezulage_eur_h", v)}
                    />
                  </Td>
                  <Td right>
                    <NumInput
                      wert={input.nu_ek?.toNumber()}
                      onChange={(v) => onWertAendern(e.oz, "nu_ek", v)}
                    />
                  </Td>
                  <Td right bold>{formatEuro(b.ep)}</Td>
                  <Td right bold>{formatEuro(b.gp)}</Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "#f1f5f9", fontWeight: 700 }}>
              <td colSpan={9} style={{ padding: "8px 12px", textAlign: "right" }}>
                Netto Angebotssumme:
              </td>
              <td style={{ padding: "8px 12px", textAlign: "right" }}>
                {formatEuro(nettoSumme)} €
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// Hilfs-Komponenten
function InfoBox(p: { label: string; wert: string; hervorheben?: boolean }): React.JSX.Element {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#64748b" }}>{p.label}</div>
      <div style={{ fontSize: p.hervorheben ? 18 : 14, fontWeight: p.hervorheben ? 700 : 500 }}>
        {p.wert}
      </div>
    </div>
  );
}

function Th(p: { children: React.ReactNode; w?: number; right?: boolean }): React.JSX.Element {
  return (
    <th
      style={{
        padding: "8px 6px",
        textAlign: p.right ? "right" : "left",
        width: p.w,
        fontWeight: 600,
        fontSize: 11,
        color: "#475569",
        borderBottom: "2px solid #e2e8f0",
        whiteSpace: "nowrap",
      }}
    >
      {p.children}
    </th>
  );
}

function Td(p: {
  children: React.ReactNode;
  right?: boolean;
  bold?: boolean;
  title?: string;
}): React.JSX.Element {
  return (
    <td
      title={p.title}
      style={{
        padding: "4px 6px",
        textAlign: p.right ? "right" : "left",
        fontWeight: p.bold ? 600 : 400,
        maxWidth: 250,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {p.children}
    </td>
  );
}

function NumInput(p: {
  wert: number | undefined;
  onChange: (v: number | undefined) => void;
}): React.JSX.Element {
  return (
    <input
      type="number"
      step="0.01"
      value={p.wert ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        p.onChange(v === "" ? undefined : parseFloat(v));
      }}
      style={{
        width: "100%",
        padding: "2px 4px",
        border: "1px solid #e2e8f0",
        borderRadius: 3,
        fontSize: 12,
        textAlign: "right",
        background: p.wert !== undefined ? "#fefce8" : "#fff",
      }}
    />
  );
}
