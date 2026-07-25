export interface Provider {
  id: string;
  display_name: string;
  command: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
}

export type SessionMode = "new" | "continue";

export interface LaunchRequest {
  provider_id: string;
  workspace_path: string;
  session_mode: SessionMode;
  new_folder?: string;
}

export interface LaunchResponse {
  launched: boolean;
  provider_id: string;
  workspace_path: string;
}

export interface WorkspaceResponse {
  workspace_path: string;
}

export interface WorkspacePreference {
  defaultWorkspace: string;
  recentWorkspaces: string[];
}

export type WorkspacePreferences = Record<string, WorkspacePreference>;

export type PreferenceSaveContext = "default" | "history";

export interface PreferenceSaveResult {
  warning?: string;
}
