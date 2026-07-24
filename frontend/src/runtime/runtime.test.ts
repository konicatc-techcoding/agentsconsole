import { invoke, isTauri } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { selectRuntime } from ".";
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

describe("runtime adapters", () => {
  it("selects Web transport by default and Tauri transport in the app", () => {
    expect(selectRuntime()).toBe(webRuntime);
    expect(selectRuntime(true)).toBe(tauriRuntime);
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
});
