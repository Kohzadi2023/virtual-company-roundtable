from __future__ import annotations

import multiprocessing
import os

import uvicorn

from app import app


def main() -> None:
    multiprocessing.freeze_support()
    host = "127.0.0.1"
    port = int(os.getenv("DESKTOP_BACKEND_PORT", "8765"))
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
        loop="asyncio",
        http="h11",
        lifespan="on",
    )


if __name__ == "__main__":
    main()
