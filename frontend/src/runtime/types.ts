import type {
  ConsoleLayout,
  LaunchRequest,
  LaunchResponse,
  PreferenceSaveContext,
  PreferenceSaveResult,
  Provider,
  PtyExitEvent,
  PtyInputRequest,
  PtyOutputEvent,
  PtyResizeRequest,
  PtySession,
  PtySessionRequest,
  PtyStartRequest,
  RuntimeKind,
  WorkspacePreferences,
  WorkspaceResponse,
} from "../types";

export type RuntimeUnlisten = () => void;

export interface RuntimeAdapter {
  kind: RuntimeKind;
  fetchProviders(): Promise<Provider[]>;
  launchProvider(request: LaunchRequest): Promise<LaunchResponse>;
  validateWorkspace(workspacePath: string): Promise<WorkspaceResponse>;
  loadWorkspacePreferences(): Promise<WorkspacePreferences>;
  saveWorkspacePreferences(
    preferences: WorkspacePreferences,
    context: PreferenceSaveContext,
  ): Promise<PreferenceSaveResult>;
  loadConsoleLayout?(): Promise<ConsoleLayout>;
  saveConsoleLayout?(layout: ConsoleLayout): Promise<ConsoleLayout>;
  startPtySession?(request: PtyStartRequest): Promise<PtySession>;
  queryPtySession?(request: PtySessionRequest): Promise<PtySession>;
  writePtyInput?(request: PtyInputRequest): Promise<void>;
  resizePty?(request: PtyResizeRequest): Promise<void>;
  stopPtySession?(request: PtySessionRequest): Promise<void>;
  onPtyOutput?(
    handler: (event: PtyOutputEvent) => void,
  ): Promise<RuntimeUnlisten>;
  onPtyExit?(handler: (event: PtyExitEvent) => void): Promise<RuntimeUnlisten>;
}
