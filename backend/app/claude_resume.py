"""Pick the Claude session a Continue should resume.

``claude --continue`` decides for itself, and its rule is to skip every
transcript carrying ``sessionKind`` — which every background agent transcript
does. A workspace whose only conversation ran in the background reports "No
conversation found to continue"; a workspace with a mix silently reattaches to
some older foreground conversation instead. ``--resume <id>`` has no such rule,
so the App picks the session itself.

Everything here is best-effort. When no session can be identified the caller
falls back to plain ``--continue``, which behaves exactly as it does today.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

# The CLI slugs a workspace with ``replace(/[^a-zA-Z0-9]/g, "-")`` and, past 200
# characters, truncates and appends a hash of its own. We do not reproduce that
# hash: a path that long simply has no slug we can derive, and Continue falls
# back rather than guessing at a directory.
MAX_SLUG_LENGTH = 200
# ``cwd`` is not on the first record — a transcript opens with title, mode, and
# permission entries and only reaches a record carrying ``cwd`` a few lines in.
CWD_SEARCH_LINES = 64

_NON_ALPHANUMERIC = re.compile(r"[^a-zA-Z0-9]")


def project_slug(workspace: Path) -> str | None:
    """Turn a workspace path into the CLI's project directory name."""

    slug = _NON_ALPHANUMERIC.sub("-", str(workspace))
    return slug if len(slug) <= MAX_SLUG_LENGTH else None


def _config_root() -> Path | None:
    configured = os.environ.get("CLAUDE_CONFIG_DIR")
    if configured:
        return Path(configured)
    home = os.environ.get("HOME")
    return Path(home) / ".claude" if home else None


def _transcript_cwd(path: Path) -> str | None:
    """Read the ``cwd`` a transcript recorded, from a bounded prefix."""

    try:
        with path.open(encoding="utf-8", errors="replace") as transcript:
            for index, line in enumerate(transcript):
                if index >= CWD_SEARCH_LINES:
                    break
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                if isinstance(record, dict) and isinstance(record.get("cwd"), str):
                    return record["cwd"]
    except OSError:
        return None
    return None


def read_candidates(project_directory: Path) -> list[tuple[str, float, str | None]]:
    """Every transcript in a project directory as (session id, mtime, cwd)."""

    try:
        transcripts = list(project_directory.glob("*.jsonl"))
    except OSError:
        return []

    candidates = []
    for transcript in transcripts:
        try:
            modified = transcript.stat().st_mtime
        except OSError:
            continue
        candidates.append((transcript.stem, modified, _transcript_cwd(transcript)))
    candidates.sort(key=lambda candidate: (-candidate[1], candidate[0]))
    return candidates


def _process_is_alive(process_id: int) -> bool:
    if process_id <= 0:
        return False
    try:
        # Signal 0 performs the existence and permission checks without
        # delivering anything.
        os.kill(process_id, 0)
    except PermissionError:
        # Owned by somebody else, but still there.
        return True
    except OSError:
        return False
    return True


def live_session_ids(sessions_directory: Path, is_alive=_process_is_alive) -> set[str]:
    """The sessions of processes that are still running.

    Recomputed on every Continue rather than cached: a background session that
    was stopped can be pulled back up from the Agent View at any moment.
    """

    try:
        session_files = list(sessions_directory.glob("*.json"))
    except OSError:
        return set()

    live = set()
    for session_file in session_files:
        try:
            record = json.loads(session_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(record, dict):
            continue
        session_id = record.get("sessionId")
        process_id = record.get("pid")
        if not isinstance(session_id, str) or not isinstance(process_id, int):
            continue
        if is_alive(process_id):
            live.add(session_id)
    return live


def pick_resumable(
    candidates: list[tuple[str, float, str | None]],
    workspace: str,
    live: set[str],
) -> str | None:
    """Choose the newest transcript that belongs here and is free.

    The slug is lossy — ``/`` and ``_`` and spaces all become ``-``, so two
    different workspaces can land in one directory. Each candidate's recorded
    ``cwd`` is what actually decides whether it belongs here; a transcript with
    no readable ``cwd`` is left alone rather than assumed to match.
    """

    for session_id, _modified, cwd in candidates:
        if cwd == workspace and session_id not in live:
            return session_id
    return None


def resumable_session_id(workspace: Path) -> str | None:
    """The session id a Continue in this workspace should resume, if any."""

    root = _config_root()
    if root is None:
        return None
    slug = project_slug(workspace)
    if slug is None:
        return None
    candidates = read_candidates(root / "projects" / slug)
    if not candidates:
        return None
    return pick_resumable(candidates, str(workspace), live_session_ids(root / "sessions"))
