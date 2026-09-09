# SUTRA service API — provider-neutral chat adapters.
# Local: deterministic grounded responder (offline, always available).
# Ollama / OpenAI-compatible: real streaming proxies to a runtime you control.
from __future__ import annotations

import asyncio
import json
import re
from typing import AsyncIterator, Optional

import httpx

from .config import Settings
from .core import ModelInfo, grounded_answer

MAX_STREAM = 4096


class ProviderError(RuntimeError):
    pass


def reachable_local_backends(settings: Settings) -> list[str]:
    """Which real backends are configured for this process (local mode may use local runtimes)."""
    out: list[str] = []
    if settings.ollama_url.strip():
        out.append("ollama")
    if settings.openai_base_url.strip() and settings.openai_api_key.strip():
        out.append("openai-compat")
    return out


async def _stream_sse(client: httpx.AsyncClient, url: str, payload: dict, headers: Optional[dict] = None):
    """Yield text deltas from an SSE stream, tolerant of both data: and raw lines."""
    async with client.stream("POST", url, json=payload, headers=headers or {}) as resp:
        if resp.status_code >= 400:
            body = (await resp.aread()).decode("utf-8", "replace")[:200]
            raise ProviderError(f"upstream {resp.status_code}: {body}")
        buf = ""
        async for piece in resp.aiter_text():
            buf += piece
            let = "\n"
            while let in buf:
                i = buf.index(let)
                line, buf = buf[:i], buf[i + 1 :]
                line = line.strip()
                if not line:
                    continue
                if line.startswith("data:"):
                    line = line[5:].strip()
                if line == "[DONE]":
                    return
                try:
                    j = json.loads(line)
                except json.JSONDecodeError:
                    # some runtimes (ollama NDJSON) have no SSE prefix — handled in caller
                    continue
                delta = None
                if isinstance(j, dict):
                    if isinstance(j.get("choices"), list) and j["choices"]:
                        delta = j["choices"][0].get("delta", {}).get("content")
                    elif isinstance(j.get("message"), dict):
                        delta = j["message"].get("content")
                if delta:
                    yield delta


class BaseProvider:
    id: str = "base"
    name: str = "base"

    def __init__(self, settings: Settings, model: ModelInfo):
        self.settings = settings
        self.model = model

    async def ping(self) -> dict:
        raise NotImplementedError

    async def chat_stream(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 1024) -> AsyncIterator[str]:
        raise NotImplementedError
        yield  # pragma: no cover


class LocalProvider(BaseProvider):
    """SUTRA Local — offline, deterministic, grounded. No network, ever."""

    id = "sutra-local"

    def __init__(self, settings: Settings, model: Optional[ModelInfo] = None):
        super().__init__(
            settings,
            model or ModelInfo(id="sutra-local", name="SUTRA Local", runtime="sutra-local", capabilities=["code", "structured"]),
        )

    @property
    def name(self) -> str:
        return "SUTRA Local"

    async def ping(self) -> dict:
        return {"ok": True, "latencyMs": 0, "detail": "local responder — always available"}

    async def chat_stream(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 1024) -> AsyncIterator[str]:
        system = next((m["content"] for m in messages if m["role"] == "system"), "")
        user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        text = _local_reply(system, user)
        for word in re.findall(r"\S+\s*", text)[:220]:
            yield word
            await asyncio.sleep(0)


def _local_reply(system: str, user: str) -> str:
    if system.startswith("Answer the question using ONLY the context"):
        return grounded_answer(system, user)
    if re.search(r"\bplan\b|\bmvp\b", user, re.I):
        return (
            f"# {user[:60]} — SUTRA Local plan\n\n"
            "**Phase 0 · Clarity (day 0–1)**\n- One-paragraph definition + success metric\n\n"
            "**Phase 1 · Skeleton (day 1–3)**\n- Repo scaffold, CI, local-first data layer\n\n"
            "**Phase 2 · Core loop (day 3–7)**\n- Chat + router, tasks, RAG, agents with gateway\n\n"
            "**Phase 3 · Prove it (day 7–10)**\n- Evaluation suite, observability, docs, deploy\n\n"
            "(Local plan — connect a larger model for deeper synthesis.)"
        )
    return (
        f"I'm SUTRA Local — the offline responder. I answered from context when you asked against the "
        f"knowledge base, and I can plan, structure, or scaffold locally. Your question: \"{user[:120]}\". "
        "Connect a larger model in Settings (Ollama or an OpenAI-compatible endpoint) and I will hand off with full context."
    )


class OllamaProvider(BaseProvider):
    id = "ollama"

    @property
    def name(self) -> str:
        return f"Ollama · {self.model.id}"

    def _base(self) -> str:
        return self.settings.ollama_url.rstrip("/")

    async def ping(self) -> dict:
        t0 = asyncio.get_event_loop().time()
        try:
            async with httpx.AsyncClient(timeout=4) as client:
                r = await client.get(f"{self._base()}/api/tags")
            ms = int((asyncio.get_event_loop().time() - t0) * 1000)
            if r.status_code >= 400:
                return {"ok": False, "latencyMs": ms, "detail": f"HTTP {r.status_code}"}
            data = r.json()
            n = len(data.get("models", []))
            return {"ok": True, "latencyMs": ms, "detail": f"{n} model(s) installed"}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "latencyMs": 0, "detail": str(e)}

    async def chat_stream(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 1024) -> AsyncIterator[str]:
        url = f"{self._base()}/api/chat"
        payload = {"model": self.model.id, "messages": messages, "stream": True, "options": {"temperature": temperature}}
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", url, json=payload) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", "replace")[:200]
                    raise ProviderError(f"ollama {resp.status_code}: {body}")
                buf = ""
                async for piece in resp.aiter_text():
                    buf += piece
                    while "\n" in buf:
                        line, buf = buf.split("\n", 1)
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            j = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        content = (j.get("message") or {}).get("content")
                        if content:
                            yield content
                        if j.get("done"):
                            return


class OpenAICompatProvider(BaseProvider):
    id = "openai-compat"

    @property
    def name(self) -> str:
        return f"API · {self.model.id}"

    def _base(self) -> str:
        return self.settings.openai_base_url.rstrip("/")

    def _headers(self) -> dict:
        return {"content-type": "application/json", "authorization": f"Bearer {self.settings.openai_api_key}"}

    async def ping(self) -> dict:
        t0 = asyncio.get_event_loop().time()
        try:
            async with httpx.AsyncClient(timeout=4) as client:
                r = await client.get(f"{self._base()}/models", headers=self._headers())
            ms = int((asyncio.get_event_loop().time() - t0) * 1000)
            return {"ok": r.status_code < 400, "latencyMs": ms, "detail": "endpoint reachable" if r.status_code < 400 else f"HTTP {r.status_code}"}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "latencyMs": 0, "detail": str(e)}

    async def chat_stream(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 1024) -> AsyncIterator[str]:
        url = f"{self._base()}/chat/completions"
        payload = {
            "model": self.model.id,
            "messages": messages,
            "stream": True,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async for delta in _stream_sse(httpx.AsyncClient(timeout=120), url, payload, self._headers()):
            yield delta


def provider_for(runtime: str, settings: Settings, model: ModelInfo) -> BaseProvider | None:
    if runtime == "sutra-local":
        return LocalProvider(settings, model)
    if runtime == "ollama" and settings.ollama_url.strip():
        return OllamaProvider(settings, model)
    if runtime in ("openai-compat", "vllm", "sglang", "llamacpp") and settings.openai_base_url.strip() and settings.openai_api_key.strip():
        return OpenAICompatProvider(settings, model)
    return None
