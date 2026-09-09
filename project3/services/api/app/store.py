# SUTRA service API — local-first persistence.
# JSON files under SUTRA_DATA_DIR (default: ./data). No external database required;
# PostgreSQL/Redis adapters slot in for cloud mode without touching route code.
from __future__ import annotations

import json
import os
import re
import threading
import uuid
from pathlib import Path
from typing import Any, Optional

from .core import ModelInfo, chunk_text


def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


class JsonStore:
    """Tiny file-backed store with process-safe reads/writes (atomic replace)."""

    def __init__(self, root: str | Path | None = None):
        env = os.environ.get("SUTRA_DATA_DIR", "")
        self.root = Path(root or env or Path(__file__).resolve().parent.parent / "data")
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def path(self, name: str) -> Path:
        safe = re.sub(r"[^a-z0-9._-]", "_", name.lower())
        return self.root / f"{safe}.json"

    def load(self, name: str, default: Any) -> Any:
        p = self.path(name)
        if not p.exists():
            return default
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return default

    def save(self, name: str, value: Any) -> None:
        with self._lock:
            p = self.path(name)
            tmp = p.with_suffix(".tmp")
            tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(p)


MODEL_REGISTRY: list[ModelInfo] = [
    ModelInfo("sutra-local", "SUTRA Local", "sutra-local", 16384, 0, 0, "low", ["code", "structured", "long-context"], True, True),
    ModelInfo("llama3.1-8b", "Llama 3.1 8B", "ollama", 131072, 0, 0, "medium", ["code", "creative", "structured"], True, True),
    ModelInfo("qwen2.5-coder-14b", "Qwen 2.5 Coder 14B", "ollama", 32768, 0, 0, "medium", ["code", "structured"], True, True),
    ModelInfo("mistral-7b-instruct", "Mistral 7B Instruct", "ollama", 32768, 0, 0, "low", ["creative", "structured"], True, True),
    ModelInfo("gpt-4o", "GPT-4o", "openai-compat", 128000, 2.5, 10.0, "high", ["code", "creative", "structured", "long-context", "vision"], True, False),
    ModelInfo("gpt-4o-mini", "GPT-4o Mini", "openai-compat", 128000, 0.15, 0.6, "medium", ["code", "creative", "structured", "long-context"], True, False),
    ModelInfo("claude-sonnet", "Claude Sonnet", "openai-compat", 200000, 3.0, 15.0, "high", ["code", "creative", "structured", "long-context"], True, False),
    ModelInfo("vllm-70b", "vLLM 70B (self-hosted)", "vllm", 32768, 0, 0, "medium", ["code", "long-context", "structured"], True, True),
]


def default_state() -> dict:
    return {
        "models": [m.to_dict() for m in MODEL_REGISTRY],
        "documents": [],
        "chunks": [],
        "tasks": [],
        "workflows": [],
        "deployments": [],
        "audit": [],
    }


def load_models(store: JsonStore) -> list[ModelInfo]:
    raw = store.load("state", default_state())["models"]
    return [ModelInfo.from_dict(d) for d in raw]
