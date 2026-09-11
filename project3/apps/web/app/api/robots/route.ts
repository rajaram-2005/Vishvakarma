import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { store } from "@/aetheris/lib/store";
import { authorize, principalFor } from "@/aetheris/core/policy/permissions";
import { DEFAULT_SAFETY, RobotAgent, RosBridge, governTwist, inspectRobot, type RobotSafety } from "@/aetheris/core/robotics/rosbridge";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

/**
 * ROS 2 via rosbridge (ws://host:9090). No robot state is faked: every op opens a live connection.
 *   GET  ?url=ws://robot:9090                                → topics/services/nodes (read_only)
 *   POST {op:"echo", url, topic, type?}                      → one message from a topic (read_only)
 *   POST {op:"govern", linear, angular, safety?, pose?}       → dry-run of the safety governor (pure)
 *   POST {op:"move", url, linear, angular, durationMs?, safety?, confirmationToken} → governed motion; `physical` grant + confirmation; watchdog stops after duration
 *   POST {op:"estop", url, safety?}                           → publish zero Twist (physical grant; no confirmation needed)
 */
const WS = /^wss?:\/\//;
export async function GET(req: Request) { const url = new URL(req.url).searchParams.get("url") ?? ""; if (!WS.test(url)) return NextResponse.json({ error: "url=ws://host:9090 required" }, { status: 400 }); try { return NextResponse.json(await inspectRobot(url)); } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 }); } }
export async function POST(req: Request) {
  const { uid } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as { op?: string; url?: string; topic?: string; type?: string; linear?: number; angular?: number; durationMs?: number; safety?: Partial<RobotSafety>; pose?: { x: number; y: number; yaw: number }; confirmationToken?: string };
  const safety: RobotSafety = { ...DEFAULT_SAFETY, ...(b.safety ?? {}) };
  if (b.op === "govern") return NextResponse.json({ governed: governTwist({ linear: Number(b.linear ?? 0), angular: Number(b.angular ?? 0) }, safety, b.pose), safety });
  if (!b.url || !WS.test(b.url)) return NextResponse.json({ error: "url=ws://host:9090 required" }, { status: 400 });
  try {
    if (b.op === "echo") { if (!b.topic) return NextResponse.json({ error: "topic required" }, { status: 400 }); const ros = new RosBridge(b.url); await ros.connect(); try { return NextResponse.json({ topic: b.topic, msg: await ros.once(b.topic, 8000, b.type) }); } finally { ros.close(); } }
    const p = principalFor(uid); if (await store.get("physical_optin", uid)) p.grants.push("physical");
    if (b.op === "estop") { const d = authorize({ principal: p, capabilityId: "robot:estop", required: "physical", stopAction: true }); if (!d.allow) return NextResponse.json({ error: d.reason, code: d.code }, { status: 403 }); const ros = new RosBridge(b.url); await ros.connect(); try { const a = new RobotAgent(ros, safety, uid); await a.start(); a.estop(); a.stop(); return NextResponse.json({ ok: true, latched: true }); } finally { ros.close(); } }
    if (b.op === "move") {
      const d = authorize({ principal: p, capabilityId: "robot:move", required: "physical", requiresConfirmation: true, confirmationToken: b.confirmationToken }); if (!d.allow) return NextResponse.json({ error: d.reason, code: d.code, hint: "POST /api/devices/optin, then /api/permissions {capabilityId:'robot:move', confirm:true}" }, { status: 403 });
      const ros = new RosBridge(b.url); await ros.connect(); const a = new RobotAgent(ros, safety, uid); await a.start();
      try { const dur = Math.min(5000, Math.max(100, b.durationMs ?? 1000)); const t0 = Date.now(); let g = a.move(Number(b.linear ?? 0), Number(b.angular ?? 0)); while (Date.now() - t0 < dur) { await new Promise((r) => setTimeout(r, 200)); g = a.move(Number(b.linear ?? 0), Number(b.angular ?? 0)); } a.move(0, 0); return NextResponse.json({ ok: true, governed: g, pose: a.pose, durationMs: dur }); } finally { a.stop(); ros.close(); }
    }
    return NextResponse.json({ error: "op must be echo|govern|move|estop" }, { status: 400 });
  } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 }); }
}
