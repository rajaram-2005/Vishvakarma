# Aetherion service API — configuration (env-driven, provider-neutral).
from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class Settings:
    service: str = "sutra-api"
    version: str = "0.1.0"
    env: str = os.environ.get("Aetherion_ENV", "development")

    # Privacy mode: local | hybrid | cloud. Local never phones home.
    privacy_mode: str = os.environ.get("Aetherion_PRIVACY_MODE", "local")
    sync_scope: str = os.environ.get("Aetherion_SYNC_SCOPE", "none")

    # Local runtimes
    ollama_url: str = os.environ.get("OLLAMA_URL", "http://localhost:11434")

    # OpenAI-compatible (vLLM / LM Studio / SGLang / API)
    openai_base_url: str = os.environ.get("OPENAI_BASE_URL", "")
    openai_api_key: str = os.environ.get("OPENAI_API_KEY", "")
    openai_model: str = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    # Observability
    otlp_endpoint: str = os.environ.get("OTLP_ENDPOINT", "")  # e.g. http://host:4318
    trace_sample: float = float(os.environ.get("Aetherion_TRACE_SAMPLE", "1.0"))

    # Security
    cors_origins: list[str] = field(
        default_factory=lambda: [o for o in os.environ.get("Aetherion_CORS_ORIGINS", "*").split(",") if o]
    )

    @property
    def is_local(self) -> bool:
        return self.privacy_mode == "local"


def load_settings() -> Settings:
    return Settings()
