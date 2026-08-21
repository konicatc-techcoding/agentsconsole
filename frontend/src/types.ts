export interface Provider {
  id: string;
  display_name: string;
  command: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
  // Tauri only, and only when the executable was not found: the directories
  // actually searched. The Web runtime does not send it.
  searched_paths?: string[];
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
  slotId: ConsoleSlotId;
  providerId: ConsoleProviderId;
  workspacePath: string;
  sessionMode: SessionMode;
  newFolder?: string;
  rows: number;
  columns: number;
}

export interface PtySessionRequest {
  slotId: ConsoleSlotId;
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
  slotId: ConsoleSlotId;
  sessionId: string;
  providerId: ConsoleProviderId;
  workspacePath: string;
  sessionMode: SessionMode;
  /** The Claude conversation this Slot resumed, when the App picked one. */
  resumedSessionId?: string | null;
  /** The spawned CLI process's PID, when the runtime reports one. */
  processId?: number | null;
}

export interface PtyOutputEvent {
  slotId: ConsoleSlotId;
  sessionId: string;
  data: number[];
}

export interface PtyExitEvent {
  slotId: ConsoleSlotId;
  sessionId: string;
  exitCode: number | null;
  reason: string;
}
