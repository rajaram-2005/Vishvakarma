def test_traces_collect_spans(client):
    client.get("/health")
    client.post("/api/v1/security/assess", json={"category": "fs.read"})
    r = client.get("/api/v1/traces")
    assert r.status_code == 200
    doc = r.json()["document"]
    assert doc["resourceSpans"][0]["resource"]["attributes"][0]["value"]["stringValue"] == "sutra-api"
    all_spans = [s for sc in doc["resourceSpans"][0]["scopeSpans"] for s in sc["spans"]]
    assert len(all_spans) >= 2
    names = {s["name"] for s in all_spans}
    assert any("http" in n for n in names)


def test_audit_records_egress_policy(client):
    r = client.get("/api/v1/audit")
    assert r.status_code == 200
    assert isinstance(r.json()["events"], list)
