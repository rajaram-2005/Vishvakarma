import { NextResponse } from "next/server";
import { getUserId } from "@/aetheris/lib/user";
import { addDocument, extractText, getKb, KB_LIMITS, saveKb } from "@/aetheris/lib/kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const MAX_UPLOAD = 25 * 1024 * 1024;

/**
 * POST multipart/form-data (files[]) or JSON {name, text} → parse, chunk, index.
 * Returns the added docs and any per-file errors.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { uid } = await getUserId();
  const kb = await getKb((await params).id);
  if (!kb || kb.uid !== uid) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const added: unknown[] = []; const errors: { name: string; error: string }[] = [];
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: "No files" }, { status: 400 });
    for (const f of files) {
      if (kb.docs.length >= KB_LIMITS.docsPerKb) { errors.push({ name: f.name, error: `Limit of ${KB_LIMITS.docsPerKb} documents per knowledge base` }); continue; }
      if (f.size > MAX_UPLOAD) { errors.push({ name: f.name, error: "File over 25 MB" }); continue; }
      try {
        const buf = Buffer.from(await f.arrayBuffer());
        const { text, kind, pages } = await extractText(f.name, f.type, buf);
        if (!text.trim()) throw new Error("No text found");
        added.push(addDocument(kb, f.name, kind, text, pages));
      } catch (e) { errors.push({ name: f.name, error: (e as Error).message }); }
    }
  } else {
    const b = (await req.json().catch(() => ({}))) as { name?: string; text?: string; url?: string };
    if (b.url && /^https?:\/\//.test(b.url)) {
      try {
        const r = await fetch(b.url, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Aetheris/1.0" } });
        const raw = await r.text(); const { htmlToText } = await import("@/aetheris/lib/kb");
        const text = /html/i.test(r.headers.get("content-type") ?? "") ? htmlToText(raw) : raw;
        added.push(addDocument(kb, b.name?.trim() || new URL(b.url).hostname + new URL(b.url).pathname, "url", text));
      } catch (e) { errors.push({ name: b.url, error: `Could not fetch: ${(e as Error).message}` }); }
    } else {
      if (!b.text?.trim()) return NextResponse.json({ error: "text or files required" }, { status: 400 });
      added.push(addDocument(kb, (b.name ?? "pasted-text.txt").slice(0, 120), "text", b.text));
    }
  }
  if (added.length) await saveKb(kb);
  const { chunks, ...lite } = kb;
  return NextResponse.json({ added, errors, kb: { ...lite, totalChunks: chunks.length } }, { status: added.length ? 200 : 400 });
}
