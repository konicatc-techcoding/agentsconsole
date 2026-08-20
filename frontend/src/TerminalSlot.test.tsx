import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IBufferRange, ILinkHandler } from "@xterm/xterm";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeAdapter } from "./runtime/types";
import TerminalSlot, {
  DEFAULT_FONT_SIZE,
  LINK_URL_REGEX,
  SEARCH_DECORATIONS,
  createTerminalOptions,
  isOpenableUrl,
} from "./TerminalSlot";
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

  class FakeSearchAddon {
    static instances: FakeSearchAddon[] = [];
    nextTerms: string[] = [];
    previousTerms: string[] = [];
    clears = 0;

    constructor() {
      FakeSearchAddon.instances.push(this);
    }

    findNext(term: string) {
      this.nextTerms.push(term);
      return term !== "nothing-here";
    }

    findPrevious(term: string) {
      this.previousTerms.push(term);
      return term !== "nothing-here";
    }

    clearDecorations() {
      this.clears += 1;
    }

    dispose() {}
  }
  class FakeWebLinksAddon {
    static instances: FakeWebLinksAddon[] = [];
    handler: ((event: MouseEvent, uri: string) => void) | undefined;
    options: { urlRegex?: RegExp } | undefined;

    constructor(
      handler?: (event: MouseEvent, uri: string) => void,
      options?: { urlRegex?: RegExp },
    ) {
      this.handler = handler;
      this.options = options;
      FakeWebLinksAddon.instances.push(this);
    }

    dispose() {}
  }

  return { FakeTerminal, FakeSearchAddon, FakeWebLinksAddon };
});

vi.mock("@xterm/xterm", () => ({
  Terminal: xterm.FakeTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

vi.mock("@xterm/addon-search", () => ({
  SearchAddon: xterm.FakeSearchAddon,
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: xterm.FakeWebLinksAddon,
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
    openExternalUrl: vi.fn().mockResolvedValue(undefined),
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
    slotId: "slot-1",
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
  xterm.FakeSearchAddon.instances.length = 0;
  xterm.FakeWebLinksAddon.instances.length = 0;
});

describe("TerminalSlot", () => {
  it("exposes the session name without remounting the terminal", () => {
    const { runtime } = terminalRuntime();
    const view = renderTerminal(runtime, { displayName: "Research lead" });

    expect(
      screen.getByLabelText("Slot 1 · Research lead terminal"),
    ).toBeInTheDocument();
    view.rerender(
      <TerminalSlot {...view.props} displayName="Review lead" />,
    );
    expect(
      screen.getByLabelText("Slot 1 · Review lead terminal"),
    ).toBeInTheDocument();
    expect(xterm.FakeTerminal.instances).toHaveLength(1);
  });

  it("routes input, output, and exit events only for its assigned slot", async () => {
    const { runtime, emitOutput, emitExit } = terminalRuntime();
    const onExit = vi.fn();
    renderTerminal(runtime, {
      slotId: "slot-4",
      session: { ...session, slotId: "slot-4" },
      onExit,
    });
    const terminal = xterm.FakeTerminal.instances[0];

    act(() => terminal.dataHandler?.("slot-four"));
    expect(runtime.writePtyInput).toHaveBeenCalledWith({
      slotId: "slot-4",
      sessionId: session.sessionId,
      data: Array.from(new TextEncoder().encode("slot-four")),
    });

    act(() => {
      emitOutput({
        slotId: "slot-1",
        sessionId: session.sessionId,
        data: [49],
      });
      emitOutput({
        slotId: "slot-4",
        sessionId: session.sessionId,
        data: [50],
      });
      emitExit({
        slotId: "slot-1",
        sessionId: session.sessionId,
        exitCode: 0,
        reason: "exited",
      });
      emitExit({
        slotId: "slot-4",
        sessionId: session.sessionId,
        exitCode: 0,
        reason: "exited",
      });
    });

    expect(terminal.writes.map((value) => Array.from(value))).toEqual([[50]]);
    expect(onExit).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledWith(
      expect.objectContaining({ slotId: "slot-4" }),
    );
  });

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

  it("stays mounted while hidden and refits with buffered output when shown", async () => {
    const { runtime, emitOutput } = terminalRuntime();
    const view = renderTerminal(runtime, { visible: true });
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const terminal = xterm.FakeTerminal.instances[0];

    view.rerender(<TerminalSlot {...view.props} visible={false} />);
    act(() =>
      emitOutput({
        slotId: "slot-1",
        sessionId: "session-1",
        data: [72, 73, 68, 68, 69, 78],
      }),
    );
    expect(xterm.FakeTerminal.instances).toHaveLength(1);
    expect(Array.from(terminal.writes.at(-1)!)).toEqual([
      72, 73, 68, 68, 69, 78,
    ]);
    const sizeReportsWhileHidden = vi.mocked(view.props.onSize).mock.calls.length;

    view.rerender(<TerminalSlot {...view.props} visible />);
    expect(xterm.FakeTerminal.instances).toHaveLength(1);
    expect(vi.mocked(view.props.onSize).mock.calls.length).toBeGreaterThan(
      sizeReportsWhileHidden,
    );
    expect(runtime.resizePty).toHaveBeenLastCalledWith({
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
    expect(
      screen.getByRole("button", { name: "Start again in Slot 1" }),
    ).toBeEnabled();
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

  it("names the conversation a Continue resumed, and shows nothing when it did not", async () => {
    const { runtime } = terminalRuntime();
    const view = renderTerminal(runtime, {
      session: {
        ...session,
        providerId: "claude",
        sessionMode: "continue",
        resumedSessionId: "3f2c1c05-77c3-4a5e-ace1-b5d3abfb0625",
      },
    });
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());

    const resumed = screen.getByText("↩ 3f2c1c05");
    expect(resumed).toHaveAttribute(
      "title",
      "Resumed conversation 3f2c1c05-77c3-4a5e-ace1-b5d3abfb0625",
    );

    // A Continue that fell back to the CLI's own choice has nothing specific
    // to name, so the Slot stays quiet rather than showing a blank badge.
    view.rerender(
      <TerminalSlot
        {...view.props}
        session={{ ...session, sessionMode: "continue" }}
      />,
    );
    expect(screen.queryByText(/↩/)).not.toBeInTheDocument();
    expect(screen.getByText("Continue")).toBeInTheDocument();
  });

  it("searches its own scrollback without resizing the terminal", async () => {
    const { runtime } = terminalRuntime();
    const view = renderTerminal(runtime);
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const terminal = xterm.FakeTerminal.instances[0];
    const search = xterm.FakeSearchAddon.instances[0];
    const sizeReports = vi.mocked(view.props.onSize).mock.calls.length;
    const resizeCalls = vi.mocked(runtime.resizePty!).mock.calls.length;

    expect(
      screen.queryByRole("textbox", { name: "Search Slot 1 output" }),
    ).not.toBeInTheDocument();
    let handled: boolean | undefined;
    act(() => {
      handled = terminal.keyHandler?.({
        type: "keydown",
        metaKey: true,
        key: "f",
      } as KeyboardEvent);
    });
    expect(handled).toBe(false);

    const input = screen.getByRole("textbox", { name: "Search Slot 1 output" });
    expect(input).toHaveFocus();
    expect(vi.mocked(view.props.onSize).mock.calls.length).toBe(sizeReports);
    expect(vi.mocked(runtime.resizePty!).mock.calls.length).toBe(resizeCalls);

    fireEvent.change(input, { target: { value: "boot" } });
    expect(search.nextTerms).toEqual(["boot"]);
    expect(input).not.toHaveClass("terminal-search-missing");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(search.nextTerms).toEqual(["boot", "boot"]);
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(search.previousTerms).toEqual(["boot"]);

    await userEvent.click(
      screen.getByRole("button", { name: "Previous match in Slot 1" }),
    );
    expect(search.previousTerms).toEqual(["boot", "boot"]);
    await userEvent.click(
      screen.getByRole("button", { name: "Next match in Slot 1" }),
    );
    expect(search.nextTerms).toEqual(["boot", "boot", "boot"]);

    fireEvent.change(input, { target: { value: "nothing-here" } });
    expect(input).toHaveClass("terminal-search-missing");

    const focusedBefore = terminal.focused;
    fireEvent.keyDown(input, { key: "Escape" });
    expect(
      screen.queryByRole("textbox", { name: "Search Slot 1 output" }),
    ).not.toBeInTheDocument();
    expect(search.clears).toBeGreaterThan(0);
    expect(terminal.focused).toBeGreaterThan(focusedBefore);
    expect(vi.mocked(view.props.onSize).mock.calls.length).toBe(sizeReports);
    expect(vi.mocked(runtime.resizePty!).mock.calls.length).toBe(resizeCalls);
  });

  it("linkifies http and https only, and gates the opener on the scheme", () => {
    expect(LINK_URL_REGEX.test("https://github.com/konicatc/agentsconsole")).toBe(
      true,
    );
    expect(LINK_URL_REGEX.test("http://127.0.0.1:5173")).toBe(true);
    expect(LINK_URL_REGEX.test("file:///etc/hosts")).toBe(false);
    expect(LINK_URL_REGEX.test("ssh://git@github.com/konicatc/repo")).toBe(false);
    expect(LINK_URL_REGEX.test("example.com")).toBe(false);

    expect(isOpenableUrl("https://example.com/a")).toBe(true);
    expect(isOpenableUrl("http://example.com/a")).toBe(true);
    expect(isOpenableUrl("file:///etc/hosts")).toBe(false);
    expect(isOpenableUrl("example.com")).toBe(false);
  });

  it("opens a link only on Command+Click and only for http or https", async () => {
    const { runtime } = terminalRuntime();
    renderTerminal(runtime);
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const links = xterm.FakeWebLinksAddon.instances[0];
    const handleLink = links.handler!;

    expect(links.options?.urlRegex).toBe(LINK_URL_REGEX);

    handleLink({ metaKey: false } as MouseEvent, "https://example.com/a");
    expect(runtime.openExternalUrl).not.toHaveBeenCalled();

    handleLink({ metaKey: true } as MouseEvent, "https://example.com/a");
    expect(runtime.openExternalUrl).toHaveBeenCalledOnce();
    expect(runtime.openExternalUrl).toHaveBeenCalledWith(
      "https://example.com/a",
    );

    handleLink({ metaKey: true } as MouseEvent, "file:///etc/hosts");
    handleLink({ metaKey: true } as MouseEvent, "ssh://git@example.com/repo");
    expect(runtime.openExternalUrl).toHaveBeenCalledOnce();
  });

  it("opens an OSC 8 link only on Command+Click and only for http or https", async () => {
    const { runtime } = terminalRuntime();
    renderTerminal(runtime);
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const terminal = xterm.FakeTerminal.instances[0];
    const linkHandler = terminal.options.linkHandler as ILinkHandler;
    const range = {} as IBufferRange;

    expect(linkHandler.allowNonHttpProtocols).toBe(false);

    linkHandler.activate(
      { metaKey: false } as MouseEvent,
      "https://example.com/a",
      range,
    );
    expect(runtime.openExternalUrl).not.toHaveBeenCalled();

    linkHandler.activate(
      { metaKey: true } as MouseEvent,
      "https://example.com/a",
      range,
    );
    expect(runtime.openExternalUrl).toHaveBeenCalledOnce();
    expect(runtime.openExternalUrl).toHaveBeenCalledWith(
      "https://example.com/a",
    );

    linkHandler.activate(
      { metaKey: true } as MouseEvent,
      "javascript:alert(1)",
      range,
    );
    linkHandler.activate(
      { metaKey: true } as MouseEvent,
      "file:///etc/hosts",
      range,
    );
    expect(runtime.openExternalUrl).toHaveBeenCalledOnce();
  });

  it("keeps working when an OSC 8 link fails to open", async () => {
    const { runtime } = terminalRuntime();
    vi.mocked(runtime.openExternalUrl!).mockRejectedValue(
      new Error("Link could not be opened"),
    );
    renderTerminal(runtime);
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const linkHandler = xterm.FakeTerminal.instances[0].options
      .linkHandler as ILinkHandler;

    expect(() =>
      linkHandler.activate(
        { metaKey: true } as MouseEvent,
        "https://example.com/a",
        {} as IBufferRange,
      ),
    ).not.toThrow();
    await Promise.resolve();

    expect(runtime.openExternalUrl).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Slot 1 terminal")).toBeInTheDocument();
  });

  it("keeps working when the opener rejects", async () => {
    const { runtime } = terminalRuntime();
    vi.mocked(runtime.openExternalUrl!).mockRejectedValue(
      new Error("Link could not be opened"),
    );
    renderTerminal(runtime);
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const handleLink = xterm.FakeWebLinksAddon.instances[0].handler!;

    expect(() =>
      handleLink({ metaKey: true } as MouseEvent, "https://example.com/a"),
    ).not.toThrow();
    await Promise.resolve();

    expect(runtime.openExternalUrl).toHaveBeenCalledOnce();
    expect(
      screen.getByLabelText("Slot 1 terminal"),
    ).toBeInTheDocument();
  });

  it("keeps the active match apart from plain matches and from selection", () => {
    const { decorations } = SEARCH_DECORATIONS;
    const { theme } = createTerminalOptions(DEFAULT_FONT_SIZE);

    expect(decorations.activeMatchBackground).toBe("#6b4f00");
    expect(decorations.activeMatchBorder).toBe("#ffd54a");
    expect(decorations.activeMatchColorOverviewRuler).toBe("#ffd54a");
    expect(decorations.matchOverviewRuler).toBe(decorations.matchBackground);
    expect(decorations.matchBackground).not.toBe(theme?.selectionBackground);
    expect(decorations.matchBackground).not.toBe(
      decorations.activeMatchBackground,
    );
  });

  it("takes focus back into an already-open search bar and closes on Escape", async () => {
    const { runtime } = terminalRuntime();
    renderTerminal(runtime);
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const terminal = xterm.FakeTerminal.instances[0];

    act(() => {
      terminal.keyHandler?.({
        type: "keydown",
        metaKey: true,
        key: "f",
      } as KeyboardEvent);
    });
    const input = screen.getByRole("textbox", {
      name: "Search Slot 1 output",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "boot" } });
    act(() => input.blur());
    expect(input).not.toHaveFocus();

    let handled: boolean | undefined;
    act(() => {
      handled = terminal.keyHandler?.({
        type: "keydown",
        metaKey: true,
        key: "f",
      } as KeyboardEvent);
    });

    expect(handled).toBe(false);
    expect(input).toHaveFocus();
    expect(input).toHaveValue("boot");
    expect(input.selectionStart).toBe(input.selectionEnd);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(
      screen.queryByRole("textbox", { name: "Search Slot 1 output" }),
    ).not.toBeInTheDocument();
  });

  it("waits for the input method to commit before searching", async () => {
    const { runtime } = terminalRuntime();
    renderTerminal(runtime);
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const terminal = xterm.FakeTerminal.instances[0];
    const search = xterm.FakeSearchAddon.instances[0];

    act(() => {
      terminal.keyHandler?.({
        type: "keydown",
        metaKey: true,
        key: "f",
      } as KeyboardEvent);
    });
    const input = screen.getByRole("textbox", { name: "Search Slot 1 output" });

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ㄕ" } });
    fireEvent.change(input, { target: { value: "失敗" } });
    expect(search.nextTerms).toEqual([]);
    expect(input).toHaveValue("失敗");

    fireEvent.compositionEnd(input, { data: "失敗" });
    expect(search.nextTerms).toEqual(["失敗"]);

    fireEvent.change(input, { target: { value: "失敗率" } });
    expect(search.nextTerms).toEqual(["失敗", "失敗率"]);
  });

  it("keeps the search bar available for an ended session", async () => {
    const { runtime } = terminalRuntime();
    renderTerminal(runtime, { phase: "exited", session: null });
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const terminal = xterm.FakeTerminal.instances[0];

    act(() => {
      terminal.keyHandler?.({
        type: "keydown",
        metaKey: true,
        key: "f",
      } as KeyboardEvent);
    });

    expect(
      screen.getByRole("textbox", { name: "Search Slot 1 output" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Close search in Slot 1" }),
    );
    expect(
      screen.queryByRole("textbox", { name: "Search Slot 1 output" }),
    ).not.toBeInTheDocument();
  });

  it("applies a new font size in place and refits the live session", async () => {
    const { runtime } = terminalRuntime();
    const view = renderTerminal(runtime, { fontSize: 12 });
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const terminal = xterm.FakeTerminal.instances[0];
    expect(terminal.options.fontSize).toBe(12);
    const sizeReports = vi.mocked(view.props.onSize).mock.calls.length;
    const resetsBeforeChange = terminal.resets;

    view.rerender(<TerminalSlot {...view.props} fontSize={17} />);

    expect(xterm.FakeTerminal.instances).toHaveLength(1);
    expect(terminal.options.fontSize).toBe(17);
    expect(terminal.resets).toBe(resetsBeforeChange);
    expect(vi.mocked(view.props.onSize).mock.calls.length).toBeGreaterThan(
      sizeReports,
    );
    expect(runtime.resizePty).toHaveBeenLastCalledWith({
      slotId: "slot-1",
      sessionId: "session-1",
      rows: 24,
      columns: 80,
    });
  });

  it("reports rendered output and terminal focus changes to its owner", async () => {
    const { runtime, emitOutput } = terminalRuntime();
    const onOutput = vi.fn();
    const onFocusChange = vi.fn();
    renderTerminal(runtime, { onOutput, onFocusChange });
    await waitFor(() => expect(runtime.onPtyOutput).toHaveBeenCalledOnce());
    const viewport = screen.getByLabelText("Slot 1 terminal");

    act(() => {
      emitOutput({ slotId: "slot-2", sessionId: "session-1", data: [65] });
      emitOutput({ slotId: "slot-1", sessionId: "stale-session", data: [66] });
    });
    expect(onOutput).not.toHaveBeenCalled();

    act(() =>
      emitOutput({ slotId: "slot-1", sessionId: "session-1", data: [67] }),
    );
    expect(onOutput).toHaveBeenCalledOnce();

    fireEvent.focusIn(viewport);
    expect(onFocusChange).toHaveBeenLastCalledWith(true);
    fireEvent.focusOut(viewport);
    expect(onFocusChange).toHaveBeenLastCalledWith(false);
    expect(onFocusChange).toHaveBeenCalledTimes(2);
  });

  it("takes focus when the owner bumps the token, but never on mount", () => {
    const { runtime } = terminalRuntime();
    const view = renderTerminal(runtime, { focusToken: 0 });
    const terminal = xterm.FakeTerminal.instances[0];
    const focusedOnMount = terminal.focused;

    view.rerender(<TerminalSlot {...view.props} focusToken={0} />);
    expect(terminal.focused).toBe(focusedOnMount);

    view.rerender(<TerminalSlot {...view.props} focusToken={1} />);
    expect(terminal.focused).toBe(focusedOnMount + 1);
    view.rerender(<TerminalSlot {...view.props} focusToken={2} />);
    expect(terminal.focused).toBe(focusedOnMount + 2);
  });

  it("keeps the Console's Cmd+digit shortcuts out of the terminal", async () => {
    const { runtime } = terminalRuntime();
    renderTerminal(runtime);
    const terminal = xterm.FakeTerminal.instances[0];

    for (const key of ["0", "1", "2", "3", "4"]) {
      expect(
        terminal.keyHandler?.({
          type: "keydown",
          key,
          metaKey: true,
        } as KeyboardEvent),
      ).toBe(false);
    }
    // Cmd+5 is not a Console shortcut, so xterm keeps handling it.
    expect(
      terminal.keyHandler?.({
        type: "keydown",
        key: "5",
        metaKey: true,
      } as KeyboardEvent),
    ).toBe(true);
    expect(runtime.writePtyInput).not.toHaveBeenCalled();
  });
});
