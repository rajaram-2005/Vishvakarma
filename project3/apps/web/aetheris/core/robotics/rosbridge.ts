/**
 * Robotics (Phase 14) — ROS 2 via rosbridge_suite (WebSocket JSON protocol), no native SDK required.
 *
 *   RosBridge      connect(ws://robot:9090) · topics() · subscribe · publish · services() · call · close
 *   RobotAgent     safety-governed motion: velocity clamps, geofence, watchdog (auto-stop if no heartbeat),
 *                  E-stop publishes zero Twist and latches
 *   Simulation     any rosbridge endpoint works, incl. Gazebo/Ignition/Webots/TurtleBot sims on the user's machine
 *
 * Status: IMPLEMENTED against the rosbridge protocol (verified with an in-repo mock rosbridge server);
 * UNVERIFIED against a real ROS 2 graph from this sandbox. Requires: `ros2 launch rosbridge_server rosbridge_websocket_launch.xml`.
 */
import { record, traced } from "../observability/events";

type Msg = Record<string, unknown>;
export class RosBridge {
  private ws?: WebSocket; private nextId = 1; private pending = new Map<string, { res: (m: Msg) => void; rej: (e: Error) => void }>(); private subs = new Map<string, ((m: Msg) => void)[]>();
  constructor(readonly url: string) {}
  connect(timeoutMs = 8000): Promise<void> {
    return new Promise((res, rej) => {
      if (typeof WebSocket === "undefined") return rej(new Error("WebSocket not available in this runtime"));
      const ws = new WebSocket(this.url); this.ws = ws; const t = setTimeout(() => { ws.close(); rej(new Error("rosbridge connect timeout")); }, timeoutMs);
      ws.onopen = () => { clearTimeout(t); res(); };
      ws.onerror = () => { clearTimeout(t); rej(new Error(`rosbridge connection failed: ${this.url}`)); };
      ws.onmessage = (ev) => { let m: Msg; try { m = JSON.parse(String(ev.data)); } catch { return; } if (m.op === "service_response" && typeof m.id === "string") { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); if (m.result === false) p.rej(new Error(String(m.values ?? "service failed"))); else p.res(m); } } else if (m.op === "publish" && typeof m.topic === "string") this.subs.get(m.topic)?.forEach((h) => h((m.msg as Msg) ?? {})); else if (m.op === "status" && m.level === "error") record({ type: "device", capability: "ros:status", ok: false, detail: String(m.msg).slice(0, 120) }); };
    });
  }
  private send(m: Msg) { if (!this.ws || this.ws.readyState !== 1) throw new Error("rosbridge not connected"); this.ws.send(JSON.stringify(m)); }
  call<T = Msg>(service: string, args: Msg = {}, timeoutMs = 8000): Promise<T> { const id = `c${this.nextId++}`; return new Promise<T>((res, rej) => { const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`service ${service} timeout`)); }, timeoutMs); this.pending.set(id, { res: (m) => { clearTimeout(t); res((m.values ?? {}) as T); }, rej: (e) => { clearTimeout(t); rej(e); } }); this.send({ op: "call_service", id, service, args }); }); }
  async topics() { const r = await this.call<{ topics: string[]; types: string[] }>("/rosapi/topics"); return r.topics.map((t, i) => ({ topic: t, type: r.types?.[i] })); }
  async services() { return (await this.call<{ services: string[] }>("/rosapi/services")).services; }
  async nodes() { return (await this.call<{ nodes: string[] }>("/rosapi/nodes")).nodes; }
  subscribe(topic: string, handler: (m: Msg) => void, opts: { type?: string; throttleMs?: number } = {}) { const list = this.subs.get(topic) ?? []; list.push(handler); this.subs.set(topic, list); this.send({ op: "subscribe", topic, ...(opts.type ? { type: opts.type } : {}), throttle_rate: opts.throttleMs ?? 0 }); return () => { const l = (this.subs.get(topic) ?? []).filter((h) => h !== handler); this.subs.set(topic, l); if (!l.length) this.send({ op: "unsubscribe", topic }); }; }
  advertise(topic: string, type: string) { this.send({ op: "advertise", topic, type }); }
  publish(topic: string, msg: Msg) { this.send({ op: "publish", topic, msg }); }
  once(topic: string, timeoutMs = 5000, type?: string): Promise<Msg> { return new Promise((res, rej) => { const t = setTimeout(() => { off(); rej(new Error(`no message on ${topic}`)); }, timeoutMs); const off = this.subscribe(topic, (m) => { clearTimeout(t); off(); res(m); }, { type }); }); }
  close() { try { this.ws?.close(); } catch { /* ignore */ } }
}

// ---- safety-governed robot agent -------------------------------------------------------------------
export interface RobotSafety { maxLinear: number; maxAngular: number; geofence?: { xMin: number; xMax: number; yMin: number; yMax: number }; watchdogMs: number; cmdVelTopic: string; odomTopic?: string }
export const DEFAULT_SAFETY: RobotSafety = { maxLinear: 0.3, maxAngular: 0.8, watchdogMs: 1500, cmdVelTopic: "/cmd_vel", odomTopic: "/odom" };
const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, Number.isFinite(v) ? v : 0));
/** Pure: clamp a Twist to limits; zero it if outside the geofence and moving outward (tested). */
export function governTwist(cmd: { linear: number; angular: number }, safety: RobotSafety, pose?: { x: number; y: number; yaw: number }): { linear: number; angular: number; clamped: boolean; reason?: string } {
  const linear = clamp(cmd.linear, safety.maxLinear), angular = clamp(cmd.angular, safety.maxAngular); const clamped = linear !== cmd.linear || angular !== cmd.angular; let reason: string | undefined;
  if (safety.geofence && pose) { const g = safety.geofence; const dx = Math.cos(pose.yaw) * linear, dy = Math.sin(pose.yaw) * linear; const out = pose.x < g.xMin || pose.x > g.xMax || pose.y < g.yMin || pose.y > g.yMax; const heading = (pose.x <= g.xMin && dx < 0) || (pose.x >= g.xMax && dx > 0) || (pose.y <= g.yMin && dy < 0) || (pose.y >= g.yMax && dy > 0); if (out || heading) { if (heading || out) { reason = `geofence: pose (${pose.x.toFixed(2)},${pose.y.toFixed(2)}) at/over boundary`; return { linear: 0, angular: out ? 0 : angular, clamped: true, reason }; } } }
  return { linear, angular, clamped, reason };
}
const yawFromQuat = (q: { x: number; y: number; z: number; w: number }) => Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
export class RobotAgent {
  latched = false; pose?: { x: number; y: number; yaw: number }; private wd?: NodeJS.Timeout; private lastCmd = 0; private off?: () => void;
  constructor(readonly ros: RosBridge, readonly safety: RobotSafety = DEFAULT_SAFETY, readonly uid?: string) {}
  async start() { this.ros.advertise(this.safety.cmdVelTopic, "geometry_msgs/msg/Twist"); if (this.safety.odomTopic) this.off = this.ros.subscribe(this.safety.odomTopic, (m) => { const p = (m.pose as { pose?: { position: { x: number; y: number }; orientation: { x: number; y: number; z: number; w: number } } })?.pose; if (p) this.pose = { x: p.position.x, y: p.position.y, yaw: yawFromQuat(p.orientation) }; }, { throttleMs: 100 }); this.wd = setInterval(() => { if (this.lastCmd && Date.now() - this.lastCmd > this.safety.watchdogMs) { this.publishTwist(0, 0); this.lastCmd = 0; record({ type: "device", uid: this.uid, capability: "robot:watchdog", ok: true, detail: "no heartbeat → stopped" }); } }, Math.min(500, this.safety.watchdogMs / 2)); }
  private publishTwist(linear: number, angular: number) { this.ros.publish(this.safety.cmdVelTopic, { linear: { x: linear, y: 0, z: 0 }, angular: { x: 0, y: 0, z: angular } }); }
  /** Send a governed velocity; caller must have `physical` grant. */
  move(linear: number, angular: number) { if (this.latched) throw new Error("robot E-STOP latched"); const g = governTwist({ linear, angular }, this.safety, this.pose); this.publishTwist(g.linear, g.angular); this.lastCmd = Date.now(); record({ type: "device", uid: this.uid, capability: "robot:move", ok: true, detail: `v=${g.linear.toFixed(2)} w=${g.angular.toFixed(2)}${g.reason ? " · " + g.reason : g.clamped ? " · clamped" : ""}` }); return g; }
  estop() { this.latched = true; this.publishTwist(0, 0); this.lastCmd = 0; record({ type: "device", uid: this.uid, capability: "robot:estop", ok: true }); }
  reset() { this.latched = false; }
  stop() { if (this.wd) clearInterval(this.wd); this.off?.(); this.publishTwist(0, 0); }
}

/** One-shot robot introspection for the API/Control Center. */
export async function inspectRobot(url: string) {
  return traced({ type: "device", capability: "robot:inspect", detail: url }, async () => {
    const ros = new RosBridge(url); await ros.connect();
    try { const [topics, services, nodes] = await Promise.all([ros.topics(), ros.services().catch(() => []), ros.nodes().catch(() => [])]); return { url, topics, services, nodes, ok: true }; } finally { ros.close(); }
  });
}
