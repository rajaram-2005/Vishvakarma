from conftest import valid_workflow  # noqa: F401


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["service"] == "sutra-api"
    assert body["privacyMode"] in ("local", "hybrid", "cloud")
    assert "backends" in body


def test_models_registry(client):
    r = client.get("/api/v1/models")
    assert r.status_code == 200
    models = r.json()["models"]
    assert any(m["id"] == "sutra-local" for m in models)
    assert all({"id", "name", "runtime", "contextWindow"} <= set(m) for m in models)


def test_route_code_intent(client):
    r = client.post("/api/v1/route", json={"text": "Refactor this: function f() { … } — fix the bug"})
    assert r.status_code == 200
    d = r.json()
    assert "code" in d["analysis"]["intents"]
    assert d["chosen"] is not None
    assert d["ranking"][0]["score"] >= d["ranking"][-1]["score"]


def test_route_force_model_pins_first(client):
    r = client.post("/api/v1/route", json={"text": "anything", "forceModel": "sutra-local"})
    d = r.json()
    assert d["chosen"]["id"] == "sutra-local"
    assert d["ranking"][0]["modelId"] == "sutra-local"
    assert d["ranking"][0]["score"] == 100
