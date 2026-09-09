DOC = "\n\n".join(
    [
        "Security model. Every tool call flows Agent → Tool Gateway → Policy → Sandbox → Execution.",
        "The gateway classifies risk as Low, Medium, High or Critical and routes dangerous operations to human approval.",
        "RAG pipeline. Documents are ingested, chunked, embedded locally, retrieved with a dense plus BM25 blend.",
        "Memory stores what the system knows: facts, preferences, episodes. Skills encode how the system works.",
        "Workflows are directed acyclic graphs: trigger, AI steps, HTTP calls, shell, conditions, human approval.",
        "Deployments always run a pre-deploy secret scan. A bundle containing secret patterns never ships.",
        "Observability is OpenTelemetry-compatible: request, router, model, agent, tool, workflow, response.",
        "Evaluation measures accuracy, factuality, hallucination, latency, tokens, cost and reproducibility.",
    ]
)


def test_ingest_and_query(client):
    r = client.post("/api/v1/rag/ingest", json={"title": "Design doc", "text": DOC, "source": "test"})
    assert r.status_code == 200
    assert r.json()["chunks"] > 1

    docs = client.get("/api/v1/rag/documents").json()["documents"]
    assert docs[0]["title"] == "Design doc"

    q = client.post("/api/v1/rag/query", json={"query": "How does the security gateway classify risk?"}).json()
    assert q["hits"], "expected retrieval hits"
    assert "Sources" in q["answer"]
    assert any(h["score"] > 0 for h in q["hits"])
    # sorted descending
    scores = [h["score"] for h in q["hits"]]
    assert scores == sorted(scores, reverse=True)


def test_query_refuses_without_evidence(client):
    client.post("/api/v1/rag/ingest", json={"title": "Small", "text": "SUTRA is a local-first workspace.", "source": "test"})
    q = client.post("/api/v1/rag/query", json={"query": "What is the population of Nairobi?"}).json()
    assert "can't verify" in q["answer"] or "won't guess" in q["answer"]


def test_ingest_empty_rejected(client):
    r = client.post("/api/v1/rag/ingest", json={"title": "Empty", "text": "   "})
    assert r.status_code == 422


def test_query_empty_kb(client):
    q = client.post("/api/v1/rag/query", json={"query": "anything?"}).json()
    assert "empty" in q["answer"].lower()
