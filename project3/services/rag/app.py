# Aetherion RAG service — Ingest → Parse → Chunk → Embed → Retrieve → Rerank → Context → Generate → Cite.
from __future__ import annotations

import json
import math
import re
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException

DATA = Path(__file__).parent / "data"
DATA.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Aetherion RAG", version="0.1.0")

DIM = 384


def _load() -> dict:
    p = DATA / "rag.json"
    return json.loads(p.read_text()) if p.exists() else {"documents": [], "chunks": []}


def _save(state: dict) -> None:
    (DATA / "rag.json").write_text(json.dumps(state, indent=2))


def _fnv(s: str) -> int:
    h = 2166136261
    for ch in s:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h


def _embed(text: str) -> list[float]:
    v = [0.0] * DIM
    for t in re.findall(r"\w+", text.lower()):
        h = _fnv(t)
        v[h % DIM] += 1.0 if (h >> 8) % 2 == 0 else -1.0
        h2 = _fnv(t + "#")
        v[h2 % DIM] += 0.5 * (1.0 if (h2 >> 4) % 2 == 0 else -1.0)
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def _cos(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _chunk(text: str, doc_id: str, size: int = 420, overlap: int = 90) -> list[dict]:
    out, buf, heading = [], "", doc_id
    for p in [x.strip() for x in re.split(r"\n{2,}", text) if x.strip()]:
        heading = re.sub(r"^#+\s*", "", p.split("\n", 1)[0]).strip()[:80]
        if buf and len(buf) + len(p) > size:
            buf = buf.strip()
            if buf:
                out.append({"id": f"{doc_id}::c{len(out)}", "docId": doc_id, "heading": heading, "text": buf})
            buf = buf[-overlap:]
        buf = f"{buf}\n\n{p}" if buf else p
    if buf.strip():
        out.append({"id": f"{doc_id}::c{len(out)}", "docId": doc_id, "heading": heading, "text": buf.strip()})
    return out or [{"id": f"{doc_id}::c0", "docId": doc_id, "heading": doc_id, "text": text[:size]}]


def _bm25(docs: list[str], q: str) -> list[float]:
    k1, b = 1.5, 0.75
    toks = [re.findall(r"\w+", d.lower()) for d in docs]
    df: dict[str, int] = {}
    for t in toks:
        for w in set(t):
            df[w] = df.get(w, 0) + 1
    avg = (sum(len(t) for t in toks) / len(toks)) if toks else 0.0
    out = [0.0] * len(docs)
    for w in re.findall(r"\w+", q.lower()):
        idf = math.log(1 + (len(docs) - df.get(w, 0) + 0.5) / (df.get(w, 0) + 0.5))
        for i, t in enumerate(toks):
            tf = t.count(w)
            if tf:
                out[i] += idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * len(t) / (avg or 1)))
    return out


@app.post("/ingest", status_code=201)
async def ingest(body: dict):
    title = (body.get("title") or "Untitled").strip()
    text = body.get("text") or ""
    if not text.strip():
        raise HTTPException(422, "text is required")
    doc_id = f"doc_{uuid.uuid4().hex[:10]}"
    chunks = _chunk(text, doc_id)
    state = _load()
    doc = {"id": doc_id, "title": title, "source": body.get("source", "api"), "kind": body.get("kind", "text"), "createdAt": time.time(), "chars": len(text), "chunkCount": len(chunks)}
    state["documents"] = [doc, *state["documents"]]
    state["chunks"] = [*state["chunks"], *chunks]
    _save(state)
    return {"doc": doc, "chunks": len(chunks)}


@app.get("/documents")
async def documents():
    return {"documents": _load()["documents"]}


@app.delete("/documents/{doc_id}", status_code=204)
async def delete_doc(doc_id: str):
    state = _load()
    before = len(state["documents"])
    state["documents"] = [d for d in state["documents"] if d["id"] != doc_id]
    state["chunks"] = [c for c in state["chunks"] if c["docId"] != doc_id]
    if len(state["documents"]) == before:
        raise HTTPException(404, "not found")
    _save(state)
    return None


@app.post("/query")
async def query(body: dict):
    q = (body.get("query") or body.get("q") or "").strip()
    if not q:
        raise HTTPException(422, "query is required")
    k = int(body.get("k", 5))
    chunks = _load()["chunks"]
    if not chunks:
        return {"answer": "The knowledge base is empty — ingest first (POST /ingest).", "hits": []}
    qv = _embed(q)
    dense = [_cos(qv, _embed(c["text"])) for c in chunks]
    bm = _bm25([c["text"] for c in chunks], q)
    lo, hi = min(bm), max(bm)
    span = (hi - lo) or 1.0
    bm = [(x - lo) / span for x in bm]
    hits = sorted(
        ({"chunk": c, "score": round(0.55 * max(0.0, dense[i]) + 0.45 * bm[i], 6)} for i, c in enumerate(chunks)),
        key=lambda h: -h["score"],
    )[:k]
    ctx = "\n\n".join(f"[{i + 1}] ({h['chunk']['heading']}) {h['chunk']['text']}" for i, h in enumerate(hits))
    # evidence gate: refuse to guess when the context doesn't support the question
    words = [w for w in re.split(r"\W+", q.lower()) if len(w) > 3]
    overlap = sum(1 for w in words if w in ctx.lower())
    if words and overlap / len(words) < 0.34:
        answer = f"I can't verify this from the knowledge base — no direct evidence about \"{q[:80]}\", so I won't guess."
    else:
        segs = re.findall(r"\[\d+\]\s*([^\[]+)", ctx)
        answer = f'Based on the knowledge base — "{q[:80]}":\n\n{segs[0].strip()[:400]}' + "\n\nSources: [1] knowledge base chunk 1"
    return {"answer": answer, "model": "sutra-local (grounded)", "hits": hits}


@app.get("/health")
async def health():
    s = _load()
    return {"service": "sutra-rag", "version": "0.1.0", "documents": len(s["documents"]), "chunks": len(s["chunks"])}
