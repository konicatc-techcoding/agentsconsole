use crate::providers::resolve_executable;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const TERMINAL_LAUNCH_TIMEOUT: Duration = Duration::from_secs(10);
const TERMINAL_APPLESCRIPT: &str = r#"on run argv
    tell application "Terminal"
        do script (item 1 of argv)
        activate
    end tell
end run"#;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionMode {
    New,
    Continue,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LaunchRequest {
    provider_id: String,
    workspace_path: String,
    session_mode: SessionMode,
    new_folder: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct LaunchResult {
    launched: bool,
    provider_id: String,
    workspace_path: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct WorkspaceResult {
    workspace_path: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct CommandError {
    pub(crate) code: String,
    pub(crate) message: String,
    pub(crate) status_code: u16,
}

impl CommandError {
    pub(crate) fn new(code: &str, message: impl Into<String>, status_code: u16) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            status_code,
        }
    }
}

trait TerminalLauncher {
    fn launch(&self, shell_command: &str) -> Result<(), CommandError>;
}

struct SystemTerminalLauncher;

impl TerminalLauncher for SystemTerminalLauncher {
    fn launch(&self, shell_command: &str) -> Result<(), CommandError> {
        let mut child = Command::new("osascript")
            .args(["-e", TERMINAL_APPLESCRIPT, shell_command])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| {
                CommandError::new(
                    "terminal_unavailable",
                    "Terminal.app could not be opened",
                    502,
                )
            })?;
        let started = Instant::now();

        loop {
            match child.try_wait() {
                Ok(Some(status)) if status.success() => return Ok(()),
                Ok(Some(_)) => {
                    return Err(CommandError::new(
                        "terminal_launch_failed",
                        "Terminal.app could not be opened",
                        502,
                    ))
                }
                Ok(None) if started.elapsed() < TERMINAL_LAUNCH_TIMEOUT => {
                    thread::sleep(Duration::from_millis(10));
                }
                Ok(None) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(CommandError::new(
                        "terminal_timeout",
                        "Terminal.app did not open in time",
                        502,
                    ));
                }
                Err(_) => {
                    return Err(CommandError::new(
                        "terminal_unavailable",
                        "Terminal.app could not be opened",
                        502,
                    ))
                }
            }
        }
    }
}

pub(crate) fn validated_workspace(workspace_path: &str) -> Result<PathBuf, CommandError> {
    let workspace = Path::new(workspace_path);
    if !workspace.is_absolute() {
        return Err(CommandError::new(
            "invalid_workspace",
            "Workspace must be an absolute path",
            400,
        ));
    }

    let resolved = workspace
        .canonicalize()
        .map_err(|_| CommandError::new("invalid_workspace", "Workspace does not exist", 400))?;
    if resolved.parent().is_none() {
        return Err(CommandError::new(
            "invalid_workspace",
            "The filesystem root cannot be used as a workspace",
            400,
        ));
    }
    if !resolved.is_dir() {
        return Err(CommandError::new(
            "invalid_workspace",
            "Workspace must be a directory",
            400,
        ));
    }
    Ok(resolved)
}

pub fn validate_workspace(workspace_path: &str) -> Result<WorkspaceResult, CommandError> {
    Ok(WorkspaceResult {
        workspace_path: validated_workspace(workspace_path)?
            .to_string_lossy()
            .into_owned(),
    })
}

/// A resolved provider command, plus the Claude session it will resume.
pub(crate) struct ProviderCommand {
    pub(crate) executable: &'static str,
    pub(crate) arguments: Vec<String>,
    /// The session `--resume` was given, so a Slot can say which one it picked.
    pub(crate) resumed_session_id: Option<String>,
}

fn fixed_command(
    provider_id: &str,
    session_mode: SessionMode,
) -> Result<(&'static str, &'static [&'static str]), CommandError> {
    let command = match (provider_id, session_mode) {
        ("hermes", SessionMode::New) => ("hermes", &["hermes"][..]),
        ("hermes", SessionMode::Continue) => {
            ("hermes", &["hermes", "--continue", "--no-restore-cwd"][..])
        }
        ("codex", SessionMode::New) => ("codex", &["codex"][..]),
        ("codex", SessionMode::Continue) => ("codex", &["codex", "resume", "--last"][..]),
        ("claude", SessionMode::New) => ("claude", &["claude"][..]),
        ("claude", SessionMode::Continue) => ("claude", &["claude", "--continue"][..]),
        ("antigravity", SessionMode::New) => ("agy", &["agy"][..]),
        ("antigravity", SessionMode::Continue) => ("agy", &["agy", "--continue"][..]),
        _ => {
            return Err(CommandError::new(
                "unknown_provider",
                "Unknown CLI provider",
                404,
            ))
        }
    };
    Ok(command)
}

/// Resolve the command for a provider, choosing the Claude session to resume.
///
/// Only Claude's Continue is decided here. The other three have no equivalent
/// of `sessionKind` and keep the fixed arguments they have always used, and so
/// does Claude whenever no resumable session can be identified — the CLI then
/// reports "nothing to continue" itself, exactly as it does today.
pub(crate) fn provider_command_for(
    provider_id: &str,
    session_mode: SessionMode,
    workspace: &Path,
    resumable: impl Fn(&Path) -> Option<String>,
) -> Result<ProviderCommand, CommandError> {
    let (executable, fixed) = fixed_command(provider_id, session_mode)?;
    let resumed_session_id = match (provider_id, session_mode) {
        ("claude", SessionMode::Continue) => resumable(workspace),
        _ => None,
    };
    let arguments = match &resumed_session_id {
        Some(session_id) => vec![
            executable.to_string(),
            "--resume".to_string(),
            session_id.clone(),
        ],
        None => fixed.iter().map(|argument| argument.to_string()).collect(),
    };
    Ok(ProviderCommand {
        executable,
        arguments,
        resumed_session_id,
    })
}

pub(crate) fn provider_command(
    provider_id: &str,
    session_mode: SessionMode,
    workspace: &Path,
) -> Result<ProviderCommand, CommandError> {
    provider_command_for(
        provider_id,
        session_mode,
        workspace,
        crate::claude_resume::resumable_session_id,
    )
}

pub(crate) fn new_workspace(
    base_workspace: &Path,
    session_mode: SessionMode,
    new_folder: Option<&str>,
) -> Result<(PathBuf, bool), CommandError> {
    let Some(new_folder) = new_folder.filter(|folder| !folder.is_empty()) else {
        return Ok((base_workspace.to_path_buf(), false));
    };
    if session_mode != SessionMode::New {
        return Err(CommandError::new(
            "invalid_new_folder",
            "New Folder is only available for a new session",
            400,
        ));
    }
    if matches!(new_folder, "." | "..")
        || Path::new(new_folder).is_absolute()
        || new_folder.contains('/')
        || new_folder.contains('\0')
    {
        return Err(CommandError::new(
            "invalid_new_folder",
            "New Folder must be a single folder name",
            400,
        ));
    }

    let workspace = base_workspace.join(new_folder);
    match fs::create_dir(&workspace) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            return Err(CommandError::new(
                "workspace_exists",
                "New Folder already exists",
                409,
            ))
        }
        Err(_) => {
            return Err(CommandError::new(
                "workspace_creation_failed",
                "New Folder could not be created",
                400,
            ))
        }
    }
    let resolved = workspace.canonicalize().map_err(|_| {
        CommandError::new(
            "workspace_creation_failed",
            "New Folder could not be created",
            400,
        )
    })?;
    Ok((resolved, true))
}

fn shell_quote(value: &str) -> String {
    if !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_@%+=:,./-".contains(character))
    {
        return value.to_string();
    }
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn shell_command(workspace: &Path, command: &[String]) -> String {
    let workspace = shell_quote(&workspace.to_string_lossy());
    let command = command
        .iter()
        .map(|argument| shell_quote(argument))
        .collect::<Vec<_>>()
        .join(" ");
    format!("cd -- {workspace} && exec {command}")
}

fn launch_provider_with<F, L>(
    request: LaunchRequest,
    executable_available: F,
    terminal: &L,
) -> Result<LaunchResult, CommandError>
where
    F: Fn(&str) -> bool,
    L: TerminalLauncher,
{
    let base_workspace = validated_workspace(&request.workspace_path)?;
    let command = provider_command(&request.provider_id, request.session_mode, &base_workspace)?;
    if !executable_available(command.executable) {
        return Err(CommandError::new(
            "provider_unavailable",
            "CLI provider is no longer available in PATH",
            409,
        ));
    }

    let (workspace, workspace_created) = new_workspace(
        &base_workspace,
        request.session_mode,
        request.new_folder.as_deref(),
    )?;
    if let Err(error) = terminal.launch(&shell_command(&workspace, &command.arguments)) {
        if workspace_created {
            return Err(CommandError::new(
                &error.code,
                format!(
                    "{}. The new workspace folder remains at {}",
                    error.message,
                    workspace.to_string_lossy()
                ),
                error.status_code,
            ));
        }
        return Err(error);
    }

    Ok(LaunchResult {
        launched: true,
        provider_id: request.provider_id,
        workspace_path: workspace.to_string_lossy().into_owned(),
    })
}

pub fn launch_provider(request: LaunchRequest) -> Result<LaunchResult, CommandError> {
    if !cfg!(target_os = "macos") {
        return Err(CommandError::new(
            "unsupported_platform",
            "CLI launch is only supported on macOS",
            501,
        ));
    }
    launch_provider_with(
        request,
        |command| resolve_executable(command).is_some(),
        &SystemTerminalLauncher,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

    struct FakeTerminal {
        calls: RefCell<Vec<String>>,
        failure: Option<CommandError>,
    }

    impl TerminalLauncher for FakeTerminal {
        fn launch(&self, shell_command: &str) -> Result<(), CommandError> {
            self.calls.borrow_mut().push(shell_command.to_string());
            match &self.failure {
                Some(error) => Err(CommandError::new(
                    &error.code,
                    &error.message,
                    error.status_code,
                )),
                None => Ok(()),
            }
        }
    }

    fn temp_workspace() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let sequence = NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
        let workspace = std::env::temp_dir().join(format!(
            "agentos-console-{}-{unique}-{sequence}",
            std::process::id()
        ));
        fs::create_dir(&workspace).unwrap();
        workspace
    }

    fn request(
        provider_id: &str,
        workspace: &Path,
        session_mode: SessionMode,
        new_folder: Option<&str>,
    ) -> LaunchRequest {
        LaunchRequest {
            provider_id: provider_id.to_string(),
            workspace_path: workspace.to_string_lossy().into_owned(),
            session_mode,
            new_folder: new_folder.map(str::to_string),
        }
    }

    fn command_for(
        provider_id: &str,
        session_mode: SessionMode,
        resumable: Option<&str>,
    ) -> ProviderCommand {
        provider_command_for(provider_id, session_mode, Path::new("/workspace"), |_| {
            resumable.map(str::to_string)
        })
        .unwrap()
    }

    // The other three providers have no session-kind rule to work around, so
    // their commands stay fixed whether or not a Claude session could be found.
    #[test]
    fn fixed_commands_match_web_runtime() {
        for resumable in [None, Some("session-that-must-not-be-used")] {
            assert_eq!(
                command_for("hermes", SessionMode::Continue, resumable).arguments,
                ["hermes", "--continue", "--no-restore-cwd"]
            );
            assert_eq!(
                command_for("codex", SessionMode::Continue, resumable).arguments,
                ["codex", "resume", "--last"]
            );
            assert_eq!(
                command_for("antigravity", SessionMode::Continue, resumable).arguments,
                ["agy", "--continue"]
            );
            assert_eq!(
                command_for("claude", SessionMode::New, resumable).arguments,
                ["claude"]
            );
        }
    }

    #[test]
    fn claude_continue_resumes_the_session_the_app_picked() {
        let command = command_for("claude", SessionMode::Continue, Some("3f2c1c05"));

        assert_eq!(command.arguments, ["claude", "--resume", "3f2c1c05"]);
        assert_eq!(command.resumed_session_id.as_deref(), Some("3f2c1c05"));
    }

    // Falling back rather than failing keeps the CLI's own "No conversation
    // found to continue" as the thing the user sees, exactly as before.
    #[test]
    fn claude_continue_falls_back_when_no_session_can_be_identified() {
        let command = command_for("claude", SessionMode::Continue, None);

        assert_eq!(command.arguments, ["claude", "--continue"]);
        assert_eq!(command.resumed_session_id, None);
    }

    #[test]
    fn a_resumed_session_id_is_quoted_like_any_other_argument() {
        let workspace = temp_workspace();
        let terminal = FakeTerminal {
            calls: RefCell::new(vec![]),
            failure: None,
        };
        let command = command_for("claude", SessionMode::Continue, Some("id with spaces"));

        terminal
            .launch(&shell_command(&workspace, &command.arguments))
            .unwrap();

        assert!(terminal.calls.borrow()[0].ends_with("exec claude --resume 'id with spaces'"));
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn workspace_validation_rejects_relative_missing_file_and_root() {
        let workspace = temp_workspace();
        let file = workspace.join("file");
        fs::write(&file, "not a directory").unwrap();

        for path in [
            "relative".to_string(),
            workspace.join("missing").to_string_lossy().into_owned(),
            file.to_string_lossy().into_owned(),
            "/".to_string(),
        ] {
            assert_eq!(
                validate_workspace(&path).unwrap_err().code,
                "invalid_workspace"
            );
        }
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn validates_and_returns_resolved_workspace() {
        let workspace = temp_workspace();

        let result = validate_workspace(&workspace.to_string_lossy()).unwrap();

        assert_eq!(
            result.workspace_path,
            workspace.canonicalize().unwrap().to_string_lossy()
        );
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn rejects_unsafe_existing_and_continue_folders() {
        let workspace = temp_workspace();
        fs::create_dir(workspace.join("existing")).unwrap();
        let terminal = FakeTerminal {
            calls: RefCell::new(vec![]),
            failure: None,
        };

        for folder in [".", "..", "/absolute", "nested/folder", "existing"] {
            let error = launch_provider_with(
                request("codex", &workspace, SessionMode::New, Some(folder)),
                |_| true,
                &terminal,
            )
            .unwrap_err();
            assert!(matches!(
                error.code.as_str(),
                "invalid_new_folder" | "workspace_exists"
            ));
        }
        assert_eq!(
            launch_provider_with(
                request(
                    "codex",
                    &workspace,
                    SessionMode::Continue,
                    Some("new-folder")
                ),
                |_| true,
                &terminal,
            )
            .unwrap_err()
            .code,
            "invalid_new_folder"
        );
        assert!(terminal.calls.borrow().is_empty());
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn creates_single_folder_and_quotes_fixed_launch() {
        let workspace = temp_workspace();
        let terminal = FakeTerminal {
            calls: RefCell::new(vec![]),
            failure: None,
        };

        let result = launch_provider_with(
            request(
                "codex",
                &workspace,
                SessionMode::New,
                Some("新 project $(safe)"),
            ),
            |_| true,
            &terminal,
        )
        .unwrap();

        let child = workspace.join("新 project $(safe)").canonicalize().unwrap();
        assert_eq!(result.workspace_path, child.to_string_lossy());
        assert_eq!(
            terminal.calls.borrow()[0],
            format!(
                "cd -- {} && exec codex",
                shell_quote(&child.to_string_lossy())
            )
        );
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn terminal_failure_keeps_new_folder_and_uses_safe_error() {
        let workspace = temp_workspace();
        let terminal = FakeTerminal {
            calls: RefCell::new(vec![]),
            failure: Some(CommandError::new(
                "terminal_launch_failed",
                "Terminal.app could not be opened",
                502,
            )),
        };

        let error = launch_provider_with(
            request("codex", &workspace, SessionMode::New, Some("project")),
            |_| true,
            &terminal,
        )
        .unwrap_err();

        assert_eq!(error.code, "terminal_launch_failed");
        assert!(error.message.contains("remains"));
        assert!(workspace.join("project").is_dir());
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn unknown_and_unavailable_providers_fail_before_launch() {
        let workspace = temp_workspace();
        let terminal = FakeTerminal {
            calls: RefCell::new(vec![]),
            failure: None,
        };

        assert_eq!(
            launch_provider_with(
                request("other", &workspace, SessionMode::New, None),
                |_| true,
                &terminal,
            )
            .unwrap_err()
            .code,
            "unknown_provider"
        );
        assert_eq!(
            launch_provider_with(
                request("codex", &workspace, SessionMode::New, None),
                |_| false,
                &terminal,
            )
            .unwrap_err()
            .code,
            "provider_unavailable"
        );
        assert!(terminal.calls.borrow().is_empty());
        fs::remove_dir_all(workspace).unwrap();
    }
}
