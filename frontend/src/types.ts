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

export type RuntimeKind = "web" | "tauri";

export type ConsoleProviderId =
  | "hermes"
  | "codex"
  | "claude"
  | "antigravity";

export type ConsoleSlotId = "slot-1" | "slot-2" | "slot-3" | "slot-4";

export interface ConsoleSlot {
  slotId: ConsoleSlotId;
  providerId: ConsoleProviderId;
}

export interface ConsoleLayout {
  version: 1;
  slots: ConsoleSlot[];
}

export interface PtyStartRequest {
  slotId: "slot-1";
  providerId: ConsoleProviderId;
  workspacePath: string;
  sessionMode: SessionMode;
  newFolder?: string;
  rows: number;
  columns: number;
}

export interface PtySessionRequest {
  slotId: "slot-1";
  sessionId: string;
}

export interface PtyInputRequest extends PtySessionRequest {
  data: number[];
}

export interface PtyResizeRequest extends PtySessionRequest {
  rows: number;
  columns: number;
}

export interface PtySession {
  slotId: "slot-1";
  sessionId: string;
  providerId: ConsoleProviderId;
  workspacePath: string;
  sessionMode: SessionMode;
}

export interface PtyOutputEvent {
  slotId: "slot-1";
  sessionId: string;
  data: number[];
}

export interface PtyExitEvent {
  slotId: "slot-1";
  sessionId: string;
  exitCode: number | null;
  reason: string;
}
