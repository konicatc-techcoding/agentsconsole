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

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
    return {
      ok: true,
      json: async () => ({
        launched: true,
        provider_id: "codex",
        workspace_path: "/Users/zack/My Project",
      }),
    } as Response;
  });

  return { fetchMock, finishLaunch };
}

afterEach(() => {
  cleanup();
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

  it("selects an available provider only for the mounted session", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const user = userEvent.setup();
    const view = render(<App />);

    await user.click(
      await screen.findByRole("button", { name: /Codex CLI.*Available/s }),
    );
    expect(
      screen.getByText("Current selection: Codex CLI"),
    ).toBeInTheDocument();

    view.unmount();
    render(<App />);
    expect(await screen.findByText("No CLI selected")).toBeInTheDocument();
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

  it("launches a selected provider and remembers the successful workspace", async () => {
    const { fetchMock } = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    expect(
      screen.getByText("Current selection: Codex CLI"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Codex CLI" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "New session" })).toBeChecked();

    await user.type(
      screen.getByRole("textbox", { name: "Workspace absolute path" }),
      "/Users/zack/My Project",
    );
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(
      await screen.findByText(
        "Codex CLI launched in /Users/zack/My Project",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_id: "codex",
        workspace_path: "/Users/zack/My Project",
        session_mode: "new",
      }),
    });

    await user.click(screen.getByRole("button", { name: "Launch Claude CLI" }));
    expect(
      screen.getByRole("textbox", { name: "Workspace absolute path" }),
    ).toHaveValue("/Users/zack/My Project");
    expect(screen.getByRole("radio", { name: "New session" })).toBeChecked();
  });

  it("clears the successful workspace after a full remount", async () => {
    const { fetchMock } = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const view = render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Workspace absolute path" }),
      "/Users/zack/My Project",
    );
    await user.click(screen.getByRole("button", { name: "Start" }));
    await screen.findByText("Codex CLI launched in /Users/zack/My Project");

    view.unmount();
    render(<App />);
    expect(await screen.findByText("No CLI selected")).toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Workspace absolute path" }),
    ).toHaveValue("");
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
      screen.getByRole("textbox", { name: "Workspace absolute path" }),
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
      screen.getByRole("textbox", { name: "Workspace absolute path" }),
      "/Users/zack/My Project",
    );
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByRole("button", { name: "Starting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "Workspace absolute path" }),
    ).toBeDisabled();

    finishLaunch?.();
    expect(
      await screen.findByText(
        "Codex CLI launched in /Users/zack/My Project",
      ),
    ).toBeInTheDocument();
  });

  it("sends continue mode but resets the next modal to new session", async () => {
    const { fetchMock } = mockApi();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: "Launch Codex CLI" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Workspace absolute path" }),
      "/Users/zack/My Project",
    );
    await user.click(
      screen.getByRole("radio", { name: "Continue last session" }),
    );
    await user.click(screen.getByRole("button", { name: "Start" }));

    await screen.findByText("Codex CLI launched in /Users/zack/My Project");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/launch",
      expect.objectContaining({
        body: JSON.stringify({
          provider_id: "codex",
          workspace_path: "/Users/zack/My Project",
          session_mode: "continue",
        }),
      }),
    );

    await user.click(screen.getByRole("button", { name: "Launch Codex CLI" }));
    expect(screen.getByRole("radio", { name: "New session" })).toBeChecked();
  });
});
