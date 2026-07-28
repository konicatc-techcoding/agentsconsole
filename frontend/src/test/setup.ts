import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

vi.mock("@xterm/addon-search", () => ({
  SearchAddon: class {
    findNext() {
      return true;
    }
    findPrevious() {
      return true;
    }
    clearDecorations() {}
    dispose() {}
  },
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {
    dispose() {}
  },
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    static instances: Array<{ options: Record<string, unknown> }> = [];
    rows = 24;
    cols = 80;
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown> = {}) {
      this.options = { ...options };
      (this.constructor as unknown as {
        instances: Array<{ options: Record<string, unknown> }>;
      }).instances.push(this);
    }

    loadAddon() {}
    open() {}
    onData() {
      return { dispose() {} };
    }
    attachCustomKeyEventHandler() {}
    hasSelection() {
      return false;
    }
    getSelection() {
      return "";
    }
    write() {}
    reset() {}
    focus() {}
    dispose() {}
  },
}));
