/**
 * Chat with documents — per-user knowledge bases with chunking, lexical (BM25) retrieval and citations.
 *
 * Why no embeddings? Aetheris must run for free on any host, with or without provider access. BM25 over
 * sentence-aware chunks is provider-independent, instant, deterministic and — for question answering over
 * a handful of documents — surprisingly competitive. Retrieval is exposed as pure functions for tests.
 */
import { store } from "@/aetheris/lib/store";

export interface Chunk { id: string; doc: string; idx: number; text: string; page?: number; section?: string }
export interface KbDoc { id: string; name: string; kind: string; size: number; chars: number; chunks: number; pages?: number; addedAt: number }
export interface Kb { id: string; uid: string; name: string; description: string; docs: KbDoc[]; chunks: Chunk[]; createdAt: number; updatedAt: number }
export interface Hit { chunk: Chunk; score: number; doc: KbDoc }

const COL = "kb";
export const KB_LIMITS = { docsPerKb: 40, charsPerDoc: 1_500_000, kbsPerUser: 30, chunkChars: 900, overlap: 120 };

// ---- CRUD ---------------------------------------------------------------------------------------
export async function listKbs(uid: string): Promise<Omit<Kb, "chunks">[]> {
  const rows = Object.values(await store.all<Kb>(COL)).filter((k) => k.uid === uid).sort((a, b) => b.updatedAt - a.updatedAt);
  return rows.map(({ chunks: _c, ...rest }) => rest);
}
export const getKb = (id: string) => store.get<Kb>(COL, id);
export async function createKb(uid: string, name: string, description = ""): Promise<Kb> {
  const kb: Kb = { id: Math.random().toString(36).slice(2, 12), uid, name: name.trim().slice(0, 80) || "Knowledge base", description: description.slice(0, 400), docs: [], chunks: [], createdAt: Date.now(), updatedAt: Date.now() };
  await store.set(COL, kb.id, kb); return kb;
}
export const saveKb = async (kb: Kb) => { kb.updatedAt = Date.now(); await store.set(COL, kb.id, kb); return kb; };
export const deleteKb = (id: string) => store.remove(COL, id);

/** Add a parsed document (already text) to a KB: chunks it and indexes. Replaces a doc with the same name. */
export function addDocument(kb: Kb, name: string, kind: string, text: string, pages?: { page: number; text: string }[]): KbDoc {
  const existing = kb.docs.find((d) => d.name === name);
  if (existing) removeDocument(kb, existing.id);
  const id = Math.random().toString(36).slice(2, 10);
  const clean = text.slice(0, KB_LIMITS.charsPerDoc);
  const chunks = pages && pages.length ? pages.flatMap((p) => chunkText(p.text, id, p.page)) : chunkText(clean, id);
  chunks.forEach((c, i) => { c.idx = i; c.id = `${id}:${i}`; });
  const doc: KbDoc = { id, name: name.slice(0, 120), kind, size: text.length, chars: clean.length, chunks: chunks.length, pages: pages?.length, addedAt: Date.now() };
  kb.docs.push(doc); kb.chunks.push(...chunks);
  return doc;
}
export function removeDocument(kb: Kb, docId: string) { kb.docs = kb.docs.filter((d) => d.id !== docId); kb.chunks = kb.chunks.filter((c) => c.doc !== docId); }

// ---- Chunking ------------------------------------------------------------------------------------
/** Sentence/paragraph-aware chunking with overlap; tracks the nearest markdown heading as `section`. */
export function chunkText(text: string, docId: string, page?: number, size = KB_LIMITS.chunkChars, overlap = KB_LIMITS.overlap): Chunk[] {
  const out: Chunk[] = [];
  const norm = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!norm) return out;
  // Split into sentences-ish units, keeping paragraph breaks and headings as their own units.
  const units = norm.split(/(?<=[.!?।])\s+(?=[A-Z0-9"“(\u0B80-\u0BFF\u0900-\u097F])|\n{2,}|(?=\n#{1,6}\s)/).map((u) => u.trim()).filter(Boolean);
  let buf = ""; let section: string | undefined;
  const flush = () => { if (buf.trim().length > 20) out.push({ id: "", doc: docId, idx: out.length, text: buf.trim(), page, section }); };
  for (const u of units) {
    const h = /^#{1,6}\s+(.+)/.exec(u); if (h) { flush(); buf = ""; section = h[1].trim().slice(0, 80); }
    if (u.length > size) { // hard-wrap very long units
      flush(); buf = "";
      for (let i = 0; i < u.length; i += size - overlap) out.push({ id: "", doc: docId, idx: out.length, text: u.slice(i, i + size), page, section });
      continue;
    }
    if ((buf + " " + u).length > size) { flush(); buf = buf.slice(-overlap).replace(/^\S*\s/, "") + " " + u; } else buf = buf ? buf + " " + u : u;
  }
  flush();
  return out;
}

// ---- Retrieval (BM25) ----------------------------------------------------------------------------
const STOP = new Set("a an and are as at be by for from has have how i in is it its of on or that the this to was were what when where which who why will with you your our we they them their can do does did not no yes if then than so such into about over under between also".split(" "));
export function tokenize(s: string): string[] {
  return s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)).map((t) => (t.length > 5 && /^[a-z]+$/.test(t) ? t.replace(/(ing|ed|es|s|ly|tion|ment)$/, "") : t));
}
export function search(chunks: Chunk[], query: string, k = 6): { chunk: Chunk; score: number }[] {
  const q = [...new Set(tokenize(query))]; if (!q.length || !chunks.length) return [];
  const docsTok = chunks.map((c) => tokenize(c.text));
  const N = chunks.length; const avg = docsTok.reduce((n, d) => n + d.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const d of docsTok) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const k1 = 1.4, b = 0.75;
  const scored = chunks.map((chunk, i) => {
    const d = docsTok[i]; const tf = new Map<string, number>(); for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let s = 0;
    for (const t of q) { const f = tf.get(t); if (!f) continue; const n = df.get(t) ?? 0; const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5)); s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.length / avg)); }
    // phrase bonus: exact query substring
    if (s > 0 && chunk.text.toLowerCase().includes(query.toLowerCase().trim()) && query.trim().length > 8) s *= 1.5;
    return { chunk, score: s };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  // add neighbouring chunk of the top hit for continuity
  const top = scored.slice(0, k);
  if (top[0]) { const nb = chunks.find((c) => c.doc === top[0].chunk.doc && c.idx === top[0].chunk.idx + 1); if (nb && !top.some((t) => t.chunk.id === nb.id)) top.push({ chunk: nb, score: top[0].score * 0.5 }); }
  return top;
}
export function retrieve(kb: Kb, query: string, k = 6): Hit[] {
  return search(kb.chunks, query, k).map((h) => ({ ...h, doc: kb.docs.find((d) => d.id === h.chunk.doc)! })).filter((h) => h.doc);
}

/** Grounding block for the system prompt with numbered citations [D1], [D2]… */
export function kbGroundingBlock(kbName: string, hits: Hit[], budget = 12_000): { block: string; cites: { n: number; doc: string; page?: number; section?: string; chunkId: string; excerpt: string }[] } {
  const cites: { n: number; doc: string; page?: number; section?: string; chunkId: string; excerpt: string }[] = [];
  const parts: string[] = []; let used = 0;
  hits.forEach((h, i) => {
    const t = h.chunk.text.slice(0, Math.max(0, budget - used)); if (!t) return; used += t.length;
    const n = i + 1; cites.push({ n, doc: h.doc.name, page: h.chunk.page, section: h.chunk.section, chunkId: h.chunk.id, excerpt: h.chunk.text.slice(0, 220) });
    parts.push(`[D${n}] ${h.doc.name}${h.chunk.page ? ` p.${h.chunk.page}` : ""}${h.chunk.section ? ` § ${h.chunk.section}` : ""}\n${t}`);
  });
  const block = `DOCUMENTS — retrieved passages from the user's knowledge base "${kbName}". Answer from these when relevant and cite each fact inline as [D1], [D2]… (the number of the passage). If the documents don't contain the answer, say so clearly before using general knowledge. Never invent citations.\n\n${parts.join("\n\n")}`;
  return { block, cites };
}

// ---- Parsing uploads -----------------------------------------------------------------------------
export const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|log|py|js|ts|tsx|jsx|java|c|cpp|h|cs|go|rs|rb|php|sh|sql|tex|rst)$/i;
/** Extract text (+ pages for PDFs) from an uploaded file buffer. */
export async function extractText(name: string, mime: string, buf: Buffer): Promise<{ text: string; kind: string; pages?: { page: number; text: string }[] }> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mime === "application/pdf") {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — no types shipped for the internal entry (the package root has a debug side-effect)
    const mod = await import("pdf-parse/lib/pdf-parse.js"); const pdfParse = (mod.default ?? mod) as unknown as (b: Buffer, o?: Record<string, unknown>) => Promise<{ text: string; numpages: number }>;
    const pages: { page: number; text: string }[] = [];
    const r = await pdfParse(buf, { pagerender: (pd: { pageIndex: number; getTextContent(): Promise<{ items: { str: string; transform: number[] }[] }> }) => pd.getTextContent().then((tc) => { let last: number | null = null; let s = ""; for (const it of tc.items) { const y = it.transform[5]; if (last !== null && Math.abs(y - last) > 2) s += "\n"; s += it.str + " "; last = y; } pages.push({ page: pd.pageIndex + 1, text: s }); return s; }) });
    pages.sort((a, b) => a.page - b.page);
    const text = pages.map((p) => p.text).join("\n\n") || r.text;
    if (!text.trim()) throw new Error("This PDF has no extractable text (scanned image?). Try OCR first.");
    return { text, kind: "pdf", pages };
  }
  if (lower.endsWith(".docx") || mime.includes("wordprocessingml")) return { text: await docxText(buf), kind: "docx" };
  if (lower.endsWith(".html") || lower.endsWith(".htm") || mime === "text/html") return { text: htmlToText(buf.toString("utf8")), kind: "html" };
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return { text: csvToText(buf.toString("utf8"), lower.endsWith(".tsv") ? "\t" : ","), kind: "csv" };
  if (TEXT_EXT.test(lower) || mime.startsWith("text/") || mime === "application/json") return { text: buf.toString("utf8"), kind: lower.split(".").pop() ?? "text" };
  throw new Error(`Unsupported file type: ${name}. Upload PDF, DOCX, CSV, TXT, Markdown, HTML, JSON or code files.`);
}

/** Minimal DOCX reader: unzip word/document.xml and flatten paragraphs (no external deps). */
async function docxText(buf: Buffer): Promise<string> {
  const { inflateRawSync } = await import("node:zlib");
  // Walk local file headers to find word/document.xml (ZIP is simple enough to parse by hand).
  let off = 0; let xml = "";
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8); const flags = buf.readUInt16LE(off + 6); let csize = buf.readUInt32LE(off + 18); const nlen = buf.readUInt16LE(off + 26); const xlen = buf.readUInt16LE(off + 28);
    const name = buf.subarray(off + 30, off + 30 + nlen).toString("utf8"); const start = off + 30 + nlen + xlen;
    if (flags & 8) { // data descriptor: sizes unknown up front → use central directory instead
      const cd = findCentral(buf, name); if (cd) csize = cd.csize;
    }
    if (name === "word/document.xml") { const data = buf.subarray(start, start + csize); xml = (method === 8 ? inflateRawSync(data) : data).toString("utf8"); break; }
    off = start + csize + ((flags & 8) ? 16 : 0);
    if (csize === 0 && !(flags & 8)) off = start;
  }
  if (!xml) throw new Error("Could not read this DOCX (no word/document.xml).");
  return xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
}
function findCentral(buf: Buffer, name: string): { csize: number } | null {
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) {
    let p = buf.readUInt32LE(i + 16);
    while (p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50) { const n = buf.readUInt16LE(p + 28); const nm = buf.subarray(p + 46, p + 46 + n).toString("utf8"); if (nm === name) return { csize: buf.readUInt32LE(p + 20) }; p += 46 + n + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32); }
    return null;
  }
  return null;
}
export function htmlToText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<(h[1-6])[^>]*>/gi, "\n## ").replace(/<\/(p|div|li|tr|h[1-6]|br)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
/** CSV → "header: value" rows so questions like "what is X's price" retrieve the right row. */
export function csvToText(csv: string, sep = ","): string {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim()); if (lines.length < 2) return csv;
  const parse = (l: string) => { const out: string[] = []; let cur = ""; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map((s) => s.trim()); };
  const head = parse(lines[0]);
  return [`Table columns: ${head.join(", ")}`, ...lines.slice(1, 5000).map((l, i) => { const v = parse(l); return `Row ${i + 1}: ` + head.map((h, j) => `${h}: ${v[j] ?? ""}`).join("; "); })].join("\n");
}
