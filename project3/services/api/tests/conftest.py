import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import create_app, SETTINGS  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SUTRA_DATA_DIR", str(tmp_path / "data"))
    import importlib
    import app.store as store_mod
    importlib.reload(store_mod)
    import app.main as main_mod
    importlib.reload(main_mod)
    main_mod.SETTINGS = main_mod.load_settings()
    main_mod.STORE = main_mod.JsonStore(tmp_path / "data")
    main_mod.EGRESS = main_mod.EgressLog(main_mod.STORE, main_mod.SETTINGS)
    with TestClient(main_mod.create_app()) as c:
        yield c


def valid_workflow():
    return {
        "id": "wf1",
        "name": "pipeline",
        "description": "test",
        "trigger": "manual",
        "nodes": [
            {"id": "a", "type": "trigger", "label": "Start", "config": {}},
            {"id": "b", "type": "ai", "label": "Think", "config": {"prompt": "x"}},
            {"id": "c", "type": "approval", "label": "Approve", "config": {}},
        ],
        "edges": [["a", "b"], ["b", "c"]],
    }
