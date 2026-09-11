import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { hydrateRouterStores } from "@/aetheris/lib/router/hydrate";
import { addCustomProviderAsync, findCustomProvider, listCustomProviders, removeCustomProviderAsync, updateCustomProviderAsync, type CustomProviderRecord } from "@/aetheris/lib/router/customProviders";
import { setRuntimeKeyAsync, runtimeKeyFor } from "@/aetheris/lib/router/runtimeKeys";
import type { ProviderKeySource } from "@/aetheris/lib/router/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET/POST/PATCH/DELETE /api/providers/custom — providers added by link (no .env, no restart).
 * Any OpenAI-compatible endpoint: Ollama, LM Studio, llama.cpp, LocalAI, a hosted gateway, …
 * An optional key is stored in the runtime key store (data/runtime_keys.json) under
 * AETHERIS_USER_<SLUG>_KEY and managed from Settings → API keys like any other key.
 */

interface CustomView {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  vision: boolean;
  local: boolean;
  priority: number;
  envKey: string;
  notes?: string;
  createdAt: number;
  hasKey: boolean;
  source: ProviderKeySource | null;
  keyless: true;
}

function view(r: CustomProviderRecord): CustomView {
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.baseUrl,
    model: r.model,
    vision: r.vision,
    local: r.local,
    priority: r.priority,
    envKey: r.envKey,
    notes: r.notes,
    createdAt: r.createdAt,
    hasKey: !!runtimeKeyFor(r.envKey),
    source: runtimeKeyFor(r.envKey) ? "app" : null,
    keyless: true,
  };
}

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function GET() {
  await getUserId();
  await hydrateRouterStores(true); // hosted: read fresh cross-instance state before rendering
  return NextResponse.json({ providers: listCustomProviders().map(view) });
}

export async function POST(req: Request) {
  await getUserId();
  const body = (await req.json().catch(() => ({}))) as { name?: string; baseUrl?: string; model?: string; key?: string; vision?: boolean; local?: boolean; notes?: string };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!name || name.length < 2) return bad("name is required");
  if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) return bad("baseUrl must be a http(s) URL, e.g. http://127.0.0.1:11434/v1");
  try { void new URL(baseUrl); } catch { return bad("baseUrl is not a valid URL"); }
  if (!model) return bad("a default model is required (the test-connection button can list the server's models)");
  if (body.key !== undefined && typeof body.key !== "string") return bad("key must be a string");
  const rec = await addCustomProviderAsync({ name, baseUrl, model, vision: !!body.vision, local: !!body.local, notes: body.notes });
  if (typeof body.key === "string" && body.key.trim()) await setRuntimeKeyAsync(rec.envKey, body.key);
  return NextResponse.json({ ok: true, provider: view(findCustomProvider(rec.id)!) }, { status: 201 });
}

export async function PATCH(req: Request) {
  await getUserId();
  await hydrateRouterStores(true); // hosted: find-before-write needs a fresh cache
  const body = (await req.json().catch(() => ({}))) as { id?: string; name?: string; baseUrl?: string; model?: string; vision?: boolean; local?: boolean; notes?: string };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return bad("id is required");
  if (!findCustomProvider(id)) return NextResponse.json({ error: `unknown provider "${id}"` }, { status: 404 });
  const updated = await updateCustomProviderAsync(id, body);
  return NextResponse.json({ ok: true, provider: view(updated!) });
}

export async function DELETE(req: Request) {
  await getUserId();
  await hydrateRouterStores(true); // hosted: find-before-write needs a fresh cache
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const rec = findCustomProvider(id);
  if (!rec) return NextResponse.json({ error: `unknown provider "${id}"` }, { status: 404 });
  await removeCustomProviderAsync(id);
  if (runtimeKeyFor(rec.envKey)) await setRuntimeKeyAsync(rec.envKey, "");
  return NextResponse.json({ ok: true });
}
