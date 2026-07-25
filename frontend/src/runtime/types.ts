import type {
  ConsoleLayout,
  LaunchRequest,
  LaunchResponse,
  PreferenceSaveContext,
  PreferenceSaveResult,
  Provider,
  RuntimeKind,
  WorkspacePreferences,
  WorkspaceResponse,
} from "../types";

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
}
