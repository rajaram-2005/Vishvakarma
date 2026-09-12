/**
 * Example plugin: deterministic unit conversion. Pure, offline, read_only — shows the full contract
 * (capability metadata + schema + handler) in ~30 lines. Copy this file to start your own plugin.
 */
import { definePlugin } from "@/aetheris/core/plugins/sdk";

const TO_BASE: Record<string, { base: string; f: number; off?: number }> = {
  m: { base: "m", f: 1 }, km: { base: "m", f: 1000 }, cm: { base: "m", f: 0.01 }, mm: { base: "m", f: 0.001 }, mi: { base: "m", f: 1609.344 }, ft: { base: "m", f: 0.3048 }, in: { base: "m", f: 0.0254 },
  kg: { base: "kg", f: 1 }, g: { base: "kg", f: 0.001 }, lb: { base: "kg", f: 0.45359237 }, oz: { base: "kg", f: 0.028349523125 },
  c: { base: "k", f: 1, off: 273.15 }, k: { base: "k", f: 1 }, f: { base: "k", f: 5 / 9, off: 459.67 },
  pa: { base: "pa", f: 1 }, kpa: { base: "pa", f: 1000 }, bar: { base: "pa", f: 100000 }, psi: { base: "pa", f: 6894.757293168 },
  w: { base: "w", f: 1 }, kw: { base: "w", f: 1000 }, hp: { base: "w", f: 745.6998715823 },
};
export function convert(value: number, from: string, to: string): number {
  const a = TO_BASE[from.toLowerCase()], b = TO_BASE[to.toLowerCase()];
  if (!a || !b) throw new Error(`unknown unit: ${!a ? from : to}`); if (a.base !== b.base) throw new Error(`cannot convert ${from} (${a.base}) to ${to} (${b.base})`);
  const base = (value + (a.off ?? 0)) * a.f; return base / b.f - (b.off ?? 0);
}

export default definePlugin({
  id: "unit-convert", name: "Unit conversion", version: "1.0.0", description: "Length, mass, temperature, pressure, power. Pure arithmetic, no network.",
  capabilities: [{
    id: "plugin:unit-convert.convert", name: "Convert units", category: "tool", description: "Convert a value between units (m/km/cm/mm/mi/ft/in, kg/g/lb/oz, C/K/F, Pa/kPa/bar/psi, W/kW/hp).",
    status: "implemented", verification_status: "verified", security_level: "read_only", tags: ["units", "engineering", "conversion"], locality: "local",
    input_schema: { type: "object", properties: { value: { type: "number" }, from: { type: "string" }, to: { type: "string" } }, required: ["value", "from", "to"] },
    output_schema: { type: "object", properties: { value: { type: "number" }, unit: { type: "string" } } },
    supported_operations: ["convert"],
  }],
  handlers: { "plugin:unit-convert.convert": ({ value, from, to }) => ({ value: convert(Number(value), String(from), String(to)), unit: String(to) }) },
});
