# Aetherion security service — policy, approvals, session grants, audit.
# Agent → Tool Gateway → Policy → Sandbox → Execution. Never silently: anything
# dangerous is routed to a human (Allow Once / Allow Session / Inspect).
from __future__ import annotations

import json
import re
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException

DATA = Path(__file__).parent / "data"
DATA.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Aetherion Security", version="0.1.0")

POLICY = [
    {"category": "fs.read", "risk": "low", "requiresApproval": False},
    {"category": "fs.write", "risk": "low", "requiresApproval": False},
    {"category": "fs.delete", "risk": "high", "requiresApproval": True},
    {"category": "terminal.exec", "risk": "medium", "requiresApproval": True},
    {"category": "network.request", "risk": "medium", "requiresApproval": True},
    {"category": "secret.read", "risk": "critical", "requiresApproval": True},
    {"category": "git.push", "risk": "medium", "requiresApproval": True},
    {"category": "db.write", "risk": "high", "requiresApproval": True},
    {"category": "browser.action", "risk": "medium", "requiresApproval": False},
    {"category": "code.exec", "risk": "high", "requiresApproval": True},
    {"category": "computer.use", "risk": "high", "requiresApproval": True},
    {"category": "deploy", "risk": "critical", "requiresApproval": True},
]

DANGEROUS = [
    (re.compile(r"\brm\s+(-[a-z]*[rf][a-z]*\s+)+", re.I), "recursive delete"),
    (re.compile(r"\bsudo\b", re.I), "privilege escalation"),
    (re.compile(r"\bmkfs\b|\bdd\s+if=", re.I), "disk-level write"),
    (re.compile(r"\bchmod\s+(-R\s+)?777\b", re.I), "world-writable permissions"),
    (re.compile(r":\s*\(\)\s*\{.*\|.*&\s*\}"), "fork bomb pattern"),
    (re.compile(r"\bcurl\b[^\n|]*\|\s*(ba|z)?sh", re.I), "remote script piped to shell"),
    (re.compile(r"\bwget\b[^\n|]*\|\s*(ba|z)?sh", re.I), "remote script piped to shell"),
    (re.compile(r"\bgit\s+push\b[^\n]*--force\b|\bgit\s+push\b[^\n]*\s-f\b", re.I), "force push"),
    (re.compile(r"\bDROP\s+(TABLE|DATABASE|SCHEMA)\b", re.I), "destructive SQL"),
    (re.compile(r"/etc/(passwd|shadow)", re.I), "credential file access"),
]

SECRETS = [
    (re.compile(r"sk-[a-zA-Z0-9]{16,}"), "OpenAI-style API key"),
    (re.compile(r"ghp_[a-zA-Z0-9]{20,}"), "GitHub personal access token"),
    (re.compile(r"xox[baprs]-[a-zA-Z0-9-]{10,}"), "Slack token"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS access key id"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "private key block"),
]


def _load() -> dict:
    p = DATA / "security.json"
    return json.loads(p.read_text()) if p.exists() else {"approvals": [], "session": {}, "audit": []}


def _save(state: dict) -> None:
    (DATA / "security.json").write_text(json.dumps(state, indent=2))


def assess(category: str, detail: str = "") -> dict:
    rule = next((p for p in POLICY if p["category"] == category), {"category": category, "risk": "medium", "requiresApproval": True})
    risk, reasons = rule["risk"], [f"{category}: baseline {rule['risk']}"]
    if detail:
        for rx, why in DANGEROUS:
            if rx.search(detail):
                risk, reasons = "critical", reasons + [f"signature: {why}"]
                break
    return {
        "risk": risk,
        "requiresApproval": rule["requiresApproval"] or risk in ("high", "critical"),
        "reasons": reasons,
        "category": category,
    }


@app.get("/policy")
async def policy():
    return {"policy": POLICY}


@app.post("/assess")
async def post_assess(body: dict):
    return assess(body.get("category", "terminal.exec"), body.get("detail", ""))


@app.post("/scan")
async def scan(body: dict):
    findings = []
    for i, line in enumerate((body.get("text") or "").splitlines(), start=1):
        for rx, kind in SECRETS:
            if rx.search(line):
                findings.append({"line": i, "kind": kind})
    return {"findings": findings, "clean": not findings, "note": "location + kind only — never the secret"}


@app.post("/approvals", status_code=201)
async def request_approval(body: dict):
    a = assess(body.get("category", "terminal.exec"), body.get("detail", ""))
    ap = {
        "id": f"ap_{uuid.uuid4().hex[:10]}",
        "source": body.get("source", "agent"),
        "action": (body.get("detail") or "")[:120],
        "category": body.get("category", "terminal.exec"),
        "risk": a["risk"],
        "reasons": a["reasons"],
        "status": "pending",
        "createdAt": time.time(),
    }
    state = _load()
    state["approvals"] = [ap, *state["approvals"]][:200]
    _save(state)
    return ap


@app.post("/approvals/{ap_id}/resolve")
async def resolve(ap_id: str, body: dict):
    decision = body.get("decision")
    if decision not in ("once", "session", "deny", "inspect"):
        raise HTTPException(422, "decision must be once|session|deny|inspect")
    state = _load()
    ap = next((a for a in state["approvals"] if a["id"] == ap_id), None)
    if ap is None:
        raise HTTPException(404, "not found")
    if ap["status"] != "pending":
        raise HTTPException(409, "already resolved")
    ap["status"] = "approved" if decision in ("once", "session", "inspect") else "denied"
    ap["decision"] = decision
    ap["resolvedAt"] = time.time()
    if decision == "session" and ap.get("category"):
        state["session"].setdefault(ap["category"], time.time())
    state["audit"] = (state.get("audit") or [])[-499:] + [
        {"id": f"ev_{uuid.uuid4().hex[:10]}", "ts": time.time(), "event": "approval", "approvalId": ap_id, "decision": decision, "risk": ap["risk"]}
    ]
    _save(state)
    return ap


@app.get("/approvals")
async def approvals(status: str | None = None):
    out = _load()["approvals"]
    if status:
        out = [a for a in out if a["status"] == status]
    return {"approvals": out}


@app.get("/session")
async def session():
    return {"session": _load().get("session", {})}


@app.delete("/session/{category}", status_code=204)
async def revoke_session(category: str):
    state = _load()
    state["session"].pop(category, None)
    _save(state)
    return None


@app.get("/audit")
async def audit(limit: int = 50):
    return {"events": _load().get("audit", [])[-limit:]}


@app.get("/health")
async def health():
    s = _load()
    return {"service": "sutra-security", "version": "0.1.0", "pending": sum(1 for a in s["approvals"] if a["status"] == "pending")}
