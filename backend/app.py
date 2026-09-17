from __future__ import annotations

import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware

MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024


def validate_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    version = payload.get("version")
    if version not in (2, 3):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="unsupported snapshot version")
    saved_at = payload.get("savedAt")
    if not isinstance(saved_at, int) or saved_at < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="savedAt must be a non-negative integer")
    if not isinstance(payload.get("rooms", []), list):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="rooms must be an array")
    return payload


class SnapshotRepository:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def _initialize(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS workspace_snapshot (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    payload TEXT NOT NULL,
                    saved_at INTEGER NOT NULL
                )
                """
            )

    def load(self) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT payload FROM workspace_snapshot WHERE id = 1").fetchone()
        if row is None:
            return None
        payload = json.loads(row[0])
        if not isinstance(payload, dict):
            raise ValueError("stored snapshot is not an object")
        return payload

    def save(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        payload = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
        if len(payload.encode("utf-8")) > MAX_SNAPSHOT_BYTES:
            raise ValueError("snapshot exceeds 5 MiB limit")

        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT INTO workspace_snapshot (id, payload, saved_at)
                VALUES (1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at
                """,
                (payload, snapshot["savedAt"]),
            )
            conn.commit()
        return snapshot

    def clear(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM workspace_snapshot WHERE id = 1")
            conn.commit()


def create_app(db_path: Path | None = None) -> FastAPI:
    path = db_path or Path(os.getenv("AI_TEAM_DB", "./data/ai-team-chat.db"))
    repo = SnapshotRepository(path)
    api_key = os.getenv("APP_API_KEY", "").strip()

    def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
        if api_key and x_api_key != api_key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid API key")

    app = FastAPI(title="Virtual Company Roundtable API", version="3.0.0")
    allowed_origins = [origin.strip() for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "PUT", "DELETE"],
        allow_headers=["Content-Type", "X-API-Key"],
    )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/snapshot", dependencies=[Depends(require_api_key)])
    def get_snapshot() -> dict[str, Any]:
        snapshot = repo.load()
        if snapshot is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="snapshot not found")
        return snapshot

    @app.put("/api/snapshot", dependencies=[Depends(require_api_key)])
    def put_snapshot(snapshot: dict[str, Any] = Body(...)) -> dict[str, Any]:
        validated = validate_snapshot(snapshot)
        try:
            return repo.save(validated)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)) from exc

    @app.delete("/api/snapshot", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_api_key)])
    def delete_snapshot() -> Response:
        repo.clear()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return app


app = create_app()
