import type {
  LaunchRequest,
  LaunchResponse,
  PreferenceSaveContext,
  PreferenceSaveResult,
  Provider,
  WorkspacePreferences,
  WorkspaceResponse,
} from "../types";

export interface RuntimeAdapter {
  fetchProviders(): Promise<Provider[]>;
  launchProvider(request: LaunchRequest): Promise<LaunchResponse>;
  validateWorkspace(workspacePath: string): Promise<WorkspaceResponse>;
  loadWorkspacePreferences(): Promise<WorkspacePreferences>;
  saveWorkspacePreferences(
    preferences: WorkspacePreferences,
    context: PreferenceSaveContext,
  ): Promise<PreferenceSaveResult>;
}
