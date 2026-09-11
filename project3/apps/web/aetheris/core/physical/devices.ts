/**
 * Physical AI Layer (Phase 13) — device registry, adapters, safety policy loop, telemetry.
 *
 *   Device        {id, name, kind, adapter, address, capabilities[], limits, safety, health, twinId?}
 *   Adapters      http   (ESP32/Arduino/RPi running any HTTP JSON firmware: GET /state, POST /cmd)   IMPLEMENTED
 *                 mqtt   (any broker; telemetry topic + command topic; ESP32/Tasmota/Home Assistant)  IMPLEMENTED (spec + mock verified)
 *                 modbus (PLC/RTU via Modbus/TCP: read regs/coils, write regs/coils)                 IMPLEMENTED (spec + mock verified)
 *                 serial (USB Arduino/STM32) — via aetheris-bridge, a tiny local HTTP↔serial daemon   NOT AVAILABLE in-process
 *                        (Next.js server cannot open /dev/tty reliably; docs/HARDWARE.md ships the bridge)
 *                 opcua, can, ros2 — NOT AVAILABLE here (need native SDKs); the adapter interface is stable
 *
 *   Safety loop   every actuation → validate against device limits + interlocks + rate limits → require
 *                 `physical` permission + confirmation → execute → read back state → verify → audit.
 *                 E-stop: /api/devices/:id/estop sends the device's configured stop command and latches.
 *
 * NO simulation pretends to be hardware: the `simulated` adapter exists only for tests/demos and is labelled.
 */
import { randomBytes } from "node:crypto";
import { store } from "@/aetheris/lib/store";
import { record, traced } from "../observability/events";
import { ModbusTcp, MqttClient } from "./protocols";
import { ssrfCheck } from "../security/guard";

export type AdapterKind = "http" | "mqtt" | "modbus" | "serial" | "opcua" | "can" | "ros2" | "simulated";
export type DeviceKind = "microcontroller" | "sbc" | "plc" | "sensor" | "actuator" | "robot" | "gateway" | "other";
export interface Limit { min?: number; max?: number; unit?: string; maxRatePerMin?: number }
export interface DeviceCapability { id: string; kind: "sensor" | "actuator"; description?: string; limits?: Limit; readonly?: boolean; /* adapter-specific mapping */ map?: Record<string, unknown> }
export interface Interlock { id: string; when: { capability: string; op: ">" | "<" | ">=" | "<=" | "==" | "!="; value: number }; block: string[]; reason: string }
export interface Device {
  id: string; uid: string; name: string; kind: DeviceKind; adapter: AdapterKind; address: string; auth?: Record<string, string>;
  capabilities: DeviceCapability[]; interlocks: Interlock[]; stopCommand?: { capability: string; value: unknown };
  health: { state: "unknown" | "online" | "offline" | "error"; lastSeen?: number; lastError?: string; latencyMs?: number };
  latched: boolean; twinId?: string; tags: string[]; createdAt: number; updatedAt: number;
}
export interface Telemetry { at: number; deviceId: string; values: Record<string, number | string | boolean>; source: "poll" | "push" }
const COL = "devices"; const TCOL = "telemetry"; const LIMIT = 100; const TEL_KEEP = 500;
const rateWindows = new Map<string, number[]>();

export const listDevices = async (uid: string) => Object.values(await store.all<Device>(COL)).filter((d) => d.uid === uid).sort((a, b) => b.updatedAt - a.updatedAt);
export const getDevice = (id: string) => store.get<Device>(COL, id);
export async function registerDevice(uid: string, input: Partial<Device> & { name: string; adapter: AdapterKind; address: string }): Promise<Device> {
  if ((await listDevices(uid)).length >= LIMIT) throw new Error(`limit of ${LIMIT} devices`);
  const d: Device = { id: randomBytes(5).toString("hex"), uid, name: input.name.slice(0, 60), kind: input.kind ?? "other", adapter: input.adapter, address: input.address, auth: input.auth, capabilities: input.capabilities ?? [], interlocks: input.interlocks ?? [], stopCommand: input.stopCommand, health: { state: "unknown" }, latched: false, twinId: input.twinId, tags: input.tags ?? [], createdAt: Date.now(), updatedAt: Date.now() };
  if (!adapterFor(d).supported) d.health = { state: "error", lastError: adapterFor(d).reason };
  // Devices normally live on the LAN, so private addresses are allowed here by design — but cloud metadata endpoints and credential-in-URL are not.
  if (d.adapter === "http") { const ss = await ssrfCheck(d.address, { allowHttp: true, allowPrivate: true }); if (!ss.ok) throw new Error(`address rejected: ${ss.reason}`); if (/169\.254\.169\.254|metadata/.test(d.address)) throw new Error("address rejected: metadata endpoint"); }
  await store.set(COL, d.id, d); return d;
}
export async function updateDevice(d: Device) { d.updatedAt = Date.now(); await store.set(COL, d.id, d); return d; }
export async function removeDevice(uid: string, id: string) { const d = await getDevice(id); if (!d || d.uid !== uid) return false; await store.remove(COL, id); return true; }

// ---- adapters ---------------------------------------------------------------------------------------
interface Adapter { supported: boolean; reason?: string; read(d: Device): Promise<Record<string, number | string | boolean>>; write(d: Device, cap: DeviceCapability, value: unknown): Promise<void> }
const simState = new Map<string, Record<string, number | string | boolean>>();
function parseAddr(address: string, defPort: number) { const m = /^(?:\w+:\/\/)?([^:/]+)(?::(\d+))?/.exec(address); return { host: m?.[1] ?? address, port: Number(m?.[2] ?? defPort) }; }
export function adapterFor(d: Device): Adapter {
  switch (d.adapter) {
    case "http": return { supported: true,
      async read(dev) { const r = await fetch(`${dev.address.replace(/\/$/, "")}/state`, { headers: dev.auth?.token ? { Authorization: `Bearer ${dev.auth.token}` } : {}, signal: AbortSignal.timeout(6000), cache: "no-store" }); if (!r.ok) throw new Error(`device HTTP ${r.status}`); return (await r.json()) as Record<string, number | string | boolean>; },
      async write(dev, cap, value) { const r = await fetch(`${dev.address.replace(/\/$/, "")}/cmd`, { method: "POST", headers: { "Content-Type": "application/json", ...(dev.auth?.token ? { Authorization: `Bearer ${dev.auth.token}` } : {}) }, body: JSON.stringify({ [cap.id]: value }), signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error(`device HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`); } };
    case "mqtt": return { supported: true,
      async read(dev) { const { host, port } = parseAddr(dev.address, 1883); const c = new MqttClient(host, port, { username: dev.auth?.username, password: dev.auth?.password }); await c.connect(); try { const topic = dev.auth?.stateTopic ?? `${dev.auth?.base ?? dev.name}/state`; return await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`no message on ${topic} within 8s`)), 8000); c.subscribe([topic], (_t, p) => { clearTimeout(t); try { res(JSON.parse(p.toString())); } catch { res({ raw: p.toString() }); } }).catch(rej); }); } finally { c.close(); } },
      async write(dev, cap, value) { const { host, port } = parseAddr(dev.address, 1883); const c = new MqttClient(host, port, { username: dev.auth?.username, password: dev.auth?.password }); await c.connect(); try { await c.publish((cap.map?.topic as string) ?? dev.auth?.cmdTopic ?? `${dev.auth?.base ?? dev.name}/cmd/${cap.id}`, typeof value === "string" ? value : JSON.stringify(value), { qos: 1 }); } finally { c.close(); } } };
    case "modbus": return { supported: true,
      async read(dev) { const { host, port } = parseAddr(dev.address, 502); const m = new ModbusTcp(host, port, Number(dev.auth?.unit ?? 1)); const out: Record<string, number | boolean> = {}; for (const c of dev.capabilities) { const mp = c.map as { table?: "holding" | "input" | "coil" | "discrete"; addr?: number; scale?: number } | undefined; if (!mp || mp.addr === undefined) continue; const t = mp.table ?? "holding"; const v = t === "holding" ? (await m.readHolding(mp.addr, 1))[0] : t === "input" ? (await m.readInput(mp.addr, 1))[0] : t === "coil" ? (await m.readCoils(mp.addr, 1))[0] : (await m.readDiscrete(mp.addr, 1))[0]; out[c.id] = typeof v === "number" ? v * (mp.scale ?? 1) : v; } return out; },
      async write(dev, cap, value) { const { host, port } = parseAddr(dev.address, 502); const m = new ModbusTcp(host, port, Number(dev.auth?.unit ?? 1)); const mp = cap.map as { table?: string; addr?: number; scale?: number } | undefined; if (!mp || mp.addr === undefined) throw new Error(`capability ${cap.id} has no modbus map {table, addr}`); if (mp.table === "coil") await m.writeCoil(mp.addr, !!value); else await m.writeRegister(mp.addr, Math.round(Number(value) / (mp.scale ?? 1))); } };
    case "simulated": return { supported: true,
      async read(dev) { const s = simState.get(dev.id) ?? Object.fromEntries(dev.capabilities.map((c) => [c.id, c.kind === "sensor" ? 20 + Math.random() : 0])); simState.set(dev.id, s); return { ...s, _simulated: true }; },
      async write(dev, cap, value) { const s = simState.get(dev.id) ?? {}; s[cap.id] = value as number; simState.set(dev.id, s); } };
    case "serial": return { supported: false, reason: "serial adapter needs the local aetheris-bridge daemon (see docs/HARDWARE.md); register the bridge as an http device instead", read: async () => { throw new Error("serial NOT AVAILABLE in-process"); }, write: async () => { throw new Error("serial NOT AVAILABLE in-process"); } };
    default: return { supported: false, reason: `${d.adapter} adapter NOT AVAILABLE (needs native SDK); interface reserved`, read: async () => { throw new Error(`${d.adapter} NOT AVAILABLE`); }, write: async () => { throw new Error(`${d.adapter} NOT AVAILABLE`); } };
  }
}

// ---- telemetry --------------------------------------------------------------------------------------
export async function readDevice(d: Device): Promise<Telemetry> {
  const t0 = Date.now();
  try { const values = await adapterFor(d).read(d); d.health = { state: "online", lastSeen: Date.now(), latencyMs: Date.now() - t0 }; await updateDevice(d); const t: Telemetry = { at: Date.now(), deviceId: d.id, values, source: "poll" }; await appendTelemetry(t); record({ type: "device", uid: d.uid, capability: `device:${d.id}.read`, ok: true, ms: Date.now() - t0 }); return t; }
  catch (e) { d.health = { state: "offline", lastSeen: d.health.lastSeen, lastError: (e as Error).message.slice(0, 160), latencyMs: Date.now() - t0 }; await updateDevice(d); record({ type: "device", uid: d.uid, capability: `device:${d.id}.read`, ok: false, ms: Date.now() - t0, detail: d.health.lastError }); throw e; }
}
export async function ingestTelemetry(d: Device, values: Record<string, number | string | boolean>) { d.health = { ...d.health, state: "online", lastSeen: Date.now() }; await updateDevice(d); const t: Telemetry = { at: Date.now(), deviceId: d.id, values, source: "push" }; await appendTelemetry(t); return t; }
async function appendTelemetry(t: Telemetry) { await store.update<Telemetry[]>(TCOL, t.deviceId, (cur) => [...(cur ?? []), t].slice(-TEL_KEEP)); }
export async function telemetryFor(deviceId: string, since?: number) { return ((await store.get<Telemetry[]>(TCOL, deviceId)) ?? []).filter((t) => !since || t.at >= since); }

// ---- safety policy loop --------------------------------------------------------------------------------
export interface SafetyVerdict { allow: boolean; reasons: string[]; clamped?: unknown }
/** Pure safety validation: limits, interlocks (against latest telemetry), rate limits, latch (tested). */
export function validateActuation(d: Device, capId: string, value: unknown, latest: Record<string, number | string | boolean> | undefined, now = Date.now()): SafetyVerdict {
  const reasons: string[] = []; const cap = d.capabilities.find((c) => c.id === capId);
  if (!cap) return { allow: false, reasons: [`unknown capability ${capId}`] };
  if (cap.kind !== "actuator" || cap.readonly) reasons.push(`${capId} is not an actuator`);
  if (d.latched) reasons.push("device is E-STOP latched; reset required");
  let out = value;
  if (cap.limits && typeof value === "number") { if (cap.limits.min !== undefined && value < cap.limits.min) reasons.push(`${value} below min ${cap.limits.min}${cap.limits.unit ?? ""}`); if (cap.limits.max !== undefined && value > cap.limits.max) reasons.push(`${value} above max ${cap.limits.max}${cap.limits.unit ?? ""}`); }
  if (cap.limits && typeof value !== "number" && (cap.limits.min !== undefined || cap.limits.max !== undefined)) reasons.push("numeric value required");
  for (const il of d.interlocks) { if (!il.block.includes(capId)) continue; const cur = latest?.[il.when.capability]; if (cur === undefined) { reasons.push(`interlock ${il.id}: no reading for ${il.when.capability} — refusing`); continue; } const n = Number(cur); const v = il.when.value; const tripped = il.when.op === ">" ? n > v : il.when.op === "<" ? n < v : il.when.op === ">=" ? n >= v : il.when.op === "<=" ? n <= v : il.when.op === "==" ? n === v : n !== v; if (tripped) reasons.push(`interlock ${il.id}: ${il.reason}`); }
  if (cap.limits?.maxRatePerMin) { const key = `${d.id}:${capId}`; const w = (rateWindows.get(key) ?? []).filter((t) => now - t < 60_000); if (w.length >= cap.limits.maxRatePerMin) reasons.push(`rate limit ${cap.limits.maxRatePerMin}/min reached`); }
  if (typeof value === "string" && value.length > 200) { out = value.slice(0, 200); reasons.push("value truncated"); }
  return { allow: reasons.length === 0, reasons, clamped: out };
}
/** Execute an actuation through the safety loop: validate → write → read back → verify → audit. */
export async function actuate(d: Device, capId: string, value: unknown, opts: { by: string; verify?: boolean } = { by: "api" }) {
  return traced({ type: "device", uid: d.uid, capability: `device:${d.id}.${capId}`, detail: JSON.stringify(value).slice(0, 60) }, async () => {
    const latest = (await telemetryFor(d.id)).at(-1)?.values;
    const v = validateActuation(d, capId, value, latest);
    if (!v.allow) { record({ type: "permission", uid: d.uid, capability: `device:${d.id}.${capId}`, ok: false, detail: `safety refused: ${v.reasons.join("; ")}` }); throw new Error(`safety refused: ${v.reasons.join("; ")}`); }
    const cap = d.capabilities.find((c) => c.id === capId)!;
    await adapterFor(d).write(d, cap, v.clamped);
    const key = `${d.id}:${capId}`; rateWindows.set(key, [...(rateWindows.get(key) ?? []), Date.now()]);
    let verified: boolean | undefined; let readback: Telemetry | undefined;
    if (opts.verify !== false) { try { readback = await readDevice(d); const rv = readback.values[capId]; verified = rv === undefined ? undefined : typeof v.clamped === "number" ? Math.abs(Number(rv) - v.clamped) <= Math.max(1e-6, Math.abs(v.clamped) * 0.02) : String(rv) === String(v.clamped); } catch { verified = false; } }
    return { ok: true, value: v.clamped, verified, readback: readback?.values, by: opts.by };
  });
}
export async function estop(d: Device, by: string) {
  d.latched = true; await updateDevice(d);
  let sent = false; let error: string | undefined;
  if (d.stopCommand) { try { await adapterFor(d).write(d, d.capabilities.find((c) => c.id === d.stopCommand!.capability) ?? { id: d.stopCommand.capability, kind: "actuator" }, d.stopCommand.value); sent = true; } catch (e) { error = (e as Error).message; } }
  record({ type: "device", uid: d.uid, capability: `device:${d.id}.estop`, ok: !error, detail: `by ${by}; stop command ${d.stopCommand ? (sent ? "sent" : "FAILED: " + error) : "not configured"}` });
  return { latched: true, stopSent: sent, error };
}
export async function resetLatch(d: Device) { d.latched = false; await updateDevice(d); }
export async function physicalSummary() { const all = Object.values(await store.all<Device>(COL)); return { devices: all.length, online: all.filter((d) => d.health.state === "online").length, latched: all.filter((d) => d.latched).length, adapters: Object.fromEntries(["http", "mqtt", "modbus", "simulated"].map((a) => [a, "implemented"]).concat([["serial", "via bridge"], ["opcua", "not available"], ["can", "not available"], ["ros2", "see robotics"]])) }; }

/** Hide secrets in device auth for API responses. */
export function redact<T extends { auth?: Record<string, string> }>(d: T): T { return d.auth ? { ...d, auth: Object.fromEntries(Object.entries(d.auth).map(([k, v]) => [k, /token|password|secret|key/i.test(k) ? "•••" : v])) } : d; }
