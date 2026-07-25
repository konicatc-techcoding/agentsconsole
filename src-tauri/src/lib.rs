mod console_layout;
mod launcher;
mod providers;
mod storage;

use console_layout::{ConsoleLayout, LayoutError};
use launcher::{CommandError, LaunchRequest, LaunchResult, WorkspaceResult};
use providers::ProviderResult;
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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            discover_providers,
            validate_workspace,
            launch_provider,
            read_workspace_preferences,
            initialize_workspace_preferences,
            write_workspace_preferences,
            read_console_layout,
            write_console_layout
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgentOS Console");
}
