import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeAdapter } from "./runtime/types";
import TerminalSlot from "./TerminalSlot";
import type { Provider, PtyExitEvent, PtyOutputEvent, PtySession } from "./types";

const xterm = vi.hoisted(() => {
  class FakeTerminal {
    static instances: FakeTerminal[] = [];
    rows = 24;
    cols = 80;
    options: Record<string, unknown>;
    writes: Uint8Array[] = [];
    resets = 0;
    focused = 0;
    selection = "";
    dataHandler: ((value: string) => void) | null = null;
    keyHandler: ((event: KeyboardEvent) => boolean) | null = null;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      FakeTerminal.instances.push(this);
    }

    loadAddon() {}
    open() {}
    onData(handler: (value: string) => void) {
      this.dataHandler = handler;
      return { dispose() {} };
    }
    attachCustomKeyEventHandler(
      handler: (event: KeyboardEvent) => boolean,
    ) {
      this.keyHandler = handler;
    }
    hasSelection() {
      return this.selection.length > 0;
    }
    getSelection() {
      return this.selection;
    }
    write(data: Uint8Array) {
      this.writes.push(data);
    }
    reset() {
      this.resets += 1;
    }
    focus() {
      this.focused += 1;
    }
    dispose() {}
  }
  return { FakeTerminal };
});

vi.mock("@xterm/xterm", () => ({
  Terminal: xterm.FakeTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

const provider: Provider = {
  id: "codex",
  display_name: "Codex CLI",
  command: "codex",
  installed: true,
  path: "/tools/codex",
  version: "codex-cli",
  error: null,
};

const session: PtySession = {
  slotId: "slot-1",
  sessionId: "session-1",
  providerId: "codex",
  workspacePath: "/workspace",
  sessionMode: "new",
};

function terminalRuntime() {
  let outputHandler: ((event: PtyOutputEvent) => void) | undefined;
  let exitHandler: ((event: PtyExitEvent) => void) | undefined;
  const runtime: RuntimeAdapter = {
    kind: "tauri",
    fetchProviders: vi.fn(),
    launchProvider: vi.fn(),
    validateWorkspace: vi.fn(),
    loadWorkspacePreferences: vi.fn(),
    saveWorkspacePreferences: vi.fn(),
    writePtyInput: vi.fn().mockResolvedValue(undefined),
    resizePty: vi.fn().mockResolvedValue(undefined),
    onPtyOutput: vi.fn(async (handler) => {
      outputHandler = handler;
      return () => {};
    }),
    onPtyExit: vi.fn(async (handler) => {
      exitHandler = handler;
      return () => {};
    }),
  };
  return {
    runtime,
    emitOutput: (event: PtyOutputEvent) => outputHandler?.(event),
    emitExit: (event: PtyExitEvent) => exitHandler?.(event),
  };
}

function renderTerminal(
  runtime: RuntimeAdapter,
  overrides: Partial<React.ComponentProps<typeof TerminalSlot>> = {},
) {
  const props: React.ComponentProps<typeof TerminalSlot> = {
    provider,
    phase: "running",
    session,
    exitEvent: null,
    error: null,
    resetToken: 0,
    startDisabled: false,
    runtime,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onExit: vi.fn(),
    onSize: vi.fn(),
    ...overrides,
  };
  return { ...render(<TerminalSlot {...props} />), props };
}

afterEach(() => {
  cleanup();
  xterm.FakeTerminal.instances.length = 0;
});

describe("TerminalSlot", () => {
  it("uses 5,000-line scrollback and forwards raw terminal input bytes", async () => {
    const { runtime, emitOutput } = terminalRuntime();
    renderTerminal(runtime);
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const terminal = xterm.FakeTerminal.instances[0];

    expect(terminal.options.scrollback).toBe(5000);
    act(() =>
      emitOutput({
        slotId: "slot-1",
        sessionId: "session-1",
        data: [0xf0, 0x9f, 0x92, 0xa9, 0x1b, 0x5b, 0x41],
      }),
    );
    act(() => terminal.dataHandler?.("a\r\u001b[A\u0003"));

    expect(Array.from(terminal.writes[0])).toEqual([
      0xf0, 0x9f, 0x92, 0xa9, 0x1b, 0x5b, 0x41,
    ]);
    expect(runtime.writePtyInput).toHaveBeenCalledWith({
      slotId: "slot-1",
      sessionId: "session-1",
      data: [97, 13, 27, 91, 65, 3],
    });
  });

  it("copies selected text and pastes clipboard text into the active PTY", async () => {
    const { runtime } = terminalRuntime();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue("pasted");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, readText },
    });
    renderTerminal(runtime);
    const terminal = xterm.FakeTerminal.instances[0];
    terminal.selection = "selected";

    expect(
      terminal.keyHandler?.({
        type: "keydown",
        key: "c",
        metaKey: true,
      } as KeyboardEvent),
    ).toBe(false);
    expect(writeText).toHaveBeenCalledWith("selected");
    expect(
      terminal.keyHandler?.({
        type: "keydown",
        key: "v",
        metaKey: true,
      } as KeyboardEvent),
    ).toBe(false);

    await waitFor(() =>
      expect(runtime.writePtyInput).toHaveBeenCalledWith({
        slotId: "slot-1",
        sessionId: "session-1",
        data: [112, 97, 115, 116, 101, 100],
      }),
    );
  });

  it("fits to a nonzero size, resizes the PTY, and buffers output during Start", async () => {
    const { runtime, emitOutput } = terminalRuntime();
    const view = renderTerminal(runtime, {
      phase: "starting",
      session: null,
    });
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const terminal = xterm.FakeTerminal.instances[0];

    act(() =>
      emitOutput({
        slotId: "slot-1",
        sessionId: "session-1",
        data: [65, 66],
      }),
    );
    expect(terminal.writes).toHaveLength(0);

    view.rerender(<TerminalSlot {...view.props} phase="running" session={session} />);
    expect(terminal.resets).toBeGreaterThan(0);
    expect(Array.from(terminal.writes[0])).toEqual([65, 66]);
    expect(terminal.focused).toBeGreaterThan(0);
    expect(view.props.onSize).toHaveBeenCalledWith(24, 80);
    expect(runtime.resizePty).toHaveBeenCalledWith({
      slotId: "slot-1",
      sessionId: "session-1",
      rows: 24,
      columns: 80,
    });
  });

  it("reports exit events and exposes retry controls for ended sessions", async () => {
    const { runtime, emitExit } = terminalRuntime();
    const onExit = vi.fn();
    renderTerminal(runtime, {
      phase: "exited",
      exitEvent: {
        slotId: "slot-1",
        sessionId: "session-1",
        exitCode: 2,
        reason: "exited",
      },
      onExit,
    });
    await waitFor(() => expect(runtime.onPtyExit).toHaveBeenCalledOnce());

    expect(screen.getByText("Exited (2)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start again" })).toBeEnabled();
    act(() =>
      emitExit({
        slotId: "slot-1",
        sessionId: "session-1",
        exitCode: 2,
        reason: "exited",
      }),
    );
    expect(onExit).toHaveBeenCalledOnce();
  });
});
