//! Pick the Claude session a Slot's Continue should resume.
//!
//! `claude --continue` decides for itself, and its rule is `if (sessionKind)
//! return false` — every background agent transcript carries `sessionKind`, so
//! Continue skips all of them. A workspace whose only conversation ran in the
//! background reports "No conversation found to continue"; a workspace with a
//! mix silently reattaches to some older foreground conversation instead, with
//! nothing on screen saying which one. `--resume <id>` has no such rule, so the
//! App picks the session itself and says which one it picked.
//!
//! Everything here is best-effort. When no session can be identified the
//! caller falls back to plain `--continue`, which behaves exactly as it does
//! today — including its own "nothing to continue" message.

use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

// The CLI slugs a workspace with `replace(/[^a-zA-Z0-9]/g, "-")` and, past 200
// characters, truncates and appends a hash of its own. We do not reproduce that
// hash: a path that long simply has no slug we can derive, and Continue falls
// back rather than guessing at a directory.
const MAX_SLUG_LENGTH: usize = 200;
// `cwd` is not on the first record — a transcript opens with title, mode, and
// permission entries and only reaches a record carrying `cwd` a few lines in
// (line 4 and line 7 in the two transcripts this was built against). Reading a
// bounded prefix keeps a large transcript from being walked in full.
const CWD_SEARCH_LINES: usize = 64;

/// A transcript that could be resumed, before any filtering.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct TranscriptCandidate {
    pub(crate) session_id: String,
    pub(crate) modified: SystemTime,
    /// The `cwd` this transcript recorded, when one was found in its prefix.
    pub(crate) cwd: Option<String>,
}

/// Turn a workspace path into the CLI's project directory name.
pub(crate) fn project_slug(workspace: &Path) -> Option<String> {
    let slug = workspace
        .to_string_lossy()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    (slug.len() <= MAX_SLUG_LENGTH).then_some(slug)
}

/// The CLI's configuration root, honouring the same override the CLI reads.
fn config_root() -> Option<PathBuf> {
    if let Some(configured) = std::env::var_os("CLAUDE_CONFIG_DIR") {
        if !configured.is_empty() {
            return Some(PathBuf::from(configured));
        }
    }
    std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(|home| PathBuf::from(home).join(".claude"))
}

/// Read the `cwd` a transcript recorded, from a bounded prefix of its records.
fn transcript_cwd(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    for line in BufReader::new(file).lines().take(CWD_SEARCH_LINES) {
        let Ok(line) = line else { break };
        if let Some(cwd) = json_string_field(&line, "cwd") {
            return Some(cwd);
        }
    }
    None
}

/// Pull one string field out of a flat JSON object.
///
/// The transcripts are one JSON object per line and we want exactly one
/// top-level string from each, so this reads the field directly rather than
/// deserializing records whose full shape is the CLI's business and changes
/// with it.
fn json_string_field(line: &str, field: &str) -> Option<String> {
    let key = format!("\"{field}\"");
    let mut rest = line;
    loop {
        let at = rest.find(&key)?;
        let after_key = &rest[at + key.len()..];
        let after_colon = after_key.trim_start();
        let Some(after_colon) = after_colon.strip_prefix(':') else {
            rest = after_key;
            continue;
        };
        let value = after_colon.trim_start();
        let Some(value) = value.strip_prefix('"') else {
            rest = after_key;
            continue;
        };
        return Some(unescape_json_string(value));
    }
}

/// Decode a JSON string body up to its closing quote.
fn unescape_json_string(value: &str) -> String {
    let mut decoded = String::new();
    let mut characters = value.chars();
    while let Some(character) = characters.next() {
        match character {
            '"' => break,
            '\\' => match characters.next() {
                Some('n') => decoded.push('\n'),
                Some('t') => decoded.push('\t'),
                Some('r') => decoded.push('\r'),
                Some('u') => {
                    let hex = characters.by_ref().take(4).collect::<String>();
                    match u32::from_str_radix(&hex, 16).ok().and_then(char::from_u32) {
                        Some(decoded_character) => decoded.push(decoded_character),
                        // An unpaired surrogate cannot be a path character, so
                        // the candidate simply fails its cwd check.
                        None => return decoded,
                    }
                }
                Some(escaped) => decoded.push(escaped),
                None => break,
            },
            _ => decoded.push(character),
        }
    }
    decoded
}

/// Every transcript in a project directory, newest first.
fn read_candidates(project_directory: &Path) -> Vec<TranscriptCandidate> {
    let Ok(entries) = fs::read_dir(project_directory) else {
        return vec![];
    };
    let mut candidates = entries
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            if path.extension() != Some(OsStr::new("jsonl")) {
                return None;
            }
            let session_id = path.file_stem()?.to_str()?.to_string();
            let modified = path.metadata().ok()?.modified().ok()?;
            Some(TranscriptCandidate {
                session_id,
                modified,
                cwd: transcript_cwd(&path),
            })
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .modified
            .cmp(&left.modified)
            .then_with(|| left.session_id.cmp(&right.session_id))
    });
    candidates
}

/// The sessions of processes that are still running.
///
/// Recomputed on every Continue rather than cached: a background session that
/// was stopped can be pulled back up from the Agent View at any moment, so a
/// remembered answer goes stale without warning.
fn live_session_ids(sessions_directory: &Path, is_alive: impl Fn(i32) -> bool) -> HashSet<String> {
    let Ok(entries) = fs::read_dir(sessions_directory) else {
        return HashSet::new();
    };
    entries
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            if path.extension() != Some(OsStr::new("json")) {
                return None;
            }
            let contents = fs::read_to_string(&path).ok()?;
            let session_id = json_string_field(&contents, "sessionId")?;
            let process_id = json_number_field(&contents, "pid")?;
            is_alive(process_id).then_some(session_id)
        })
        .collect()
}

/// Pull one integer field out of a flat JSON object.
fn json_number_field(contents: &str, field: &str) -> Option<i32> {
    let key = format!("\"{field}\"");
    let at = contents.find(&key)?;
    let after_colon = contents[at + key.len()..].trim_start().strip_prefix(':')?;
    let digits = after_colon
        .trim_start()
        .chars()
        .take_while(|character| character.is_ascii_digit() || *character == '-')
        .collect::<String>();
    digits.parse().ok()
}

#[cfg(unix)]
fn process_is_alive(process_id: i32) -> bool {
    if process_id <= 0 {
        return false;
    }
    // Signal 0 performs the existence and permission checks without delivering
    // anything. EPERM means the process is there but owned by somebody else,
    // which still counts as alive.
    let result = unsafe { libc::kill(process_id, 0) };
    if result == 0 {
        return true;
    }
    std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(not(unix))]
fn process_is_alive(_process_id: i32) -> bool {
    false
}

/// Choose the newest transcript that belongs to this workspace and is free.
///
/// The slug is lossy — `/` and `_` and spaces all become `-`, so two different
/// workspaces can land in one directory, and one was observed doing exactly
/// that. Each candidate's recorded `cwd` is what actually decides whether it
/// belongs here; a transcript with no readable `cwd` is left alone rather than
/// assumed to match.
pub(crate) fn pick_resumable(
    candidates: &[TranscriptCandidate],
    workspace: &str,
    live_session_ids: &HashSet<String>,
) -> Option<String> {
    candidates
        .iter()
        .find(|candidate| {
            candidate.cwd.as_deref() == Some(workspace)
                && !live_session_ids.contains(&candidate.session_id)
        })
        .map(|candidate| candidate.session_id.clone())
}

/// The session id a Continue in this workspace should resume, if any.
pub(crate) fn resumable_session_id(workspace: &Path) -> Option<String> {
    let root = config_root()?;
    let slug = project_slug(workspace)?;
    let candidates = read_candidates(&root.join("projects").join(slug));
    if candidates.is_empty() {
        return None;
    }
    let live = live_session_ids(&root.join("sessions"), process_is_alive);
    pick_resumable(&candidates, &workspace.to_string_lossy(), &live)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, UNIX_EPOCH};

    static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

    fn temp_directory() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let sequence = NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
        let directory = std::env::temp_dir().join(format!(
            "agentos-resume-{}-{unique}-{sequence}",
            std::process::id()
        ));
        fs::create_dir(&directory).unwrap();
        directory
    }

    fn candidate(session_id: &str, seconds: u64, cwd: Option<&str>) -> TranscriptCandidate {
        TranscriptCandidate {
            session_id: session_id.to_string(),
            modified: UNIX_EPOCH + Duration::from_secs(seconds),
            cwd: cwd.map(str::to_string),
        }
    }

    #[test]
    fn slug_replaces_every_character_the_cli_replaces() {
        assert_eq!(
            project_slug(Path::new(
                "/Volumes/1TBM2/AI_Drive/ClaudeCode_Projects/agentsconsole"
            ))
            .unwrap(),
            "-Volumes-1TBM2-AI-Drive-ClaudeCode-Projects-agentsconsole"
        );
        // Spaces and dots go the same way as slashes and underscores.
        assert_eq!(
            project_slug(Path::new("/Users/zackchiu/Documents/Claude Code/v1.2")).unwrap(),
            "-Users-zackchiu-Documents-Claude-Code-v1-2"
        );
    }

    #[test]
    fn a_path_too_long_to_slug_has_no_slug() {
        let long = format!("/{}", "a".repeat(MAX_SLUG_LENGTH));

        assert_eq!(project_slug(Path::new(&long)), None);
    }

    #[test]
    fn picks_the_newest_transcript_regardless_of_session_kind() {
        // The background transcript is newest. `--continue` skips it for that
        // reason; picking by time is the whole point of the change.
        let candidates = vec![
            candidate("background-newest", 300, Some("/workspace")),
            candidate("foreground-older", 200, Some("/workspace")),
        ];

        assert_eq!(
            pick_resumable(&candidates, "/workspace", &HashSet::new()),
            Some("background-newest".to_string())
        );
    }

    #[test]
    fn skips_transcripts_recorded_for_a_different_workspace() {
        // Two workspaces can slug to one directory, so the newest transcript in
        // it is not necessarily this workspace's.
        let candidates = vec![
            candidate("other-workspace", 300, Some("/workspace/Auto App")),
            candidate("this-workspace", 200, Some("/workspace")),
            candidate("no-recorded-cwd", 100, None),
        ];

        assert_eq!(
            pick_resumable(&candidates, "/workspace", &HashSet::new()),
            Some("this-workspace".to_string())
        );
    }

    #[test]
    fn skips_sessions_that_are_still_running() {
        // `--resume` on a live background agent is refused by the CLI, so the
        // App moves past it to the next resumable one.
        let candidates = vec![
            candidate("still-running", 300, Some("/workspace")),
            candidate("free-to-resume", 200, Some("/workspace")),
        ];
        let live = HashSet::from(["still-running".to_string()]);

        assert_eq!(
            pick_resumable(&candidates, "/workspace", &live),
            Some("free-to-resume".to_string())
        );
    }

    #[test]
    fn no_resumable_transcript_yields_nothing() {
        let candidates = vec![candidate("running", 300, Some("/workspace"))];
        let live = HashSet::from(["running".to_string()]);

        assert_eq!(pick_resumable(&candidates, "/workspace", &live), None);
        assert_eq!(pick_resumable(&[], "/workspace", &HashSet::new()), None);
    }

    #[test]
    fn reads_candidates_newest_first_with_their_recorded_cwd() {
        let directory = temp_directory();
        fs::write(
            directory.join("older.jsonl"),
            "{\"type\":\"ai-title\"}\n{\"cwd\":\"/workspace\",\"sessionKind\":\"bg\"}\n",
        )
        .unwrap();
        fs::write(directory.join("ignored.txt"), "not a transcript").unwrap();
        // Written second so its modification time is the later one.
        fs::write(
            directory.join("newer.jsonl"),
            "{\"cwd\":\"/workspace/other\"}\n",
        )
        .unwrap();

        let candidates = read_candidates(&directory);

        assert_eq!(candidates.len(), 2);
        assert_eq!(candidates[0].session_id, "newer");
        assert_eq!(candidates[0].cwd.as_deref(), Some("/workspace/other"));
        assert_eq!(candidates[1].session_id, "older");
        assert_eq!(candidates[1].cwd.as_deref(), Some("/workspace"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_cwd_further_into_the_transcript_is_still_found() {
        let directory = temp_directory();
        let mut transcript = String::new();
        for index in 0..7 {
            transcript.push_str(&format!("{{\"type\":\"record-{index}\"}}\n"));
        }
        transcript.push_str("{\"cwd\":\"/workspace\"}\n");
        fs::write(directory.join("late-cwd.jsonl"), transcript).unwrap();

        let candidates = read_candidates(&directory);

        assert_eq!(candidates[0].cwd.as_deref(), Some("/workspace"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_cwd_past_the_search_window_is_not_found() {
        let directory = temp_directory();
        let mut transcript = String::new();
        for index in 0..CWD_SEARCH_LINES {
            transcript.push_str(&format!("{{\"type\":\"record-{index}\"}}\n"));
        }
        transcript.push_str("{\"cwd\":\"/workspace\"}\n");
        fs::write(directory.join("very-late-cwd.jsonl"), transcript).unwrap();

        let candidates = read_candidates(&directory);

        assert_eq!(candidates[0].cwd, None);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn escaped_paths_are_decoded_before_they_are_compared() {
        let directory = temp_directory();
        fs::write(
            directory.join("escaped.jsonl"),
            "{\"cwd\":\"/workspace/caf\\u00e9 \\\"quoted\\\"\"}\n",
        )
        .unwrap();

        let candidates = read_candidates(&directory);

        assert_eq!(
            candidates[0].cwd.as_deref(),
            Some("/workspace/café \"quoted\"")
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn live_sessions_are_those_whose_process_answers() {
        let directory = temp_directory();
        fs::write(
            directory.join("alive.json"),
            "{\"pid\":4242,\"sessionId\":\"running-session\",\"kind\":\"bg\"}",
        )
        .unwrap();
        fs::write(
            directory.join("dead.json"),
            "{\"pid\":99,\"sessionId\":\"finished-session\"}",
        )
        .unwrap();
        fs::write(directory.join("ignored.key"), "not a session").unwrap();

        let live = live_session_ids(&directory, |process_id| process_id == 4242);

        assert_eq!(live, HashSet::from(["running-session".to_string()]));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_missing_directory_reads_as_nothing_rather_than_failing() {
        let missing = std::env::temp_dir().join("agentos-resume-does-not-exist");

        assert!(read_candidates(&missing).is_empty());
        assert!(live_session_ids(&missing, |_| true).is_empty());
    }
}
