from conftest import valid_workflow


def test_validate_ok(client):
    r = client.post("/api/v1/workflows/validate", json={"workflow": valid_workflow()})
    assert r.json() == {"errors": [], "valid": True}


def test_validate_cycle(client):
    wf = valid_workflow()
    wf["edges"] = [["a", "b"], ["b", "c"], ["c", "a"]]
    r = client.post("/api/v1/workflows/validate", json={"workflow": wf})
    assert "workflow contains a cycle" in r.json()["errors"]


def test_validate_unknown_edge(client):
    wf = valid_workflow()
    wf["edges"] = [["a", "nope"]]
    r = client.post("/api/v1/workflows/validate", json={"workflow": wf})
    assert any("unknown node" in e for e in r.json()["errors"])


def test_topo_order(client):
    r = client.post("/api/v1/workflows/topo", json={"workflow": valid_workflow()})
    order = r.json()["order"]
    assert order.index("a") < order.index("b") < order.index("c")


def test_n8n_export(client):
    r = client.post("/api/v1/workflows/n8n", json={"workflow": valid_workflow()})
    assert r.status_code == 200
    j = r.json()
    assert j["settings"]["executionOrder"] == "v1"
    assert j["nodes"][0]["type"] == "n8n-nodes-base.manualTrigger"
    assert j["connections"]["Start"]["main"][0][0]["node"] == "Think"
    assert j["nodes"][1]["parameters"]["prompt"] == "x"


def test_n8n_export_rejects_invalid(client):
    wf = valid_workflow()
    wf["nodes"] = []
    r = client.post("/api/v1/workflows/n8n", json={"workflow": wf})
    assert r.status_code == 422
