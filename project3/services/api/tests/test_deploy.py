def test_deploy_clean_bundle(client):
    r = client.post(
        "/api/v1/deploy/local",
        json={"name": "workspace", "files": {"README.md": "# Aetherion", "src/app.ts": "export const a = 1;\n"}},
    )
    assert r.status_code == 201
    m = r.json()
    assert m["status"] == "success"
    assert m["secretScan"] == "clean"
    assert m["bundleHash"]
    assert m["files"]["README.md"]["chars"] > 0

    deps = client.get("/api/v1/deployments").json()["deployments"]
    assert deps[0]["id"] == m["id"]


def test_deploy_with_secret_blocked(client):
    r = client.post(
        "/api/v1/deploy/local",
        json={"name": "leaky", "files": {"env.txt": "OPENAI_API_KEY=sk-" + "a" * 24}},
    )
    assert r.status_code == 409
    assert r.json()["detail"]["reason"] == "secrets_detected"
    # and it must not appear in the deployments list
    assert all(d["name"] != "leaky" for d in client.get("/api/v1/deployments").json()["deployments"])


def test_deploy_requires_files(client):
    assert client.post("/api/v1/deploy/local", json={"name": "x"}).status_code == 422
