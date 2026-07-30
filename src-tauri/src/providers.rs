use serde::Serialize;
use std::env;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

const VERSION_TIMEOUT: Duration = Duration::from_secs(3);
const LOGIN_SHELL_TIMEOUT: Duration = Duration::from_secs(3);
// Where the four CLIs actually live when the login shell cannot be asked.
// Deliberately short: this is a floor under the failure case, not a second
// source of truth competing with the user's own shell configuration.
const FALLBACK_DIRECTORIES: [&str; 4] = [
    "~/.local/bin",
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ProviderSpec {
    id: &'static str,
    display_name: &'static str,
    command: &'static str,
    version_markers: &'static [&'static str],
}

const PROVIDERS: [ProviderSpec; 4] = [
    ProviderSpec {
        id: "hermes",
        display_name: "Hermes CLI",
        command: "hermes",
        version_markers: &["hermes agent"],
    },
    ProviderSpec {
        id: "codex",
        display_name: "Codex CLI",
        command: "codex",
        version_markers: &["codex-cli"],
    },
    ProviderSpec {
        id: "claude",
        display_name: "Claude CLI",
        command: "claude",
        version_markers: &["claude code"],
    },
    ProviderSpec {
        id: "antigravity",
        display_name: "Antigravity CLI",
        command: "agy",
        version_markers: &[],
    },
];

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ProviderResult {
    id: String,
    display_name: String,
    command: String,
    installed: bool,
    path: Option<String>,
    version: Option<String>,
    error: Option<String>,
    // What was actually looked through. "Not found in PATH" is useless advice
    // when the whole defect is that PATH was not what the user assumed.
    searched_paths: Vec<String>,
}

#[derive(Debug)]
struct VersionOutput {
    exit_code: i32,
    stdout: String,
    stderr: String,
}

#[derive(Debug)]
enum VersionFailure {
    Timeout,
    Io(String),
}

trait ProviderRunner {
    fn find_executable(&self, command: &str) -> Option<PathBuf>;
    fn searched_paths(&self) -> Vec<PathBuf>;
    fn version_output(&self, path: &Path) -> Result<VersionOutput, VersionFailure>;
}

struct SystemProviderRunner;

impl ProviderRunner for SystemProviderRunner {
    fn find_executable(&self, command: &str) -> Option<PathBuf> {
        resolve_executable(command)
    }

    fn searched_paths(&self) -> Vec<PathBuf> {
        search_path()
    }

    fn version_output(&self, path: &Path) -> Result<VersionOutput, VersionFailure> {
        let mut child = Command::new(path)
            .arg("--version")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| VersionFailure::Io(error.to_string()))?;
        let started = Instant::now();

        loop {
            match child.try_wait() {
                Ok(Some(_)) => {
                    let output = child
                        .wait_with_output()
                        .map_err(|error| VersionFailure::Io(error.to_string()))?;
                    return Ok(VersionOutput {
                        exit_code: output.status.code().unwrap_or(-1),
                        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
                    });
                }
                Ok(None) if started.elapsed() < VERSION_TIMEOUT => {
                    thread::sleep(Duration::from_millis(10));
                }
                Ok(None) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(VersionFailure::Timeout);
                }
                Err(error) => return Err(VersionFailure::Io(error.to_string())),
            }
        }
    }
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    fs::metadata(path)
        .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

// Launched from Finder, the App gets launchd's bare PATH — /usr/bin:/bin:
// /usr/sbin:/sbin — and every CLI lives in ~/.local/bin, so all four providers
// read Unavailable. Asking the login shell is the only way to find out what
// the user's PATH actually is; `tauri:dev` never sees this because it inherits
// the terminal's environment.
trait LoginShellProbe {
    fn login_shell_path(&self) -> Option<String>;
}

struct SystemLoginShellProbe;

impl LoginShellProbe for SystemLoginShellProbe {
    fn login_shell_path(&self) -> Option<String> {
        let shell = env::var_os("SHELL")?;
        // `-l` only: `-i` would run .zshrc, pulling in interactive side effects
        // and a much better chance of hanging on something that expects a tty.
        let mut child = Command::new(&shell)
            .arg("-l")
            .arg("-c")
            .arg("printf %s \"$PATH\"")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let started = Instant::now();

        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    if !status.success() {
                        return None;
                    }
                    let output = child.wait_with_output().ok()?;
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    return (!path.is_empty()).then_some(path);
                }
                // A login shell that never returns must not hold the window
                // blank: give up at the timeout and take the fallback instead.
                Ok(None) if started.elapsed() < LOGIN_SHELL_TIMEOUT => {
                    thread::sleep(Duration::from_millis(10));
                }
                Ok(None) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                Err(_) => return None,
            }
        }
    }
}

fn expand_home(directory: &str) -> Option<PathBuf> {
    let Some(rest) = directory.strip_prefix("~/") else {
        return Some(PathBuf::from(directory));
    };
    env::var_os("HOME").map(|home| PathBuf::from(home).join(rest))
}

// Union, never replacement: whatever the process already had keeps its place
// and its precedence, and the probed entries extend it. A failed probe can
// therefore only leave the App where it already was, never worse.
fn merge_search_path(existing: Option<&OsStr>, discovered: Option<&str>) -> Vec<PathBuf> {
    let mut entries: Vec<PathBuf> = Vec::new();
    let mut push = |directory: PathBuf| {
        if !directory.as_os_str().is_empty() && !entries.contains(&directory) {
            entries.push(directory);
        }
    };

    if let Some(existing) = existing {
        for directory in env::split_paths(existing) {
            push(directory);
        }
    }
    match discovered {
        Some(discovered) => {
            for directory in env::split_paths(discovered) {
                push(directory);
            }
        }
        None => {
            for directory in FALLBACK_DIRECTORIES {
                if let Some(directory) = expand_home(directory) {
                    push(directory);
                }
            }
        }
    }
    entries
}

fn search_path_cell() -> &'static Mutex<Option<Vec<PathBuf>>> {
    static SEARCH_PATH: OnceLock<Mutex<Option<Vec<PathBuf>>>> = OnceLock::new();
    SEARCH_PATH.get_or_init(|| Mutex::new(None))
}

fn store_search_path(entries: Vec<PathBuf>) -> Vec<PathBuf> {
    if let Ok(mut cell) = search_path_cell().lock() {
        *cell = Some(entries.clone());
    }
    entries
}

fn refresh_search_path_with<P: LoginShellProbe>(probe: &P) -> Vec<PathBuf> {
    let discovered = probe.login_shell_path();
    store_search_path(merge_search_path(
        env::var_os("PATH").as_deref(),
        discovered.as_deref(),
    ))
}

/// Re-asks the login shell and republishes the effective search path. Called
/// on every discovery, so Refresh picks up a changed shell profile without
/// restarting the App.
pub fn refresh_search_path() -> Vec<PathBuf> {
    refresh_search_path_with(&SystemLoginShellProbe)
}

/// The directories `resolve_executable` looks through, in order. Probing has
/// not happened yet on the very first call, so fall back to the process PATH
/// rather than reporting an empty search.
pub fn search_path() -> Vec<PathBuf> {
    match search_path_cell().lock() {
        Ok(cell) => cell
            .clone()
            .unwrap_or_else(|| merge_search_path(env::var_os("PATH").as_deref(), Some(""))),
        Err(_) => merge_search_path(env::var_os("PATH").as_deref(), Some("")),
    }
}

/// The effective search path as a `PATH` value, for handing to child processes.
pub fn search_path_value() -> OsString {
    env::join_paths(search_path()).unwrap_or_else(|_| env::var_os("PATH").unwrap_or_default())
}

pub fn resolve_executable(command: &str) -> Option<PathBuf> {
    search_path()
        .into_iter()
        .map(|directory| directory.join(command))
        .find(|candidate| is_executable(candidate))
}

fn version_line(output: &str, markers: &[&str]) -> Option<String> {
    let lines: Vec<&str> = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();

    for marker in markers {
        if let Some(line) = lines
            .iter()
            .find(|line| line.to_lowercase().contains(&marker.to_lowercase()))
        {
            return Some((*line).to_string());
        }
    }

    lines
        .into_iter()
        .find(|line| !line.to_lowercase().starts_with("warning:"))
        .map(str::to_string)
}

fn detect_provider<R: ProviderRunner>(spec: ProviderSpec, runner: &R) -> ProviderResult {
    let Some(path) = runner.find_executable(spec.command) else {
        return ProviderResult {
            id: spec.id.to_string(),
            display_name: spec.display_name.to_string(),
            command: spec.command.to_string(),
            installed: false,
            path: None,
            version: None,
            error: Some("Executable not found in PATH".to_string()),
            searched_paths: runner
                .searched_paths()
                .iter()
                .map(|directory| directory.to_string_lossy().into_owned())
                .collect(),
        };
    };

    let mut result = ProviderResult {
        id: spec.id.to_string(),
        display_name: spec.display_name.to_string(),
        command: spec.command.to_string(),
        installed: true,
        path: Some(path.to_string_lossy().into_owned()),
        version: None,
        error: None,
        searched_paths: vec![],
    };

    let output = match runner.version_output(&path) {
        Ok(output) => output,
        Err(VersionFailure::Timeout) => {
            result.error = Some("Version check timed out".to_string());
            return result;
        }
        Err(VersionFailure::Io(error)) => {
            result.error = Some(format!("Version check failed: {error}"));
            return result;
        }
    };
    if output.exit_code != 0 {
        result.error = Some(format!(
            "Version command exited with code {}",
            output.exit_code
        ));
        return result;
    }

    let combined = [output.stdout, output.stderr]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    match version_line(&combined, spec.version_markers) {
        Some(version) => result.version = Some(version),
        None => {
            result.error = Some("Version command returned no usable output".to_string());
        }
    }
    result
}

fn detect_providers_with<R: ProviderRunner>(runner: &R) -> Vec<ProviderResult> {
    PROVIDERS
        .iter()
        .map(|spec| detect_provider(*spec, runner))
        .collect()
}

pub fn detect_providers() -> Vec<ProviderResult> {
    // Re-probe on every discovery, which is also what Refresh runs: edit a
    // shell profile, press Refresh, and the App picks it up without a restart.
    refresh_search_path();
    detect_providers_with(&SystemProviderRunner)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    struct FakeRunner {
        paths: HashMap<String, PathBuf>,
        outputs: HashMap<String, Result<VersionOutput, VersionFailure>>,
    }

    struct FakeProbe {
        path: Option<String>,
    }

    impl LoginShellProbe for FakeProbe {
        fn login_shell_path(&self) -> Option<String> {
            self.path.clone()
        }
    }

    impl ProviderRunner for FakeRunner {
        fn find_executable(&self, command: &str) -> Option<PathBuf> {
            self.paths.get(command).cloned()
        }

        fn searched_paths(&self) -> Vec<PathBuf> {
            vec![PathBuf::from("/tools"), PathBuf::from("/usr/bin")]
        }

        fn version_output(&self, path: &Path) -> Result<VersionOutput, VersionFailure> {
            self.outputs
                .get(&path.to_string_lossy().into_owned())
                .expect("fake output")
                .as_ref()
                .map(|output| VersionOutput {
                    exit_code: output.exit_code,
                    stdout: output.stdout.clone(),
                    stderr: output.stderr.clone(),
                })
                .map_err(|error| match error {
                    VersionFailure::Timeout => VersionFailure::Timeout,
                    VersionFailure::Io(message) => VersionFailure::Io(message.clone()),
                })
        }
    }

    fn runner() -> FakeRunner {
        let mut paths = HashMap::new();
        let mut outputs = HashMap::new();
        for (command, version) in [
            ("hermes", "Hermes Agent v0.19.0"),
            ("codex", "codex-cli 0.145.0"),
            ("claude", "2.1.218 (Claude Code)"),
            ("agy", "1.1.5"),
        ] {
            let path = PathBuf::from(format!("/tools/{command}"));
            paths.insert(command.to_string(), path.clone());
            outputs.insert(
                path.to_string_lossy().into_owned(),
                Ok(VersionOutput {
                    exit_code: 0,
                    stdout: version.to_string(),
                    stderr: String::new(),
                }),
            );
        }
        FakeRunner { paths, outputs }
    }

    #[test]
    fn fixed_provider_mapping_and_order_match_web_runtime() {
        let results = detect_providers_with(&runner());

        assert_eq!(
            results
                .iter()
                .map(|provider| provider.id.as_str())
                .collect::<Vec<_>>(),
            ["hermes", "codex", "claude", "antigravity"]
        );
        assert!(results.iter().all(|provider| provider.installed));
        assert!(results.iter().all(|provider| provider.error.is_none()));
    }

    #[test]
    fn missing_provider_does_not_block_other_results() {
        let mut fake = runner();
        fake.paths.remove("claude");

        let results = detect_providers_with(&fake);

        assert_eq!(
            results[2].error.as_deref(),
            Some("Executable not found in PATH")
        );
        assert_eq!(
            results[2].searched_paths,
            vec!["/tools".to_string(), "/usr/bin".to_string()]
        );
        assert_eq!(results[3].version.as_deref(), Some("1.1.5"));
        assert!(results[3].searched_paths.is_empty());
    }

    #[test]
    fn merging_keeps_existing_entries_first_and_drops_duplicates() {
        let merged = merge_search_path(
            Some(OsStr::new("/usr/bin:/bin")),
            Some("/Users/z/.local/bin:/usr/bin:/opt/homebrew/bin"),
        );

        assert_eq!(
            merged,
            [
                "/usr/bin",
                "/bin",
                "/Users/z/.local/bin",
                "/opt/homebrew/bin"
            ]
            .map(PathBuf::from)
        );
    }

    #[test]
    fn a_failed_probe_falls_back_without_losing_the_bare_path() {
        let merged = merge_search_path(Some(OsStr::new("/usr/bin:/bin:/usr/sbin:/sbin")), None);

        assert_eq!(
            &merged[..4],
            &["/usr/bin", "/bin", "/usr/sbin", "/sbin"].map(PathBuf::from)
        );
        assert!(merged.contains(&PathBuf::from("/opt/homebrew/bin")));
        assert!(merged.contains(&PathBuf::from("/usr/local/bin")));
        assert!(merged.len() > 4);
    }

    // The probe is injected rather than run for real: these tests must never
    // execute the developer's own login shell.
    #[test]
    fn an_empty_or_absent_shell_result_is_treated_as_no_result() {
        let discovered = FakeProbe { path: None }.login_shell_path();
        assert_eq!(discovered, None);

        let fallback = merge_search_path(Some(OsStr::new("/usr/bin")), discovered.as_deref());
        let probed = merge_search_path(
            Some(OsStr::new("/usr/bin")),
            FakeProbe {
                path: Some("/usr/bin:/opt/homebrew/bin".to_string()),
            }
            .login_shell_path()
            .as_deref(),
        );

        assert!(fallback.contains(&PathBuf::from("/opt/homebrew/sbin")));
        assert_eq!(probed, ["/usr/bin", "/opt/homebrew/bin"].map(PathBuf::from));
    }

    #[test]
    fn timeout_is_isolated() {
        let mut fake = runner();
        fake.outputs
            .insert("/tools/agy".to_string(), Err(VersionFailure::Timeout));

        let results = detect_providers_with(&fake);

        assert_eq!(results[3].error.as_deref(), Some("Version check timed out"));
        assert_eq!(results[1].version.as_deref(), Some("codex-cli 0.145.0"));
    }

    #[test]
    fn version_parser_ignores_warning_before_codex_version() {
        assert_eq!(
            version_line(
                "WARNING: could not create PATH aliases\ncodex-cli 0.145.0",
                &["codex-cli"]
            ),
            Some("codex-cli 0.145.0".to_string())
        );
    }

    #[test]
    fn nonzero_version_exit_uses_safe_contract() {
        let mut fake = runner();
        fake.outputs.insert(
            "/tools/hermes".to_string(),
            Ok(VersionOutput {
                exit_code: 2,
                stdout: String::new(),
                stderr: "private output".to_string(),
            }),
        );

        let result = &detect_providers_with(&fake)[0];

        assert_eq!(
            result.error.as_deref(),
            Some("Version command exited with code 2")
        );
        assert!(!result.error.as_deref().unwrap().contains("private output"));
    }

    // Nothing here probes, so the search path cache stays unset and
    // `resolve_executable` falls back to the process PATH — which is exactly
    // the state this test wants: PATH in, resolved entry out.
    #[cfg(unix)]
    #[test]
    fn executable_resolution_preserves_the_path_entry_instead_of_the_symlink_target() {
        use std::os::unix::fs::symlink;

        let unique = format!(
            "agentos-provider-path-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let directory = std::env::temp_dir().join(unique);
        fs::create_dir(&directory).unwrap();
        let target = directory.join("real-codex");
        fs::write(&target, "#!/bin/sh\n").unwrap();
        let mut permissions = fs::metadata(&target).unwrap().permissions();
        use std::os::unix::fs::PermissionsExt;
        permissions.set_mode(0o755);
        fs::set_permissions(&target, permissions).unwrap();
        let linked = directory.join("codex");
        symlink(&target, &linked).unwrap();

        let previous_path = env::var_os("PATH");
        env::set_var("PATH", &directory);
        let resolved = resolve_executable("codex");
        match previous_path {
            Some(path) => env::set_var("PATH", path),
            None => env::remove_var("PATH"),
        }

        assert_eq!(resolved, Some(linked));
        fs::remove_dir_all(directory).unwrap();
    }
}
