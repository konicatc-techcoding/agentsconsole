import subprocess
from pathlib import Path

import pytest

from app import launcher


def test_new_and_continue_commands_are_fixed():
    assert launcher.SESSION_COMMANDS == {
        "hermes": {
            "new": ("hermes",),
            "continue": ("hermes", "--continue", "--no-restore-cwd"),
        },
        "codex": {
            "new": ("codex",),
            "continue": ("codex", "resume", "--last"),
        },
        "claude": {
            "new": ("claude",),
            "continue": ("claude", "--continue"),
        },
        "antigravity": {
            "new": ("agy",),
            "continue": ("agy", "--continue"),
        },
    }


def _command(provider_id, session_mode, resumable, workspace="/workspace"):
    return launcher._provider_command(
        provider_id,
        session_mode,
        Path(workspace),
        resumable=lambda _workspace: resumable,
    )


# The other three providers have no session-kind rule to work around, so their
# commands stay fixed whether or not a Claude session could be found.
@pytest.mark.parametrize("resumable", [None, "session-that-must-not-be-used"])
@pytest.mark.parametrize(
    ("provider_id", "session_mode", "expected"),
    [
        ("hermes", "continue", ("hermes", "--continue", "--no-restore-cwd")),
        ("codex", "continue", ("codex", "resume", "--last")),
        ("antigravity", "continue", ("agy", "--continue")),
        ("claude", "new", ("claude",)),
    ],
)
def test_only_claude_continue_consults_the_resumer(
    provider_id, session_mode, expected, resumable
):
    assert _command(provider_id, session_mode, resumable) == (expected, None)


def test_claude_continue_resumes_the_session_the_app_picked():
    assert _command("claude", "continue", "3f2c1c05") == (
        ("claude", "--resume", "3f2c1c05"),
        "3f2c1c05",
    )


# Falling back rather than failing keeps the CLI's own "No conversation found
# to continue" as the thing the user sees, exactly as before.
def test_claude_continue_falls_back_when_no_session_can_be_identified():
    assert _command("claude", "continue", None) == (("claude", "--continue"), None)


def test_unknown_provider_is_rejected_before_any_session_lookup():
    with pytest.raises(launcher.LaunchError) as error:
        _command("other", "continue", "session")

    assert error.value.code == "unknown_provider"


@pytest.mark.parametrize("workspace_path", ["relative/path", "/"])
def test_rejects_disallowed_workspace_paths(workspace_path):
    with pytest.raises(launcher.LaunchError) as error:
        launcher.launch_provider("codex", workspace_path, "new")

    assert error.value.code == "invalid_workspace"
    assert error.value.status_code == 400


def test_rejects_missing_path_and_regular_file(tmp_path):
    for workspace_path in (tmp_path / "missing", tmp_path / "file.txt"):
        if workspace_path.suffix:
            workspace_path.write_text("not a directory")

        with pytest.raises(launcher.LaunchError) as error:
            launcher.launch_provider("codex", str(workspace_path), "new")

        assert error.value.code == "invalid_workspace"


def test_validate_workspace_returns_resolved_path(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    assert launcher.validate_workspace(str(workspace)) == {
        "workspace_path": str(workspace.resolve())
    }


def test_rejects_unknown_or_unavailable_provider(tmp_path, monkeypatch):
    with pytest.raises(launcher.LaunchError) as unknown:
        launcher.launch_provider("other", str(tmp_path), "new")
    assert unknown.value.code == "unknown_provider"
    assert unknown.value.status_code == 404

    monkeypatch.setattr(launcher.shutil, "which", lambda command: None)
    with pytest.raises(launcher.LaunchError) as unavailable:
        launcher.launch_provider("codex", str(tmp_path), "new")
    assert unavailable.value.code == "provider_unavailable"
    assert unavailable.value.status_code == 409


def test_rejects_unsupported_platform_without_running_command(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(launcher.shutil, "which", lambda command: f"/tools/{command}")
    monkeypatch.setattr(launcher.platform, "system", lambda: "Linux")
    monkeypatch.setattr(
        launcher.subprocess,
        "run",
        lambda *args, **kwargs: pytest.fail("subprocess should not run"),
    )

    with pytest.raises(launcher.LaunchError) as error:
        launcher.launch_provider("codex", str(tmp_path), "new")

    assert error.value.code == "unsupported_platform"
    assert error.value.status_code == 501


def test_unsupported_platform_does_not_create_new_folder(tmp_path, monkeypatch):
    monkeypatch.setattr(launcher.shutil, "which", lambda command: f"/tools/{command}")
    monkeypatch.setattr(launcher.platform, "system", lambda: "Linux")

    with pytest.raises(launcher.LaunchError):
        launcher.launch_provider("codex", str(tmp_path), "new", "project")

    assert not (tmp_path / "project").exists()


@pytest.mark.parametrize(
    "new_folder",
    [".", "..", "/absolute", "nested/project", "project/", "bad\0name"],
)
def test_rejects_unsafe_new_folder_names(tmp_path, monkeypatch, new_folder):
    monkeypatch.setattr(launcher.shutil, "which", lambda command: f"/tools/{command}")
    monkeypatch.setattr(launcher.platform, "system", lambda: "Darwin")

    with pytest.raises(launcher.LaunchError) as error:
        launcher.launch_provider("codex", str(tmp_path), "new", new_folder)

    assert error.value.code == "invalid_new_folder"
    assert list(tmp_path.iterdir()) == []


def test_rejects_new_folder_for_continue_mode(tmp_path, monkeypatch):
    monkeypatch.setattr(launcher.shutil, "which", lambda command: f"/tools/{command}")
    monkeypatch.setattr(launcher.platform, "system", lambda: "Darwin")

    with pytest.raises(launcher.LaunchError) as error:
        launcher.launch_provider("codex", str(tmp_path), "continue", "project")

    assert error.value.code == "invalid_new_folder"
    assert not (tmp_path / "project").exists()


def test_rejects_existing_new_folder(tmp_path, monkeypatch):
    existing = tmp_path / "project"
    existing.mkdir()
    monkeypatch.setattr(launcher.shutil, "which", lambda command: f"/tools/{command}")
    monkeypatch.setattr(launcher.platform, "system", lambda: "Darwin")

    with pytest.raises(launcher.LaunchError) as error:
        launcher.launch_provider("codex", str(tmp_path), "new", "project")

    assert error.value.code == "workspace_exists"
    assert error.value.status_code == 409


def test_creates_single_new_folder_and_launches_in_it(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(launcher.shutil, "which", lambda command: f"/tools/{command}")
    monkeypatch.setattr(launcher.platform, "system", lambda: "Darwin")

    def fake_run(args, **kwargs):
        calls.append(args)
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(launcher.subprocess, "run", fake_run)

    result = launcher.launch_provider(
        "codex",
        str(tmp_path),
        "new",
        "新 project $(safe)",
    )

    workspace = tmp_path / "新 project $(safe)"
    assert workspace.is_dir()
    assert result["workspace_path"] == str(workspace.resolve())
    assert calls[0][3] == (
        f"cd -- {launcher.shlex.quote(str(workspace.resolve()))} && exec codex"
    )


def test_terminal_failure_keeps_new_folder_and_reports_path(tmp_path, monkeypatch):
    monkeypatch.setattr(launcher.shutil, "which", lambda command: f"/tools/{command}")
    monkeypatch.setattr(launcher.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(
        launcher.subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess([], 1, "", ""),
    )

    with pytest.raises(launcher.LaunchError) as error:
        launcher.launch_provider("codex", str(tmp_path), "new", "project")

    workspace = tmp_path / "project"
    assert workspace.is_dir()
    assert error.value.code == "terminal_launch_failed"
    assert str(workspace.resolve()) in str(error.value)
    assert "remains" in str(error.value)


def test_launches_safe_shell_command_with_argument_array(tmp_path, monkeypatch):
    workspace = tmp_path / "專案 '$(touch nope)'"
    workspace.mkdir()
    calls = []

    monkeypatch.setattr(launcher.shutil, "which", lambda command: f"/tools/{command}")
    monkeypatch.setattr(launcher.platform, "system", lambda: "Darwin")

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(launcher.subprocess, "run", fake_run)

    result = launcher.launch_provider("codex", str(workspace), "continue")

    assert result == {
        "launched": True,
        "provider_id": "codex",
        "workspace_path": str(workspace.resolve()),
    }
    assert len(calls) == 1
    args, kwargs = calls[0]
    assert args[:3] == ["osascript", "-e", launcher.TERMINAL_APPLESCRIPT]
    assert args[3] == (
        f"cd -- {launcher.shlex.quote(str(workspace.resolve()))} "
        "&& exec codex resume --last"
    )
    assert kwargs["timeout"] == launcher.TERMINAL_LAUNCH_TIMEOUT_SECONDS
    assert kwargs["check"] is False
    assert "shell" not in kwargs
    assert not (tmp_path / "nope").exists()


@pytest.mark.parametrize(
    ("failure", "expected_code"),
    [
        (subprocess.CompletedProcess([], 1, "", "private error"), "terminal_launch_failed"),
        (OSError("private error"), "terminal_unavailable"),
        (
            subprocess.TimeoutExpired(["osascript"], 10),
            "terminal_timeout",
        ),
    ],
)
def test_terminal_failures_return_safe_errors(
    tmp_path, monkeypatch, failure, expected_code
):
    monkeypatch.setattr(launcher.shutil, "which", lambda command: f"/tools/{command}")
    monkeypatch.setattr(launcher.platform, "system", lambda: "Darwin")

    def fake_run(*args, **kwargs):
        if isinstance(failure, BaseException):
            raise failure
        return failure

    monkeypatch.setattr(launcher.subprocess, "run", fake_run)

    with pytest.raises(launcher.LaunchError) as error:
        launcher.launch_provider("codex", str(tmp_path), "new")

    assert error.value.code == expected_code
    assert error.value.status_code == 502
    assert "private error" not in str(error.value)
