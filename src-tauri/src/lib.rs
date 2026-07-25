mod launcher;
mod providers;

use launcher::{CommandError, LaunchRequest, LaunchResult, WorkspaceResult};
use providers::ProviderResult;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            discover_providers,
            validate_workspace,
            launch_provider
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgentOS Console");
}
