mod claude_resume;
mod console_layout;
mod launcher;
mod providers;
mod pty_session;
mod storage;

use console_layout::{ConsoleLayout, LayoutError};
use launcher::{CommandError, LaunchRequest, LaunchResult, WorkspaceResult};
use providers::ProviderResult;
use pty_session::{
    PtyInputRequest, PtyResizeRequest, PtySession, PtySessionEngine, PtySessionRequest,
    PtyStartRequest,
};
use storage::{StorageError, WorkspacePreferences, WorkspacePreferencesState};
use tauri::Manager;

#[tauri::command]
async fn discover_providers() -> Vec<ProviderResult> {
    providers::detect_providers()
}

#[tauri::command]
async fn validate_workspace(workspace_path: String) -> Result<WorkspaceResult, CommandError> {
    launcher::validate_workspace(&workspace_path)
}

#[tauri::command]
async fn launch_provider(request: LaunchRequest) -> Result<LaunchResult, CommandError> {
    launcher::launch_provider(request)
}

#[tauri::command]
async fn start_pty_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, PtySessionEngine>,
    request: PtyStartRequest,
) -> Result<PtySession, CommandError> {
    state.start(app, request)
}

#[tauri::command]
async fn query_pty_session(
    state: tauri::State<'_, PtySessionEngine>,
    request: PtySessionRequest,
) -> Result<PtySession, CommandError> {
    state.query(request)
}

#[tauri::command]
async fn write_pty_input(
    state: tauri::State<'_, PtySessionEngine>,
    request: PtyInputRequest,
) -> Result<(), CommandError> {
    state.write(request)
}

#[tauri::command]
async fn resize_pty(
    state: tauri::State<'_, PtySessionEngine>,
    request: PtyResizeRequest,
) -> Result<(), CommandError> {
    state.resize(request)
}

#[tauri::command]
async fn stop_pty_session(
    state: tauri::State<'_, PtySessionEngine>,
    request: PtySessionRequest,
) -> Result<(), CommandError> {
    state.stop(request)
}

#[tauri::command]
async fn close_app_window(app: tauri::AppHandle) -> Result<(), CommandError> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| CommandError::new("window_unavailable", "App window is unavailable", 500))?;
    window.destroy().map_err(|_| {
        CommandError::new("window_close_failed", "App window could not be closed", 500)
    })
}

fn app_data_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, StorageError> {
    app.path().app_data_dir().map_err(|_| StorageError {
        code: "storage_unavailable".to_string(),
        message: "The macOS App Data directory is unavailable".to_string(),
        status_code: 500,
    })
}

fn layout_data_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, LayoutError> {
    app.path().app_data_dir().map_err(|_| {
        LayoutError::new(
            "layout_storage_unavailable",
            "The macOS App Data directory is unavailable",
        )
    })
}

#[tauri::command]
async fn read_workspace_preferences(
    app: tauri::AppHandle,
) -> Result<WorkspacePreferencesState, StorageError> {
    storage::read_preferences(&app_data_directory(&app)?)
}

#[tauri::command]
async fn initialize_workspace_preferences(
    app: tauri::AppHandle,
    preferences: WorkspacePreferences,
) -> Result<WorkspacePreferences, StorageError> {
    storage::initialize_preferences(&app_data_directory(&app)?, preferences)
}

#[tauri::command]
async fn write_workspace_preferences(
    app: tauri::AppHandle,
    preferences: WorkspacePreferences,
) -> Result<WorkspacePreferences, StorageError> {
    storage::write_preferences(&app_data_directory(&app)?, preferences)
}

#[tauri::command]
async fn read_console_layout(app: tauri::AppHandle) -> Result<ConsoleLayout, LayoutError> {
    console_layout::read_or_initialize_layout(&layout_data_directory(&app)?)
}

#[tauri::command]
async fn write_console_layout(
    app: tauri::AppHandle,
    layout: ConsoleLayout,
) -> Result<ConsoleLayout, LayoutError> {
    console_layout::write_layout(&layout_data_directory(&app)?, layout)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(PtySessionEngine::default())
        .on_page_load(|webview, _payload| {
            let _ = webview.app_handle().state::<PtySessionEngine>().cleanup();
        })
        .invoke_handler(tauri::generate_handler![
            discover_providers,
            validate_workspace,
            launch_provider,
            start_pty_session,
            query_pty_session,
            write_pty_input,
            resize_pty,
            stop_pty_session,
            close_app_window,
            read_workspace_preferences,
            initialize_workspace_preferences,
            write_workspace_preferences,
            read_console_layout,
            write_console_layout
        ])
        .build(tauri::generate_context!())
        .expect("error while building AgentOS Console");

    app.run(|app_handle, event| {
        let should_cleanup = matches!(
            event,
            tauri::RunEvent::Exit
                | tauri::RunEvent::ExitRequested { .. }
                | tauri::RunEvent::WindowEvent {
                    event: tauri::WindowEvent::Destroyed,
                    ..
                }
        );
        if should_cleanup {
            let _ = app_handle.state::<PtySessionEngine>().cleanup();
        }
    });
}
