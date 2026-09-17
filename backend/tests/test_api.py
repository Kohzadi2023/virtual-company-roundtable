from pathlib import Path

from fastapi.testclient import TestClient

from app import create_app


def sample_snapshot(saved_at: int = 1) -> dict:
    return {
        "version": 3,
        "rooms": [],
        "roles": [],
        "agents": [],
        "agentContext": {},
        "activeRoomId": None,
        "savedAt": saved_at,
    }


def test_snapshot_round_trip(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "test.db"))
    assert client.get("/api/snapshot").status_code == 404

    payload = sample_snapshot(123)
    put = client.put("/api/snapshot", json=payload)
    assert put.status_code == 200
    assert put.json() == payload

    get = client.get("/api/snapshot")
    assert get.status_code == 200
    assert get.json() == payload


def test_delete_snapshot(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "test.db"))
    client.put("/api/snapshot", json=sample_snapshot())
    assert client.delete("/api/snapshot").status_code == 204
    assert client.get("/api/snapshot").status_code == 404


def test_accepts_legacy_v2_during_migration(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "test.db"))
    payload = {
        "version": 2,
        "rooms": [],
        "characters": [],
        "queueOverrides": {},
        "activeRoomId": None,
        "savedAt": 1,
    }
    response = client.put("/api/snapshot", json=payload)
    assert response.status_code == 200
    assert response.json() == payload


def test_rejects_unknown_version(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "test.db"))
    payload = sample_snapshot()
    payload["version"] = 4
    assert client.put("/api/snapshot", json=payload).status_code == 422
