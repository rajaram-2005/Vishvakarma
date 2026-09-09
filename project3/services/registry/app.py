# SUTRA registry service — skills, plugins, workflows, MCP servers.
# Manifest-first: nothing installs without a validated manifest + declared scopes.
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException

DATA = Path(__file__).parent / "data"
DATA.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="SUTRA Registry", version="0.1.0")

VALID_SCOPES = {"fs.read", "fs.write", "fs.delete", "terminal.exec", "network.request", "db", "secrets", "deploy", "memory.write", "browser"}


def _load() -> dict:
    p = DATA / "registry.json"
    return json.loads(p.read_text()) if p.exists() else {"items": {}}


def _save(state: dict) -> None:
    (DATA / "registry.json").write_text(json.dumps(state, indent=2))


def validate_manifest(m: dict) -> list[str]:
    errs = []
    if not m.get("id", "").strip():
        errs.append("id required")
    if not m.get("name", "").strip():
        errs.append("name required")
    if not m.get("version"):
        errs.append("version required (semver)")
    if not m.get("entry"):
        errs.append("entry point required")
    if not m.get("license"):
        errs.append("license required")
    for sc in m.get("scopes", []):
        if sc not in VALID_SCOPES:
            errs.append(f"unknown scope: {sc}")
    return errs


@app.get("/items")
async def items(kind: str | None = None):
    state = _load()
    out = list(state["items"].values())
    if kind:
        out = [i for i in out if i["kind"] == kind]
    return {"items": out}


@app.post("/items", status_code=201)
async def publish(body: dict):
    kind = body.get("kind")
    if kind not in ("skill", "plugin", "workflow", "mcp", "model"):
        raise HTTPException(422, "kind must be skill|plugin|workflow|mcp|model")
    manifest = body.get("manifest") or body
    errs = validate_manifest(manifest)
    if errs:
        raise HTTPException(422, {"errors": errs})
    item = {
        "id": manifest["id"],
        "kind": kind,
        "name": manifest["name"],
        "version": manifest["version"],
        "author": manifest.get("author", "anonymous"),
        "license": manifest["license"],
        "scopes": list(manifest.get("scopes", [])),
        "entry": manifest.get("entry", "-"),
        "publishedAt": time.time(),
    }
    state = _load()
    state["items"][item["id"]] = item
    _save(state)
    return item


@app.delete("/items/{item_id}", status_code=204)
async def remove(item_id: str):
    state = _load()
    if item_id not in state["items"]:
        raise HTTPException(404, "not found")
    del state["items"][item_id]
    _save(state)
    return None


@app.post("/validate")
async def validate(body: dict):
    errs = validate_manifest(body.get("manifest") or body)
    return {"valid": not errs, "errors": errs, "scopes": (body.get("manifest") or body).get("scopes", [])}


@app.get("/health")
async def health():
    return {"service": "sutra-registry", "version": "0.1.0", "items": len(_load()["items"])}
