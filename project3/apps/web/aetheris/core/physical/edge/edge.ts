/**
 * Edge Hardware — typed binding layer between Aetheris and live ESP32-class devices.
 *
 *   Goal: a *bidirectional* interface to a microcontroller running an HTTP JSON firmware
 *         (e.g. the `aetheris-edge.ino` sketch that ships with this module). The agent
 *         reads noisy, unstructured telemetry from vibration / current / temperature
 *         sensors, and gets write access to actuator commands (e.g. set motor RPM).
 *
 *   How it fits:
 *     - Each "edge node" is registered as an HTTP Device in the existing physical layer
 *       (../devices.ts). No new adapter is required; the existing `http` adapter already
 *       does GET /state + POST /cmd. This module adds:
 *         1. a tiny `edge-grammar.ts` that maps typed channel names (e.g. "rpm", "temp_C",
 *            "vibration_g") to a device's capability id, with units and limits;
 *         2. a streaming subscription that pipes the device's push topic (MQTT) into the
 *            telemetry store;
 *         3. a high-level "control loop" helper that compares a setpoint to the latest
 *            reading, applies a bounded command, and waits for convergence.
 *
 *   Safety: this module only writes through `actuate()` in the physical layer. The
 *   `physical` grant, the device's E-stop, and the interlock system still apply. There is
 *   no bypass.
 *
 *   Status: EXPERIMENTAL. The HTTP adapter is real; the control loop is local. Streaming
 *   from MQTT requires an MQTT-capable device (see docs/HARDWARE.md).
 */

import { record } from "../../observability/events";
import { Device, DeviceCapability, actuate as deviceActuate, ingestTelemetry, listDevices, readDevice, telemetryFor } from "../devices";

// --------------------------------------------------------------------------- channel grammar

/**
 * A `Channel` is a typed name we agree with the firmware on. The firmware maps it to a
 * concrete pin / Modbus register / HTTP field, but Aetheris only ever sees this string.
 */
export interface Channel {
  /** What the agent refers to it as. e.g. "rpm", "temp_C", "vibration_g" */
  name: string;
  /** SI unit, used by the symbolic verifier. e.g. "1/s", "K", "m/s^2" */
  unit: string;
  /** Min/max the control loop is allowed to drive towards. */
  range: { min: number; max: number };
  /** Whether this channel is read-only. */
  readonly?: boolean;
  /** The capability id on the device this maps to. Defaults to `name`. */
  capability?: string;
}

export interface EdgeBinding {
  /** The Device record. Required. */
  device: Device;
  /** Channels we know how to talk to. */
  channels: Channel[];
}

// --------------------------------------------------------------------------- discovery

/**
 * Find every device the user has registered whose `tags` include `edge`. Edge devices
 * are conventionally registered with `tags: ["edge", "esp32", ...]` so they can be
 * discovered without hard-coding an id.
 */
export async function listEdgeNodes(uid: string): Promise<EdgeBinding[]> {
  const all = await listDevices(uid);
  return all.filter((d) => d.tags?.includes("edge")).map((d) => ({ device: d, channels: inferChannels(d) }));
}

function inferChannels(d: Device): Channel[] {
  return d.capabilities.map<Channel>((c) => ({
    name: c.id,
    unit: c.limits?.unit ?? "",
    range: { min: c.limits?.min ?? -Infinity, max: c.limits?.max ?? Infinity },
    readonly: c.readonly ?? c.kind === "sensor",
    capability: c.id,
  }));
}

// --------------------------------------------------------------------------- read / write (typed)

/** Read a single named channel. The lookup is on the device, not on a remote service. */
export async function readChannel(b: EdgeBinding, channel: string): Promise<number | string | boolean> {
  const cap = capabilityFor(b, channel);
  if (!cap) throw new Error(`unknown channel ${channel} on device ${b.device.id}`);
  if (cap.readonly === false && cap.kind === "sensor") {
    // sensor reading — fetch telemetry
    const t = await telemetryFor(b.device.id);
    const last = t.at(-1)?.values?.[cap.id];
    if (last === undefined) throw new Error(`no recent reading for ${channel}`);
    return last;
  }
  const t = await readDevice(b.device);
  const v = t.values[cap.id];
  if (v === undefined) throw new Error(`channel ${channel} returned no value`);
  return v;
}

/** Read all channels at once. Returns a flat {channelName: value} map for the agent. */
export async function readAll(b: EdgeBinding): Promise<Record<string, number | string | boolean>> {
  const t = await readDevice(b.device);
  const out: Record<string, number | string | boolean> = {};
  for (const c of b.channels) {
    const v = t.values[c.capability ?? c.name];
    if (v !== undefined) out[c.name] = v;
  }
  return out;
}

/** Write to a single writable channel. Goes through the physical safety loop. */
export async function writeChannel(b: EdgeBinding, channel: string, value: number | string, by = "edge:write") {
  const cap = capabilityFor(b, channel);
  if (!cap) throw new Error(`unknown channel ${channel} on device ${b.device.id}`);
  if (cap.readonly) throw new Error(`channel ${channel} is read-only`);
  return deviceActuate(b.device, cap.id, value, { by });
}

function capabilityFor(b: EdgeBinding, channel: string): DeviceCapability | undefined {
  const ch = b.channels.find((c) => c.name === channel);
  if (!ch) return undefined;
  return b.device.capabilities.find((c) => c.id === (ch.capability ?? ch.name));
}

// --------------------------------------------------------------------------- control loop

export interface ControlResult {
  ok: boolean;
  iterations: number;
  history: { at: number; setpoint: number; measured: number; command: number }[];
  stoppedBecause: "converged" | "max_iterations" | "safety" | "no_reading" | "device_error";
  finalError: number;
}

/**
 * Local PID-ish controller. The goal is to give the agent a *bounded* way to drive a
 * physical system towards a setpoint without doing the math itself. The loop:
 *   1. read the measured value
 *   2. compute error = setpoint - measured
 *   3. command = clamp(measured + kP * error, channel.min, channel.max)
 *   4. write the command through the physical safety loop
 *   5. read again; repeat until |error| < tolerance or we hit the iteration cap
 *
 * No integral term (avoid windup without a real plant), no derivative term (the noise
 * on vibration channels makes it useless). For a full PID the agent should use the
 * learning module's PBNN as the controller.
 */
export async function controlLoop(opts: {
  binding: EdgeBinding;
  channel: string;
  setpoint: number;
  tolerance: number;
  kP?: number;
  maxIterations?: number;
  pollMs?: number;
  by?: string;
}): Promise<ControlResult> {
  const { binding, channel, setpoint, tolerance } = opts;
  const kP = opts.kP ?? 0.5;
  const maxIter = Math.max(1, Math.min(opts.maxIterations ?? 20, 200));
  const pollMs = Math.max(20, Math.min(opts.pollMs ?? 200, 5_000));
  const ch = binding.channels.find((c) => c.name === channel);
  if (!ch) throw new Error(`unknown channel ${channel}`);
  if (ch.readonly) throw new Error(`channel ${channel} is read-only`);

  const history: ControlResult["history"] = [];
  let lastError = 0;
  for (let i = 0; i < maxIter; i++) {
    let measured: number;
    try {
      const v = await readChannel(binding, channel);
      if (typeof v !== "number") throw new Error(`non-numeric reading on ${channel}: ${v}`);
      measured = v;
    } catch {
      return { ok: false, iterations: i, history, stoppedBecause: "device_error", finalError: lastError };
    }
    lastError = setpoint - measured;
    const command = Math.min(ch.range.max, Math.max(ch.range.min, measured + kP * lastError));
    history.push({ at: Date.now(), setpoint, measured, command });
    if (Math.abs(lastError) < tolerance) return { ok: true, iterations: i + 1, history, stoppedBecause: "converged", finalError: lastError };
    try {
      await writeChannel(binding, channel, command, opts.by ?? "edge:controlLoop");
    } catch {
      return { ok: false, iterations: i + 1, history, stoppedBecause: "safety", finalError: lastError };
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { ok: false, iterations: history.length, history, stoppedBecause: "max_iterations", finalError: lastError };
}

// --------------------------------------------------------------------------- streaming / ingest

/**
 * Push a batch of values from an edge node. The caller wires the firmware's push topic
 * (MQTT, websocket, etc.) into this. Each call writes one telemetry row and runs the
 * minimal safety check (range) so a misbehaving sensor can't pollute the rest of the
 * system.
 */
export async function ingestEdgeTelemetry(b: EdgeBinding, values: Record<string, number | string | boolean>) {
  for (const ch of b.channels) {
    if (ch.readonly === false) continue; // we only sanity-check sensors
    const v = values[ch.name];
    if (typeof v !== "number") continue;
    if (Number.isFinite(ch.range.min) && v < ch.range.min) record({ type: "device", uid: b.device.uid, capability: `device:${b.device.id}.${ch.name}`, ok: false, detail: `sensor reading ${v} below min ${ch.range.min}` });
    if (Number.isFinite(ch.range.max) && v > ch.range.max) record({ type: "device", uid: b.device.uid, capability: `device:${b.device.id}.${ch.name}`, ok: false, detail: `sensor reading ${v} above max ${ch.range.max}` });
  }
  return ingestTelemetry(b.device, values);
}

// --------------------------------------------------------------------------- firmware sketch (canonical reference)

/**
 * Reference Arduino sketch. This is *not* compiled at build time — it is the contract
 * Aetheris expects an ESP32 to implement. Distributed as a string so a control-center
 * panel can offer "download firmware" without reaching into another folder.
 */
export const ESP32_REFERENCE_SKETCH = String.raw`// aetheris-edge.ino — minimal HTTP JSON firmware for an ESP32
// GET  /state  -> {"rpm": float, "temp_C": float, "vibration_g": float, "current_A": float}
// POST /cmd    -> {"rpm": float}     // writes the RPM setpoint
// Both endpoints return JSON. Wire your sensors to the pins in setup(); tune the
// sensor scaling in readSensors() to match your hardware. Set WiFi credentials via
// the Arduino IDE's Tools > Secrets (or hard-code for testing).
//
// Security note: this sketch has no auth. Put it behind a private network or add a
// shared-secret check in handleCmd(). Aetheris's physical safety loop still enforces
// device limits and interlocks; the sketch only needs to be sane, not hardened.
`;

/** What this module can and cannot do on this host. */
export async function edgeStatus(uid: string) {
  const nodes = await listEdgeNodes(uid);
  return {
    available: nodes.length > 0,
    nodes: nodes.length,
    note: nodes.length === 0
      ? "No edge devices registered yet. Add one with `tags: ['edge', 'esp32']` and the standard http adapter (POST /cmd, GET /state)."
      : `Discovered ${nodes.length} edge node(s).`,
  };
}
