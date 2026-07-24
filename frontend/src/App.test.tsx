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

function mockApi(options?: { launchError?: string; launchDelay?: boolean }) {
  let finishLaunch: (() => void) | undefined;
  const launchGate = options?.launchDelay
    ? new Promise<void>((resolve) => {
        finishLaunch = resolve;
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

  return { fetchMock, finishLaunch };
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

  it("creates a new folder and keeps preferences isolated by provider", async () => {
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
      screen.getByRole("textbox", {
        name: "Default workspace absolute path",
      }),
      "/Users/zack/Projects",
    );
    await user.type(
      screen.getByRole("textbox", { name: "New folder (optional)" }),
      "My Project",
    );
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(
      await screen.findByText(
        "Codex CLI launched in /Users/zack/Projects/My Project",
      ),
    ).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Launch Claude CLI" }));
    expect(
      screen.getByRole("textbox", {
        name: "Default workspace absolute path",
      }),
    ).toHaveValue("");
    expect(screen.getByRole("radio", { name: "New session" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Launch Codex CLI" }));
    expect(
      screen.getByRole("textbox", {
        name: "Default workspace absolute path",
      }),
    ).toHaveValue("/Users/zack/Projects");
  });

  it("persists a provider default workspace after a full remount", async () => {
    const { fetchMock } = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const view = render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Default workspace absolute path",
      }),
      "/Users/zack/My Project",
    );
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByText("Codex CLI launched in /Users/zack/My Project");

    view.unmount();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    expect(
      screen.getByRole("textbox", {
        name: "Default workspace absolute path",
      }),
    ).toHaveValue("/Users/zack/My Project");
  });

  it("falls back to the provider default when continue has no last path", async () => {
    localStorage.setItem(
      "agentos-console.workspace-preferences.v1",
      JSON.stringify({
        codex: {
          defaultWorkspace: "/Users/zack/Default",
          lastStartedWorkspace: "",
        },
      }),
    );
    vi.stubGlobal("fetch", mockFetch());
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.click(
      screen.getByRole("radio", { name: "Continue last session" }),
    );

    expect(
      screen.getByRole("textbox", { name: "Workspace absolute path" }),
    ).toHaveValue("/Users/zack/Default");
  });

  it("keeps the launch modal open when the API rejects a workspace", async () => {
    const { fetchMock } = mockApi({
      launchError: "Workspace does not exist",
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Default workspace absolute path",
      }),
      "/missing",
    );
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("Workspace does not exist")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(
      screen.getByRole("heading", { name: "Codex CLI" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
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
      screen.getByRole("textbox", {
        name: "Default workspace absolute path",
      }),
      "/Users/zack/My Project",
    );
    await user.type(
      screen.getByRole("textbox", { name: "New folder (optional)" }),
      "project",
    );
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByRole("button", { name: "Starting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(
      screen.getByRole("textbox", {
        name: "Default workspace absolute path",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "New folder (optional)" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("radio", { name: "Continue last session" }),
    ).toBeDisabled();

    finishLaunch?.();
    expect(
      await screen.findByText(
        "Codex CLI launched in /Users/zack/My Project/project",
      ),
    ).toBeInTheDocument();
  });

  it("prefills continue with the provider last-started workspace", async () => {
    const { fetchMock } = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Default workspace absolute path",
      }),
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

    await user.click(screen.getByRole("button", { name: "Launch Codex CLI" }));
    await user.click(
      screen.getByRole("radio", { name: "Continue last session" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Workspace absolute path" }),
    ).toHaveValue("/Users/zack/Projects/My Project");
    expect(
      screen.queryByRole("textbox", { name: "New folder (optional)" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start" }));

    await screen.findByText(
      "Codex CLI launched in /Users/zack/Projects/My Project",
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/launch",
      expect.objectContaining({
        body: JSON.stringify({
          provider_id: "codex",
          workspace_path: "/Users/zack/Projects/My Project",
          session_mode: "continue",
        }),
      }),
    );

    await user.click(screen.getByRole("button", { name: "Launch Codex CLI" }));
    expect(screen.getByRole("radio", { name: "New session" })).toBeChecked();
    expect(
      screen.getByRole("textbox", {
        name: "Default workspace absolute path",
      }),
    ).toHaveValue("/Users/zack/Projects");
  });
});
