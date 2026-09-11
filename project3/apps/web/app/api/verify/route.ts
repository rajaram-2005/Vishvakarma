import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { consumeChat } from "@/aetheris/lib/billing/entitlements";
import { route } from "@/aetheris/lib/router/router";
import { authorize, principalFor } from "@/aetheris/core/policy/permissions";
import { extractJson, reviewerGate, validateSchema, verifierStatus, verifyWithTests } from "@/aetheris/core/verification/verify";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/** GET → what the verification engine can do on this host. */
export async function GET() {
  return NextResponse.json(await verifierStatus(), { headers: { "cache-control": "no-store" } });
}

/**
 * POST — one endpoint, three verification kinds:
 *   { kind: "schema",   value, schema }                      → JSON-Schema validation (free, offline)
 *   { kind: "review",   question, answer, generator?, minScore? } → independent reviewer verdict
 *   { kind: "tests",    command, files?, maxIterations? }     → run it in the sandbox, feed failures back
 * `tests` needs `safe_write`; it executes a command on the server.
 */
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as {
    kind?: string; value?: unknown; schema?: unknown; question?: string; answer?: string;
    generator?: string; minScore?: number; command?: string; files?: Record<string, string>; maxIterations?: number;
    confirmationToken?: string;
  };
  const kind = b.kind ?? "schema";
  const done = (payload: unknown, status = 200) => { const r = NextResponse.json(payload, { status }); if (isNew) r.cookies.set(uidCookie(uid)); return r; };

  if (kind === "schema") {
    if (b.schema === undefined) return done({ error: "schema required" }, 400);
    return done({ kind, ...validateSchema(b.value, b.schema) });
  }

  if (kind === "review") {
    const question = (b.question ?? "").trim();
    const answer = (b.answer ?? "").trim();
    if (!answer) return done({ error: "answer required" }, 400);
    const quota = await consumeChat(uid, 1, "chat");
    if (!quota.allowed) return done({ error: "Daily limit reached." }, 402);
    const verdict = await reviewerGate({
      question: question || "(no question supplied)",
      answer,
      generator: b.generator ?? null,
      minScore: b.minScore,
      // `avoid` is passed through the meta policy: the router picks a reasoning model and reports
      // what it used, so a same-model review is flagged `independent:false` rather than hidden.
      complete: async ({ messages, avoid, maxTokens, temperature }) => {
        const out = await route({ messages, maxTokens, temperature, policy: { task: "reasoning", avoidModels: avoid ?? undefined } });
        return { content: out.content, provider: out.provider, model: out.model };
      },
      meta: { uid, capability: "system:verifier" },
    });
    return done({ kind, verdict });
  }

  if (kind === "tests") {
    // Same gate as POST /api/executions: server execution is full_workspace and needs a confirmation
    // token issued by POST /api/permissions {capabilityId:"execution:server-sandbox", confirm:true}.
    const decision = authorize({ principal: principalFor(uid), capabilityId: "execution:server-sandbox", required: "full_workspace", requiresConfirmation: true, confirmationToken: b.confirmationToken });
    if (!decision.allow) return done({ error: decision.reason, code: (decision as { code?: string }).code }, 403);
    if (!b.command?.trim()) return done({ error: "command required" }, 400);
    const result = await verifyWithTests({
      command: b.command,
      files: b.files,
      maxIterations: b.maxIterations,
      meta: { uid, capability: "system:verifier" },
    });
    return done({ kind, result });
  }

  return done({ error: `unknown kind "${kind}" (schema | review | tests)`, hint: extractJson("").error }, 400);
}
