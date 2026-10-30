"""FastAPI 應用程式進入點：uvicorn app.main:app。"""

from __future__ import annotations

from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/api/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    return app


app = create_app()
