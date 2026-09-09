# SUTRA service API — FastAPI application.
# Local-first, provider-neutral, OTel-compatible. Nothing phones home in local mode.
from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import re
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import __version__
from .config import Settings, load_settings
from .core import (
    assess,
    chunk_text,
    grounded_answer,
    retrieve,
    route,
    scan_for_secrets,
    to_n8n,
    topo_order,
    validate_workflow,
)
from .observability import Tracer
from .providers import (
    LocalProvider,
    OpenAICompatProvider,
    OllamaProvider,
    ProviderError,
    provider_for,
    reachable_local_backends,
)
from .schemas import TaskIn
from .store import JsonStore, default_state, load_models, _uid

SETTINGS: Settings = load_settings()
STORE = JsonStore()
TRACER = Tracer(SETTINGS.service)


# ---------------------------------------------------------------------------
# Privacy guard — never silently upload private data.
# ---------------------------------------------------------------------------

def _is_private_host(host: str) -> bool:
    h = host.lower().split(":")[0]
    if h in ("localhost",) or h.endswith(".local") or h.endswith(".internal"):
        return True
    try:
        ip = ipaddress.ip_address(h)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False


class EgressLog:
    """Every outbound request is classified and recorded. Local mode is strict."""

    def __init__(self, store: JsonStore, settings: Settings):
        self.store = store
        self.settings = settings

    def allow(self, url: str, purpose: str) -> bool:
        host = (urlparse(url).hostname or "")
        state = self.store.load("state", default_state())
        entry = {
            "id": _uid("egress"),
            "ts": time.time(),
            "url": url,
            "purpose": purpose,
            "mode": self.settings.privacy_mode,
            "private": _is_private_host(host),
            "allowed": False,
        }
        if self.settings.is_local:
            entry["allowed"] = _is_private_host(host)
            if not entry["allowed"]:
                entry["note"] = "local mode: egress to non-private host blocked"
        else:
            entry["allowed"] = True
        state["audit"] = (state.get("audit") or [])[-499:] + [entry]
        self.store.save("state", state)
        return entry["allowed"]


EGRESS = EgressLog(STORE, SETTINGS)


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_: FastAPI):
    if not STORE.path("state").exists():
        STORE.save("state", default_state())
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="SUTRA Service API",
        version=__version__,
        description="Local-first AI operating workspace — backend surface. Provider-neutral, OTel-compatible.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=SETTINGS.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def trace_requests(request: Request, call_next):
        span = TRACER.start(f"http {request.method} {request.url.path}", kind="server", method=request.method)
        try:
            response = await call_next(request)
            TRACER.end(span, "ok" if response.status_code < 500 else "error", )
            response.headers["x-trace-id"] = span.trace_id
            return response
        except Exception:
            TRACER.end(span, "error")
            raise

    # ---------------- meta ----------------

    @app.get("/health")
    async def health():
        state = STORE.load("state", default_state())
        return {
            "service": SETTINGS.service,
            "version": __version__,
            "env": SETTINGS.env,
            "privacyMode": SETTINGS.privacy_mode,
            "syncScope": SETTINGS.sync_scope,
            "backends": reachable_local_backends(SETTINGS),
            "documents": len(state.get("documents", [])),
            "tasks": len(state.get("tasks", [])),
            "uptimeNote": "state is local-first; files under SUTRA_DATA_DIR",
        }

    @app.get("/")
    async def root():
        return {
            "service": "SUTRA Service API",
            "docs": "/docs",
            "health": "/health",
            "api": "/api/v1",
        }

    # ---------------- models & routing ----------------

    @app.get("/api/v1/models")
    async def list_models():
        return {"models": [m.to_dict() for m in load_models(STORE)]}

    @app.post("/api/v1/route")
    async def post_route(body: dict):
        text = body.get("text") or body.get("prompt") or ""
        if not text:
            raise HTTPException(422, "text is required")
        d = route(load_models(STORE), text, require_local=bool(body.get("requireLocal")), force_model=body.get("forceModel"))
        return d

    @app.post("/api/v1/chat")
    async def post_chat(request: Request, body: dict):
        messages = body.get("messages") or []
        if not messages or not isinstance(messages, list):
            raise HTTPException(422, "messages[] is required")
        models = load_models(STORE)
        require_local = bool(body.get("requireLocal")) or SETTINGS.is_local

        chosen_id = body.get("modelId")
        if require_local and chosen_id:
            forced = next((m for m in models if m.id == chosen_id), None)
            if forced is not None and not forced.local and provider_for(forced.runtime, SETTINGS, forced) is None:
                raise HTTPException(409, "local mode: that model is not reachable locally; pick a local model or change privacy mode")

        decision = route(models, " ".join(m.get("content", "") for m in messages[-3:]), require_local=require_local, force_model=chosen_id)
        chosen = next((m for m in models if m.id == (decision["chosen"] or {}).get("id")), None)
        provider = provider_for(chosen.runtime, SETTINGS, chosen) if chosen else None
        if provider is None:
            if SETTINGS.is_local:
                raise HTTPException(409, "no reachable provider in local mode — configure Ollama (OLLAMA_URL) or an OpenAI-compatible endpoint")
            provider = LocalProvider(SETTINGS)

        chosen_id = chosen.id if chosen else provider.id
        provider_kind = chosen.runtime if chosen else "sutra-local"

        async def gen():
            span = TRACER.start("chat.stream", parent=None, kind="client", model=chosen_id)
            sent_header = False
            out: list[str] = []
            try:
                yield f"event: route\ndata: {json.dumps({'model': chosen_id, 'runtime': provider_kind, 'reasons': decision['ranking'][0]['reasons'] if decision['ranking'] else []})}\n\n"
                sent_header = True
                async for delta in provider.chat_stream(messages, float(body.get("temperature", 0.7)), int(body.get("maxTokens", 1024))):
                    out.append(delta)
                    yield f"data: {json.dumps({'text': delta})}\n\n"
                yield f"data: {json.dumps({'done': True, 'model': chosen_id, 'chars': len(''.join(out))})}\n\n"
                TRACER.end(span, "ok")
            except ProviderError as e:
                TRACER.end(span, "error")
                if not sent_header:
                    raise HTTPException(502, str(e))
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            except Exception as e:  # noqa: BLE001
                TRACER.end(span, "error")
                if not sent_header:
                    raise HTTPException(502, str(e))
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return StreamingResponse(gen(), media_type="text/event-stream")

    @app.post("/api/v1/models/{model_id}/ping")
    async def ping_model(model_id: str):
        models = load_models(STORE)
        m = next((x for x in models if x.id == model_id), None)
        if m is None:
            raise HTTPException(404, "unknown model")
        provider = provider_for(m.runtime, SETTINGS, m)
        if provider is None:
            return {"ok": False, "latencyMs": 0, "detail": "no browser/service adapter configured for this runtime"}
        return await provider.ping()

    # ---------------- RAG ----------------

    @app.post("/api/v1/rag/ingest")
    async def rag_ingest(body: dict):
        title = (body.get("title") or "Untitled").strip()
        text = body.get("text") or ""
        if not text.strip():
            raise HTTPException(422, "text is required")
        source = body.get("source", "api")
        doc_id = _uid("doc")
        chunks = chunk_text(text, doc_id)
        state = STORE.load("state", default_state())
        state["documents"] = [
            {"id": doc_id, "title": title, "source": source, "kind": "text", "createdAt": time.time(), "chars": len(text), "chunkCount": len(chunks)},
            *state.get("documents", []),
        ]
        state["chunks"] = [*state.get("chunks", []), *chunks]
        STORE.save("state", state)
        return {"doc": state["documents"][0], "chunks": len(chunks)}

    @app.get("/api/v1/rag/documents")
    async def rag_documents():
        state = STORE.load("state", default_state())
        return {"documents": state.get("documents", [])}

    @app.post("/api/v1/rag/query")
    async def rag_query(body: dict):
        query = body.get("query") or body.get("q") or ""
        if not query.strip():
            raise HTTPException(422, "query is required")
        k = int(body.get("k", 5))
        state = STORE.load("state", default_state())
        chunks = state.get("chunks", [])
        hits = retrieve(chunks, query, k)
        ctx = "\n\n".join(f"[{i + 1}] ({h['chunk']['heading']}) {h['chunk']['text']}" for i, h in enumerate(hits))
        answer = grounded_answer(ctx, query) if hits else "The knowledge base is empty — ingest a document first (POST /api/v1/rag/ingest)."
        return {
            "answer": answer,
            "model": "sutra-local (grounded)",
            "hits": [
                {"score": h["score"], "chunk": {kk: h["chunk"][kk] for kk in ("id", "docId", "heading", "text")}} for h in hits
            ],
        }

    # ---------------- security ----------------

    @app.post("/api/v1/security/assess")
    async def security_assess(body: dict):
        category = body.get("category") or "terminal.exec"
        detail = body.get("detail") or ""
        return assess(category, detail).to_dict()

    @app.post("/api/v1/security/scan")
    async def security_scan(body: dict):
        text = body.get("text") or ""
        findings = scan_for_secrets(text)
        return {"findings": findings, "clean": not findings, "note": "findings contain location + kind only — never the secret"}

    # ---------------- workflows ----------------

    @app.post("/api/v1/workflows/validate")
    async def wf_validate(body: dict):
        wf = body.get("workflow") or body
        return {"errors": validate_workflow(wf), "valid": not validate_workflow(wf)}

    @app.post("/api/v1/workflows/topo")
    async def wf_topo(body: dict):
        wf = body.get("workflow") or body
        return {"order": topo_order(wf)}

    @app.post("/api/v1/workflows/n8n")
    async def wf_n8n(body: dict):
        wf = body.get("workflow") or body
        errs = validate_workflow(wf)
        if errs:
            raise HTTPException(422, {"errors": errs})
        return to_n8n(wf)

    # ---------------- tasks ----------------

    @app.get("/api/v1/tasks")
    async def tasks_list(status: Optional[str] = None):
        state = STORE.load("state", default_state())
        tasks = state.get("tasks", [])
        if status:
            tasks = [t for t in tasks if t.get("status") == status]
        return {"tasks": tasks}

    @app.post("/api/v1/tasks", status_code=201)
    async def tasks_create(body: TaskIn):
        state = STORE.load("state", default_state())
        task = {
            "id": _uid("task"),
            **body.model_dump(),
            "status": "todo",
            "archived": False,
            "order": len(state.get("tasks", [])),
            "createdAt": time.time(),
        }
        if task["priority"] not in ("p0", "p1", "p2", "p3"):
            raise HTTPException(422, "priority must be p0..p3")
        state["tasks"] = [task, *state.get("tasks", [])]
        STORE.save("state", state)
        return task

    @app.patch("/api/v1/tasks/{task_id}")
    async def tasks_update(task_id: str, body: dict):
        state = STORE.load("state", default_state())
        tasks = state.get("tasks", [])
        for i, t in enumerate(tasks):
            if t["id"] == task_id:
                allowed = {"title", "description", "priority", "category", "tags", "due", "assignee", "status", "archived", "order"}
                for k, v in body.items():
                    if k in allowed:
                        if k == "priority" and v not in ("p0", "p1", "p2", "p3"):
                            raise HTTPException(422, "priority must be p0..p3")
                        tasks[i][k] = v
                break
        else:
            raise HTTPException(404, "task not found")
        STORE.save("state", state)
        return tasks[i]

    @app.delete("/api/v1/tasks/{task_id}", status_code=204)
    async def tasks_delete(task_id: str):
        state = STORE.load("state", default_state())
        tasks = state.get("tasks", [])
        state["tasks"] = [t for t in tasks if t["id"] != task_id]
        STORE.save("state", state)
        return None

    # ---------------- deployment ----------------

    @app.post("/api/v1/deploy/local", status_code=201)
    async def deploy_local(body: dict):
        name = body.get("name") or "workspace"
        files: dict[str, str] = body.get("files") or {}
        if not files:
            raise HTTPException(422, "files map is required")
        span = TRACER.start(f"deploy {name}", kind="internal")
        # 1) pre-deploy secret scan — a bundle with secrets never ships
        findings = []
        for path, content in files.items():
            for f in scan_for_secrets(content):
                findings.append({**f, "file": path})
        if findings:
            TRACER.end(span, "error")
            raise HTTPException(409, {"reason": "secrets_detected", "findings": findings[:10]})
        # 2) bundle manifest
        digest = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()[:16]
        deploy_id = _uid("dep")
        manifest = {
            "id": deploy_id,
            "name": name,
            "target": "local",
            "createdAt": time.time(),
            "files": {p: {"chars": len(c), "sha256_8": hashlib.sha256(c.encode()).hexdigest()[:8]} for p, c in files.items()},
            "bundleHash": digest,
            "secretScan": "clean",
            "status": "success",
        }
        # 3) persist bundle
        state = STORE.load("state", default_state())
        state["deployments"] = [manifest, *state.get("deployments", [])][:50]
        STORE.save("state", state)
        STORE.save(f"bundle-{deploy_id}", {"manifest": manifest, "files": files})
        TRACER.end(span, "ok")
        return manifest

    @app.get("/api/v1/deployments")
    async def deployments_list():
        state = STORE.load("state", default_state())
        return {"deployments": state.get("deployments", [])}

    # ---------------- observability ----------------

    @app.get("/api/v1/traces")
    async def traces(limit: int = 100):
        return {"document": TRACER.resource_spans(), "spans": len(TRACER.spans), "limit": limit}

    @app.get("/api/v1/audit")
    async def audit(limit: int = 50):
        state = STORE.load("state", default_state())
        return {"events": (state.get("audit") or [])[-limit:]}

    return app


app = create_app()
