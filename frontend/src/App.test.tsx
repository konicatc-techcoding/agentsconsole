import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { defaultConsoleLayout } from "./runtime/consoleLayout";
import type { RuntimeAdapter } from "./runtime/types";
import type {
  ConsoleLayout,
  Provider,
  PtyExitEvent,
  PtyOutputEvent,
  PtySession,
  WorkspacePreferences,
} from "./types";

const providers: Provider[] = [
  {
    id: "hermes",
    display_name: "Hermes CLI",
    command: "hermes",
    installed: true,
    path: "/tools/hermes",
    version: "Hermes Agent v0.19.0",
    error: null,
  },
  {
    id: "codex",
    display_name: "Codex CLI",
    command: "codex",
    installed: true,
    path: "/tools/codex",
    version: "codex-cli 0.145.0",
    error: null,
  },
  {
    id: "claude",
    display_name: "Claude CLI",
    command: "claude",
    installed: true,
    path: "/tools/claude",
    version: "2.1.218 (Claude Code)",
    error: null,
  },
  {
    id: "antigravity",
    display_name: "Antigravity CLI",
    command: "agy",
    installed: true,
    path: "/tools/agy",
    version: "1.1.5",
    error: null,
  },
];

function mockFetch(data: Provider[] = providers) {
  return vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => data } as Response);
}

function mockApi(options?: {
  launchError?: string;
  launchDelay?: boolean;
  saveError?: string;
  saveDelay?: boolean;
}) {
  let finishLaunch: (() => void) | undefined;
  let finishSave: (() => void) | undefined;
  const launchGate = options?.launchDelay
    ? new Promise<void>((resolve) => {
        finishLaunch = resolve;
      })
    : Promise.resolve();
  const saveGate = options?.saveDelay
    ? new Promise<void>((resolve) => {
        finishSave = resolve;
      })
    : Promise.resolve();

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/providers") {
        return {
          ok: true,
          json: async () => providers,
        } as Response;
      }

      if (input === "/api/workspaces/validate") {
        await saveGate;
        if (options?.saveError) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              detail: {
                code: "invalid_workspace",
                message: options.saveError,
              },
            }),
          } as Response;
        }
        const request = JSON.parse(String(init?.body)) as {
          workspace_path: string;
        };
        return {
          ok: true,
          json: async () => ({ workspace_path: request.workspace_path }),
        } as Response;
      }

      await launchGate;
      if (options?.launchError) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            detail: {
              code: "invalid_workspace",
              message: options.launchError,
            },
          }),
        } as Response;
      }
      const request = JSON.parse(String(init?.body)) as {
        provider_id: string;
        workspace_path: string;
        new_folder?: string;
      };
      return {
        ok: true,
        json: async () => ({
          launched: true,
          provider_id: request.provider_id,
          workspace_path: request.new_folder
            ? `${request.workspace_path}/${request.new_folder}`
            : request.workspace_path,
        }),
      } as Response;
    },
  );

  return { fetchMock, finishLaunch, finishSave };
}

function mockRuntime(options?: {
  kind?: RuntimeAdapter["kind"];
  loadPreferences?: () => Promise<WorkspacePreferences>;
  savePreferences?: RuntimeAdapter["saveWorkspacePreferences"];
  loadLayout?: () => Promise<ConsoleLayout>;
  saveLayout?: RuntimeAdapter["saveConsoleLayout"];
  startPty?: RuntimeAdapter["startPtySession"];
  stopPty?: RuntimeAdapter["stopPtySession"];
  onPtyOutput?: (handler: (event: PtyOutputEvent) => void) => Promise<() => void>;
  onPtyExit?: (handler: (event: PtyExitEvent) => void) => Promise<() => void>;
  onCloseRequested?: RuntimeAdapter["onCloseRequested"];
  closeWindow?: RuntimeAdapter["closeWindow"];
  reloadWindow?: RuntimeAdapter["reloadWindow"];
}): RuntimeAdapter {
  const runtime: RuntimeAdapter = {
    kind: options?.kind ?? "web",
    fetchProviders: vi.fn().mockResolvedValue(providers),
    launchProvider: vi.fn(async (request) => ({
      launched: true,
      provider_id: request.provider_id,
      workspace_path: request.workspace_path,
    })),
    validateWorkspace: vi.fn(async (workspacePath) => ({
      workspace_path: workspacePath,
    })),
    loadWorkspacePreferences:
      options?.loadPreferences ?? vi.fn().mockResolvedValue({}),
    saveWorkspacePreferences:
      options?.savePreferences ?? vi.fn().mockResolvedValue({}),
  };
  if (runtime.kind === "tauri") {
    runtime.loadConsoleLayout =
      options?.loadLayout ?? vi.fn().mockResolvedValue(defaultConsoleLayout());
    runtime.saveConsoleLayout =
      options?.saveLayout ??
      vi.fn(async (layout: ConsoleLayout) => layout);
    runtime.startPtySession =
      options?.startPty ??
      vi.fn<NonNullable<RuntimeAdapter["startPtySession"]>>(
        async (request) => ({
          slotId: request.slotId,
          sessionId: `session-${request.slotId}`,
          providerId: request.providerId,
          workspacePath: request.workspacePath,
          sessionMode: request.sessionMode,
        }),
      );
    runtime.queryPtySession = vi.fn();
    runtime.writePtyInput = vi.fn().mockResolvedValue(undefined);
    runtime.resizePty = vi.fn().mockResolvedValue(undefined);
    runtime.stopPtySession =
      options?.stopPty ?? vi.fn().mockResolvedValue(undefined);
    runtime.onPtyOutput =
      options?.onPtyOutput ?? vi.fn().mockResolvedValue(() => {});
    runtime.onPtyExit =
      options?.onPtyExit ?? vi.fn().mockResolvedValue(() => {});
    runtime.onCloseRequested =
      options?.onCloseRequested ?? vi.fn().mockResolvedValue(() => {});
    runtime.closeWindow =
      options?.closeWindow ?? vi.fn().mockResolvedValue(undefined);
    runtime.reloadWindow =
      options?.reloadWindow ?? vi.fn().mockResolvedValue(undefined);
  }
  return runtime;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("AgentOS Console", () => {
  it("renders all providers in API order with details", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<App />);

    await screen.findByRole("button", { name: "Hermes CLI — Available" });
    expect(
      screen.getByRole("heading", { name: "AI Agent Console" }),
    ).toBeInTheDocument();
    const cards = providers.map((provider) =>
      screen.getByRole("button", {
        name: `${provider.display_name} — Available`,
      }),
    );
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("Hermes CLI"),
      expect.stringContaining("Codex CLI"),
      expect.stringContaining("Claude CLI"),
      expect.stringContaining("Antigravity CLI"),
    ]);
    expect(screen.getByText("codex-cli 0.145.0")).toBeInTheDocument();
    expect(screen.getAllByText("Executable path")).toHaveLength(4);
  });

  it("uses card highlighting without a redundant selection footer", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const user = userEvent.setup();
    const view = render(<App />);

    const codexCard = await screen.findByRole("button", {
      name: /Codex CLI.*Available/s,
    });
    await user.click(codexCard);
    expect(codexCard).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("SESSION SELECTION")).not.toBeInTheDocument();

    view.unmount();
    render(<App />);
    expect(
      await screen.findByRole("button", { name: /Codex CLI.*Available/s }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps an unavailable provider visible and disabled", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        providers.map((provider) =>
          provider.id === "antigravity"
            ? {
                ...provider,
                installed: false,
                path: null,
                version: null,
                error: "Executable not found in PATH",
              }
            : provider,
        ),
      ),
    );
    render(<App />);

    const unavailable = await screen.findByRole("button", {
      name: "Antigravity CLI — Unavailable",
    });
    expect(unavailable).toBeDisabled();
    expect(
      screen.getByText("Executable not found in PATH"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Hermes CLI.*Available/s }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Launch Antigravity CLI" }),
    ).toBeDisabled();
  });

  it("refreshes discovery without a page reload", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Hermes Agent v0.19.0");
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("does not expose task execution controls", async () => {
    vi.stubGlobal("fetch", mockFetch());
    render(<App />);

    await screen.findByText("Hermes Agent v0.19.0");
    expect(screen.queryByText(/^Run$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Create task/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Terminal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Prompt submission/i)).not.toBeInTheDocument();
  });

  it("saves a validated default without launching and isolates providers", async () => {
    const { fetchMock } = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    expect(
      screen.getByRole("button", { name: /Codex CLI.*Available/s }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("heading", { name: "Codex CLI" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "New session" })).toBeChecked();

    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/Users/zack/Projects",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Default workspace saved")).toHaveAttribute(
      "role",
      "status",
    );
    expect(fetchMock).toHaveBeenLastCalledWith("/api/workspaces/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_path: "/Users/zack/Projects" }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Launch Claude CLI" }));
    expect(
      screen.getByRole("textbox", { name: "Default workspace path" }),
    ).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Launch Codex CLI" }));
    expect(
      screen.getByRole("textbox", { name: "Default workspace path" }),
    ).toHaveValue("/Users/zack/Projects");
  });

  it("starts in a new folder without automatically saving the default", async () => {
    const { fetchMock } = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const view = render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/Users/zack/Projects",
    );
    await user.type(
      screen.getByRole("textbox", { name: "New folder (optional)" }),
      "My Project",
    );
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByText(
      "Codex CLI launched in /Users/zack/Projects/My Project",
    );
    expect(fetchMock).toHaveBeenLastCalledWith("/api/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_id: "codex",
        workspace_path: "/Users/zack/Projects",
        session_mode: "new",
        new_folder: "My Project",
      }),
    });

    view.unmount();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Default workspace path" }),
    ).toHaveValue("");
    await user.click(screen.getByRole("radio", { name: "Continue session" }));
    expect(screen.getByRole("combobox", { name: "Recent workspace" })).toHaveValue(
      "/Users/zack/Projects/My Project",
    );
  });

  it("migrates the previous last-started preference to recent workspaces", async () => {
    localStorage.setItem(
      "agentos-console.workspace-preferences.v1",
      JSON.stringify({
        codex: {
          defaultWorkspace: "/Users/zack/Default",
          lastStartedWorkspace: "/Users/zack/Previous",
        },
      }),
    );
    vi.stubGlobal("fetch", mockFetch());
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.click(screen.getByRole("radio", { name: "Continue session" }));

    expect(
      screen.getByRole("combobox", { name: "Recent workspace" }),
    ).toHaveValue("/Users/zack/Previous");
  });

  it("falls back to the saved default when no recent workspace exists", async () => {
    localStorage.setItem(
      "agentos-console.workspace-preferences.v1",
      JSON.stringify({
        codex: {
          defaultWorkspace: "/Users/zack/Default",
          recentWorkspaces: [],
        },
      }),
    );
    vi.stubGlobal("fetch", mockFetch());
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.click(screen.getByRole("radio", { name: "Continue session" }));

    expect(
      screen.getByRole("combobox", { name: "Recent workspace" }),
    ).toHaveValue("/Users/zack/Default");
  });

  it("keeps the modal open and does not save an invalid default", async () => {
    const { fetchMock } = mockApi({
      saveError: "Workspace does not exist",
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/missing",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Workspace does not exist")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(
      screen.getByRole("heading", { name: "Codex CLI" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(localStorage.getItem("agentos-console.workspace-preferences.v1")).toBeNull();
  });

  it("reports browser storage failure without falsely saving the default", async () => {
    const { fetchMock } = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/Users/zack/Projects",
    );
    const storageWrite = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "Default workspace could not be saved in this browser",
      ),
    ).toHaveAttribute("role", "alert");
    expect(
      screen.queryByText("Default workspace saved"),
    ).not.toBeInTheDocument();

    storageWrite.mockRestore();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Launch Codex CLI" }));
    expect(
      screen.getByRole("textbox", { name: "Default workspace path" }),
    ).toHaveValue("");
  });

  it("locks modal controls while saving a default", async () => {
    const { fetchMock, finishSave } = mockApi({ saveDelay: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/Users/zack/My Project",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "Default workspace path" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "New folder (optional)" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("radio", { name: "Continue session" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();

    finishSave?.();
    expect(
      await screen.findByText("Default workspace saved"),
    ).toBeInTheDocument();
  });

  it("locks modal controls while a launch request is pending", async () => {
    const { fetchMock, finishLaunch } = mockApi({ launchDelay: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/Users/zack/My Project",
    );
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByRole("button", { name: "Starting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "Default workspace path" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("radio", { name: "Continue session" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    finishLaunch?.();
    await screen.findByText(
      "Codex CLI launched in /Users/zack/My Project",
    );
  });

  it("keeps five recent workspaces, deduplicated and newest first", async () => {
    localStorage.setItem(
      "agentos-console.workspace-preferences.v1",
      JSON.stringify({
        codex: {
          defaultWorkspace: "/default",
          recentWorkspaces: ["/one", "/two", "/three", "/four", "/five"],
        },
      }),
    );
    const { fetchMock } = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    const defaultInput = screen.getByRole("textbox", {
      name: "Default workspace path",
    });
    await user.clear(defaultInput);
    await user.type(defaultInput, "/six");
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByText("Codex CLI launched in /six");

    let stored = JSON.parse(
      localStorage.getItem("agentos-console.workspace-preferences.v1") ?? "{}",
    );
    expect(stored.codex).toEqual({
      defaultWorkspace: "/default",
      recentWorkspaces: ["/six", "/one", "/two", "/three", "/four"],
    });

    await user.click(screen.getByRole("button", { name: "Launch Codex CLI" }));
    await user.click(screen.getByRole("radio", { name: "Continue session" }));
    const recentSelect = screen.getByRole("combobox", {
      name: "Recent workspace",
    });
    expect(screen.getAllByRole("option")).toHaveLength(5);
    await user.selectOptions(recentSelect, "/three");
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByText("Codex CLI launched in /three");

    stored = JSON.parse(
      localStorage.getItem("agentos-console.workspace-preferences.v1") ?? "{}",
    );
    expect(stored.codex).toEqual({
      defaultWorkspace: "/default",
      recentWorkspaces: ["/three", "/six", "/one", "/two", "/four"],
    });
  });

  it("disables Continue Start when no workspace is available", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.click(screen.getByRole("radio", { name: "Continue session" }));

    expect(
      screen.getByRole("combobox", { name: "Recent workspace" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.getByText("No recent workspace available")).toBeInTheDocument();
  });

  it("keeps Launch disabled until App-managed preferences finish loading", async () => {
    let finishLoading: ((preferences: WorkspacePreferences) => void) | undefined;
    const loading = new Promise<WorkspacePreferences>((resolve) => {
      finishLoading = resolve;
    });
    const runtime = mockRuntime({ loadPreferences: () => loading });
    render(<App runtime={runtime} />);

    const launch = await screen.findByRole("button", {
      name: "Launch Codex CLI",
    });
    expect(launch).toBeDisabled();

    finishLoading?.({});
    await waitFor(() => expect(launch).toBeEnabled());
  });

  it("shows the storage path error and retries storage on Refresh", async () => {
    const loadPreferences = vi
      .fn<() => Promise<WorkspacePreferences>>()
      .mockRejectedValueOnce(
        new Error(
          "Workspace preferences at /App Data/workspace-preferences.json are invalid",
        ),
      )
      .mockResolvedValueOnce({});
    const runtime = mockRuntime({ loadPreferences });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    expect(
      await screen.findByText(/\/App Data\/workspace-preferences\.json/),
    ).toHaveAttribute("role", "alert");
    expect(
      screen.getByRole("button", { name: "Launch Codex CLI" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Launch Codex CLI" }),
      ).toBeEnabled(),
    );
    expect(loadPreferences).toHaveBeenCalledTimes(2);
  });

  it("shows a history warning after a successful launch persistence failure", async () => {
    const runtime = mockRuntime({
      savePreferences: vi.fn().mockResolvedValue({
        warning: "CLI launched, but history was not saved",
      }),
    });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/workspace",
    );
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(
      await screen.findByText("Codex CLI launched in /workspace"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("CLI launched, but history was not saved"),
    ).toHaveAttribute("role", "alert");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(runtime.saveWorkspacePreferences).toHaveBeenCalledWith(
      {
        codex: {
          defaultWorkspace: "",
          recentWorkspaces: ["/workspace"],
        },
      },
      "history",
    );
  });

  it("renders the Tauri-only sidebar and fixed two-by-two console layout", async () => {
    const runtime = mockRuntime({ kind: "tauri" });
    render(<App runtime={runtime} />);

    expect(
      screen.getByRole("heading", { name: "AI Agent Console" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("CLI PROVIDERS")).not.toBeInTheDocument();
    expect(screen.getByLabelText("CLI providers")).toBeInTheDocument();
    expect(await screen.findAllByText("Embedded terminal coming next")).toHaveLength(
      2,
    );
    expect(screen.getByLabelText("Slot 1 terminal")).toBeInTheDocument();
    expect(screen.getByLabelText("Slot 2 terminal")).toBeInTheDocument();
    expect(screen.getByLabelText("Slot 1 provider")).toHaveValue("hermes");
    expect(screen.getByLabelText("Slot 2 provider")).toHaveValue("codex");
    expect(screen.getByLabelText("Slot 3 provider")).toHaveValue("claude");
    expect(screen.getByLabelText("Slot 4 provider")).toHaveValue(
      "antigravity",
    );
    expect(screen.getByText("Saved")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Save Layout" })).toBeDisabled();
  });

  it("allows duplicate slot providers and saves only an explicit dirty layout", async () => {
    const saveLayout = vi.fn(async (layout: ConsoleLayout) => layout);
    const runtime = mockRuntime({
      kind: "tauri",
      saveLayout,
    });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    const slotOne = await screen.findByLabelText("Slot 1 provider");
    const slotTwo = screen.getByLabelText("Slot 2 provider");
    await user.selectOptions(slotOne, "codex");

    expect(slotOne).toHaveValue("codex");
    expect(slotTwo).toHaveValue("codex");
    expect(screen.getByText("Unsaved changes")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Layout" })).toBeEnabled();

    await user.selectOptions(slotOne, "hermes");
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save Layout" })).toBeDisabled();

    await user.selectOptions(slotOne, "codex");
    await user.click(screen.getByRole("button", { name: "Save Layout" }));
    await waitFor(() => expect(saveLayout).toHaveBeenCalledOnce());
    expect(saveLayout.mock.calls[0][0].slots[0]).toEqual({
      slotId: "slot-1",
      providerId: "codex",
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("keeps a dirty layout available for retry when saving fails", async () => {
    const saveLayout = vi
      .fn<(layout: ConsoleLayout) => Promise<ConsoleLayout>>()
      .mockRejectedValueOnce(
        new Error(
          "Console layout could not be saved at /App Data/console-layout.json",
        ),
      )
      .mockImplementationOnce(async (layout) => layout);
    const runtime = mockRuntime({
      kind: "tauri",
      saveLayout,
    });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    const slotOne = await screen.findByLabelText("Slot 1 provider");
    await user.selectOptions(slotOne, "codex");
    await user.click(screen.getByRole("button", { name: "Save Layout" }));

    expect(
      await screen.findByText(/\/App Data\/console-layout\.json/),
    ).toHaveAttribute("role", "alert");
    expect(slotOne).toHaveValue("codex");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Layout" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save Layout" }));
    await waitFor(() => expect(saveLayout).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("locks all slot controls while an explicit layout save is pending", async () => {
    let finishSave: ((layout: ConsoleLayout) => void) | undefined;
    const savePending = new Promise<ConsoleLayout>((resolve) => {
      finishSave = resolve;
    });
    const runtime = mockRuntime({
      kind: "tauri",
      saveLayout: vi.fn(() => savePending),
    });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    const slotOne = await screen.findByLabelText("Slot 1 provider");
    await user.selectOptions(slotOne, "codex");
    await user.click(screen.getByRole("button", { name: "Save Layout" }));

    expect(screen.getAllByText("Saving…")[0]).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    for (let index = 1; index <= 4; index += 1) {
      expect(screen.getByLabelText(`Slot ${index} provider`)).toBeDisabled();
    }

    finishSave?.({
      ...defaultConsoleLayout(),
      slots: [
        {
          slotId: "slot-1",
          providerId: "codex",
        },
        ...defaultConsoleLayout().slots.slice(1),
      ],
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("locks default slots for invalid layout storage and recovers on Refresh", async () => {
    const loadLayout = vi
      .fn<() => Promise<ConsoleLayout>>()
      .mockRejectedValueOnce(
        new Error(
          "Console layout at /App Data/console-layout.json is invalid",
        ),
      )
      .mockResolvedValueOnce(defaultConsoleLayout());
    const runtime = mockRuntime({
      kind: "tauri",
      loadLayout,
    });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    expect(
      await screen.findByText(/\/App Data\/console-layout\.json/),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("Slot 1 provider")).toHaveValue("hermes");
    expect(screen.getByLabelText("Slot 1 provider")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Layout" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Slot 1 provider")).toBeEnabled(),
    );
    expect(loadLayout).toHaveBeenCalledTimes(2);
  });

  it("retains unavailable slot assignments while disabling sidebar launch", async () => {
    const runtime = mockRuntime({ kind: "tauri" });
    runtime.fetchProviders = vi.fn().mockResolvedValue(
      providers.map((provider) =>
        provider.id === "antigravity"
          ? {
              ...provider,
              installed: false,
              path: null,
              version: null,
              error: "Executable not found in PATH",
            }
          : provider,
      ),
    );
    render(<App runtime={runtime} />);

    expect(await screen.findByLabelText("Slot 4 provider")).toHaveValue(
      "antigravity",
    );
    expect(screen.getByLabelText("Slot 4 provider")).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Launch Antigravity CLI" }),
    ).toBeDisabled();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(2);
  });

  it("loads providers, workspace preferences, and console layout concurrently", async () => {
    let finishProviders: ((value: Provider[]) => void) | undefined;
    let finishPreferences:
      | ((value: WorkspacePreferences) => void)
      | undefined;
    let finishLayout: ((value: ConsoleLayout) => void) | undefined;
    const providerPending = new Promise<Provider[]>((resolve) => {
      finishProviders = resolve;
    });
    const preferencePending = new Promise<WorkspacePreferences>((resolve) => {
      finishPreferences = resolve;
    });
    const layoutPending = new Promise<ConsoleLayout>((resolve) => {
      finishLayout = resolve;
    });
    const runtime = mockRuntime({
      kind: "tauri",
      loadPreferences: vi.fn(() => preferencePending),
      loadLayout: vi.fn(() => layoutPending),
    });
    runtime.fetchProviders = vi.fn(() => providerPending);
    render(<App runtime={runtime} />);

    await waitFor(() => {
      expect(runtime.fetchProviders).toHaveBeenCalledOnce();
      expect(runtime.loadWorkspacePreferences).toHaveBeenCalledOnce();
      expect(runtime.loadConsoleLayout).toHaveBeenCalledOnce();
    });
    expect(screen.getByLabelText("Slot 1 provider")).toBeDisabled();

    finishLayout?.(defaultConsoleLayout());
    await waitFor(() =>
      expect(screen.getByLabelText("Slot 1 provider")).toBeEnabled(),
    );
    expect(
      screen.getByRole("button", { name: "Launch Codex CLI" }),
    ).toBeDisabled();

    finishProviders?.(providers);
    finishPreferences?.({});
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Launch Codex CLI" }),
      ).toBeEnabled(),
    );
  });

  it("keeps external launches separate from console slot state", async () => {
    const runtime = mockRuntime({ kind: "tauri" });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/workspace",
    );
    await user.click(
      screen
        .getByRole("dialog")
        .querySelector<HTMLButtonElement>('button[type="submit"]')!,
    );

    expect(
      await screen.findByText("Codex CLI launched in /workspace"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Embedded terminal coming next")).toHaveLength(2);
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(screen.queryByText("Launched")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Slot 2 provider")).toHaveValue("codex");
  });

  it("starts the unsaved Slot 1 provider without saving layout and persists history", async () => {
    const startPty = vi.fn<
      NonNullable<RuntimeAdapter["startPtySession"]>
    >(async (request) => ({
      slotId: "slot-1",
      sessionId: "session-codex",
      providerId: request.providerId,
      workspacePath: `${request.workspacePath}/new-project`,
      sessionMode: request.sessionMode,
    }));
    const runtime = mockRuntime({ kind: "tauri", startPty });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    const slotOne = await screen.findByLabelText("Slot 1 provider");
    await user.selectOptions(slotOne, "codex");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Configure Slot 1 session" }),
    );

    expect(
      screen.getByRole("button", { name: "Start in Slot 1" }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/workspace",
    );
    await user.type(
      screen.getByRole("textbox", { name: "New folder (optional)" }),
      "new-project",
    );
    await user.click(
      screen.getByRole("button", { name: "Start in Slot 1" }),
    );

    expect(await screen.findByText("Running")).toBeInTheDocument();
    expect(startPty).toHaveBeenCalledWith({
      slotId: "slot-1",
      providerId: "codex",
      workspacePath: "/workspace",
      sessionMode: "new",
      newFolder: "new-project",
      rows: 24,
      columns: 80,
    });
    expect(runtime.saveConsoleLayout).not.toHaveBeenCalled();
    expect(runtime.saveWorkspacePreferences).toHaveBeenCalledWith(
      {
        codex: {
          defaultWorkspace: "",
          recentWorkspaces: ["/workspace/new-project"],
        },
      },
      "history",
    );
    expect(slotOne).toBeDisabled();
    expect(screen.getByLabelText("Slot 2 provider")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save Layout" })).toBeEnabled();
  });

  it("shows Starting and a retryable Error without creating fake Running state", async () => {
    let rejectStart: ((error: Error) => void) | undefined;
    const startPending = new Promise<PtySession>((_resolve, reject) => {
      rejectStart = reject;
    });
    const runtime = mockRuntime({
      kind: "tauri",
      startPty: vi.fn(() => startPending),
    });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Configure Slot 1 session",
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/workspace",
    );
    await user.click(
      screen.getByRole("button", { name: "Start in Slot 1" }),
    );

    expect(screen.getByText("Starting")).toBeInTheDocument();
    expect(screen.getByLabelText("Slot 1 provider")).toBeDisabled();
    rejectStart?.(new Error("Provider could not start"));
    await waitFor(() => expect(screen.getByText("Error")).toBeInTheDocument());
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(screen.getAllByText("Provider could not start").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByRole("button", { name: "Retry Slot 1" })).toBeEnabled();
    expect(screen.getByLabelText("Slot 1 provider")).toBeEnabled();
  });

  it("keeps Refresh, other-slot Save, and external Launch independent while running", async () => {
    const runtime = mockRuntime({ kind: "tauri" });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Configure Slot 1 session",
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/workspace",
    );
    await user.click(
      screen.getByRole("button", { name: "Start in Slot 1" }),
    );
    expect(await screen.findByText("Running")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Running")).toBeInTheDocument();
    expect(runtime.startPtySession).toHaveBeenCalledTimes(1);

    await user.selectOptions(screen.getByLabelText("Slot 2 provider"), "hermes");
    await user.click(screen.getByRole("button", { name: "Save Layout" }));
    await waitFor(() =>
      expect(runtime.saveConsoleLayout).toHaveBeenCalledOnce(),
    );
    expect(screen.getByText("Running")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Launch Hermes CLI" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("stops cleanly, preserves the ended state, and resets on provider change", async () => {
    const runtime = mockRuntime({ kind: "tauri" });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Configure Slot 1 session",
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/workspace",
    );
    await user.click(
      screen.getByRole("button", { name: "Start in Slot 1" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Stop Slot 1" }),
    );

    expect(await screen.findByText("Stopped")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start again in Slot 1" }),
    ).toBeEnabled();
    expect(runtime.stopPtySession).toHaveBeenCalledWith({
      slotId: "slot-1",
      sessionId: "session-slot-1",
    });
    await user.selectOptions(screen.getByLabelText("Slot 1 provider"), "codex");
    expect(screen.getAllByText("Idle")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Configure Slot 1 session" }),
    ).toBeEnabled();
  });

  it("shows natural exit state and ignores stale exit events", async () => {
    const exitHandlers: Array<(event: PtyExitEvent) => void> = [];
    const runtime = mockRuntime({
      kind: "tauri",
      onPtyExit: async (handler) => {
        exitHandlers.push(handler);
        return () => {};
      },
    });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Configure Slot 1 session",
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/workspace",
    );
    await user.click(
      screen.getByRole("button", { name: "Start in Slot 1" }),
    );
    await screen.findByText("Running");

    act(() => {
      for (const handler of exitHandlers) handler({
        slotId: "slot-1",
        sessionId: "stale-session",
        exitCode: 1,
        reason: "exited",
      });
    });
    expect(screen.getByText("Running")).toBeInTheDocument();
    act(() => {
      for (const handler of exitHandlers) handler({
        slotId: "slot-1",
        sessionId: "session-slot-1",
        exitCode: 0,
        reason: "exited",
      });
    });
    expect(await screen.findByText("Exited (0)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start again in Slot 1" }),
    ).toBeEnabled();
  });

  it("disables retry when Refresh makes the ended Provider unavailable", async () => {
    const exitHandlers: Array<(event: PtyExitEvent) => void> = [];
    const runtime = mockRuntime({
      kind: "tauri",
      onPtyExit: async (handler) => {
        exitHandlers.push(handler);
        return () => {};
      },
    });
    runtime.fetchProviders = vi
      .fn()
      .mockResolvedValueOnce(providers)
      .mockResolvedValueOnce(
        providers.map((provider) =>
          provider.id === "hermes"
            ? {
                ...provider,
                installed: false,
                path: null,
                version: null,
                error: "Executable not found in PATH",
              }
            : provider,
        ),
      );
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Configure Slot 1 session",
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/workspace",
    );
    await user.click(
      screen.getByRole("button", { name: "Start in Slot 1" }),
    );
    await screen.findByText("Running");
    act(() => {
      for (const handler of exitHandlers) handler({
        slotId: "slot-1",
        sessionId: "session-slot-1",
        exitCode: 0,
        reason: "exited",
      });
    });
    expect(await screen.findByText("Exited (0)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start again in Slot 1" }),
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Start again in Slot 1" }),
      ).toBeDisabled(),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("requires Stop and Close and keeps the App open when cleanup fails", async () => {
    let closeHandler: (() => boolean) | undefined;
    const stopPty = vi
      .fn<NonNullable<RuntimeAdapter["stopPtySession"]>>()
      .mockRejectedValueOnce(new Error("PTY process tree could not be terminated"))
      .mockResolvedValueOnce(undefined);
    const closeWindow = vi.fn().mockResolvedValue(undefined);
    const runtime = mockRuntime({
      kind: "tauri",
      stopPty,
      closeWindow,
      onCloseRequested: async (handler) => {
        closeHandler = handler;
        return () => {};
      },
    });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Configure Slot 1 session",
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/workspace",
    );
    await user.click(
      screen.getByRole("button", { name: "Start in Slot 1" }),
    );
    await screen.findByText("Running");
    await waitFor(() => expect(closeHandler).toBeDefined());

    act(() => expect(closeHandler?.()).toBe(true));
    expect(
      screen.getByRole("heading", { name: "Slot 1 is running" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop and Close" }));
    await waitFor(() =>
      expect(
        screen
          .getAllByText("Slot 1 could not be stopped")
          .some((element) => element.classList.contains("modal-error")),
      ).toBe(true),
    );
    expect(closeWindow).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Stop and Close" }));
    await waitFor(() => expect(closeWindow).toHaveBeenCalledOnce());
  });

  it("runs the same Provider independently in Slot 1 and Slot 2", async () => {
    const startPty = vi.fn<
      NonNullable<RuntimeAdapter["startPtySession"]>
    >(async (request) => ({
      slotId: request.slotId,
      sessionId: `session-${request.slotId}`,
      providerId: request.providerId,
      workspacePath: request.workspacePath,
      sessionMode: request.sessionMode,
    }));
    const runtime = mockRuntime({ kind: "tauri", startPty });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    await user.selectOptions(
      await screen.findByLabelText("Slot 1 provider"),
      "codex",
    );
    await user.click(
      screen.getByRole("button", { name: "Configure Slot 1 session" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/workspace-one",
    );
    await user.click(
      screen.getByRole("button", { name: "Start in Slot 1" }),
    );

    await user.click(
      screen.getByRole("button", { name: "Configure Slot 2 session" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/workspace-two",
    );
    await user.click(
      screen.getByRole("button", { name: "Start in Slot 2" }),
    );

    await waitFor(() =>
      expect(screen.getAllByText("Running")).toHaveLength(2),
    );
    expect(startPty).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        slotId: "slot-1",
        providerId: "codex",
        workspacePath: "/workspace-one",
      }),
    );
    expect(startPty).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        slotId: "slot-2",
        providerId: "codex",
        workspacePath: "/workspace-two",
      }),
    );
    expect(runtime.saveWorkspacePreferences).toHaveBeenLastCalledWith(
      {
        codex: {
          defaultWorkspace: "",
          recentWorkspaces: ["/workspace-two", "/workspace-one"],
        },
      },
      "history",
    );
    expect(screen.getByLabelText("Slot 1 provider")).toBeDisabled();
    expect(screen.getByLabelText("Slot 2 provider")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Stop Slot 1" }));
    expect(await screen.findByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByLabelText("Slot 1 provider")).toBeEnabled();
    expect(screen.getByLabelText("Slot 2 provider")).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Slot 1 provider"), "hermes");
    expect(screen.getByText("Idle")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("stops every active Slot and blocks closing when one Slot fails", async () => {
    let closeHandler: (() => boolean) | undefined;
    let slotTwoAttempts = 0;
    const stopPty = vi.fn<NonNullable<RuntimeAdapter["stopPtySession"]>>(
      async (request) => {
        if (request.slotId === "slot-2" && slotTwoAttempts++ === 0) {
          throw new Error("Slot 2 cleanup failed");
        }
      },
    );
    const closeWindow = vi.fn().mockResolvedValue(undefined);
    const runtime = mockRuntime({
      kind: "tauri",
      stopPty,
      closeWindow,
      onCloseRequested: async (handler) => {
        closeHandler = handler;
        return () => {};
      },
    });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    for (const slotNumber of [1, 2]) {
      await user.click(
        await screen.findByRole("button", {
          name: `Configure Slot ${slotNumber} session`,
        }),
      );
      await user.type(
        screen.getByRole("textbox", { name: "Default workspace path" }),
        `/workspace-${slotNumber}`,
      );
      await user.click(
        screen.getByRole("button", {
          name: `Start in Slot ${slotNumber}`,
        }),
      );
    }
    await waitFor(() =>
      expect(screen.getAllByText("Running")).toHaveLength(2),
    );
    await waitFor(() => expect(closeHandler).toBeDefined());

    act(() => expect(closeHandler?.()).toBe(true));
    expect(
      screen.getByRole("heading", { name: "Slot 1, Slot 2 are running" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop and Close" }));
    expect(
      await screen.findByText("Slot 2 could not be stopped"),
    ).toBeInTheDocument();
    expect(closeWindow).not.toHaveBeenCalled();
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stop and Close" }));
    await waitFor(() => expect(closeWindow).toHaveBeenCalledOnce());
    expect(stopPty).toHaveBeenCalledWith({
      slotId: "slot-1",
      sessionId: "session-slot-1",
    });
    expect(stopPty).toHaveBeenCalledWith({
      slotId: "slot-2",
      sessionId: "session-slot-2",
    });
  });

  it("stops the active Slot before Command+R reloads the App", async () => {
    const reloadWindow = vi.fn().mockResolvedValue(undefined);
    const runtime = mockRuntime({ kind: "tauri", reloadWindow });
    const user = userEvent.setup();
    render(<App runtime={runtime} />);

    await user.click(
      await screen.findByRole("button", {
        name: "Configure Slot 2 session",
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Default workspace path" }),
      "/workspace-two",
    );
    await user.click(
      screen.getByRole("button", { name: "Start in Slot 2" }),
    );
    await screen.findByText("Running");

    fireEvent.keyDown(window, { key: "r", metaKey: true });
    expect(
      screen.getByRole("heading", { name: "Slot 2 is running" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop and Reload" }));

    await waitFor(() => expect(reloadWindow).toHaveBeenCalledOnce());
    expect(runtime.stopPtySession).toHaveBeenCalledWith({
      slotId: "slot-2",
      sessionId: "session-slot-2",
    });
  });
});
