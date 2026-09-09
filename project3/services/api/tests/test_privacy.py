from app import core
from app.main import EgressLog
from app.config import Settings
from app.store import JsonStore
import tempfile, os


def test_egress_local_mode_blocks_public():
    with tempfile.TemporaryDirectory() as tmp:
        store = JsonStore(tmp)
        s = Settings(privacy_mode="local")
        eg = EgressLog(store, s)
        assert eg.allow("http://127.0.0.1:11434/api/tags", "ollama ping") is True
        assert eg.allow("http://localhost:8000/v1/models", "openai ping") is True
        assert eg.allow("https://api.openai.com/v1/models", "openai ping") is False
        state = store.load("state", {"audit": []})
        blocked = [e for e in state["audit"] if not e["allowed"]]
        assert blocked and "local mode" in blocked[0]["note"]


def test_egress_hybrid_mode_allows_but_logs():
    with tempfile.TemporaryDirectory() as tmp:
        store = JsonStore(tmp)
        s = Settings(privacy_mode="hybrid")
        eg = EgressLog(store, s)
        assert eg.allow("https://api.openai.com/v1/models", "chat") is True
        state = store.load("state", {"audit": []})
        assert state["audit"][0]["mode"] == "hybrid"


def test_chunking_matches_web_contract():
    chunks = core.chunk_text("para one\n\npara two\n\npara three", "doc1")
    assert chunks and all(c["docId"] == "doc1" for c in chunks)


def test_embed_deterministic_and_normalized():
    a = core.embed("security gateway risk")
    b = core.embed("security gateway risk")
    c = core.embed("population of nairobi")
    assert a == b
    assert abs(sum(x * x for x in a) - 1.0) < 1e-6
    assert core.cosine(a, b) > 0.99
    assert core.cosine(a, c) < core.cosine(a, b)


def test_route_local_only_filters_cloud():
    models = [
        core.ModelInfo("cloud-1", "Cloud", "openai-compat", local=False),
        core.ModelInfo("local-1", "Local", "sutra-local", local=True),
    ]
    d = core.route(models, "hello", require_local=True)
    assert d["chosen"]["id"] == "local-1"
