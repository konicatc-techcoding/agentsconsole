import { invoke } from "@tauri-apps/api/core";

import type {
  LaunchRequest,
  LaunchResponse,
  Provider,
  WorkspaceResponse,
} from "../types";

import type { RuntimeAdapter } from "./types";

interface TauriCommandError {
  message?: string;
}

function commandError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    return error;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as TauriCommandError).message === "string"
  ) {
    return new Error((error as TauriCommandError).message);
  }
  return new Error(fallback);
}

export const tauriRuntime: RuntimeAdapter = {
  async fetchProviders(): Promise<Provider[]> {
    try {
      return await invoke<Provider[]>("discover_providers");
    } catch (error) {
      throw commandError(error, "Provider discovery failed");
    }
  },

  async launchProvider(request: LaunchRequest): Promise<LaunchResponse> {
    try {
      return await invoke<LaunchResponse>("launch_provider", { request });
    } catch (error) {
      throw commandError(error, "CLI launch failed");
    }
  },

  async validateWorkspace(workspacePath: string): Promise<WorkspaceResponse> {
    try {
      return await invoke<WorkspaceResponse>("validate_workspace", {
        workspacePath,
      });
    } catch (error) {
      throw commandError(error, "Workspace validation failed");
    }
  },
};
