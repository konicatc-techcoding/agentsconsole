"""Read-only discovery for the fixed set of supported AI CLIs."""

from __future__ import annotations

import shutil
import subprocess
from typing import NamedTuple, TypedDict

VERSION_TIMEOUT_SECONDS = 3


class ProviderSpec(NamedTuple):
    id: str
    display_name: str
    command: str
    version_markers: tuple[str, ...]


class ProviderResult(TypedDict):
    id: str
    display_name: str
    command: str
    installed: bool
    path: str | None
    version: str | None
    error: str | None


PROVIDERS: tuple[ProviderSpec, ...] = (
    ProviderSpec("hermes", "Hermes CLI", "hermes", ("hermes agent",)),
    ProviderSpec("codex", "Codex CLI", "codex", ("codex-cli",)),
    ProviderSpec("claude", "Claude CLI", "claude", ("claude code",)),
    ProviderSpec("antigravity", "Antigravity CLI", "agy", ()),
)


def _version_line(output: str, markers: tuple[str, ...]) -> str | None:
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    for marker in markers:
        for line in lines:
            if marker in line.casefold():
                return line
    for line in lines:
        if not line.casefold().startswith("warning:"):
            return line
    return None


def detect_provider(spec: ProviderSpec) -> ProviderResult:
    path = shutil.which(spec.command)
    base: ProviderResult = {
        "id": spec.id,
        "display_name": spec.display_name,
        "command": spec.command,
        "installed": path is not None,
        "path": path,
        "version": None,
        "error": None,
    }
    if path is None:
        base["error"] = "Executable not found in PATH"
        return base

    try:
        completed = subprocess.run(
            [path, "--version"],
            capture_output=True,
            text=True,
            timeout=VERSION_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        base["error"] = "Version check timed out"
        return base
    except OSError as exc:
        base["error"] = f"Version check failed: {exc}"
        return base

    output = "\n".join(part for part in (completed.stdout, completed.stderr) if part)
    if completed.returncode != 0:
        base["error"] = f"Version command exited with code {completed.returncode}"
        return base

    version = _version_line(output, spec.version_markers)
    if version is None:
        base["error"] = "Version command returned no usable output"
        return base

    base["version"] = version
    return base


def detect_providers() -> list[ProviderResult]:
    return [detect_provider(spec) for spec in PROVIDERS]
