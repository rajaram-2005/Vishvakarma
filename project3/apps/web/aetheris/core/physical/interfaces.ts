/**
 * Physical AI layer — contracts only. STATUS: NOT AVAILABLE (no adapters implemented; nothing here
 * produces telemetry or sends commands). The interfaces exist so adapters (MQTT, serial/ESP32,
 * Modbus, OPC-UA, ROS 2) can be added as plugins without changing Aetheris Core, and so the
 * safety policy is designed before any actuator is ever reachable.
 *
 * Physical World → Sensor → Device Gateway → Telemetry → World Model → Reasoning → SAFETY POLICY → Command → Controller → Actuator
 */
export type SensorKind = "temperature" | "humidity" | "pressure" | "vibration" | "accelerometer" | "gyroscope" | "current" | "voltage" | "power" | "flow" | "proximity" | "light" | "gas" | "gps" | "custom";
export type ActuatorKind = "motor" | "servo" | "stepper" | "relay" | "valve" | "pump" | "solenoid" | "led" | "custom";
export type Transport = "mqtt" | "serial" | "modbus-tcp" | "modbus-rtu" | "opc-ua" | "can" | "http" | "ros2" | "simulated";

export interface Reading { deviceId: string; sensor: string; kind: SensorKind; value: number; unit: string; at: number; quality?: "good" | "uncertain" | "bad" }
export interface Command { deviceId: string; actuator: string; kind: ActuatorKind; action: string; params?: Record<string, number | string | boolean>; /** issuer */ uid: string; /** confirmation token from the execution policy */ confirmationToken?: string }
export interface DeviceDescriptor { id: string; name: string; transport: Transport; model?: string; sensors: { id: string; kind: SensorKind; unit: string; min?: number; max?: number }[]; actuators: { id: string; kind: ActuatorKind; limits?: Record<string, { min: number; max: number }>; interlocks?: string[] }[]; location?: string; tags?: string[] }

/** Adapter contract. One per transport/vendor; registered as a plugin. */
export interface DeviceProvider {
  id: string; transport: Transport;
  discover(): Promise<DeviceDescriptor[]>;
  connect(deviceId: string): Promise<void>;
  subscribe(deviceId: string, onReading: (r: Reading) => void): Promise<() => void>;
  send(cmd: Command): Promise<{ ok: boolean; detail?: string }>;
  state(deviceId: string): Promise<Record<string, unknown>>;
}
/** ROS 2 / simulation bridge contract. */
export interface RobotProvider { id: string; topics(): Promise<string[]>; subscribe(topic: string, cb: (msg: unknown) => void): Promise<() => void>; publish(topic: string, msg: unknown, confirmationToken: string): Promise<void>; services(): Promise<string[]>; call(service: string, req: unknown, confirmationToken: string): Promise<unknown> }

/** Digital twin — typed representation reasoned over before touching hardware. */
export interface DigitalTwin { device: DeviceDescriptor; state: Record<string, unknown>; lastReadings: Record<string, Reading>; events: { at: number; kind: string; detail: string }[]; maintenance: { at: number; note: string; nextDue?: number }[]; relationships: { kind: "feeds" | "controls" | "part_of" | "near"; targetId: string }[]; updatedAt: number }

/** Safety policy: deterministic checks that every physical command must pass. Pure; tested. */
export interface SafetyRule { id: string; description: string; check(cmd: Command, twin: DigitalTwin | undefined): { ok: true } | { ok: false; reason: string } }
export const CORE_SAFETY_RULES: SafetyRule[] = [
  { id: "known-device", description: "Command targets a described device and actuator", check: (c, t) => (t && t.device.actuators.some((a) => a.id === c.actuator) ? { ok: true } : { ok: false, reason: `unknown device/actuator ${c.deviceId}/${c.actuator}` }) },
  { id: "within-limits", description: "Numeric params stay within the actuator's declared limits", check: (c, t) => { const a = t?.device.actuators.find((x) => x.id === c.actuator); for (const [k, v] of Object.entries(c.params ?? {})) { const lim = a?.limits?.[k]; if (lim && typeof v === "number" && (v < lim.min || v > lim.max)) return { ok: false, reason: `${k}=${v} outside [${lim.min},${lim.max}]` }; } return { ok: true }; } },
  { id: "fresh-telemetry", description: "Twin state is recent (< 5 min) before actuation", check: (_c, t) => (t && Date.now() - t.updatedAt < 5 * 60_000 ? { ok: true } : { ok: false, reason: "stale or missing telemetry — refuse to actuate blind" }) },
  { id: "confirmed", description: "A single-use confirmation token is present", check: (c) => (c.confirmationToken ? { ok: true } : { ok: false, reason: "physical actions require explicit confirmation" }) },
];
export function checkSafety(cmd: Command, twin: DigitalTwin | undefined, rules: SafetyRule[] = CORE_SAFETY_RULES): { ok: boolean; failures: { rule: string; reason: string }[] } {
  const failures = rules.map((r) => ({ r, res: r.check(cmd, twin) })).filter((x) => !x.res.ok).map((x) => ({ rule: x.r.id, reason: (x.res as { reason: string }).reason }));
  return { ok: failures.length === 0, failures };
}
