import subprocess

from app import providers


PATHS = {
    "hermes": "/tools/hermes",
    "codex": "/tools/codex",
    "claude": "/tools/claude",
    "agy": "/tools/agy",
}

VERSIONS = {
    "/tools/hermes": "Hermes Agent v0.19.0\n",
    "/tools/codex": "codex-cli 0.145.0\n",
    "/tools/claude": "2.1.218 (Claude Code)\n",
    "/tools/agy": "1.1.5\n",
}


def completed(path: str, *, returncode: int = 0, stderr: str = ""):
    return subprocess.CompletedProcess(
        [path, "--version"],
        returncode,
        stdout=VERSIONS.get(path, ""),
        stderr=stderr,
    )


def test_detects_all_providers_in_fixed_order(monkeypatch):
    monkeypatch.setattr(providers.shutil, "which", PATHS.get)
    monkeypatch.setattr(
        providers.subprocess,
        "run",
        lambda args, **kwargs: completed(args[0]),
    )

    results = providers.detect_providers()

    assert [result["id"] for result in results] == [
        "hermes",
        "codex",
        "claude",
        "antigravity",
    ]
    assert all(result["installed"] for result in results)
    assert all(result["version"] for result in results)
    assert all(result["error"] is None for result in results)


def test_missing_provider_does_not_block_others(monkeypatch):
    monkeypatch.setattr(
        providers.shutil,
        "which",
        lambda command: None if command == "claude" else PATHS[command],
    )
    monkeypatch.setattr(
        providers.subprocess,
        "run",
        lambda args, **kwargs: completed(args[0]),
    )

    results = providers.detect_providers()
    claude = results[2]

    assert claude == {
        "id": "claude",
        "display_name": "Claude CLI",
        "command": "claude",
        "installed": False,
        "path": None,
        "version": None,
        "error": "Executable not found in PATH",
    }
    assert results[0]["version"] == "Hermes Agent v0.19.0"
    assert results[3]["version"] == "1.1.5"


def test_nonzero_exit_is_isolated(monkeypatch):
    monkeypatch.setattr(providers.shutil, "which", PATHS.get)

    def fake_run(args, **kwargs):
        if args[0] == "/tools/hermes":
            return completed(args[0], returncode=2, stderr="failed")
        return completed(args[0])

    monkeypatch.setattr(providers.subprocess, "run", fake_run)

    results = providers.detect_providers()

    assert results[0]["installed"] is True
    assert results[0]["version"] is None
    assert results[0]["error"] == "Version command exited with code 2"
    assert results[1]["version"] == "codex-cli 0.145.0"


def test_timeout_is_isolated_and_uses_argument_array(monkeypatch):
    monkeypatch.setattr(providers.shutil, "which", PATHS.get)
    calls = []

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        if args[0] == "/tools/agy":
            raise subprocess.TimeoutExpired(args, kwargs["timeout"])
        return completed(args[0])

    monkeypatch.setattr(providers.subprocess, "run", fake_run)

    results = providers.detect_providers()

    assert results[3]["error"] == "Version check timed out"
    assert calls[0][0] == ["/tools/hermes", "--version"]
    assert calls[0][1]["timeout"] == providers.VERSION_TIMEOUT_SECONDS
    assert "shell" not in calls[0][1]


def test_codex_warning_before_version_is_ignored(monkeypatch):
    monkeypatch.setattr(providers.shutil, "which", PATHS.get)

    def fake_run(args, **kwargs):
        if args[0] == "/tools/codex":
            return subprocess.CompletedProcess(
                args,
                0,
                stdout="codex-cli 0.145.0\n",
                stderr="WARNING: could not create PATH aliases\n",
            )
        return completed(args[0])

    monkeypatch.setattr(providers.subprocess, "run", fake_run)

    assert providers.detect_providers()[1]["version"] == "codex-cli 0.145.0"


def test_empty_version_output_is_reported(monkeypatch):
    monkeypatch.setattr(providers.shutil, "which", PATHS.get)
    monkeypatch.setattr(
        providers.subprocess,
        "run",
        lambda args, **kwargs: subprocess.CompletedProcess(args, 0, "", ""),
    )

    results = providers.detect_providers()

    assert all(
        result["error"] == "Version command returned no usable output"
        for result in results
    )
