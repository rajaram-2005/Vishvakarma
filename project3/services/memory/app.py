# SUTRA memory service — the WHAT. Local, scoped, searchable, deletable.
from __future__ import annotations

import hashlib
import json
import math
import re
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException

DATA = Path(__file__).parent / "data"
DATA.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="SUTRA Memory", version="0.1.0")

DIM = 384
KINDS = ("fact", "preference", "episodic")


def _load() -> dict:
    p = DATA / "memory.json"
    return json.loads(p.read_text()) if p.exists() else {"entries": []}


def _save(state: dict) -> None:
    (DATA / "memory.json").write_text(json.dumps(state, indent=2))


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
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def _cos(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


@app.get("/")
async def list_entries(scope: str | None = None, kind: str | None = None):
    out = _load()["entries"]
    if scope:
        out = [e for e in out if e["scope"] == scope]
    if kind:
        out = [e for e in out if e["kind"] == kind]
    return {"entries": out}


@app.post("/", status_code=201)
async def add(body: dict):
    text = (body.get("text") or "").strip()
    kind = body.get("kind", "fact")
    if not text:
        raise HTTPException(422, "text is required")
    if kind not in KINDS:
        raise HTTPException(422, f"kind must be one of {KINDS}")
    entry = {
        "id": f"mem_{uuid.uuid4().hex[:10]}",
        "kind": kind,
        "text": text,
        "scope": body.get("scope", "user"),  # user | project:<id>
        "source": body.get("source", "api"),
        "ts": time.time(),
    }
    state = _load()
    state["entries"] = [entry, *state["entries"]][:2000]
    _save(state)
    return entry


@app.delete("/{entry_id}", status_code=204)
async def remove(entry_id: str):
    state = _load()
    before = len(state["entries"])
    state["entries"] = [e for e in state["entries"] if e["id"] != entry_id]
    if len(state["entries"]) == before:
        raise HTTPException(404, "not found")
    _save(state)
    return None


@app.post("/search")
async def search(body: dict):
    q = (body.get("q") or "").strip()
    if not q:
        raise HTTPException(422, "q is required")
    k = int(body.get("k", 5))
    scope = body.get("scope")
    entries = _load()["entries"]
    if scope:
        entries = [e for e in entries if e["scope"] == scope]
    qv = _embed(q)
    scored = sorted(((e, _cos(qv, _embed(e["text"]))) for e in entries), key=lambda p: -p[1])
    return {"hits": [{"entry": e, "score": round(s, 4)} for e, s in scored[:k]]}


@app.get("/health")
async def health():
    return {"service": "sutra-memory", "version": "0.1.0", "entries": len(_load()["entries"])}
