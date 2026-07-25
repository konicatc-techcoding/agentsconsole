import type { WorkspacePreferences } from "../types";

export const WORKSPACE_PREFERENCES_KEY =
  "agentos-console.workspace-preferences.v1";
export const RECENT_WORKSPACE_LIMIT = 5;

export function normalizeWorkspacePreferences(
  stored: unknown,
): WorkspacePreferences {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return {};
  }

  const preferences: WorkspacePreferences = {};
  for (const [providerId, value] of Object.entries(stored)) {
    if (
      !value ||
      typeof value !== "object" ||
      !("defaultWorkspace" in value) ||
      typeof value.defaultWorkspace !== "string"
    ) {
      continue;
    }

    let recent: string[] = [];
    if ("recentWorkspaces" in value && Array.isArray(value.recentWorkspaces)) {
      recent = value.recentWorkspaces.filter(
        (path: unknown): path is string =>
          typeof path === "string" && Boolean(path),
      );
    } else if (
      "lastStartedWorkspace" in value &&
      typeof value.lastStartedWorkspace === "string" &&
      value.lastStartedWorkspace
    ) {
      recent = [value.lastStartedWorkspace];
    }

    preferences[providerId] = {
      defaultWorkspace: value.defaultWorkspace,
      recentWorkspaces: [...new Set(recent)].slice(0, RECENT_WORKSPACE_LIMIT),
    };
  }
  return preferences;
}

export function hasLocalWorkspacePreferences(): boolean {
  return localStorage.getItem(WORKSPACE_PREFERENCES_KEY) !== null;
}

export function readLocalWorkspacePreferences(): WorkspacePreferences {
  try {
    return normalizeWorkspacePreferences(
      JSON.parse(localStorage.getItem(WORKSPACE_PREFERENCES_KEY) ?? "{}"),
    );
  } catch {
    return {};
  }
}

export function writeLocalWorkspacePreferences(
  preferences: WorkspacePreferences,
): boolean {
  try {
    localStorage.setItem(
      WORKSPACE_PREFERENCES_KEY,
      JSON.stringify(preferences),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearLocalWorkspacePreferences(): void {
  try {
    localStorage.removeItem(WORKSPACE_PREFERENCES_KEY);
  } catch {
    // The App-managed JSON is already authoritative after migration succeeds.
  }
}
