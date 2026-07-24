import pytest
from fastapi.testclient import TestClient

from app.launcher import LaunchError
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


def test_launch_endpoint_returns_launch_result(monkeypatch):
    expected = {
        "launched": True,
        "provider_id": "codex",
        "workspace_path": "/workspace",
    }
    calls = []

    def fake_launch(provider_id, workspace_path, session_mode, new_folder):
        calls.append((provider_id, workspace_path, session_mode, new_folder))
        return expected

    monkeypatch.setattr("app.main.launch_provider", fake_launch)

    response = TestClient(app).post(
        "/api/launch",
        json={
            "provider_id": "codex",
            "workspace_path": "/workspace",
            "session_mode": "new",
            "new_folder": "project",
        },
    )

    assert response.status_code == 200
    assert response.json() == expected
    assert calls == [("codex", "/workspace", "new", "project")]


def test_launch_endpoint_returns_safe_error(monkeypatch):
    def fake_launch(*args):
        raise LaunchError(
            "Workspace does not exist",
            code="invalid_workspace",
            status_code=400,
        )

    monkeypatch.setattr("app.main.launch_provider", fake_launch)

    response = TestClient(app).post(
        "/api/launch",
        json={
            "provider_id": "codex",
            "workspace_path": "/missing",
            "session_mode": "new",
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": {
            "code": "invalid_workspace",
            "message": "Workspace does not exist",
        }
    }


def test_launch_endpoint_rejects_unknown_session_mode(monkeypatch):
    launch = monkeypatch.setattr(
        "app.main.launch_provider",
        lambda *args: pytest.fail("launch should not be called"),
    )

    response = TestClient(app).post(
        "/api/launch",
        json={
            "provider_id": "codex",
            "workspace_path": "/workspace",
            "session_mode": "other",
        },
    )

    assert launch is None
    assert response.status_code == 422
