import { NextResponse } from "next/server";
import { getUserId, uidCookie } from "@/aetheris/lib/user";
import { addFact, queryUnified, fabricStatus, listFacts, type SourceKind } from "@/aetheris/core/knowledge/fabric";
import { readableScopes } from "@/aetheris/core/workspaces/workspaces";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

/** GET ?q=&workspace=&k=&asOf=&mode=&entity=&tag=&documents=0 → hybrid hits (facts + document KBs unless documents=0) (or recent facts + status when no q). POST {text, workspace?, tags?, source?, ref?, confidence?, validFrom?, validTo?, supersedes?, edges?}. */
export async function GET(req: Request) {
  const { uid, isNew } = await getUserId(); const u = new URL(req.url); const q = u.searchParams.get("q");
  const ws = u.searchParams.get("workspace") ?? undefined;
  /**
   * A workspace can be shared with other users (src/core/workspaces). `workspace` accepts either the
   * scope key or a full workspace id, and is resolved through readableScopes() — so a member reads
   * the owner's scope, and a scope the caller has no access to is simply not found. Writes below are
   * still the caller's own data: sharing is read-only by design.
   */
  const scopes = await readableScopes(uid);
  const scope = ws ? scopes.find((s) => s.workspace === ws || s.workspaceId === decodeURIComponent(ws)) : undefined;
  if (ws && !scope) return NextResponse.json({ error: "workspace not found" }, { status: 404 });
  const dataUid = scope?.uid ?? uid;
  const scopeKey = scope?.workspace ?? ws;
  let body: unknown;
  try {
    if (q) body = { hits: await queryUnified(dataUid, q, { includeDocuments: u.searchParams.get("documents") !== "0", workspace: scopeKey, k: Number(u.searchParams.get("k") ?? 8), asOf: u.searchParams.get("asOf") ? Number(u.searchParams.get("asOf")) : undefined, mode: (u.searchParams.get("mode") as "hybrid" | undefined) ?? undefined, entity: u.searchParams.get("entity") ?? undefined, tags: u.searchParams.getAll("tag") }), shared: scope ? { workspaceId: scope.workspaceId, role: scope.role } : undefined };
    else body = { status: await fabricStatus(), facts: await listFacts(dataUid, scopeKey, Number(u.searchParams.get("limit") ?? 50)), shared: scope ? { workspaceId: scope.workspaceId, role: scope.role } : undefined };
  } catch (e) { return NextResponse.json({ error: (e as Error).message, status: await fabricStatus() }, { status: 503 }); }
  const res = NextResponse.json(body); if (isNew) res.cookies.set(uidCookie(uid)); return res;
}
export async function POST(req: Request) {
  const { uid, isNew } = await getUserId();
  const b = (await req.json().catch(() => ({}))) as { text?: string; workspace?: string; tags?: string[]; source?: SourceKind; ref?: string; confidence?: number; validFrom?: number; validTo?: number; supersedes?: string; entities?: string[]; edges?: { src: string; rel: string; dst: string; weight?: number }[] };
  if (!b.text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
  try { const fact = await addFact({ uid, workspace: b.workspace, text: b.text, tags: b.tags, entities: b.entities, validFrom: b.validFrom, validTo: b.validTo, supersedes: b.supersedes, edges: b.edges, provenance: { kind: b.source ?? "user", ref: b.ref, confidence: b.confidence ?? 0.9, by: uid } }); const res = NextResponse.json({ fact }, { status: 201 }); if (isNew) res.cookies.set(uidCookie(uid)); return res; }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 503 }); }
}
