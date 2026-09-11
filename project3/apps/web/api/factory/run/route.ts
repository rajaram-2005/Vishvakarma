import { getSession } from "@/aetheris/lib/github/auth";
import { runFactory, type FactoryEvent } from "@/aetheris/lib/factory/pipeline";
import { getUserId } from "@/aetheris/lib/user";
import { consumeChat, hasFeature } from "@/aetheris/lib/billing/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST { task, preferred? } → Server-Sent Events stream of FactoryEvent.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Sign in with GitHub first" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  let body: { task?: string; preferred?: string; repo?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const task = body.task?.trim();
  if (!task) return new Response(JSON.stringify({ error: "task required" }), { status: 400 });
  const { uid } = await getUserId();
  // Enterprise factory: custom target repo (e.g. an org repo) and long specs.
  if ((body.repo && body.repo.trim()) || task.length > 2000) {
    if (!(await hasFeature(uid, "factory_enterprise"))) {
      return new Response(JSON.stringify({ error: "Custom target repos and specs over 2,000 characters need the Enterprise GitHub Factory (God Mode).", code: "upgrade", feature: "factory_enterprise" }), { status: 402, headers: { "Content-Type": "application/json" } });
    }
  }
  const quota = await consumeChat(uid, 3, "factory"); // a factory run = 3 credits
  if (!quota.allowed) return new Response(JSON.stringify({ error: `Daily credit limit reached (${quota.limit}). Upgrade for more Factory runs.`, code: "quota" }), { status: 402, headers: { "Content-Type": "application/json" } });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: FactoryEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch { /* stream closed */ }
      };
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { /* closed */ }
      }, 15_000);

      runFactory({ token: session.token, login: session.login }, task, send, { preferred: body.preferred, signal: req.signal, repo: body.repo?.trim() || undefined, uid })
        .catch((err) => send({ type: "error", message: err instanceof Error ? err.message : String(err) }))
        .finally(() => {
          clearInterval(heartbeat);
          try { controller.close(); } catch { /* already closed */ }
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
