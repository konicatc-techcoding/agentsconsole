"""Launch supported AI CLIs in a native terminal."""

from __future__ import annotations

import platform
import shlex
import shutil
import subprocess
from pathlib import Path
from typing import Literal, TypedDict

from .claude_resume import resumable_session_id
from .providers import PROVIDERS

SessionMode = Literal["new", "continue"]
TERMINAL_LAUNCH_TIMEOUT_SECONDS = 10

SESSION_COMMANDS: dict[str, dict[SessionMode, tuple[str, ...]]] = {
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

PROVIDER_COMMANDS = {spec.id: spec.command for spec in PROVIDERS}

TERMINAL_APPLESCRIPT = """
on run argv
    tell application "Terminal"
        do script (item 1 of argv)
        activate
    end tell
end run
""".strip()


class LaunchResult(TypedDict):
    launched: bool
    provider_id: str
    workspace_path: str


class WorkspaceResult(TypedDict):
    workspace_path: str


class LaunchError(Exception):
    """A safe launch error that can be returned by the local API."""

    def __init__(self, message: str, *, code: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class MacOSTerminalLauncher:
    """Open a command in a new Terminal.app window."""

    def launch(self, shell_command: str) -> None:
        try:
            completed = subprocess.run(
                ["osascript", "-e", TERMINAL_APPLESCRIPT, shell_command],
                capture_output=True,
                text=True,
                timeout=TERMINAL_LAUNCH_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise LaunchError(
                "Terminal.app did not open in time",
                code="terminal_timeout",
                status_code=502,
            ) from exc
        except OSError as exc:
            raise LaunchError(
                "Terminal.app could not be opened",
                code="terminal_unavailable",
                status_code=502,
            ) from exc

        if completed.returncode != 0:
            raise LaunchError(
                "Terminal.app could not be opened",
                code="terminal_launch_failed",
                status_code=502,
            )


def _validated_workspace(workspace_path: str) -> Path:
    workspace = Path(workspace_path)
    if not workspace.is_absolute():
        raise LaunchError(
            "Workspace must be an absolute path",
            code="invalid_workspace",
            status_code=400,
        )

    try:
        resolved = workspace.resolve(strict=True)
    except (FileNotFoundError, OSError) as exc:
        raise LaunchError(
            "Workspace does not exist",
            code="invalid_workspace",
            status_code=400,
        ) from exc

    if resolved == Path("/"):
        raise LaunchError(
            "The filesystem root cannot be used as a workspace",
            code="invalid_workspace",
            status_code=400,
        )
    if not resolved.is_dir():
        raise LaunchError(
            "Workspace must be a directory",
            code="invalid_workspace",
            status_code=400,
        )
    return resolved


def validate_workspace(workspace_path: str) -> WorkspaceResult:
    """Return the resolved form of an existing safe workspace."""

    return {"workspace_path": str(_validated_workspace(workspace_path))}


def _provider_command(
    provider_id: str,
    session_mode: SessionMode,
    workspace: Path,
    resumable=resumable_session_id,
) -> tuple[tuple[str, ...], str | None]:
    """Resolve a provider command and the Claude session it will resume.

    Only Claude's Continue is decided here. The other three have no equivalent
    of ``sessionKind`` and keep the fixed arguments they have always used, and
    so does Claude whenever no resumable session can be identified — the CLI
    then reports "nothing to continue" itself, exactly as it does today.
    """

    modes = SESSION_COMMANDS.get(provider_id)
    if modes is None:
        raise LaunchError(
            "Unknown CLI provider",
            code="unknown_provider",
            status_code=404,
        )
    if provider_id != "claude" or session_mode != "continue":
        return modes[session_mode], None

    session_id = resumable(workspace)
    if session_id is None:
        return modes[session_mode], None
    return ("claude", "--resume", session_id), session_id


def _new_workspace(
    base_workspace: Path,
    session_mode: SessionMode,
    new_folder: str | None,
) -> tuple[Path, bool]:
    if not new_folder:
        return base_workspace, False
    if session_mode != "new":
        raise LaunchError(
            "New Folder is only available for a new session",
            code="invalid_new_folder",
            status_code=400,
        )
    if (
        new_folder in {".", ".."}
        or Path(new_folder).is_absolute()
        or "/" in new_folder
        or "\0" in new_folder
    ):
        raise LaunchError(
            "New Folder must be a single folder name",
            code="invalid_new_folder",
            status_code=400,
        )

    workspace = base_workspace / new_folder
    try:
        workspace.mkdir()
    except FileExistsError as exc:
        raise LaunchError(
            "New Folder already exists",
            code="workspace_exists",
            status_code=409,
        ) from exc
    except OSError as exc:
        raise LaunchError(
            "New Folder could not be created",
            code="workspace_creation_failed",
            status_code=400,
        ) from exc
    return workspace.resolve(strict=True), True


def _shell_command(workspace: Path, command: tuple[str, ...]) -> str:
    change_directory = shlex.join(["cd", "--", str(workspace)])
    return f"{change_directory} && exec {shlex.join(command)}"


def _terminal_launcher() -> MacOSTerminalLauncher:
    if platform.system() != "Darwin":
        raise LaunchError(
            "CLI launch is only supported on macOS",
            code="unsupported_platform",
            status_code=501,
        )
    return MacOSTerminalLauncher()


def launch_provider(
    provider_id: str,
    workspace_path: str,
    session_mode: SessionMode,
    new_folder: str | None = None,
) -> LaunchResult:
    """Validate and launch a fixed provider command in Terminal.app."""

    base_workspace = _validated_workspace(workspace_path)
    # Web mode hands the session to Terminal.app and stops tracking it, so the
    # chosen session id has nowhere to be shown; the embedded Slots report it.
    command, _ = _provider_command(provider_id, session_mode, base_workspace)
    provider_command = PROVIDER_COMMANDS[provider_id]
    if shutil.which(provider_command) is None:
        raise LaunchError(
            "CLI provider is no longer available in PATH",
            code="provider_unavailable",
            status_code=409,
        )

    terminal_launcher = _terminal_launcher()
    workspace, workspace_created = _new_workspace(
        base_workspace,
        session_mode,
        new_folder,
    )
    try:
        terminal_launcher.launch(_shell_command(workspace, command))
    except LaunchError as exc:
        if workspace_created:
            raise LaunchError(
                f"{exc}. The new workspace folder remains at {workspace}",
                code=exc.code,
                status_code=exc.status_code,
            ) from exc
        raise

    return {
        "launched": True,
        "provider_id": provider_id,
        "workspace_path": str(workspace),
    }
