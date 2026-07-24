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
}

export interface LaunchResponse {
  launched: boolean;
  provider_id: string;
  workspace_path: string;
}
