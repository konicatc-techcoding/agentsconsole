use crate::launcher::{
    new_workspace, provider_command, validated_workspace, CommandError, SessionMode,
};
use crate::providers::{resolve_executable, search_path_value};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub const PTY_OUTPUT_EVENT: &str = "pty-output";
pub const PTY_EXIT_EVENT: &str = "pty-exit";
const SLOT_IDS: [&str; 4] = ["slot-1", "slot-2", "slot-3", "slot-4"];
// Claude Code sets this on its own children. `CommandBuilder::new` hands the
// App's whole environment to the Slot, so when the App is launched from a
// Claude Code session the `claude` CLI inherits the marker, decides it is a
// child session, and silently stops saving its transcript — Continue then
// reconnects to a conversation that has been quietly losing its tail.
const CLAUDE_CHILD_SESSION_MARKER: &str = "CLAUDE_CODE_CHILD_SESSION";
const STOP_GRACE_PERIOD: Duration = Duration::from_millis(500);
static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyStartRequest {
    slot_id: String,
    provider_id: String,
    workspace_path: String,
    session_mode: SessionMode,
    new_folder: Option<String>,
    rows: u16,
    columns: u16,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySessionRequest {
    slot_id: String,
    session_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyInputRequest {
    slot_id: String,
    session_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyResizeRequest {
    slot_id: String,
    session_id: String,
    rows: u16,
    columns: u16,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySession {
    slot_id: String,
    session_id: String,
    provider_id: String,
    workspace_path: String,
    session_mode: SessionMode,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOutputEvent {
    slot_id: String,
    session_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyExitEvent {
    slot_id: String,
    session_id: String,
    exit_code: Option<i32>,
    reason: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ProcessExit {
    exit_code: Option<i32>,
    reason: String,
}

trait EventSink: Send + Sync {
    fn output(&self, event: &PtyOutputEvent) -> Result<(), ()>;
    fn exit(&self, event: &PtyExitEvent);
}

struct TauriEventSink {
    app: AppHandle,
}

impl EventSink for TauriEventSink {
    fn output(&self, event: &PtyOutputEvent) -> Result<(), ()> {
        self.app.emit(PTY_OUTPUT_EVENT, event).map_err(|_| ())
    }

    fn exit(&self, event: &PtyExitEvent) {
        let _ = self.app.emit(PTY_EXIT_EVENT, event);
    }
}

trait RunningPty: Send + Sync {
    fn resize(&self, rows: u16, columns: u16) -> Result<(), String>;
    fn terminate_tree(&self) -> Result<(), String>;
    fn wait(&self) -> Result<ProcessExit, String>;
}

struct SpawnedPty {
    process: Arc<dyn RunningPty>,
    reader: Box<dyn Read + Send>,
    writer: Box<dyn Write + Send>,
}

trait PtyAdapter: Send + Sync {
    fn spawn(
        &self,
        executable: &Path,
        arguments: &[&str],
        workspace: &Path,
        removed_environment: &[&str],
        search_path: &OsStr,
        rows: u16,
        columns: u16,
    ) -> Result<SpawnedPty, String>;
}

trait ExecutableResolver: Send + Sync {
    fn resolve(&self, command: &str) -> Option<PathBuf>;
}

struct SystemExecutableResolver;

impl ExecutableResolver for SystemExecutableResolver {
    fn resolve(&self, command: &str) -> Option<PathBuf> {
        resolve_executable(command)
    }
}

struct SystemPtyAdapter;

fn prepare_then_spawn<R, W, C>(
    prepare_reader: impl FnOnce() -> Result<R, String>,
    prepare_writer: impl FnOnce() -> Result<W, String>,
    spawn_child: impl FnOnce() -> Result<C, String>,
) -> Result<(R, W, C), String> {
    let reader = prepare_reader()?;
    let writer = prepare_writer()?;
    let child = spawn_child()?;
    Ok((reader, writer, child))
}

struct SystemRunningPty {
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    process_id: Option<u32>,
    exit: Mutex<Option<ProcessExit>>,
}

#[cfg(unix)]
trait UnixProcessGroupControl {
    fn signal_group(&self, signal: i32) -> Result<(), String>;
    fn group_exists(&self) -> Result<bool, String>;
    fn poll_child_exit(&self) -> Result<(), String>;
}

#[cfg(unix)]
fn terminate_unix_process_group(
    control: &dyn UnixProcessGroupControl,
    grace_period: Duration,
) -> Result<(), String> {
    control.signal_group(libc::SIGTERM)?;
    let started = Instant::now();
    loop {
        control.poll_child_exit()?;
        if !control.group_exists()? {
            return Ok(());
        }
        if started.elapsed() >= grace_period {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }

    control.signal_group(libc::SIGKILL)?;
    let kill_started = Instant::now();
    loop {
        control.poll_child_exit()?;
        if !control.group_exists()? {
            return Ok(());
        }
        if kill_started.elapsed() >= grace_period {
            return Err("PTY process group did not terminate".to_string());
        }
        thread::sleep(Duration::from_millis(10));
    }
}

#[cfg(unix)]
impl UnixProcessGroupControl for SystemRunningPty {
    fn signal_group(&self, signal: i32) -> Result<(), String> {
        let process_id = self
            .process_id
            .ok_or_else(|| "PTY process group is unavailable".to_string())?;
        let result = unsafe { libc::kill(-(process_id as i32), signal) };
        if result == 0 {
            return Ok(());
        }
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(libc::ESRCH) {
            return Ok(());
        }
        Err(error.to_string())
    }

    fn group_exists(&self) -> Result<bool, String> {
        let process_id = self
            .process_id
            .ok_or_else(|| "PTY process group is unavailable".to_string())?;
        let result = unsafe { libc::kill(-(process_id as i32), 0) };
        if result == 0 {
            return Ok(true);
        }
        let error = std::io::Error::last_os_error();
        match error.raw_os_error() {
            Some(libc::ESRCH) => Ok(false),
            Some(libc::EPERM) => Ok(true),
            _ => Err(error.to_string()),
        }
    }

    fn poll_child_exit(&self) -> Result<(), String> {
        let mut exit_guard = lock(&self.exit)?;
        if exit_guard.is_some() {
            return Ok(());
        }
        if let Some(status) = lock(&self.child)?
            .try_wait()
            .map_err(|error| error.to_string())?
        {
            *exit_guard = Some(ProcessExit {
                exit_code: Some(status.exit_code() as i32),
                reason: "exited".to_string(),
            });
        }
        Ok(())
    }
}

impl RunningPty for SystemRunningPty {
    fn resize(&self, rows: u16, columns: u16) -> Result<(), String> {
        lock(&self.master)?
            .resize(PtySize {
                rows,
                cols: columns,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| error.to_string())
    }

    fn terminate_tree(&self) -> Result<(), String> {
        #[cfg(unix)]
        {
            terminate_unix_process_group(self, STOP_GRACE_PERIOD)?;
        }

        #[cfg(not(unix))]
        lock(&self.child)?
            .kill()
            .map_err(|error| error.to_string())?;

        Ok(())
    }

    fn wait(&self) -> Result<ProcessExit, String> {
        let mut exit_guard = lock(&self.exit)?;
        if let Some(exit) = exit_guard.clone() {
            return Ok(exit);
        }
        let status = lock(&self.child)?
            .wait()
            .map_err(|error| error.to_string())?;
        let exit = ProcessExit {
            exit_code: Some(status.exit_code() as i32),
            reason: "exited".to_string(),
        };
        *exit_guard = Some(exit.clone());
        Ok(exit)
    }
}

// The engine decides this per provider and passes it to the adapter rather
// than the adapter deciding for itself: the adapter is replaced wholesale in
// tests, so a rule living inside it could never be asserted on.
fn removed_environment(provider_id: &str) -> &'static [&'static str] {
    match provider_id {
        "claude" => &[CLAUDE_CHILD_SESSION_MARKER],
        _ => &[],
    }
}

// Removal, not an empty value: Claude Code treats the marker as present either
// way, so overwriting it would change nothing.
fn apply_environment_removals(command: &mut CommandBuilder, removed_environment: &[&str]) {
    for name in removed_environment {
        command.env_remove(name);
    }
}

// The CLI needs the same PATH the App searched, or it starts and then fails
// later, obscurely, the first time it reaches for git or node.
fn apply_search_path(command: &mut CommandBuilder, search_path: &OsStr) {
    if !search_path.is_empty() {
        command.env("PATH", search_path);
    }
}

impl PtyAdapter for SystemPtyAdapter {
    fn spawn(
        &self,
        executable: &Path,
        arguments: &[&str],
        workspace: &Path,
        removed_environment: &[&str],
        search_path: &OsStr,
        rows: u16,
        columns: u16,
    ) -> Result<SpawnedPty, String> {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows,
                cols: columns,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| error.to_string())?;
        let mut command = CommandBuilder::new(executable);
        command.args(arguments);
        command.cwd(workspace);
        apply_environment_removals(&mut command, removed_environment);
        apply_search_path(&mut command, search_path);
        let (reader, writer, child) = prepare_then_spawn(
            || {
                pair.master
                    .try_clone_reader()
                    .map_err(|error| error.to_string())
            },
            || pair.master.take_writer().map_err(|error| error.to_string()),
            || {
                pair.slave
                    .spawn_command(command)
                    .map_err(|error| error.to_string())
            },
        )?;
        drop(pair.slave);

        let process_id = child.process_id();
        let process = Arc::new(SystemRunningPty {
            master: Mutex::new(pair.master),
            child: Mutex::new(child),
            process_id,
            exit: Mutex::new(None),
        });
        Ok(SpawnedPty {
            process,
            reader,
            writer,
        })
    }
}

struct ActiveSession {
    session: PtySession,
    process: Arc<dyn RunningPty>,
    writer: Mutex<Box<dyn Write + Send>>,
    stopping: AtomicBool,
    reader_thread: Mutex<Option<JoinHandle<()>>>,
}

struct EngineInner {
    active: Mutex<HashMap<String, Arc<ActiveSession>>>,
    adapter: Arc<dyn PtyAdapter>,
    resolver: Arc<dyn ExecutableResolver>,
}

#[derive(Clone)]
pub struct PtySessionEngine {
    inner: Arc<EngineInner>,
}

impl Default for PtySessionEngine {
    fn default() -> Self {
        Self::new(
            Arc::new(SystemPtyAdapter),
            Arc::new(SystemExecutableResolver),
        )
    }
}

impl PtySessionEngine {
    fn new(adapter: Arc<dyn PtyAdapter>, resolver: Arc<dyn ExecutableResolver>) -> Self {
        Self {
            inner: Arc::new(EngineInner {
                active: Mutex::new(HashMap::new()),
                adapter,
                resolver,
            }),
        }
    }

    pub fn start(
        &self,
        app: AppHandle,
        request: PtyStartRequest,
    ) -> Result<PtySession, CommandError> {
        if !cfg!(target_os = "macos") {
            return Err(CommandError::new(
                "unsupported_platform",
                "Embedded PTY sessions are only supported on macOS",
                501,
            ));
        }
        self.start_with_sink(request, Arc::new(TauriEventSink { app }))
    }

    fn start_with_sink(
        &self,
        request: PtyStartRequest,
        sink: Arc<dyn EventSink>,
    ) -> Result<PtySession, CommandError> {
        validate_slot(&request.slot_id)?;
        validate_size(request.rows, request.columns)?;

        let mut active_guard = self.active()?;
        if active_guard.contains_key(&request.slot_id) {
            return Err(CommandError::new(
                "session_already_running",
                format!("{} already has an active PTY session", request.slot_id),
                409,
            ));
        }

        let base_workspace = validated_workspace(&request.workspace_path)?;
        let (provider_executable, command) =
            provider_command(&request.provider_id, request.session_mode)?;
        let executable = self
            .inner
            .resolver
            .resolve(provider_executable)
            .ok_or_else(|| {
                CommandError::new(
                    "provider_unavailable",
                    "CLI provider is no longer available in PATH",
                    409,
                )
            })?;
        let (workspace, workspace_created) = new_workspace(
            &base_workspace,
            request.session_mode,
            request.new_folder.as_deref(),
        )?;
        let spawned = match self.inner.adapter.spawn(
            &executable,
            &command[1..],
            &workspace,
            removed_environment(&request.provider_id),
            &search_path_value(),
            request.rows,
            request.columns,
        ) {
            Ok(spawned) => spawned,
            Err(_) => {
                let message = if workspace_created {
                    format!(
                        "PTY session could not be started. The new workspace folder remains at {}",
                        workspace.to_string_lossy()
                    )
                } else {
                    "PTY session could not be started".to_string()
                };
                return Err(CommandError::new("pty_spawn_failed", message, 502));
            }
        };

        let session = PtySession {
            slot_id: request.slot_id,
            session_id: next_session_id(),
            provider_id: request.provider_id,
            workspace_path: workspace.to_string_lossy().into_owned(),
            session_mode: request.session_mode,
        };
        let active = Arc::new(ActiveSession {
            session: session.clone(),
            process: spawned.process,
            writer: Mutex::new(spawned.writer),
            stopping: AtomicBool::new(false),
            reader_thread: Mutex::new(None),
        });
        active_guard.insert(session.slot_id.clone(), active.clone());
        drop(active_guard);

        let engine = self.clone();
        let thread_active = active.clone();
        let handle = thread::spawn(move || {
            stream_output(engine, thread_active, spawned.reader, sink);
        });
        *lock(&active.reader_thread).map_err(internal_error)? = Some(handle);
        Ok(session)
    }

    pub fn query(&self, request: PtySessionRequest) -> Result<PtySession, CommandError> {
        Ok(self.session_for(&request)?.session.clone())
    }

    pub fn write(&self, request: PtyInputRequest) -> Result<(), CommandError> {
        let active = self.session_for(&PtySessionRequest {
            slot_id: request.slot_id,
            session_id: request.session_id,
        })?;
        let result = lock(&active.writer)
            .map_err(internal_error)?
            .write_all(&request.data)
            .map_err(|_| CommandError::new("pty_write_failed", "PTY input could not be sent", 502));
        result
    }

    pub fn resize(&self, request: PtyResizeRequest) -> Result<(), CommandError> {
        validate_size(request.rows, request.columns)?;
        let active = self.session_for(&PtySessionRequest {
            slot_id: request.slot_id,
            session_id: request.session_id,
        })?;
        active
            .process
            .resize(request.rows, request.columns)
            .map_err(|_| CommandError::new("pty_resize_failed", "PTY could not be resized", 502))
    }

    pub fn stop(&self, request: PtySessionRequest) -> Result<(), CommandError> {
        let active = self.session_for(&request)?;
        active.stopping.store(true, Ordering::SeqCst);
        active.process.terminate_tree().map_err(|_| {
            CommandError::new(
                "pty_stop_failed",
                "PTY process tree could not be terminated",
                502,
            )
        })?;
        active.process.wait().map_err(|_| {
            CommandError::new("pty_stop_failed", "PTY process could not be reaped", 502)
        })?;

        if let Some(handle) = lock(&active.reader_thread).map_err(internal_error)?.take() {
            handle.join().map_err(|_| {
                CommandError::new("pty_stop_failed", "PTY reader could not be released", 502)
            })?;
        }
        self.clear_if_current(&active.session.slot_id, &active.session.session_id);
        Ok(())
    }

    pub fn cleanup(&self) -> Result<(), CommandError> {
        let requests = self
            .active()?
            .values()
            .map(|active| PtySessionRequest {
                slot_id: active.session.slot_id.clone(),
                session_id: active.session.session_id.clone(),
            })
            .collect::<Vec<_>>();
        let mut first_error = None;
        for request in requests {
            if let Err(error) = self.stop(request) {
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
        first_error.map_or(Ok(()), Err)
    }

    fn active(&self) -> Result<MutexGuard<'_, HashMap<String, Arc<ActiveSession>>>, CommandError> {
        lock(&self.inner.active).map_err(internal_error)
    }

    fn session_for(&self, request: &PtySessionRequest) -> Result<Arc<ActiveSession>, CommandError> {
        validate_slot(&request.slot_id)?;
        let active_guard = self.active()?;
        let active = match active_guard.get(&request.slot_id).cloned() {
            Some(active) => active,
            None if active_guard
                .values()
                .any(|active| active.session.session_id == request.session_id) =>
            {
                return Err(CommandError::new(
                    "stale_session",
                    "The PTY session ID is not active in the requested slot",
                    409,
                ));
            }
            None => {
                return Err(CommandError::new(
                    "no_active_session",
                    format!("{} has no active PTY session", request.slot_id),
                    404,
                ));
            }
        };
        if active.session.session_id != request.session_id {
            return Err(CommandError::new(
                "stale_session",
                "The PTY session ID is no longer active",
                409,
            ));
        }
        Ok(active)
    }

    fn clear_if_current(&self, slot_id: &str, session_id: &str) {
        if let Ok(mut guard) = self.inner.active.lock() {
            if guard
                .get(slot_id)
                .is_some_and(|active| active.session.session_id == session_id)
            {
                guard.remove(slot_id);
            }
        }
    }
}

fn stream_output(
    engine: PtySessionEngine,
    active: Arc<ActiveSession>,
    mut reader: Box<dyn Read + Send>,
    sink: Arc<dyn EventSink>,
) {
    let mut buffer = [0_u8; 8192];
    let mut disconnected = false;
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => {
                let event = PtyOutputEvent {
                    slot_id: active.session.slot_id.clone(),
                    session_id: active.session.session_id.clone(),
                    data: buffer[..count].to_vec(),
                };
                if sink.output(&event).is_err() {
                    disconnected = true;
                    active.stopping.store(true, Ordering::SeqCst);
                    let _ = active.process.terminate_tree();
                    break;
                }
            }
            Err(_) => {
                active.stopping.store(true, Ordering::SeqCst);
                let _ = active.process.terminate_tree();
                break;
            }
        }
    }

    let exit = active.process.wait().unwrap_or(ProcessExit {
        exit_code: None,
        reason: "wait_failed".to_string(),
    });
    let reason = if disconnected {
        "frontend_disconnected".to_string()
    } else if active.stopping.load(Ordering::SeqCst) {
        "stopped".to_string()
    } else {
        exit.reason
    };
    engine.clear_if_current(&active.session.slot_id, &active.session.session_id);
    sink.exit(&PtyExitEvent {
        slot_id: active.session.slot_id.clone(),
        session_id: active.session.session_id.clone(),
        exit_code: exit.exit_code,
        reason,
    });
}

fn validate_slot(slot_id: &str) -> Result<(), CommandError> {
    if !SLOT_IDS.contains(&slot_id) {
        return Err(CommandError::new(
            "invalid_slot",
            "Embedded PTY sessions require slot-1 through slot-4",
            400,
        ));
    }
    Ok(())
}

fn validate_size(rows: u16, columns: u16) -> Result<(), CommandError> {
    if rows == 0 || columns == 0 {
        return Err(CommandError::new(
            "invalid_terminal_size",
            "Terminal rows and columns must be greater than zero",
            400,
        ));
    }
    Ok(())
}

fn next_session_id() -> String {
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let sequence = NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed);
    format!("pty-{time:x}-{sequence:x}")
}

fn lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, String> {
    mutex
        .lock()
        .map_err(|_| "PTY session state is unavailable".to_string())
}

fn internal_error(_: String) -> CommandError {
    CommandError::new(
        "pty_state_unavailable",
        "PTY session state is unavailable",
        500,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{HashMap, VecDeque};
    use std::ffi::OsString;
    use std::io;
    use std::sync::mpsc::{self, Receiver, Sender};
    use std::sync::Condvar;

    const SLOT_ID: &str = "slot-1";

    #[cfg(unix)]
    struct FakeUnixProcessGroup {
        signals: Mutex<Vec<i32>>,
        group_states: Mutex<VecDeque<bool>>,
        child_exited: AtomicBool,
        poll_count: AtomicU64,
    }

    #[cfg(unix)]
    impl UnixProcessGroupControl for FakeUnixProcessGroup {
        fn signal_group(&self, signal: i32) -> Result<(), String> {
            lock(&self.signals)?.push(signal);
            Ok(())
        }

        fn group_exists(&self) -> Result<bool, String> {
            Ok(lock(&self.group_states)?.pop_front().unwrap_or(false))
        }

        fn poll_child_exit(&self) -> Result<(), String> {
            assert!(self.child_exited.load(Ordering::SeqCst));
            self.poll_count.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
    }

    #[derive(Clone, Debug, PartialEq, Eq)]
    struct SpawnCall {
        executable: PathBuf,
        arguments: Vec<String>,
        workspace: PathBuf,
        removed_environment: Vec<String>,
        search_path: OsString,
        rows: u16,
        columns: u16,
    }

    #[derive(Default)]
    struct FakeProcessState {
        input: Mutex<Vec<u8>>,
        sizes: Mutex<Vec<(u16, u16)>>,
        sender: Mutex<Option<Sender<Vec<u8>>>>,
        terminated: AtomicBool,
        terminate_error: AtomicBool,
        write_error: AtomicBool,
    }

    struct ChannelReader {
        receiver: Receiver<Vec<u8>>,
        pending: Vec<u8>,
    }

    impl Read for ChannelReader {
        fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
            if self.pending.is_empty() {
                self.pending = match self.receiver.recv() {
                    Ok(chunk) => chunk,
                    Err(_) => return Ok(0),
                };
            }
            let count = buffer.len().min(self.pending.len());
            buffer[..count].copy_from_slice(&self.pending[..count]);
            self.pending.drain(..count);
            Ok(count)
        }
    }

    struct FakeWriter {
        state: Arc<FakeProcessState>,
    }

    impl Write for FakeWriter {
        fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
            if self.state.write_error.load(Ordering::SeqCst) {
                return Err(io::Error::other("fake write failure"));
            }
            lock(&self.state.input)
                .map_err(io::Error::other)?
                .extend_from_slice(buffer);
            Ok(buffer.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    struct FakeRunningPty {
        state: Arc<FakeProcessState>,
    }

    impl RunningPty for FakeRunningPty {
        fn resize(&self, rows: u16, columns: u16) -> Result<(), String> {
            lock(&self.state.sizes)?.push((rows, columns));
            Ok(())
        }

        fn terminate_tree(&self) -> Result<(), String> {
            if self.state.terminate_error.load(Ordering::SeqCst) {
                return Err("fake cleanup failure".to_string());
            }
            self.state.terminated.store(true, Ordering::SeqCst);
            lock(&self.state.sender)?.take();
            Ok(())
        }

        fn wait(&self) -> Result<ProcessExit, String> {
            Ok(ProcessExit {
                exit_code: Some(if self.state.terminated.load(Ordering::SeqCst) {
                    143
                } else {
                    0
                }),
                reason: "exited".to_string(),
            })
        }
    }

    struct FakeAdapter {
        calls: Mutex<Vec<SpawnCall>>,
        processes: Mutex<Vec<Arc<FakeProcessState>>>,
        output_chunks: Mutex<Vec<Vec<u8>>>,
        auto_exit: AtomicBool,
        spawn_error: AtomicBool,
    }

    impl FakeAdapter {
        fn new() -> Self {
            Self {
                calls: Mutex::new(vec![]),
                processes: Mutex::new(vec![]),
                output_chunks: Mutex::new(vec![]),
                auto_exit: AtomicBool::new(false),
                spawn_error: AtomicBool::new(false),
            }
        }

        fn latest_process(&self) -> Arc<FakeProcessState> {
            lock(&self.processes).unwrap().last().unwrap().clone()
        }
    }

    impl PtyAdapter for FakeAdapter {
        fn spawn(
            &self,
            executable: &Path,
            arguments: &[&str],
            workspace: &Path,
            removed_environment: &[&str],
            search_path: &OsStr,
            rows: u16,
            columns: u16,
        ) -> Result<SpawnedPty, String> {
            lock(&self.calls)?.push(SpawnCall {
                executable: executable.to_path_buf(),
                arguments: arguments
                    .iter()
                    .map(|argument| (*argument).to_string())
                    .collect(),
                workspace: workspace.to_path_buf(),
                removed_environment: removed_environment
                    .iter()
                    .map(|name| (*name).to_string())
                    .collect(),
                search_path: search_path.to_os_string(),
                rows,
                columns,
            });
            if self.spawn_error.load(Ordering::SeqCst) {
                return Err("fake spawn failure".to_string());
            }

            let (sender, receiver) = mpsc::channel();
            for chunk in lock(&self.output_chunks)?.iter() {
                sender.send(chunk.clone()).unwrap();
            }
            let state = Arc::new(FakeProcessState::default());
            if !self.auto_exit.load(Ordering::SeqCst) {
                *lock(&state.sender)? = Some(sender);
            }
            lock(&self.processes)?.push(state.clone());
            Ok(SpawnedPty {
                process: Arc::new(FakeRunningPty {
                    state: state.clone(),
                }),
                reader: Box::new(ChannelReader {
                    receiver,
                    pending: vec![],
                }),
                writer: Box::new(FakeWriter { state }),
            })
        }
    }

    struct FakeResolver {
        paths: HashMap<String, PathBuf>,
    }

    impl ExecutableResolver for FakeResolver {
        fn resolve(&self, command: &str) -> Option<PathBuf> {
            self.paths.get(command).cloned()
        }
    }

    #[derive(Clone, Debug, PartialEq, Eq)]
    enum RecordedEvent {
        Output(PtyOutputEvent),
        Exit(PtyExitEvent),
    }

    #[derive(Default)]
    struct FakeSink {
        events: Mutex<Vec<RecordedEvent>>,
        changed: Condvar,
        output_error: AtomicBool,
    }

    impl FakeSink {
        fn wait_for_exit(&self) {
            let events = lock(&self.events).unwrap();
            let (events, timeout) = self
                .changed
                .wait_timeout_while(events, Duration::from_secs(2), |events| {
                    !events
                        .iter()
                        .any(|event| matches!(event, RecordedEvent::Exit(_)))
                })
                .unwrap();
            assert!(!timeout.timed_out(), "timed out waiting for PTY exit");
            assert!(events
                .iter()
                .any(|event| matches!(event, RecordedEvent::Exit(_))));
        }

        fn events(&self) -> Vec<RecordedEvent> {
            lock(&self.events).unwrap().clone()
        }
    }

    impl EventSink for FakeSink {
        fn output(&self, event: &PtyOutputEvent) -> Result<(), ()> {
            if self.output_error.load(Ordering::SeqCst) {
                return Err(());
            }
            lock(&self.events)
                .unwrap()
                .push(RecordedEvent::Output(event.clone()));
            self.changed.notify_all();
            Ok(())
        }

        fn exit(&self, event: &PtyExitEvent) {
            lock(&self.events)
                .unwrap()
                .push(RecordedEvent::Exit(event.clone()));
            self.changed.notify_all();
        }
    }

    fn resolver() -> Arc<FakeResolver> {
        Arc::new(FakeResolver {
            paths: [
                ("hermes", "/tools/hermes"),
                ("codex", "/tools/codex"),
                ("claude", "/tools/claude"),
                ("agy", "/tools/agy"),
            ]
            .into_iter()
            .map(|(command, path)| (command.to_string(), PathBuf::from(path)))
            .collect(),
        })
    }

    fn engine(adapter: Arc<FakeAdapter>) -> PtySessionEngine {
        PtySessionEngine::new(adapter, resolver())
    }

    fn temp_workspace() -> PathBuf {
        let unique = NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed);
        let workspace =
            std::env::temp_dir().join(format!("agentos-pty-test-{}-{unique}", std::process::id()));
        std::fs::create_dir(&workspace).unwrap();
        workspace
    }

    fn request(provider_id: &str, workspace: &Path, session_mode: SessionMode) -> PtyStartRequest {
        request_for_slot(SLOT_ID, provider_id, workspace, session_mode)
    }

    fn request_for_slot(
        slot_id: &str,
        provider_id: &str,
        workspace: &Path,
        session_mode: SessionMode,
    ) -> PtyStartRequest {
        PtyStartRequest {
            slot_id: slot_id.to_string(),
            provider_id: provider_id.to_string(),
            workspace_path: workspace.to_string_lossy().into_owned(),
            session_mode,
            new_folder: None,
            rows: 24,
            columns: 80,
        }
    }

    fn session_request(session: &PtySession) -> PtySessionRequest {
        PtySessionRequest {
            slot_id: session.slot_id.clone(),
            session_id: session.session_id.clone(),
        }
    }

    #[cfg(unix)]
    #[test]
    fn process_group_cleanup_kills_a_descendant_after_the_leader_exits() {
        let group = FakeUnixProcessGroup {
            signals: Mutex::new(vec![]),
            group_states: Mutex::new(VecDeque::from([true, false])),
            child_exited: AtomicBool::new(true),
            poll_count: AtomicU64::new(0),
        };

        terminate_unix_process_group(&group, Duration::ZERO).unwrap();

        assert_eq!(
            *lock(&group.signals).unwrap(),
            vec![libc::SIGTERM, libc::SIGKILL]
        );
        assert_eq!(group.poll_count.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn failed_pty_handle_preparation_never_spawns_a_child() {
        let calls = Arc::new(Mutex::new(vec![]));
        let reader_calls = calls.clone();
        let writer_calls = calls.clone();
        let spawn_calls = calls.clone();

        let result = prepare_then_spawn(
            move || {
                lock(&reader_calls)?.push("reader");
                Ok(())
            },
            move || {
                lock(&writer_calls)?.push("writer");
                Err::<(), _>("writer setup failed".to_string())
            },
            move || {
                lock(&spawn_calls)?.push("spawn");
                Ok(())
            },
        );

        assert_eq!(result.unwrap_err(), "writer setup failed");
        assert_eq!(*lock(&calls).unwrap(), vec!["reader", "writer"]);
    }

    #[test]
    fn fixed_provider_commands_match_the_external_launcher_contract() {
        let cases = [
            ("hermes", SessionMode::New, Vec::<String>::new()),
            (
                "hermes",
                SessionMode::Continue,
                vec!["--continue".to_string(), "--no-restore-cwd".to_string()],
            ),
            ("codex", SessionMode::New, vec![]),
            (
                "codex",
                SessionMode::Continue,
                vec!["resume".to_string(), "--last".to_string()],
            ),
            ("claude", SessionMode::New, vec![]),
            (
                "claude",
                SessionMode::Continue,
                vec!["--continue".to_string()],
            ),
            ("antigravity", SessionMode::New, vec![]),
            (
                "antigravity",
                SessionMode::Continue,
                vec!["--continue".to_string()],
            ),
        ];

        for (provider, mode, expected_arguments) in cases {
            let workspace = temp_workspace();
            let adapter = Arc::new(FakeAdapter::new());
            let engine = engine(adapter.clone());
            let sink = Arc::new(FakeSink::default());
            let session = engine
                .start_with_sink(request(provider, &workspace, mode), sink)
                .unwrap();
            let call = lock(&adapter.calls).unwrap()[0].clone();
            assert_eq!(call.arguments, expected_arguments);
            assert_eq!(call.workspace, workspace.canonicalize().unwrap());
            assert_eq!((call.rows, call.columns), (24, 80));
            engine.stop(session_request(&session)).unwrap();
            std::fs::remove_dir_all(workspace).unwrap();
        }
    }

    #[test]
    fn strips_the_child_session_marker_for_claude_slots_only() {
        let cases = [
            (
                "claude",
                SessionMode::New,
                vec!["CLAUDE_CODE_CHILD_SESSION"],
            ),
            (
                "claude",
                SessionMode::Continue,
                vec!["CLAUDE_CODE_CHILD_SESSION"],
            ),
            ("hermes", SessionMode::New, vec![]),
            ("hermes", SessionMode::Continue, vec![]),
            ("codex", SessionMode::New, vec![]),
            ("codex", SessionMode::Continue, vec![]),
            ("antigravity", SessionMode::New, vec![]),
            ("antigravity", SessionMode::Continue, vec![]),
        ];

        for (provider, mode, expected_removals) in cases {
            let workspace = temp_workspace();
            let adapter = Arc::new(FakeAdapter::new());
            let engine = engine(adapter.clone());
            let sink = Arc::new(FakeSink::default());
            let session = engine
                .start_with_sink(request(provider, &workspace, mode), sink)
                .unwrap();
            let call = lock(&adapter.calls).unwrap()[0].clone();
            assert_eq!(call.removed_environment, expected_removals);
            engine.stop(session_request(&session)).unwrap();
            std::fs::remove_dir_all(workspace).unwrap();
        }
    }

    #[test]
    fn hands_the_apps_effective_search_path_to_the_cli() {
        let workspace = temp_workspace();
        let adapter = Arc::new(FakeAdapter::new());
        let engine = engine(adapter.clone());
        let sink = Arc::new(FakeSink::default());
        let session = engine
            .start_with_sink(request("codex", &workspace, SessionMode::New), sink)
            .unwrap();

        let call = lock(&adapter.calls).unwrap()[0].clone();
        assert_eq!(call.search_path, crate::providers::search_path_value());
        assert!(!call.search_path.is_empty());

        engine.stop(session_request(&session)).unwrap();
        std::fs::remove_dir_all(workspace).unwrap();
    }

    // The engine tests above can only prove the right values reach the adapter.
    // These two prove they do something once they get there. They build their
    // own CommandBuilder rather than touching the test process environment,
    // which Rust runs from several threads at once.
    #[test]
    fn setting_the_search_path_puts_it_on_the_command() {
        let mut command = CommandBuilder::new("codex");
        command.env("PATH", "/usr/bin");

        apply_search_path(&mut command, OsStr::new("/tools:/usr/bin"));

        assert_eq!(
            command.get_env("PATH").and_then(|value| value.to_str()),
            Some("/tools:/usr/bin")
        );
    }

    #[test]
    fn removing_environment_takes_the_variable_off_the_command() {
        let mut command = CommandBuilder::new("claude");
        command.env(CLAUDE_CHILD_SESSION_MARKER, "1");
        command.env("PATH", "/usr/bin");

        apply_environment_removals(&mut command, removed_environment("claude"));

        assert!(command.get_env(CLAUDE_CHILD_SESSION_MARKER).is_none());
        assert_eq!(
            command.get_env("PATH").and_then(|value| value.to_str()),
            Some("/usr/bin")
        );
    }

    #[test]
    fn rejects_invalid_slot_size_workspace_provider_and_unavailable_executable() {
        let workspace = temp_workspace();
        let adapter = Arc::new(FakeAdapter::new());
        let engine = engine(adapter);
        let sink = Arc::new(FakeSink::default());

        let mut invalid_slot = request("codex", &workspace, SessionMode::New);
        invalid_slot.slot_id = "slot-5".to_string();
        assert_eq!(
            engine
                .start_with_sink(invalid_slot, sink.clone())
                .unwrap_err()
                .code,
            "invalid_slot"
        );

        let mut invalid_size = request("codex", &workspace, SessionMode::New);
        invalid_size.rows = 0;
        assert_eq!(
            engine
                .start_with_sink(invalid_size, sink.clone())
                .unwrap_err()
                .code,
            "invalid_terminal_size"
        );
        assert_eq!(
            engine
                .start_with_sink(
                    request("codex", Path::new("relative"), SessionMode::New),
                    sink.clone(),
                )
                .unwrap_err()
                .code,
            "invalid_workspace"
        );
        assert_eq!(
            engine
                .start_with_sink(
                    request("unknown", &workspace, SessionMode::New),
                    sink.clone(),
                )
                .unwrap_err()
                .code,
            "unknown_provider"
        );

        let unavailable = PtySessionEngine::new(
            Arc::new(FakeAdapter::new()),
            Arc::new(FakeResolver {
                paths: HashMap::new(),
            }),
        );
        assert_eq!(
            unavailable
                .start_with_sink(request("codex", &workspace, SessionMode::New), sink,)
                .unwrap_err()
                .code,
            "provider_unavailable"
        );
        std::fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn supports_four_independent_slots_and_rejects_duplicate_slot_sessions() {
        let workspace = temp_workspace();
        let adapter = Arc::new(FakeAdapter::new());
        let engine = engine(adapter.clone());
        let sink = Arc::new(FakeSink::default());
        let sessions = SLOT_IDS
            .iter()
            .map(|slot_id| {
                engine
                    .start_with_sink(
                        request_for_slot(slot_id, "codex", &workspace, SessionMode::New),
                        sink.clone(),
                    )
                    .unwrap()
            })
            .collect::<Vec<_>>();

        assert_eq!(
            engine
                .start_with_sink(
                    request_for_slot("slot-2", "claude", &workspace, SessionMode::New),
                    sink.clone(),
                )
                .unwrap_err()
                .code,
            "session_already_running"
        );
        assert_eq!(lock(&adapter.processes).unwrap().len(), 4);
        for session in &sessions {
            assert_eq!(engine.query(session_request(session)).unwrap(), *session);
        }
        for session in sessions {
            engine.stop(session_request(&session)).unwrap();
        }
        std::fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn rejects_stale_and_cross_slot_session_ids_without_touching_other_sessions() {
        let workspace = temp_workspace();
        let adapter = Arc::new(FakeAdapter::new());
        let engine = engine(adapter);
        let sink = Arc::new(FakeSink::default());
        let first = engine
            .start_with_sink(request("codex", &workspace, SessionMode::New), sink.clone())
            .unwrap();
        engine.stop(session_request(&first)).unwrap();
        let second = engine
            .start_with_sink(
                request_for_slot("slot-1", "claude", &workspace, SessionMode::New),
                sink,
            )
            .unwrap();
        for code in [
            engine.query(session_request(&first)).unwrap_err().code,
            engine
                .write(PtyInputRequest {
                    slot_id: SLOT_ID.to_string(),
                    session_id: first.session_id.clone(),
                    data: vec![3],
                })
                .unwrap_err()
                .code,
            engine
                .resize(PtyResizeRequest {
                    slot_id: SLOT_ID.to_string(),
                    session_id: first.session_id.clone(),
                    rows: 40,
                    columns: 120,
                })
                .unwrap_err()
                .code,
            engine.stop(session_request(&first)).unwrap_err().code,
            engine
                .query(PtySessionRequest {
                    slot_id: "slot-2".to_string(),
                    session_id: second.session_id.clone(),
                })
                .unwrap_err()
                .code,
        ] {
            assert_eq!(code, "stale_session");
        }
        assert_eq!(engine.query(session_request(&second)).unwrap(), second);
        engine.stop(session_request(&second)).unwrap();
        std::fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn streams_partial_utf8_and_ansi_bytes_in_order_before_natural_exit() {
        let workspace = temp_workspace();
        let adapter = Arc::new(FakeAdapter::new());
        *lock(&adapter.output_chunks).unwrap() = vec![
            vec![0xf0, 0x9f],
            vec![0x92, 0xa9],
            b"\x1b[31mred\x1b[0m".to_vec(),
        ];
        adapter.auto_exit.store(true, Ordering::SeqCst);
        let engine = engine(adapter);
        let sink = Arc::new(FakeSink::default());
        let session = engine
            .start_with_sink(request("codex", &workspace, SessionMode::New), sink.clone())
            .unwrap();
        sink.wait_for_exit();

        let events = sink.events();
        let output = events
            .iter()
            .filter_map(|event| match event {
                RecordedEvent::Output(output) => Some(output.data.clone()),
                RecordedEvent::Exit(_) => None,
            })
            .flatten()
            .collect::<Vec<_>>();
        assert_eq!(output, b"\xf0\x9f\x92\xa9\x1b[31mred\x1b[0m");
        assert!(matches!(events.last(), Some(RecordedEvent::Exit(_))));
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event, RecordedEvent::Exit(_)))
                .count(),
            1
        );
        assert_eq!(
            engine.query(session_request(&session)).unwrap_err().code,
            "no_active_session"
        );
        std::fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn forwards_input_resizes_and_stops_the_complete_fake_process_tree() {
        let workspace = temp_workspace();
        let adapter = Arc::new(FakeAdapter::new());
        let engine = engine(adapter.clone());
        let sink = Arc::new(FakeSink::default());
        let session = engine
            .start_with_sink(request("codex", &workspace, SessionMode::New), sink.clone())
            .unwrap();
        let process = adapter.latest_process();

        engine
            .write(PtyInputRequest {
                slot_id: SLOT_ID.to_string(),
                session_id: session.session_id.clone(),
                data: vec![b'a', 13, 27, b'[', b'A', 3],
            })
            .unwrap();
        engine
            .resize(PtyResizeRequest {
                slot_id: SLOT_ID.to_string(),
                session_id: session.session_id.clone(),
                rows: 50,
                columns: 160,
            })
            .unwrap();
        assert_eq!(
            *lock(&process.input).unwrap(),
            vec![b'a', 13, 27, b'[', b'A', 3]
        );
        assert_eq!(*lock(&process.sizes).unwrap(), vec![(50, 160)]);

        engine.stop(session_request(&session)).unwrap();
        assert!(process.terminated.load(Ordering::SeqCst));
        sink.wait_for_exit();
        assert!(matches!(
            sink.events().last(),
            Some(RecordedEvent::Exit(PtyExitEvent { reason, .. })) if reason == "stopped"
        ));
        std::fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn spawn_failure_keeps_a_new_workspace_folder_and_reports_its_path() {
        let workspace = temp_workspace();
        let adapter = Arc::new(FakeAdapter::new());
        adapter.spawn_error.store(true, Ordering::SeqCst);
        let engine = engine(adapter);
        let mut start = request("codex", &workspace, SessionMode::New);
        start.new_folder = Some("new-project".to_string());

        let error = engine
            .start_with_sink(start, Arc::new(FakeSink::default()))
            .unwrap_err();

        assert_eq!(error.code, "pty_spawn_failed");
        assert!(error.message.contains("remains"));
        assert!(error.message.contains("new-project"));
        assert!(workspace.join("new-project").is_dir());
        std::fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn cleanup_terminates_an_active_session_and_surfaces_cleanup_failure() {
        let workspace = temp_workspace();
        let adapter = Arc::new(FakeAdapter::new());
        let engine = engine(adapter.clone());
        let session = engine
            .start_with_sink(
                request("codex", &workspace, SessionMode::New),
                Arc::new(FakeSink::default()),
            )
            .unwrap();
        let process = adapter.latest_process();
        process.terminate_error.store(true, Ordering::SeqCst);

        assert_eq!(engine.cleanup().unwrap_err().code, "pty_stop_failed");
        assert_eq!(engine.query(session_request(&session)).unwrap(), session);

        process.terminate_error.store(false, Ordering::SeqCst);
        engine.cleanup().unwrap();
        assert!(process.terminated.load(Ordering::SeqCst));
        std::fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn cleanup_attempts_every_active_slot_when_one_stop_fails() {
        let workspace = temp_workspace();
        let adapter = Arc::new(FakeAdapter::new());
        let engine = engine(adapter.clone());
        let first = engine
            .start_with_sink(
                request_for_slot("slot-1", "codex", &workspace, SessionMode::New),
                Arc::new(FakeSink::default()),
            )
            .unwrap();
        let second = engine
            .start_with_sink(
                request_for_slot("slot-2", "codex", &workspace, SessionMode::New),
                Arc::new(FakeSink::default()),
            )
            .unwrap();
        let processes = lock(&adapter.processes).unwrap().clone();
        processes[0].terminate_error.store(true, Ordering::SeqCst);

        assert_eq!(engine.cleanup().unwrap_err().code, "pty_stop_failed");
        assert_eq!(engine.query(session_request(&first)).unwrap(), first);
        assert!(processes[1].terminated.load(Ordering::SeqCst));
        assert_eq!(
            engine.query(session_request(&second)).unwrap_err().code,
            "no_active_session"
        );

        processes[0].terminate_error.store(false, Ordering::SeqCst);
        engine.cleanup().unwrap();
        std::fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn frontend_event_failure_terminates_the_session_instead_of_orphaning_it() {
        let workspace = temp_workspace();
        let adapter = Arc::new(FakeAdapter::new());
        *lock(&adapter.output_chunks).unwrap() = vec![b"output".to_vec()];
        let engine = engine(adapter.clone());
        let sink = Arc::new(FakeSink::default());
        sink.output_error.store(true, Ordering::SeqCst);
        let session = engine
            .start_with_sink(request("codex", &workspace, SessionMode::New), sink.clone())
            .unwrap();
        sink.wait_for_exit();

        assert!(adapter.latest_process().terminated.load(Ordering::SeqCst));
        assert!(matches!(
            sink.events().last(),
            Some(RecordedEvent::Exit(PtyExitEvent { reason, .. }))
                if reason == "frontend_disconnected"
        ));
        assert_eq!(
            engine.query(session_request(&session)).unwrap_err().code,
            "no_active_session"
        );
        std::fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn write_and_resize_failures_use_structured_errors_without_clearing_session() {
        let workspace = temp_workspace();
        let adapter = Arc::new(FakeAdapter::new());
        let engine = engine(adapter.clone());
        let session = engine
            .start_with_sink(
                request("codex", &workspace, SessionMode::New),
                Arc::new(FakeSink::default()),
            )
            .unwrap();
        adapter
            .latest_process()
            .write_error
            .store(true, Ordering::SeqCst);

        assert_eq!(
            engine
                .write(PtyInputRequest {
                    slot_id: SLOT_ID.to_string(),
                    session_id: session.session_id.clone(),
                    data: vec![3],
                })
                .unwrap_err()
                .code,
            "pty_write_failed"
        );
        assert_eq!(
            engine
                .resize(PtyResizeRequest {
                    slot_id: SLOT_ID.to_string(),
                    session_id: session.session_id.clone(),
                    rows: 0,
                    columns: 80,
                })
                .unwrap_err()
                .code,
            "invalid_terminal_size"
        );
        assert_eq!(engine.query(session_request(&session)).unwrap(), session);
        engine.stop(session_request(&session)).unwrap();
        std::fs::remove_dir_all(workspace).unwrap();
    }
}
