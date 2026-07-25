import { invoke } from "@tauri-apps/api/core";

import type {
  ConsoleLayout,
  LaunchRequest,
  LaunchResponse,
  PreferenceSaveContext,
  PreferenceSaveResult,
  Provider,
  WorkspacePreferences,
  WorkspaceResponse,
} from "../types";

import {
  clearLocalWorkspacePreferences,
  hasLocalWorkspacePreferences,
  readLocalWorkspacePreferences,
} from "./preferences";
import type { RuntimeAdapter } from "./types";

interface TauriCommandError {
  message?: string;
}

interface WorkspacePreferencesState {
  exists: boolean;
  preferences: WorkspacePreferences | null;
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
  kind: "tauri",
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

  async loadWorkspacePreferences(): Promise<WorkspacePreferences> {
    try {
      const state = await invoke<WorkspacePreferencesState>(
        "read_workspace_preferences",
      );
      if (state.exists && state.preferences) {
        return state.preferences;
      }

      const hadLegacyPreferences = hasLocalWorkspacePreferences();
      const preferences = readLocalWorkspacePreferences();
      const initialized = await invoke<WorkspacePreferences>(
        "initialize_workspace_preferences",
        { preferences },
      );
      if (hadLegacyPreferences) {
        clearLocalWorkspacePreferences();
      }
      return initialized;
    } catch (error) {
      throw commandError(error, "Workspace preferences could not be loaded");
    }
  },

  async saveWorkspacePreferences(
    preferences: WorkspacePreferences,
    context: PreferenceSaveContext,
  ): Promise<PreferenceSaveResult> {
    try {
      await invoke<WorkspacePreferences>("write_workspace_preferences", {
        preferences,
      });
      return {};
    } catch (error) {
      if (context === "history") {
        return { warning: "CLI launched, but history was not saved" };
      }
      throw commandError(error, "Workspace preferences could not be saved");
    }
  },

  async loadConsoleLayout(): Promise<ConsoleLayout> {
    try {
      return await invoke<ConsoleLayout>("read_console_layout");
    } catch (error) {
      throw commandError(error, "Console layout could not be loaded");
    }
  },

  async saveConsoleLayout(layout: ConsoleLayout): Promise<ConsoleLayout> {
    try {
      return await invoke<ConsoleLayout>("write_console_layout", { layout });
    } catch (error) {
      throw commandError(error, "Console layout could not be saved");
    }
  },
};
