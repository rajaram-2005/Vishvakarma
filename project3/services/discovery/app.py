# SUTRA discovery service — finds local runtimes, MCP servers and peers.
# Health checks are read-only and privacy-aware: local mode only probes private hosts.
from __future__ import annotations

import asyncio
import ipaddress
import os
import time
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI

app = FastAPI(title="SUTRA Discovery", version="0.1.0")

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "")

MCP_SERVERS = [
    {"id": "mcp-local-fs", "name": "Local Filesystem", "transport": "stdio", "command": "npx @sutra/mcp-fs", "tools": ["read_file", "write_file", "list_dir"], "scopes": ["fs.read", "fs.write"], "version": "0.4.0"},
    {"id": "mcp-github", "name": "GitHub", "transport": "stdio", "command": "npx @modelcontextprotocol/server-github", "tools": ["list_repos", "search_code", "create_issue"], "scopes": ["network.request"], "version": "1.2.0"},
    {"id": "mcp-postgres", "name": "PostgreSQL", "transport": "stdio", "command": "npx @modelcontextprotocol/server-postgres", "tools": ["query", "list_tables"], "scopes": ["db"], "version": "0.9.0"},
    {"id": "mcp-fetch", "name": "Web Fetch", "transport": "http", "url": "http://localhost:3001/mcp", "tools": ["fetch"], "scopes": ["network.request"], "version": "0.3.0"},
]


def _private(host: str) -> bool:
    h = (host or "").lower().split(":")[0]
    if h in ("localhost",) or h.endswith(".local") or h.endswith(".internal"):
        return True
    try:
        return ipaddress.ip_address(h).is_private
    except ValueError:
        return False


async def _probe(url: str) -> dict:
    host = urlparse(url).hostname or ""
    if not host:
        return {"ok": False, "latencyMs": 0, "detail": "no host"}
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(url)
        ms = int((time.time() - t0) * 1000)
        return {"ok": r.status_code < 500, "latencyMs": ms, "detail": f"HTTP {r.status_code}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "latencyMs": int((time.time() - t0) * 1000), "detail": str(e)[:120]}


@app.get("/runtimes")
async def runtimes():
    ollama = await _probe(f"{OLLAMA_URL.rstrip('/')}/api/tags")
    openai = await _probe(f"{OPENAI_BASE_URL.rstrip('/')}/models") if OPENAI_BASE_URL else {"ok": False, "latencyMs": 0, "detail": "not configured"}
    return {
        "runtimes": [
            {"id": "sutra-local", "name": "SUTRA Local (in-process)", "ok": True, "latencyMs": 0, "detail": "always available"},
            {"id": "ollama", "name": "Ollama", "url": OLLAMA_URL, **ollama},
            {"id": "openai-compat", "name": "OpenAI-compatible (vLLM/LM Studio/SGLang)", "url": OPENAI_BASE_URL or None, **openai},
        ]
    }


@app.get("/mcp")
async def mcp():
    return {"servers": MCP_SERVERS}


@app.post("/mcp/{server_id}/health")
async def mcp_health(server_id: str):
    s = next((x for x in MCP_SERVERS if x["id"] == server_id), None)
    if s is None:
        from fastapi import HTTPException

        raise HTTPException(404, "unknown mcp server")
    if s["transport"] == "http" and s.get("url"):
        host = urlparse(s["url"]).hostname or ""
        if not _private(host):
            return {"ok": False, "detail": "refused: non-private host (local privacy mode)"}
        return {"server": server_id, **await _probe(s["url"])}
    return {"server": server_id, "ok": False, "detail": "stdio transport requires the desktop runtime (services/discovery probes HTTP targets only)"}


@app.get("/health")
async def health():
    return {"service": "sutra-discovery", "version": "0.1.0", "mcpServers": len(MCP_SERVERS)}
