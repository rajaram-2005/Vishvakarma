def test_assess_dangerous(client):
    r = client.post("/api/v1/security/assess", json={"category": "terminal.exec", "detail": "rm -rf / --no-preserve-root"})
    assert r.status_code == 200
    d = r.json()
    assert d["risk"] == "critical"
    assert d["requiresApproval"] is True
    assert any("signature" in x for x in d["reasons"])


def test_assess_safe(client):
    r = client.post("/api/v1/security/assess", json={"category": "fs.read", "detail": "read src/app.ts"})
    d = r.json()
    assert d["risk"] == "low"
    assert d["requiresApproval"] is False


def test_assess_force_push(client):
    r = client.post("/api/v1/security/assess", json={"category": "git.push", "detail": "git push origin main --force"})
    assert r.json()["risk"] == "critical"


def test_scan_finds_and_masks(client):
    secret = "sk-" + "a1B2c3D4e5F6g7H8"
    r = client.post("/api/v1/security/scan", json={"text": f'const key = "{secret}";'})
    assert r.status_code == 200
    d = r.json()
    assert d["clean"] is False
    assert d["findings"][0]["line"] == 1
    assert secret not in r.text  # never echoes the secret


def test_scan_clean(client):
    r = client.post("/api/v1/security/scan", json={"text": "no secrets here"})
    assert r.json()["clean"] is True
