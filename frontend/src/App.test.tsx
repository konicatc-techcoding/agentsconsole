import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { defaultConsoleLayout } from "./runtime/consoleLayout";
import type { RuntimeAdapter } from "./runtime/types";
import type {
  ConsoleLayout,
  Provider,
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
      4,
    );
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
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(
      await screen.findByText("Codex CLI launched in /workspace"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Embedded terminal coming next")).toHaveLength(4);
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(screen.queryByText("Launched")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Slot 2 provider")).toHaveValue("codex");
  });
});
