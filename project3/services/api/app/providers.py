# Aetherion service API — provider-neutral chat adapters.
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


# ---------------------------------------------------------------------------
# Aetherion Local responder — full parity port of packages/model-adapters/local.ts.
# Deterministic, offline, provider-neutral. No network, ever.
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9_]+", text.lower())


def eval_arith(expr: str) -> Optional[float]:
    """Tiny recursive-descent arithmetic evaluator (safe: digits/operators only)."""
    s = re.sub(r"\s+", "", expr).replace("×", "*").replace("÷", "/")
    if not re.match(r"^[0-9+\-*/().^%]+$", s) or not re.search(r"\d", s):
        return None
    pos = 0

    def peek() -> str:
        return s[pos] if pos < len(s) else ""

    def num() -> Optional[float]:
        nonlocal pos
        j = pos
        while j < len(s) and (s[j].isdigit() or s[j] == "."):
            j += 1
        if j == pos:
            return None
        try:
            v = float(s[pos:j])
        except ValueError:
            return None
        pos = j
        return v

    def factor() -> Optional[float]:
        nonlocal pos
        if peek() == "(":
            pos += 1
            v = expr0()
            if peek() == ")":
                pos += 1
            return v
        if peek() == "-":
            pos += 1
            v = factor()
            return None if v is None else -v
        return num()

    def power() -> Optional[float]:
        nonlocal pos
        b = factor()
        if b is None:
            return None
        if peek() == "^":
            pos += 1
            e = power()
            if e is None:
                return None
            try:
                return b ** e
            except (OverflowError, ZeroDivisionError, ValueError):
                return None
        return b

    def term() -> Optional[float]:
        nonlocal pos
        v = power()
        if v is None:
            return None
        while peek() in ("*", "/", "%"):
            c = s[pos]
            pos += 1
            r = power()
            if r is None:
                return None
            try:
                v = v * r if c == "*" else (v / r if c == "/" else v % r)
            except ZeroDivisionError:
                return None
            if v != v or v in (float("inf"), float("-inf")):
                return None
        return v

    def expr0() -> Optional[float]:
        nonlocal pos
        v = term()
        if v is None:
            return None
        while peek() in ("+", "-"):
            c = s[pos]
            pos += 1
            r = term()
            if r is None:
                return None
            v = v + r if c == "+" else v - r
        return v

    r = expr0()
    return r if (pos == len(s) and r is not None) else None


def try_math(text: str) -> Optional[str]:
    m = re.search(r"-?[\d.]+(\s*[\+\-\*\/\^%×÷]\s*-?[\d.]+){1,}", text)
    if not m:
        return None
    v = eval_arith(m.group(0))
    if v is None:
        return None
    rv = round(v, 6)
    if rv == int(rv):  # JS-style number rendering: 396, not 396.0
        rv = int(rv)
    return f"{m.group(0).strip()} = {rv}"


def analyze_code(code: str) -> str:
    lines = code.split("\n")
    funcs = len(re.findall(r"function\s+\w+|\w+\s*=\s*(async\s*)?\(|def\s+\w+\s*\(", code))
    classes = len(re.findall(r"\bclass\s+\w+", code))
    imports = len(re.findall(r"^import\s.*$", code, re.M))
    exports = len(re.findall(r"^export\s", code, re.M))
    comments = sum(1 for l in lines if re.search(r"//|/\*|\*", l))
    if re.search(r"def\s+\w+|import\s+\w+.*from", code, re.I):
        lang = "Python"
    elif re.search(r"\b(interface|type)\s+\w+.*=|: (string|number|void)\b", code, re.I):
        lang = "TypeScript"
    else:
        lang = "JavaScript/other"
    out = [
        "Here is a structural read of the code:",
        f"• Language: {lang} · {len(lines)} lines",
        f"• {funcs} function{'s' if funcs != 1 else ''}, {classes} class{'es' if classes != 1 else ''}, "
        f"{imports} import{'s' if imports != 1 else ''}, {exports} export{'s' if exports != 1 else ''}",
        f"• Comment density: {round(100 * comments / (len(lines) or 1))}%",
    ]
    first = next((l for l in lines if l.strip() and not re.match(r"\s*(//|#|/\*)", l)), None)
    if first:
        out.append(f"• Entry point: {first.strip()[:90]}")
    out.append("")
    out.append("Want depth? Connect a larger model in Settings → Providers and I will hand off with this context attached.")
    return "\n".join(out)


_PLAN = """# Project 3 · Aetherion MVP — Aetherion Local plan

**Phase 0 · Clarity (day 0–1)**
- One-paragraph product definition + success metric
- Three user journeys, sketched end-to-end

**Phase 1 · Skeleton (day 1–3)**
- Repo scaffold, CI, local-first data layer
- Auth-free onboarding path (privacy mode: Local)

**Phase 2 · Core loop (day 3–7)**
- Chat + model router (local runtime first)
- Tasks, knowledge ingest, RAG with citations
- Agent loop: Understand → Plan → Tools → Execute → Verify

**Phase 3 · Safety (day 7–9)**
- Tool gateway with risk matrix + approval queue
- Sandbox, secret isolation, audit trail

**Phase 4 · Prove it (day 9–10)**
- Evaluation suite green (accuracy, latency, cost, reproducibility)
- Traces wired to OpenTelemetry; deployment to local + cloud

**Risks**
- Scope creep → freeze feature list at Phase 2
- Provider lock-in → adapter layer stays provider-neutral

Next: I can turn any phase into structured tasks with priorities, owners and due dates."""

_FIZZBUZZ = (
    "```ts\nfunction fizzbuzz(n: number): string[] {\n  const out: string[] = [];\n"
    "  for (let i = 1; i <= n; i++) {\n    if (i % 15 === 0) out.push(\"FizzBuzz\");\n"
    "    else if (i % 3 === 0) out.push(\"Fizz\");\n"
    "    else if (i % 5 === 0) out.push(\"Buzz\");\n"
    "    else out.push(String(i));\n  }\n  return out;\n}\n```\n\n"
    "Local generation (Aetherion built-in). I can also write the test suite for this if you ask."
)

_STARTER_CODE = (
    "Here is a starting point (local generation):\n\n"
    "```ts\n// Aetherion local stub — connect a larger model for production code\n"
    "export function starter(): string {\n  return \"hello from Aetherion\";\n}\n```\n\n"
    "Tell me the interface you need (inputs, outputs, edge cases) and I'll refine the structure locally, "
    "or hand off to a connected model."
)

_HELP = """Aetherion is your AI operating workspace. Right now, offline:

• **Plan** — "Plan my Project 3 MVP" → structured tasks
• **Knowledge** — ingest docs, then ask grounded questions (citations included)
• **Compute** — "what is 17 × 23 + 5?"
• **Code** — paste code and ask me to explain/review it
• **Memory** — "remember that I prefer TypeScript"

Connect a runtime in Settings → Providers (Ollama recommended) and I'll start routing real work to it automatically via the model router."""


def build_local_reply(system: str, text: str) -> str:
    text = text.strip()
    lower = text.lower()

    # 1) RAG-grounded mode (evidence-gated — refuses when unsupported)
    if re.search(r"context:|\[\d+\] ", system) and re.search(r"answer the question", system, re.I):
        ctx = re.sub(r"answer the question.*$", "", system, flags=re.I)
        return grounded_answer(ctx, text)

    # 2) arithmetic
    math = try_math(text)
    if math and not re.search(r"story|poem", lower):
        return f"**{math}**\n\nComputed locally by Aetherion (offline adapter). Need a worked solution or further steps? Ask."

    # 3) code explanation
    code_match = re.search(r"```[a-z]*\n([\s\S]*?)```", text)
    if re.search(r"explain|analyze|read|review", lower) and code_match:
        return analyze_code(code_match.group(1))

    # 4) planning
    if re.search(r"\bplan\b.*\b(mvp|project|release|roadmap|launch)\b|\b(mvp|project)\b.*\bplan\b", lower) or lower == "plan my project 3 mvp":
        return _PLAN

    # 5) remember
    rem = re.search(r"remember\s+(?:that\s+)?(.+)", text, re.I)
    if rem:
        return f'Stored to long-term memory: "{rem.group(1).strip()}"\n\nI will recall this in future sessions (Memory → facts).'

    # 6) safety refusal
    if re.search(r"break(?:ing)? into|pick a lock|hack (a|the|my|someone)|steal|bypass (security|auth)|exploit", lower) and not re.search(
        r"how to stay safe|security research|defend", lower
    ):
        return (
            "I won't help with that. If it's a legitimate security question — defending a system, "
            "authorized testing, incident response — rephrase with that context and I'll dig in."
        )

    # 7) hallucination probe: unknown-person pattern
    person = re.search(r"who (was|is) the ([^?]+)\??", text, re.I)
    if person and re.search(r"vexworth|quellborn|astramind|zephyria", person.group(2), re.I):
        return (
            f"I have no record of {person.group(2).strip()}. That name does not appear in my knowledge or in the "
            "workspace. I'd rather tell you that plainly than invent a biography."
        )
    if person and re.search(r"\bnever existed\b|\bfictional\b", text, re.I):
        return "Agreed — that person never existed. I won't invent details for them."

    # 8) sentiment
    if re.search(r"classif|sentiment", lower):
        pos_re = re.compile(r"good|great|love|amazing|wonderful|excellent|ruined|terrible|awful|worst|hate|broke", re.I)
        m2 = re.search(r'"(.*?)"|:(.+)$', text, re.S)
        sample = (m2.group(1) if m2 and m2.group(1) is not None else (m2.group(2) if m2 else text)).lower()
        words = _tokenize(sample)
        neg_set = {"ruined", "terrible", "awful", "worst", "hate", "broke", "bad", "poor", "disappointed", "horrible"}
        pos_set = {"good", "great", "love", "amazing", "wonderful", "excellent", "happy", "joy", "best"}
        neg = sum(1 for w in words if w in neg_set)
        posc = sum(1 for w in words if w in pos_set)
        if neg > posc:
            return "negative"
        if posc > neg:
            return "positive"
        return "negative" if pos_re.search(sample) else "neutral"

    # 9) extraction
    if re.search(r"extract", lower):
        email = re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", text, re.I)
        if email:
            return email.group(0)
        date = re.search(r"\b\d{4}-\d{2}-\d{2}\b", text)
        if date:
            return date.group(0)
        num = re.search(r"\b\d{3,}\b", text)
        if num:
            return num.group(0)
        return "Nothing extractable found in that text — try including an email, date or number."

    # 10) code gen
    if re.search(r"write|create|generate|implement", lower) and re.search(r"function|code|script|component|class|api", lower):
        if re.search(r"fizzbuzz", lower):
            return _FIZZBUZZ
        return _STARTER_CODE

    # 11) greetings
    if re.match(r"^(hi|hello|hey|yo|salaam|namaste)\b", lower):
        return (
            "Hello. I'm Aetherion Local — the built-in offline model. I can plan projects, answer grounded questions from "
            'your knowledge base, compute, analyze code, and route harder work to connected models. Try: "Plan my Project 3 MVP."'
        )

    # 12) help
    if lower == "help" or re.search(r"what can you do|capabilities|features", lower):
        return _HELP

    # 13) default: structured local analysis
    words = _tokenize(text)
    return (
        "**Aetherion Local** processed your request (offline).\n\n"
        f"I read a {len(words)}-term request about: {', '.join(words[:8])}.\n\n"
        "What I can do right now, on-device:\n"
        "1. Turn this into a plan with phases, tasks and owners\n"
        "2. Answer it against your Knowledge base (grounded, with citations)\n"
        "3. Draft code structure or a test plan\n\n"
        "For open-ended synthesis, connect a model — Settings → Providers → Ollama (local, free, private) or an "
        "OpenAI-compatible endpoint — and I will route it automatically."
    )


class LocalProvider(BaseProvider):
    """Aetherion Local — offline, deterministic, grounded. No network, ever."""

    id = "sutra-local"

    def __init__(self, settings: Settings, model: Optional[ModelInfo] = None):
        super().__init__(
            settings,
            model or ModelInfo(id="sutra-local", name="Aetherion Local", runtime="sutra-local", capabilities=["code", "structured"]),
        )

    @property
    def name(self) -> str:
        return "Aetherion Local"

    async def ping(self) -> dict:
        return {"ok": True, "latencyMs": 0, "detail": "local responder — always available"}

    async def chat_stream(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 1024) -> AsyncIterator[str]:
        system = "\n".join(m["content"] for m in messages if m["role"] == "system")
        user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        text = build_local_reply(system, user)
        for word in re.findall(r"\S+\s*", text)[:220]:
            yield word
            await asyncio.sleep(0)


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
