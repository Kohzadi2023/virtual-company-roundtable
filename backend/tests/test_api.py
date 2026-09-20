from pathlib import Path

from fastapi.testclient import TestClient

from app import create_app


def sample_snapshot(saved_at: int = 1) -> dict:
    return {
        "version": 4,
        "rooms": [],
        "roles": [],
        "agents": [],
        "teams": [],
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


def test_v4_preserves_extension_state(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "test.db"))
    payload = sample_snapshot(456)
    payload["extensions"] = {
        "version": 1,
        "workspaceSuite": {"activeCompanyId": "company-default"},
        "memoryV2": {"version": 1, "sharedMemories": [{"id": "memory-1"}]},
        "memoryIntelligence": {"version": 1, "candidates": [{"id": "candidate-1"}]},
        "meetingOrchestration": {"rooms": {"room-a": {"roundIndex": 2}}, "chats": {}},
        "operationsSuite": {"version": 1, "risks": [{"id": "risk-1"}]},
        "securityPreferences": {"appLockEnabled": True},
    }

    put = client.put("/api/snapshot", json=payload)
    assert put.status_code == 200
    assert put.json()["extensions"] == payload["extensions"]

    get = client.get("/api/snapshot")
    assert get.status_code == 200
    assert get.json()["extensions"] == payload["extensions"]


def test_delete_snapshot(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "test.db"))
    client.put("/api/snapshot", json=sample_snapshot())
    assert client.delete("/api/snapshot").status_code == 204
    assert client.get("/api/snapshot").status_code == 404


def test_accepts_legacy_v2_and_v3_during_migration(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "test.db"))
    v2 = {
        "version": 2,
        "rooms": [],
        "characters": [],
        "queueOverrides": {},
        "activeRoomId": None,
        "savedAt": 1,
    }
    assert client.put("/api/snapshot", json=v2).status_code == 200

    v3 = {
        "version": 3,
        "rooms": [],
        "roles": [],
        "agents": [],
        "agentContext": {},
        "activeRoomId": None,
        "savedAt": 2,
    }
    assert client.put("/api/snapshot", json=v3).status_code == 200


def test_v4_requires_teams_array(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "test.db"))
    payload = sample_snapshot()
    payload["teams"] = "invalid"
    assert client.put("/api/snapshot", json=payload).status_code == 422


def test_rejects_unknown_version(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "test.db"))
    payload = sample_snapshot()
    payload["version"] = 5
    assert client.put("/api/snapshot", json=payload).status_code == 422
