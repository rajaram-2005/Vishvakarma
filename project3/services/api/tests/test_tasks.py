def test_task_crud_lifecycle(client):
    # create
    r = client.post(
        "/api/v1/tasks",
        json={"title": "Define success metric", "priority": "p0", "category": "Discovery", "tags": ["spec"]},
    )
    assert r.status_code == 201
    task = r.json()
    assert task["status"] == "todo"
    assert task["assignee"]["kind"] == "human"

    # list
    tasks = client.get("/api/v1/tasks").json()["tasks"]
    assert any(t["id"] == task["id"] for t in tasks)

    # update
    r = client.patch(f"/api/v1/tasks/{task['id']}", json={"status": "done", "priority": "p1"})
    assert r.status_code == 200
    assert r.json()["status"] == "done"

    # filter
    done = client.get("/api/v1/tasks", params={"status": "done"}).json()["tasks"]
    assert any(t["id"] == task["id"] for t in done)

    # delete
    assert client.delete(f"/api/v1/tasks/{task['id']}").status_code == 204
    assert not any(t["id"] == task["id"] for t in client.get("/api/v1/tasks").json()["tasks"])


def test_task_bad_priority_rejected(client):
    r = client.post("/api/v1/tasks", json={"title": "x", "priority": "p9"})
    assert r.status_code == 422
    r = client.post("/api/v1/tasks", json={"title": "ok task", "priority": "p2"})
    tid = r.json()["id"]
    assert client.patch(f"/api/v1/tasks/{tid}", json={"priority": "nope"}).status_code == 422


def test_task_404(client):
    assert client.patch("/api/v1/tasks/task_missing", json={"status": "done"}).status_code == 404
