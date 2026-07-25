import type {
  LaunchRequest,
  LaunchResponse,
  Provider,
  WorkspaceResponse,
} from "../types";

export interface RuntimeAdapter {
  fetchProviders(): Promise<Provider[]>;
  launchProvider(request: LaunchRequest): Promise<LaunchResponse>;
  validateWorkspace(workspacePath: string): Promise<WorkspaceResponse>;
}
