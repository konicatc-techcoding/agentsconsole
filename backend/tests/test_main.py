from fastapi.testclient import TestClient

from app.main import app


def test_provider_endpoint_returns_discovery_results(monkeypatch):
    expected = [
        {
            "id": "codex",
            "display_name": "Codex CLI",
            "command": "codex",
            "installed": True,
            "path": "/tools/codex",
            "version": "codex-cli 1.2.3",
            "error": None,
        }
    ]
    monkeypatch.setattr("app.main.detect_providers", lambda: expected)

    response = TestClient(app).get("/api/providers")

    assert response.status_code == 200
    assert response.json() == expected
