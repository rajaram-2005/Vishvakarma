# Aetherion router service — Request → Task Analysis → Model Ranking → Model.
# Deterministic, offline. Split-out of the routing boundary used by api/agent.
from __future__ import annotations

import re

from fastapi import FastAPI, HTTPException

app = FastAPI(title="Aetherion Router", version="0.1.0")

# Canonical registry (mirrors services/api). In production this is fed by services/registry.
MODELS = [
    {"id": "sutra-local", "name": "Aetherion Local", "runtime": "sutra-local", "contextWindow": 16384, "costIn": 0, "latencyTier": "low", "capabilities": ["code", "structured", "long-context"], "available": True, "local": True},
    {"id": "llama3.1-8b", "name": "Llama 3.1 8B", "runtime": "ollama", "contextWindow": 131072, "costIn": 0, "latencyTier": "medium", "capabilities": ["code", "creative", "structured"], "available": True, "local": True},
    {"id": "qwen2.5-coder-14b", "name": "Qwen 2.5 Coder 14B", "runtime": "ollama", "contextWindow": 32768, "costIn": 0, "latencyTier": "medium", "capabilities": ["code", "structured"], "available": True, "local": True},
    {"id": "gpt-4o", "name": "GPT-4o", "runtime": "openai-compat", "contextWindow": 128000, "costIn": 2.5, "latencyTier": "high", "capabilities": ["code", "creative", "structured", "long-context", "vision"], "available": True, "local": False},
    {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "runtime": "openai-compat", "contextWindow": 128000, "costIn": 0.15, "latencyTier": "medium", "capabilities": ["code", "creative", "structured", "long-context"], "available": True, "local": False},
    {"id": "claude-sonnet", "name": "Claude Sonnet", "runtime": "openai-compat", "contextWindow": 200000, "costIn": 3.0, "latencyTier": "high", "capabilities": ["code", "creative", "structured", "long-context"], "available": True, "local": False},
]

CODE_RE = re.compile(r"```|function\s+\w+\s*\(|const\s+\w+\s*[:=]|def\s+\w+\s*\(|class\s+\w+|import\s+\w|SELECT\s|refactor|implement|bug|stack ?trace|regex|unit test", re.I)
MATH_RE = re.compile(r"\d+\s*[\+\-\*/^%×]\s*\d+|\bcalculate\b|\bsolve\b|\bequation\b|\bintegral\b|\bderivative\b", re.I)
CREATIVE_RE = re.compile(r"\bwrite\b|\bstory\b|\bpoem\b|\bname(s)?\s+(for|of)\b|\bcreative\b|\bslogan\b|\btagline\b|\blore\b", re.I)
STRUCTURED_RE = re.compile(r"\bjson\b|\btable\b|\bextract\b|\bsummariz\w+|\blist (of|the)\b|\bcompare\b|\bplan\b", re.I)
CAP_BY_INTENT = {"code": "code", "math": "code", "long-context": "long-context", "creative": "creative", "structured": "structured", "general": None}


def analyze(text: str, needs_local: bool = False) -> dict:
    intents = []
    if CODE_RE.search(text):
        intents.append("code")
    if MATH_RE.search(text):
        intents.append("math")
    if len(text) > 6000:
        intents.append("long-context")
    if CREATIVE_RE.search(text):
        intents.append("creative")
    if STRUCTURED_RE.search(text):
        intents.append("structured")
    if not intents:
        intents.append("general")
    return {"intents": intents, "needsLocal": needs_local, "charCount": len(text), "label": " · ".join(intents)}


def rank(models: list[dict], a: dict, require_local: bool = False) -> list[dict]:
    out = []
    for m in models:
        if not m.get("available", True):
            continue
        if require_local and not m.get("local"):
            continue
        score, reasons = 50, []
        for intent in a["intents"]:
            cap = CAP_BY_INTENT.get(intent)
            if cap and cap in m.get("capabilities", []):
                score += 12
                reasons.append(f"matches {intent}")
        lat = {"low": 10, "medium": 4, "high": -4}[m.get("latencyTier", "low")]
        score += lat
        if lat > 0:
            reasons.append("fast tier")
        if a["charCount"] > m["contextWindow"] * 0.5:
            score -= 15
            reasons.append("context window tight")
        elif m["contextWindow"] >= 32000:
            score += 4
            reasons.append("wide context")
        if m["costIn"] == 0:
            score += 8
            reasons.append("zero cost")
        elif m["costIn"] < 0.5:
            score += 4
            reasons.append("low cost")
        if m.get("local"):
            score += 3
            reasons.append("runs on your machine")
        out.append({"modelId": m["id"], "score": score, "reasons": reasons[:4]})
    out.sort(key=lambda e: -e["score"])
    return out


@app.get("/models")
async def models():
    return {"models": MODELS}


@app.post("/analyze")
async def post_analyze(body: dict):
    text = body.get("text") or ""
    if not text:
        raise HTTPException(422, "text is required")
    return analyze(text, bool(body.get("needsLocal")))


@app.post("/route")
async def post_route(body: dict):
    text = body.get("text") or ""
    if not text:
        raise HTTPException(422, "text is required")
    a = analyze(text, bool(body.get("requireLocal")))
    r = rank(MODELS, a, bool(body.get("requireLocal")))
    force = body.get("forceModel")
    chosen = next((m for m in MODELS if m["id"] == (force or (r[0]["modelId"] if r else None)) and m.get("available", True)), None)
    return {"analysis": a, "ranking": r[:6], "chosen": chosen}


@app.get("/health")
async def health():
    return {"service": "sutra-router", "version": "0.1.0", "models": len(MODELS)}
