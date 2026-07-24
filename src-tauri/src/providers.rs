use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const VERSION_TIMEOUT: Duration = Duration::from_secs(3);

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
    fn version_output(&self, path: &Path) -> Result<VersionOutput, VersionFailure>;
}

struct SystemProviderRunner;

impl ProviderRunner for SystemProviderRunner {
    fn find_executable(&self, command: &str) -> Option<PathBuf> {
        resolve_executable(command)
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

pub fn resolve_executable(command: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    env::split_paths(&path)
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

    impl ProviderRunner for FakeRunner {
        fn find_executable(&self, command: &str) -> Option<PathBuf> {
            self.paths.get(command).cloned()
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
        assert_eq!(results[3].version.as_deref(), Some("1.1.5"));
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
