import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_FONT_SIZE,
  SEARCH_DECORATIONS,
  createTerminalOptions,
} from "./TerminalSlot";

// The global setup mocks @xterm/xterm and @xterm/addon-search so the component
// tests can run in jsdom. That mock also hides real API guards: a SearchAddon
// whose findNext always returns true cannot fail on a missing
// `allowProposedApi`. This suite bypasses the mock with importActual and drives
// the real modules with the same options the component uses.
//
// `terminal.open()` is never called — jsdom has no canvas and no matchMedia.
// Without open() there is no selection service, so findNext gets as far as
// decorating every match and then throws a TypeError on `setSelection`. That
// is expected and irrelevant here: the decoration stage runs first, which is
// exactly the stage the proposed-API guard rejects. The test asserts on which
// error comes back, not on the absence of one.
describe("SearchAddon against the real xterm modules", () => {
  it("gets past the proposed-API guard with the component's terminal options", async () => {
    const { Terminal } = await vi.importActual<typeof import("@xterm/xterm")>(
      "@xterm/xterm",
    );
    const { SearchAddon } = await vi.importActual<
      typeof import("@xterm/addon-search")
    >("@xterm/addon-search");

    const terminal = new Terminal(createTerminalOptions(DEFAULT_FONT_SIZE));
    const search = new SearchAddon();
    terminal.loadAddon(search);
    await new Promise<void>((resolve) => {
      terminal.write("boot sequence complete\r\n", resolve);
    });
    const registerDecoration = vi.spyOn(terminal, "registerDecoration");

    let thrown: unknown;
    try {
      search.findNext("sequence", SEARCH_DECORATIONS);
    } catch (error) {
      thrown = error;
    }

    // Proves the decoration path really ran, so the assertion below is not
    // passing by simply never reaching the guard.
    expect(registerDecoration).toHaveBeenCalled();
    expect(String(thrown ?? "")).not.toMatch(/proposed api/i);

    search.dispose();
    terminal.dispose();
  });
});
