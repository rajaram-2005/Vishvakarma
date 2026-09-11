import { NextResponse } from "next/server";
import { getSession } from "@/aetheris/lib/github/auth";
import { getUserId } from "@/aetheris/lib/user";
import { authorize, principalFor } from "@/aetheris/core/policy/permissions";
import { analyzeRepo, proposePatch, repoMap, reviewPR, triageIssues } from "@/aetheris/core/github/intelligence";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;

/**
 * GitHub Repository Intelligence.
 *   GET  ?repo=owner/name[&ref=]                          → structural map (read_only)
 *   POST {op:"analyze", repo, question?}                 → LLM brief (read_only)
 *   POST {op:"review",  repo, number, post?}             → findings; post=true needs safe_write confirmation
 *   POST {op:"triage",  repo, limit?, apply?}            → triage; apply=true needs safe_write confirmation
 *   POST {op:"patch",   repo, task, files?, draft?}      → branch+PR; needs safe_write confirmation
 * Requires a GitHub session (OAuth/PAT). Never runs against repos the token can't see.
 */
const REPO = /^[\w.-]+\/[\w.-]+$/;
export async function GET(req: Request) {
  const s = await getSession(); if (!s) return NextResponse.json({ error: "Sign in with GitHub first" }, { status: 401 });
  const u = new URL(req.url); const repo = u.searchParams.get("repo") ?? ""; if (!REPO.test(repo)) return NextResponse.json({ error: "repo=owner/name required" }, { status: 400 });
  try { return NextResponse.json({ map: await repoMap({ token: s.token, login: s.login }, repo, u.searchParams.get("ref") ?? undefined) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
export async function POST(req: Request) {
  const s = await getSession(); if (!s) return NextResponse.json({ error: "Sign in with GitHub first" }, { status: 401 });
  const { uid } = await getUserId(); const g = { token: s.token, login: s.login };
  const b = (await req.json().catch(() => ({}))) as { op?: string; repo?: string; ref?: string; question?: string; number?: number; post?: boolean; limit?: number; apply?: boolean; task?: string; files?: string[]; draft?: boolean; preferred?: string; confirmationToken?: string };
  if (!b.repo || !REPO.test(b.repo)) return NextResponse.json({ error: "repo=owner/name required" }, { status: 400 });
  const writes = (b.op === "review" && b.post) || (b.op === "triage" && b.apply) || b.op === "patch";
  const d = authorize({ principal: principalFor(uid), capabilityId: `github:intelligence.${b.op}`, required: writes ? "safe_write" : "read_only", requiresConfirmation: writes, confirmationToken: b.confirmationToken });
  if (!d.allow) return NextResponse.json({ error: d.reason, code: d.code }, { status: 403 });
  try {
    switch (b.op) {
      case "analyze": return NextResponse.json(await analyzeRepo(g, b.repo, { ref: b.ref, question: b.question, preferred: b.preferred }));
      case "review": if (!b.number) return NextResponse.json({ error: "number required" }, { status: 400 }); return NextResponse.json(await reviewPR(g, b.repo, b.number, { post: b.post, preferred: b.preferred }));
      case "triage": return NextResponse.json(await triageIssues(g, b.repo, { limit: b.limit, apply: b.apply, preferred: b.preferred }));
      case "patch": if (!b.task) return NextResponse.json({ error: "task required" }, { status: 400 }); return NextResponse.json(await proposePatch(g, b.repo, b.task, { files: b.files, draft: b.draft, preferred: b.preferred }), { status: 201 });
      default: return NextResponse.json({ error: "op must be analyze|review|triage|patch" }, { status: 400 });
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
