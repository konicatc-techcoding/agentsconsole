import json
from pathlib import Path

import pytest

from app import claude_resume


def test_slug_replaces_every_character_the_cli_replaces():
    assert (
        claude_resume.project_slug(
            Path("/Volumes/1TBM2/AI_Drive/ClaudeCode_Projects/agentsconsole")
        )
        == "-Volumes-1TBM2-AI-Drive-ClaudeCode-Projects-agentsconsole"
    )
    # Spaces and dots go the same way as slashes and underscores.
    assert (
        claude_resume.project_slug(Path("/Users/zackchiu/Documents/Claude Code/v1.2"))
        == "-Users-zackchiu-Documents-Claude-Code-v1-2"
    )


def test_a_path_too_long_to_slug_has_no_slug():
    assert claude_resume.project_slug(Path("/" + "a" * claude_resume.MAX_SLUG_LENGTH)) is None


def _candidates(*entries):
    return list(entries)


# The background transcript is newest. `--continue` skips it for that reason;
# picking by time is the whole point of the change.
def test_picks_the_newest_transcript_regardless_of_session_kind():
    candidates = _candidates(
        ("background-newest", 300.0, "/workspace"),
        ("foreground-older", 200.0, "/workspace"),
    )

    assert (
        claude_resume.pick_resumable(candidates, "/workspace", set())
        == "background-newest"
    )


# Two workspaces can slug to one directory, so the newest transcript in it is
# not necessarily this workspace's.
def test_skips_transcripts_recorded_for_a_different_workspace():
    candidates = _candidates(
        ("other-workspace", 300.0, "/workspace/Auto App"),
        ("this-workspace", 200.0, "/workspace"),
        ("no-recorded-cwd", 100.0, None),
    )

    assert (
        claude_resume.pick_resumable(candidates, "/workspace", set()) == "this-workspace"
    )


# `--resume` on a live background agent is refused by the CLI, so the App moves
# past it to the next resumable one.
def test_skips_sessions_that_are_still_running():
    candidates = _candidates(
        ("still-running", 300.0, "/workspace"),
        ("free-to-resume", 200.0, "/workspace"),
    )

    assert (
        claude_resume.pick_resumable(candidates, "/workspace", {"still-running"})
        == "free-to-resume"
    )


def test_no_resumable_transcript_yields_nothing():
    candidates = _candidates(("running", 300.0, "/workspace"))

    assert claude_resume.pick_resumable(candidates, "/workspace", {"running"}) is None
    assert claude_resume.pick_resumable([], "/workspace", set()) is None


def test_reads_candidates_newest_first_with_their_recorded_cwd(tmp_path):
    older = tmp_path / "older.jsonl"
    older.write_text(
        '{"type":"ai-title"}\n{"cwd":"/workspace","sessionKind":"bg"}\n',
        encoding="utf-8",
    )
    (tmp_path / "ignored.txt").write_text("not a transcript", encoding="utf-8")
    newer = tmp_path / "newer.jsonl"
    newer.write_text('{"cwd":"/workspace/other"}\n', encoding="utf-8")
    import os

    os.utime(older, (100, 100))
    os.utime(newer, (200, 200))

    candidates = claude_resume.read_candidates(tmp_path)

    assert [(session_id, cwd) for session_id, _mtime, cwd in candidates] == [
        ("newer", "/workspace/other"),
        ("older", "/workspace"),
    ]


def test_a_cwd_further_into_the_transcript_is_still_found(tmp_path):
    transcript = tmp_path / "late-cwd.jsonl"
    lines = [json.dumps({"type": f"record-{index}"}) for index in range(7)]
    lines.append(json.dumps({"cwd": "/workspace"}))
    transcript.write_text("\n".join(lines) + "\n", encoding="utf-8")

    candidates = claude_resume.read_candidates(tmp_path)

    assert candidates[0][2] == "/workspace"


def test_a_cwd_past_the_search_window_is_not_found(tmp_path):
    transcript = tmp_path / "very-late-cwd.jsonl"
    lines = [
        json.dumps({"type": f"record-{index}"})
        for index in range(claude_resume.CWD_SEARCH_LINES)
    ]
    lines.append(json.dumps({"cwd": "/workspace"}))
    transcript.write_text("\n".join(lines) + "\n", encoding="utf-8")

    candidates = claude_resume.read_candidates(tmp_path)

    assert candidates[0][2] is None


def test_live_sessions_are_those_whose_process_answers(tmp_path):
    (tmp_path / "alive.json").write_text(
        json.dumps({"pid": 4242, "sessionId": "running-session", "kind": "bg"}),
        encoding="utf-8",
    )
    (tmp_path / "dead.json").write_text(
        json.dumps({"pid": 99, "sessionId": "finished-session"}), encoding="utf-8"
    )
    (tmp_path / "ignored.key").write_text("not a session", encoding="utf-8")

    live = claude_resume.live_session_ids(
        tmp_path, is_alive=lambda process_id: process_id == 4242
    )

    assert live == {"running-session"}


def test_a_missing_directory_reads_as_nothing_rather_than_failing(tmp_path):
    missing = tmp_path / "does-not-exist"

    assert claude_resume.read_candidates(missing) == []
    assert claude_resume.live_session_ids(missing, is_alive=lambda _pid: True) == set()


def test_resolves_a_session_through_the_configured_root(tmp_path, monkeypatch):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    slug = claude_resume.project_slug(workspace)
    project_directory = tmp_path / "config" / "projects" / slug
    project_directory.mkdir(parents=True)
    (project_directory / "the-session.jsonl").write_text(
        json.dumps({"cwd": str(workspace), "sessionKind": "bg"}) + "\n",
        encoding="utf-8",
    )
    (tmp_path / "config" / "sessions").mkdir()
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "config"))

    assert claude_resume.resumable_session_id(workspace) == "the-session"


def test_a_workspace_with_no_project_directory_resolves_to_nothing(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "config"))

    assert claude_resume.resumable_session_id(tmp_path / "never-used") is None
