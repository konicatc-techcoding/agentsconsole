import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import type { Provider } from "./types";

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
});
