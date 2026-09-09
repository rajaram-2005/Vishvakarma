# SUTRA service API — Python port of the shared logic (security, router, RAG, workflows).
# Deterministic, offline-first, provider-neutral.

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

RISK_LEVELS = ("low", "medium", "high", "critical")
RISK_RANK = {r: i for i, r in enumerate(RISK_LEVELS)}


@dataclass
class PolicyRule:
    category: str
    risk: str
    requires_approval: bool


DEFAULT_POLICY: list[PolicyRule] = [
    PolicyRule("fs.read", "low", False),
    PolicyRule("fs.write", "low", False),
    PolicyRule("fs.delete", "high", True),
    PolicyRule("terminal.exec", "medium", True),
    PolicyRule("network.request", "medium", True),
    PolicyRule("secret.read", "critical", True),
    PolicyRule("git.push", "medium", True),
    PolicyRule("db.write", "high", True),
    PolicyRule("browser.action", "medium", False),
    PolicyRule("code.exec", "high", True),
    PolicyRule("computer.use", "high", True),
    PolicyRule("deploy", "critical", True),
]


@dataclass
class RiskAssessment:
    risk: str
    requires_approval: bool
    reasons: list[str]
    category: str

    def to_dict(self) -> dict:
        return {
            "risk": self.risk,
            "requiresApproval": self.requires_approval,
            "reasons": self.reasons,
            "category": self.category,
        }


# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------

_DANGEROUS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\brm\s+(-[a-z]*[rf][a-z]*\s+)+", re.I), "recursive delete"),
    (re.compile(r"\bsudo\b", re.I), "privilege escalation"),
    (re.compile(r"\bmkfs\b|\bdd\s+if=", re.I), "disk-level write"),
    (re.compile(r"\bchmod\s+(-R\s+)?777\b", re.I), "world-writable permissions"),
    (re.compile(r":\s*\(\)\s*\{.*\|.*&\s*\}"), "fork bomb pattern"),
    (re.compile(r"\bcurl\b[^\n|]*\|\s*(ba|z)?sh", re.I), "remote script piped to shell"),
    (re.compile(r"\bwget\b[^\n|]*\|\s*(ba|z)?sh", re.I), "remote script piped to shell"),
    (re.compile(r"\bbase64\s+(-d|--decode)", re.I), "encoded payload decode"),
    (re.compile(r"\bgit\s+push\b[^\n]*--force\b|\bgit\s+push\b[^\n]*\s-f\b", re.I), "force push"),
    (re.compile(r"\beval\b\s*\(", re.I), "dynamic code evaluation"),
    (re.compile(r"\bDROP\s+(TABLE|DATABASE|SCHEMA)\b", re.I), "destructive SQL"),
    (re.compile(r"\bTRUNCATE\s+TABLE\b", re.I), "destructive SQL"),
    (re.compile(r"\bnc\s+-e\b|\bnetcat\b.*\b-e\b", re.I), "reverse shell pattern"),
    (re.compile(r"/etc/(passwd|shadow)", re.I), "credential file access"),
]


def max_risk(a: str, b: str) -> str:
    return a if RISK_RANK[a] >= RISK_RANK[b] else b


def assess(category: str, detail: str = "", policy: Optional[list[PolicyRule]] = None) -> RiskAssessment:
    """Agent → Tool Gateway → Policy. Never silently: dangerous ⇒ approval."""
    rules = policy or DEFAULT_POLICY
    rule = next((p for p in rules if p.category == category), None)
    if rule is None:
        risk = "medium"
        requires = True
    else:
        risk = rule.risk
        requires = rule.requires_approval
    reasons = [f"{category}: baseline {risk}"]
    if detail:
        for rx, why in _DANGEROUS:
            if rx.search(detail):
                risk = "critical"
                reasons.append(f"signature: {why}")
                break
    requires = requires or risk in ("critical", "high")
    return RiskAssessment(risk=risk, requires_approval=requires, reasons=reasons, category=category)


_SECRET_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"sk-[a-zA-Z0-9]{16,}"), "OpenAI-style API key"),
    (re.compile(r"ghp_[a-zA-Z0-9]{20,}"), "GitHub personal access token"),
    (re.compile(r"github_pat_[a-zA-Z0-9_]{20,}"), "GitHub fine-grained token"),
    (re.compile(r"xox[baprs]-[a-zA-Z0-9-]{10,}"), "Slack token"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS access key id"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "private key block"),
    (re.compile(r"\b(password|passwd|secret|token)\b\s*[:=]\s*['\"][^'\"]{6,}['\"]", re.I), "hardcoded credential"),
]


def scan_for_secrets(text: str) -> list[dict]:
    """Find likely secrets. Never returns the secret itself — location + kind only."""
    out: list[dict] = []
    for i, line in enumerate(text.splitlines(), start=1):
        for rx, kind in _SECRET_PATTERNS:
            if rx.search(line):
                out.append({"file": "-", "line": i, "kind": kind})
    return out


# ---------------------------------------------------------------------------
# Model router (Request → Task Analysis → Model Ranking → Model)
# ---------------------------------------------------------------------------

CODE_RE = re.compile(
    r"```|function\s+\w+\s*\(|const\s+\w+\s*[:=]|def\s+\w+\s*\(|class\s+\w+|import\s+\w|SELECT\s|"
    r"refactor|implement|bug|stack ?trace|regex|unit test",
    re.I,
)
MATH_RE = re.compile(r"\d+\s*[\+\-\*/^%×]\s*\d+|\bcalculate\b|\bsolve\b|\bequation\b|\bintegral\b|\bderivative\b", re.I)
CREATIVE_RE = re.compile(r"\bwrite\b|\bstory\b|\bpoem\b|\bname(s)?\s+(for|of)\b|\bcreative\b|\bslogan\b|\btagline\b|\blore\b", re.I)
STRUCTURED_RE = re.compile(r"\bjson\b|\btable\b|\bextract\b|\bsummariz\w+|\blist (of|the)\b|\bcompare\b|\bplan\b", re.I)

CAP_BY_INTENT = {
    "code": "code",
    "math": "code",
    "long-context": "long-context",
    "creative": "creative",
    "structured": "structured",
    "general": None,
}


@dataclass
class RouteAnalysis:
    intents: list[str]
    needs_local: bool
    char_count: int
    label: str

    def to_dict(self) -> dict:
        return {
            "intents": self.intents,
            "needsLocal": self.needs_local,
            "charCount": self.char_count,
            "label": self.label,
        }


@dataclass
class ModelInfo:
    id: str
    name: str
    runtime: str
    context_window: int = 8192
    cost_in: float = 0.0
    cost_out: float = 0.0
    latency_tier: str = "low"  # low | medium | high
    capabilities: list[str] = field(default_factory=list)
    available: bool = True
    local: bool = True

    @classmethod
    def from_dict(cls, d: dict) -> "ModelInfo":
        return cls(
            id=d["id"],
            name=d.get("name", d["id"]),
            runtime=d.get("runtime", "sutra-local"),
            context_window=int(d.get("contextWindow", 8192)),
            cost_in=float(d.get("costIn", 0)),
            cost_out=float(d.get("costOut", 0)),
            latency_tier=d.get("latencyTier", "low"),
            capabilities=list(d.get("capabilities", [])),
            available=bool(d.get("available", True)),
            local=bool(d.get("local", True)),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "runtime": self.runtime,
            "contextWindow": self.context_window,
            "costIn": self.cost_in,
            "costOut": self.cost_out,
            "latencyTier": self.latency_tier,
            "capabilities": self.capabilities,
            "available": self.available,
            "local": self.local,
        }


def analyze_request(text: str, needs_local: bool = False) -> RouteAnalysis:
    intents: list[str] = []
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
    return RouteAnalysis(intents=intents, needs_local=needs_local, char_count=len(text), label=" · ".join(intents))


def rank_models(
    models: list[ModelInfo],
    analysis: RouteAnalysis,
    require_local: bool = False,
) -> list[dict]:
    entries: list[dict] = []
    for m in models:
        if not m.available:
            continue
        if require_local and not m.local:
            continue
        score = 50
        reasons: list[str] = []
        for intent in analysis.intents:
            cap = CAP_BY_INTENT.get(intent)
            if cap and cap in m.capabilities:
                score += 12
                reasons.append(f"matches {intent}")
        lat = {"low": 10, "medium": 4, "high": -4}[m.latency_tier]
        score += lat
        if lat > 0:
            reasons.append("fast tier")
        if analysis.char_count > m.context_window * 0.5:
            score -= 15
            reasons.append("context window tight")
        elif m.context_window >= 32000:
            score += 4
            reasons.append("wide context")
        if m.cost_in == 0:
            score += 8
            reasons.append("zero cost")
        elif m.cost_in < 0.5:
            score += 4
            reasons.append("low cost")
        if m.local:
            score += 3
            reasons.append("runs on your machine")
        entries.append({"modelId": m.id, "score": score, "reasons": reasons[:4]})
    entries.sort(key=lambda e: -e["score"])
    return entries


def route(
    models: list[ModelInfo],
    text: str,
    require_local: bool = False,
    force_model: Optional[str] = None,
) -> dict:
    """Request → Task Analysis → Model Ranking → Model. Deterministic."""
    analysis = analyze_request(text, require_local)
    ranking = rank_models(models, analysis, require_local)
    chosen: Optional[ModelInfo] = None
    if force_model:
        chosen = next((m for m in models if m.id == force_model and m.available), None)
        if chosen:
            ranking.insert(0, {"modelId": chosen.id, "score": 100, "reasons": ["pinned by user"]})
    else:
        chosen = next((m for m in models if m.id == (ranking[0]["modelId"] if ranking else None)), None) or (
            next((m for m in models if m.available), None)
        )
    return {
        "analysis": analysis.to_dict(),
        "ranking": ranking[:6],
        "chosen": chosen.to_dict() if chosen else None,
    }


# ---------------------------------------------------------------------------
# RAG primitives (Ingest → Chunk → Embed → Retrieve → Rerank → Cite)
# ---------------------------------------------------------------------------

EMBED_DIM = 384


def fnv1a(s: str) -> int:
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def embed(text: str, dim: int = EMBED_DIM) -> list[float]:
    """Deterministic local hash-embedding (provider-neutral, offline)."""
    v = [0.0] * dim
    tokens = re.findall(r"\w+", text.lower())
    for t in tokens:
        h = fnv1a(t)
        idx = h % dim
        sign = 1.0 if (h >> 8) % 2 == 0 else -1.0
        v[idx] += sign
        h2 = fnv1a(t + "#")
        v[h2 % dim] += 0.5 * (1.0 if (h2 >> 4) % 2 == 0 else -1.0)
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def chunk_text(text: str, doc_id: str, size: int = 420, overlap: int = 90) -> list[dict]:
    """Paragraph-aware chunker with overlap — same contract as the web build."""
    out: list[dict] = []
    paras = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    buf = ""
    heading = doc_id
    for p in paras:
        heading = re.sub(r"^#+\s*", "", p.split("\n", 1)[0]).strip()[:80]
        if buf and len(buf) + len(p) > size:
            buf = buf.strip()
            if buf:
                out.append({"id": f"{doc_id}::c{len(out)}", "docId": doc_id, "heading": heading, "text": buf})
            buf = buf[-max(0, overlap):]
        buf = f"{buf}\n\n{p}" if buf else p
    buf = buf.strip()
    if buf:
        out.append({"id": f"{doc_id}::c{len(out)}", "docId": doc_id, "heading": heading, "text": buf})
    if not out:
        out.append({"id": f"{doc_id}::c0", "docId": doc_id, "heading": doc_id, "text": text[:size]})
    return out


class BM25:
    k1 = 1.5
    b = 0.75

    def __init__(self, docs: list[str]):
        self.docs = docs
        self.tokenized = [re.findall(r"\w+", d.lower()) for d in docs]
        self.df: dict[str, int] = {}
        for toks in self.tokenized:
            for t in set(toks):
                self.df[t] = self.df.get(t, 0) + 1
        self.avgdl = (sum(len(t) for t in self.tokenized) / len(self.tokenized)) if self.tokenized else 0.0

    def scores(self, query: str) -> list[float]:
        q = re.findall(r"\w+", query.lower())
        n = len(self.docs)
        out = [0.0] * n
        if not q or not n:
            return out
        for t in q:
            idf = math.log(1 + (n - self.df.get(t, 0) + 0.5) / (self.df.get(t, 0) + 0.5))
            for i, toks in enumerate(self.tokenized):
                tf = toks.count(t)
                if tf:
                    out[i] += idf * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * len(toks) / (self.avgdl or 1)))
        return out


def retrieve(chunks: list[dict], query: str, k: int = 5) -> list[dict]:
    """Dense 0.55 + BM25 0.45 blend, normalized, reranked descending."""
    if not chunks:
        return []
    qv = embed(query)
    dense = [cosine(qv, embed(c["text"])) for c in chunks]
    bm = BM25([c["text"] for c in chunks]).scores(query)

    def norm(xs: list[float]) -> list[float]:
        lo, hi = min(xs), max(xs)
        span = (hi - lo) or 1.0
        return [(x - lo) / span for x in xs]

    dn, bn = norm(dense), norm(bm)
    hits = []
    for i, c in enumerate(chunks):
        score = 0.55 * max(0.0, dense[i]) + 0.45 * bn[i]
        hits.append({"chunk": c, "score": round(score, 6)})
    hits.sort(key=lambda h: -h["score"])
    return hits[:k]


def grounded_answer(ctx: str, question: str) -> str:
    """Answer strictly from retrieved context; refuse to guess (evidence gate)."""
    q_words = [w for w in re.split(r"\W+", question.lower()) if len(w) > 3]
    ctx_lower = ctx.lower()
    overlap = sum(1 for w in q_words if w in ctx_lower)
    if q_words and overlap / len(q_words) < 0.34:
        return (
            f"I can't verify this from the knowledge base — the retrieved context contains no direct "
            f'evidence about "{question[:80]}", so I won\'t guess.\n\n'
            f"Closest retrieved context: {ctx[:160]}…\n\n"
            "(Local grounded answer — connect a larger model for deeper synthesis.)"
        )
    segs = re.findall(r"\[\d+\]\s*([^\[]+)", ctx)
    top = segs[0].strip()[:400] if segs else ctx[:220]
    out = f'Based on the knowledge base — "{question[:80]}":\n\n{top}'
    if len(segs) > 1:
        out += f"\n\nSupporting context: {segs[1].strip()[:200]} [2]"
    out += "\n\nSources: [1] knowledge base chunk 1" + (", [2] chunk 2" if len(segs) > 1 else "")
    return out


# ---------------------------------------------------------------------------
# Workflows (DAG validation, topological order, n8n export)
# ---------------------------------------------------------------------------

N8N_MAP = {
    "trigger": ("n8n-nodes-base.manualTrigger", 1),
    "ai": ("@n8n/n8n-nodes-langchain.chainLlm", 2),
    "http": ("n8n-nodes-base.httpRequest", 4.2),
    "shell": ("n8n-nodes-base.executeCommand", 1),
    "setVar": ("n8n-nodes-base.set", 3.4),
    "condition": ("n8n-nodes-base.if", 2),
    "approval": ("n8n-nodes-base.wait", 1.1),
    "code": ("n8n-nodes-base.code", 2),
    "notify": ("n8n-nodes-base.respondToWebhook", 1.1),
}


def validate_workflow(wf: dict) -> list[str]:
    errs: list[str] = []
    if not (wf.get("name") or "").strip():
        errs.append("workflow needs a name")
    nodes = wf.get("nodes") or []
    if not nodes:
        errs.append("workflow has no nodes")
    triggers = [n for n in nodes if n.get("type") == "trigger"]
    if len(triggers) == 0:
        errs.append("workflow needs a trigger node")
    if len(triggers) > 1:
        errs.append("only one trigger node is allowed")
    ids = {n["id"] for n in nodes}
    for a, b in wf.get("edges") or []:
        if a not in ids:
            errs.append(f'edge starts at unknown node "{a}"')
        if b not in ids:
            errs.append(f'edge points at unknown node "{b}"')
        if a == b:
            errs.append("self-loops are not allowed")
    indeg = {n["id"]: 0 for n in nodes}
    for a, b in wf.get("edges") or []:
        indeg[b] = indeg.get(b, 0) + 1
    queue = [n["id"] for n in nodes if indeg.get(n["id"], 0) == 0]
    seen = 0
    while queue:
        cur = queue.pop(0)
        seen += 1
        for a, b in wf.get("edges") or []:
            if a == cur:
                indeg[b] -= 1
                if indeg[b] == 0:
                    queue.append(b)
    if seen < len(nodes):
        errs.append("workflow contains a cycle")
    return errs


def topo_order(wf: dict) -> list[str]:
    nodes = wf.get("nodes") or []
    edges = wf.get("edges") or []
    indeg = {n["id"]: 0 for n in nodes}
    for a, b in edges:
        indeg[b] = indeg.get(b, 0) + 1
    queue = [n["id"] for n in nodes if indeg.get(n["id"], 0) == 0]
    out: list[str] = []
    while queue:
        cur = queue.pop(0)
        out.append(cur)
        for a, b in edges:
            if a == cur:
                indeg[b] -= 1
                if indeg[b] == 0:
                    queue.append(b)
    return out


def to_n8n(wf: dict) -> dict:
    nodes = wf.get("nodes") or []
    out_nodes = []
    for i, n in enumerate(nodes):
        ntype, version = N8N_MAP.get(n.get("type", ""), ("n8n-nodes-base.noOp", 1))
        out_nodes.append(
            {
                "id": n["id"],
                "name": n.get("label", n["id"]),
                "type": ntype,
                "typeVersion": version,
                "position": [40 + (i % 3) * 240, 40 + (i // 3) * 180],
                "parameters": dict(n.get("config") or {}),
            }
        )
    connections: dict = {n.get("label", n["id"]): {"main": [[]]} for n in nodes}
    by_id = {n["id"]: n for n in nodes}
    for a, b in wf.get("edges") or []:
        if a in by_id and b in by_id:
            fa, fb = by_id[a].get("label", a), by_id[b].get("label", b)
            connections[fa]["main"][0].append({"node": fb, "type": "main", "index": 0})
    return {
        "name": wf.get("name", "workflow"),
        "nodes": out_nodes,
        "connections": connections,
        "settings": {"executionOrder": "v1"},
        "pinData": {},
    }
