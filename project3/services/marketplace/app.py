# SUTRA marketplace service — catalog + scope-reviewed installs into the local registry.
from __future__ import annotations

import json
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException

DATA = Path(__file__).parent / "data"
DATA.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="SUTRA Marketplace", version="0.1.0")

CATALOG = [
    {"id": "cat-rag-tuning", "kind": "skill", "name": "RAG Tuning", "version": "1.0.0", "author": "SUTRA", "license": "MIT", "scopes": ["fs.read"], "description": "Chunk sizes, overlap, rerank blends and citation formats for grounded answers."},
    {"id": "cat-data-pipeline", "kind": "skill", "name": "Data Pipeline", "version": "0.9.2", "author": "SUTRA", "license": "MIT", "scopes": ["db", "network.request"], "description": "Source → normalize → validate → store, with idempotent steps."},
    {"id": "cat-sentry-mcp", "kind": "mcp", "name": "Sentry MCP", "version": "0.5.1", "author": "sentry", "license": "MIT", "scopes": ["network.request"], "description": "Issues, alerts and release health over MCP."},
    {"id": "cat-github-mcp", "kind": "mcp", "name": "GitHub MCP", "version": "1.2.0", "author": "modelcontextprotocol", "license": "MIT", "scopes": ["network.request"], "description": "Repos, code search, issues and PRs over MCP."},
    {"id": "cat-oncall-workflow", "kind": "workflow", "name": "On-call Digest", "version": "1.0.0", "author": "SUTRA", "license": "MIT", "scopes": ["network.request"], "description": "Daily 09:00: gather incidents → summarize → human review → post digest."},
    {"id": "cat-linear-bridge", "kind": "plugin", "name": "Linear Bridge", "version": "0.3.0", "author": "sutra-community", "license": "MIT", "scopes": ["network.request", "memory.write"], "description": "Sync tasks with a Linear team via API."},
]

VALID_SCOPES = {"fs.read", "fs.write", "fs.delete", "terminal.exec", "network.request", "db", "secrets", "deploy", "memory.write", "browser"}


def _load() -> dict:
    p = DATA / "installs.json"
    return json.loads(p.read_text()) if p.exists() else {"installed": []}


def _save(state: dict) -> None:
    (DATA / "installs.json").write_text(json.dumps(state, indent=2))


@app.get("/catalog")
async def catalog(kind: str | None = None):
    items = CATALOG
    if kind:
        items = [c for c in CATALOG if c["kind"] == kind]
    installed = {i["id"] for i in _load()["installed"]}
    return {"items": [{**c, "installed": c["id"] in installed} for c in items]}


@app.post("/install/{item_id}", status_code=201)
async def install(item_id: str, body: dict):
    item = next((c for c in CATALOG if c["id"] == item_id), None)
    if item is None:
        raise HTTPException(404, "not in catalog")
    asked = list(item.get("scopes", []))
    for sc in asked:
        if sc not in VALID_SCOPES:
            raise HTTPException(422, f"unknown scope {sc} — catalog item quarantined")
    granted_raw = body.get("grantedScopes")
    if asked and granted_raw is None:
        # scopes can never be silently implied — every scope must be granted explicitly
        raise HTTPException(409, {"reason": "scopes_not_granted", "missing": sorted(asked), "note": "install again with grantedScopes — every scope must be explicit"})
    granted = sorted(set(asked) & set(granted_raw or []))
    missing = set(asked) - set(granted)
    if missing:
        raise HTTPException(409, {"reason": "scopes_not_granted", "missing": sorted(missing), "note": "install again with grantedScopes — every scope must be explicit"})
    state = _load()
    state["installed"] = [i for i in state["installed"] if i["id"] != item_id] + [
        {"id": item["id"], "kind": item["kind"], "name": item["name"], "version": item["version"], "scopes": granted, "installedAt": time.time()}
    ]
    _save(state)
    return state["installed"][-1]


@app.delete("/install/{item_id}", status_code=204)
async def uninstall(item_id: str):
    state = _load()
    before = len(state["installed"])
    state["installed"] = [i for i in state["installed"] if i["id"] != item_id]
    if len(state["installed"]) == before:
        raise HTTPException(404, "not installed")
    _save(state)
    return None


@app.get("/installed")
async def installed():
    return {"installed": _load()["installed"]}


@app.get("/health")
async def health():
    return {"service": "sutra-marketplace", "version": "0.1.0", "catalog": len(CATALOG)}
