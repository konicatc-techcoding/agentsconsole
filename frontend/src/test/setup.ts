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
    // Real xterm renders a helper textarea into the parent and `focus()` moves
    // keyboard focus onto it; the Console tracks which Slot holds focus by
    // listening for the focusin that produces. The fake has to do the same, or
    // every focus assertion would only be testing the fake.
    textarea: HTMLTextAreaElement | null = null;

    constructor(options: Record<string, unknown> = {}) {
      this.options = { ...options };
      (this.constructor as unknown as {
        instances: Array<{ options: Record<string, unknown> }>;
      }).instances.push(this);
    }

    loadAddon() {}
    open(parent: HTMLElement) {
      const textarea = parent.ownerDocument.createElement("textarea");
      textarea.className = "xterm-helper-textarea";
      parent.appendChild(textarea);
      this.textarea = textarea;
    }
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
    focus() {
      this.textarea?.focus();
    }
    dispose() {
      this.textarea?.remove();
      this.textarea = null;
    }
  },
}));
