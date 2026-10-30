from fastapi.testclient import TestClient

from app.main import create_app


def test_health_returns_ok() -> None:
    client = TestClient(create_app())
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_api_docs_are_disabled() -> None:
    client = TestClient(create_app())
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
