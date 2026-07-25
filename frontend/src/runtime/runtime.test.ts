import { invoke, isTauri } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { selectRuntime } from ".";
import { defaultConsoleLayout } from "./consoleLayout";
import { tauriRuntime } from "./tauri";
import { webRuntime } from "./web";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(isTauri).mockReturnValue(false);
});

afterEach(() => {
  localStorage.clear();
});

describe("runtime adapters", () => {
  it("selects Web transport by default and Tauri transport in the app", () => {
    expect(selectRuntime()).toBe(webRuntime);
    expect(selectRuntime(true)).toBe(tauriRuntime);
    expect(webRuntime.kind).toBe("web");
    expect(tauriRuntime.kind).toBe("tauri");
    expect(webRuntime.loadConsoleLayout).toBeUndefined();
    expect(webRuntime.saveConsoleLayout).toBeUndefined();
  });

  it("routes typed operations through fixed Tauri commands", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ workspace_path: "/workspace" })
      .mockResolvedValueOnce({
        launched: true,
        provider_id: "codex",
        workspace_path: "/workspace",
      });

    await tauriRuntime.fetchProviders();
    await tauriRuntime.validateWorkspace("/workspace");
    await tauriRuntime.launchProvider({
      provider_id: "codex",
      workspace_path: "/workspace",
      session_mode: "continue",
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "discover_providers");
    expect(invoke).toHaveBeenNthCalledWith(2, "validate_workspace", {
      workspacePath: "/workspace",
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "launch_provider", {
      request: {
        provider_id: "codex",
        workspace_path: "/workspace",
        session_mode: "continue",
      },
    });
  });

  it("turns structured Tauri failures into user-safe Error objects", async () => {
    vi.mocked(invoke).mockRejectedValue({
      code: "invalid_workspace",
      message: "Workspace does not exist",
      status_code: 400,
    });

    await expect(
      tauriRuntime.validateWorkspace("/missing"),
    ).rejects.toThrow("Workspace does not exist");
  });

  it("uses existing App-managed preferences without reading legacy storage", async () => {
    const preferences = {
      codex: {
        defaultWorkspace: "/app-data",
        recentWorkspaces: ["/recent"],
      },
    };
    localStorage.setItem(
      "agentos-console.workspace-preferences.v1",
      JSON.stringify({
        codex: { defaultWorkspace: "/legacy", recentWorkspaces: [] },
      }),
    );
    const storageRead = vi.spyOn(Storage.prototype, "getItem");
    vi.mocked(invoke).mockResolvedValue({
      exists: true,
      preferences,
    });

    await expect(tauriRuntime.loadWorkspacePreferences()).resolves.toEqual(
      preferences,
    );

    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("read_workspace_preferences");
    expect(storageRead).not.toHaveBeenCalled();
    storageRead.mockRestore();
  });

  it("migrates legacy preferences only when the App-managed JSON is missing", async () => {
    localStorage.setItem(
      "agentos-console.workspace-preferences.v1",
      JSON.stringify({
        codex: {
          defaultWorkspace: "/default",
          lastStartedWorkspace: "/legacy-recent",
        },
      }),
    );
    const migrated = {
      codex: {
        defaultWorkspace: "/default",
        recentWorkspaces: ["/legacy-recent"],
      },
    };
    vi.mocked(invoke)
      .mockResolvedValueOnce({ exists: false, preferences: null })
      .mockResolvedValueOnce(migrated);

    await expect(tauriRuntime.loadWorkspacePreferences()).resolves.toEqual(
      migrated,
    );

    expect(invoke).toHaveBeenNthCalledWith(2, "initialize_workspace_preferences", {
      preferences: migrated,
    });
    expect(
      localStorage.getItem("agentos-console.workspace-preferences.v1"),
    ).toBeNull();
  });

  it("keeps legacy storage when App-managed initialization fails", async () => {
    localStorage.setItem(
      "agentos-console.workspace-preferences.v1",
      JSON.stringify({
        codex: { defaultWorkspace: "/legacy", recentWorkspaces: [] },
      }),
    );
    vi.mocked(invoke)
      .mockResolvedValueOnce({ exists: false, preferences: null })
      .mockRejectedValueOnce({
        message: "Workspace preferences could not be saved",
      });

    await expect(tauriRuntime.loadWorkspacePreferences()).rejects.toThrow(
      "Workspace preferences could not be saved",
    );

    expect(
      localStorage.getItem("agentos-console.workspace-preferences.v1"),
    ).not.toBeNull();
  });

  it("reports post-launch history failures without converting them to launch failures", async () => {
    const preferences = {
      codex: { defaultWorkspace: "/default", recentWorkspaces: ["/recent"] },
    };
    vi.mocked(invoke).mockRejectedValue({
      message: "Workspace preferences could not be saved",
    });

    await expect(
      tauriRuntime.saveWorkspacePreferences(preferences, "history"),
    ).resolves.toEqual({
      warning: "CLI launched, but history was not saved",
    });
    await expect(
      tauriRuntime.saveWorkspacePreferences(preferences, "default"),
    ).rejects.toThrow("Workspace preferences could not be saved");
  });

  it("routes console layout storage through fixed Tauri commands", async () => {
    const layout = defaultConsoleLayout();
    vi.mocked(invoke)
      .mockResolvedValueOnce(layout)
      .mockResolvedValueOnce(layout);

    await expect(tauriRuntime.loadConsoleLayout?.()).resolves.toEqual(layout);
    await expect(tauriRuntime.saveConsoleLayout?.(layout)).resolves.toEqual(
      layout,
    );

    expect(invoke).toHaveBeenNthCalledWith(1, "read_console_layout");
    expect(invoke).toHaveBeenNthCalledWith(2, "write_console_layout", {
      layout,
    });
  });
});
