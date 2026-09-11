# Aetherion auth service — local-first identity.
# HS256 tokens (stdlib only), JSON persistence, session revocation. No external IdP required.
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request

DATA = Path(os.environ.get("Aetherion_DATA_DIR", Path(__file__).parent / "data"))
DATA.mkdir(parents=True, exist_ok=True)
SECRET = os.environ.get("Aetherion_AUTH_SECRET", "sutra-local-dev-secret-change-me").encode()
PEPPER = os.environ.get("Aetherion_AUTH_PEPPER", "sutra-pepper").encode()

app = FastAPI(title="Aetherion Auth", version="0.1.0")


def _store() -> dict:
    p = DATA / "auth.json"
    if p.exists():
        return json.loads(p.read_text())
    return {"users": {}, "sessions": {}}


def _save(state: dict) -> None:
    (DATA / "auth.json").write_text(json.dumps(state, indent=2))


def _hash_password(pw: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), PEPPER, 60_000).hex()


def _issue_token(user_id: str, ttl: int = 3600 * 24) -> tuple[str, str]:
    session_id = uuid.uuid4().hex[:12]
    exp = int(time.time()) + ttl
    payload = json.dumps({"sub": user_id, "sid": session_id, "exp": exp}).encode()
    sig = hmac.new(SECRET, payload, hashlib.sha256).hexdigest()
    token = f"{payload.decode()}.{sig}"
    return token, session_id


def _verify_token(token: str) -> dict:
    try:
        payload_b64, sig = token.rsplit(".", 1)
        payload = payload_b64.encode()
    except ValueError:
        raise HTTPException(401, "malformed token")
    if not hmac.compare_digest(sig, hmac.new(SECRET, payload, hashlib.sha256).hexdigest()):
        raise HTTPException(401, "bad signature")
    claims = json.loads(payload)
    if claims.get("exp", 0) < time.time():
        raise HTTPException(401, "token expired")
    state = _store()
    if claims.get("sid") not in state["sessions"]:
        raise HTTPException(401, "session revoked")
    return claims


@app.post("/users", status_code=201)
async def register(body: dict):
    email = (body.get("email") or "").strip().lower()
    name = body.get("name") or email.split("@")[0]
    password = body.get("password") or ""
    if "@" not in email or len(password) < 8:
        raise HTTPException(422, "email and password (min 8 chars) required")
    state = _store()
    if email in state["users"]:
        raise HTTPException(409, "user exists")
    state["users"][email] = {"id": f"u_{uuid.uuid4().hex[:10]}", "name": name, "hash": _hash_password(password), "createdAt": time.time()}
    _save(state)
    token, sid = _issue_token(state["users"][email]["id"])
    state["sessions"][sid] = {"userId": state["users"][email]["id"], "createdAt": time.time()}
    _save(state)
    return {"id": state["users"][email]["id"], "email": email, "token": token}


@app.post("/login")
async def login(body: dict):
    email = (body.get("email") or "").strip().lower()
    state = _store()
    user = state["users"].get(email)
    if not user or user["hash"] != _hash_password(body.get("password") or ""):
        raise HTTPException(401, "invalid credentials")
    token, sid = _issue_token(user["id"])
    state["sessions"][sid] = {"userId": user["id"], "createdAt": time.time()}
    _save(state)
    return {"id": user["id"], "email": email, "token": token}


@app.get("/me")
async def me(request: Request):
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "missing bearer token")
    claims = _verify_token(auth[7:])
    state = _store()
    user = next((u for u in state["users"].values() if u["id"] == claims["sub"]), None)
    return {"id": user["id"], "name": user["name"], "email": next(k for k, v in state["users"].items() if v["id"] == user["id"])}


@app.delete("/sessions/current", status_code=204)
async def logout(request: Request):
    auth = request.headers.get("authorization", "")
    claims = _verify_token(auth[7:])
    state = _store()
    state["sessions"].pop(claims.get("sid"), None)
    _save(state)
    return None


@app.get("/health")
async def health():
    return {"service": "sutra-auth", "version": "0.1.0", "users": len(_store()["users"])}
