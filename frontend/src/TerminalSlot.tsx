import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Terminal } from "@xterm/xterm";
import type { ITerminalOptions } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RuntimeAdapter } from "./runtime/types";
import type {
  ConsoleSlotId,
  Provider,
  PtyExitEvent,
  PtyOutputEvent,
  PtySession,
} from "./types";

export type TerminalPhase =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "exited"
  | "error";

interface TerminalSlotProps {
  slotId: ConsoleSlotId;
  provider: Provider;
  phase: TerminalPhase;
  session: PtySession | null;
  exitEvent: PtyExitEvent | null;
  error: string | null;
  resetToken: number;
  displayName?: string | null;
  visible?: boolean;
  fontSize?: number;
  startDisabled: boolean;
  runtime: RuntimeAdapter;
  onStart(): void;
  onStop(): void;
  onExit(event: PtyExitEvent): void;
  onSize(rows: number, columns: number): void;
  onOutput?(): void;
  onFocusChange?(focused: boolean): void;
}

const encoder = new TextEncoder();

export const DEFAULT_FONT_SIZE = 16;

export const SEARCH_DECORATIONS = {
  decorations: {
    matchBackground: "#334a78",
    activeMatchBackground: "#8ca4ff",
    matchOverviewRuler: "#334a78",
    activeMatchColorOverviewRuler: "#8ca4ff",
  },
};

// Single source of truth for the Terminal options: the component and the
// real-module search test must build the terminal exactly the same way, or the
// test stops protecting the option it exists to protect. `allowProposedApi`
// is required because SearchAddon draws matches with the proposed decoration
// API; without it every findNext call throws before it ever searches.
export function createTerminalOptions(fontSize: number): ITerminalOptions {
  return {
    allowProposedApi: true,
    convertEol: false,
    cursorBlink: true,
    fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
    fontSize,
    scrollback: 5000,
    theme: {
      background: "#080c12",
      foreground: "#d9e1ee",
      cursor: "#8ca4ff",
      selectionBackground: "#334a78",
    },
  };
}

function terminalStatus(
  phase: TerminalPhase,
  exitEvent: PtyExitEvent | null,
): string {
  if (phase === "exited" && exitEvent) {
    return exitEvent.exitCode === null
      ? `Exited (${exitEvent.reason})`
      : `Exited (${exitEvent.exitCode})`;
  }
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export default function TerminalSlot({
  slotId,
  provider,
  phase,
  session,
  exitEvent,
  error,
  resetToken,
  displayName = null,
  visible = true,
  fontSize = DEFAULT_FONT_SIZE,
  startDisabled,
  runtime,
  onStart,
  onStop,
  onExit,
  onSize,
  onOutput,
  onFocusChange,
}: TerminalSlotProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMissing, setSearchMissing] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const sessionRef = useRef(session);
  const phaseRef = useRef(phase);
  const onExitRef = useRef(onExit);
  const onSizeRef = useRef(onSize);
  const onOutputRef = useRef(onOutput);
  const onFocusChangeRef = useRef(onFocusChange);
  const fontSizeRef = useRef(fontSize);
  const pendingOutputRef = useRef<PtyOutputEvent[]>([]);
  const previousSessionIdRef = useRef<string | null>(null);

  sessionRef.current = session;
  phaseRef.current = phase;
  onExitRef.current = onExit;
  onSizeRef.current = onSize;
  onOutputRef.current = onOutput;
  onFocusChangeRef.current = onFocusChange;
  fontSizeRef.current = fontSize;

  const runSearch = useCallback(
    (term: string, direction: "next" | "previous") => {
      const search = searchRef.current;
      if (!search) {
        return;
      }
      if (!term) {
        search.clearDecorations();
        setSearchMissing(false);
        return;
      }
      const found =
        direction === "next"
          ? search.findNext(term, SEARCH_DECORATIONS)
          : search.findPrevious(term, SEARCH_DECORATIONS);
      setSearchMissing(!found);
    },
    [],
  );

  const closeSearch = useCallback(() => {
    searchRef.current?.clearDecorations();
    setSearchOpen(false);
    setSearchMissing(false);
    terminalRef.current?.focus();
  }, []);

  const openSearchRef = useRef(() => {
    setSearchOpen(true);
  });

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const fitAndReport = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    try {
      fitRef.current?.fit();
    } catch {
      return;
    }
    if (terminal.rows > 0 && terminal.cols > 0) {
      onSizeRef.current(terminal.rows, terminal.cols);
      const active = sessionRef.current;
      if (active && runtime.resizePty) {
        void runtime.resizePty({
          slotId,
          sessionId: active.sessionId,
          rows: terminal.rows,
          columns: terminal.cols,
        });
      }
    }
  }, [runtime, slotId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !runtime.onPtyOutput || !runtime.onPtyExit) {
      return;
    }

    const terminal = new Terminal(createTerminalOptions(fontSizeRef.current));
    const fit = new FitAddon();
    const search = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.open(viewport);
    terminalRef.current = terminal;
    fitRef.current = fit;
    searchRef.current = search;

    const sendInput = (value: string) => {
      const active = sessionRef.current;
      if (!active || !runtime.writePtyInput) {
        return;
      }
      void runtime.writePtyInput({
        slotId,
        sessionId: active.sessionId,
        data: Array.from(encoder.encode(value)),
      });
    };

    const inputDisposable = terminal.onData(sendInput);
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || !event.metaKey) {
        return true;
      }
      const key = event.key.toLowerCase();
      if (key === "f") {
        openSearchRef.current();
        return false;
      }
      if (key === "c" && terminal.hasSelection()) {
        void navigator.clipboard?.writeText(terminal.getSelection());
        return false;
      }
      if (key === "v") {
        void navigator.clipboard?.readText().then(sendInput);
        return false;
      }
      return true;
    });

    const reportSize = () => fitAndReport();
    reportSize();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(reportSize);
    resizeObserver?.observe(viewport);

    const reportFocus = () => onFocusChangeRef.current?.(true);
    const reportBlur = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && viewport.contains(next)) {
        return;
      }
      onFocusChangeRef.current?.(false);
    };
    viewport.addEventListener("focusin", reportFocus);
    viewport.addEventListener("focusout", reportBlur);

    let disposed = false;
    const unlisteners: Array<() => void> = [];
    void runtime
      .onPtyOutput((event) => {
        if (event.slotId !== slotId) {
          return;
        }
        const active = sessionRef.current;
        if (active?.sessionId === event.sessionId) {
          terminal.write(new Uint8Array(event.data));
        } else if (phaseRef.current === "starting") {
          pendingOutputRef.current.push(event);
        } else {
          return;
        }
        onOutputRef.current?.();
      })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          unlisteners.push(unlisten);
        }
      });
    void runtime
      .onPtyExit((event) => {
        if (event.slotId === slotId) {
          onExitRef.current(event);
        }
      })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          unlisteners.push(unlisten);
        }
      });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      viewport.removeEventListener("focusin", reportFocus);
      viewport.removeEventListener("focusout", reportBlur);
      inputDisposable.dispose();
      for (const unlisten of unlisteners) {
        unlisten();
      }
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
  }, [fitAndReport, runtime, slotId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    const sessionId = session?.sessionId ?? null;
    if (sessionId && previousSessionIdRef.current !== sessionId) {
      terminal.reset();
      for (const event of pendingOutputRef.current) {
        if (event.sessionId === sessionId) {
          terminal.write(new Uint8Array(event.data));
        }
      }
      pendingOutputRef.current = [];
      previousSessionIdRef.current = sessionId;
      terminal.focus();
      fitAndReport();
    }
  }, [fitAndReport, session]);

  useEffect(() => {
    if (visible) {
      fitAndReport();
    }
  }, [fitAndReport, visible]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    terminal.options.fontSize = fontSize;
    fitAndReport();
  }, [fitAndReport, fontSize]);

  useEffect(() => {
    if (phase === "idle") {
      terminalRef.current?.reset();
      pendingOutputRef.current = [];
      previousSessionIdRef.current = null;
    }
  }, [phase, resetToken]);

  const available = provider.installed && provider.error === null;
  const hasTerminal = session !== null || phase === "stopped" || phase === "exited";
  const slotLabel = slotId.replace("slot-", "Slot ");

  return (
    <div className="terminal-slot">
      <div
        className={`terminal-viewport ${hasTerminal ? "" : "terminal-hidden"}`}
        ref={viewportRef}
        aria-label={`${slotId.replace("slot-", "Slot ")}${
          displayName ? ` · ${displayName}` : ""
        } terminal`}
      />
      {searchOpen && (
        <div className="terminal-search" role="search">
          <input
            ref={searchInputRef}
            className={searchMissing ? "terminal-search-missing" : ""}
            type="text"
            aria-label={`Search ${slotLabel} output`}
            value={searchTerm}
            onChange={(event) => {
              const term = event.target.value;
              setSearchTerm(term);
              // Intermediate IME states are not terms the user is looking for;
              // searching them only flashes the no-match state while composing.
              if (composingRef.current) {
                return;
              }
              runSearch(term, "next");
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              const term = event.currentTarget.value;
              setSearchTerm(term);
              runSearch(term, "next");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                runSearch(searchTerm, event.shiftKey ? "previous" : "next");
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                closeSearch();
              }
            }}
          />
          <button
            type="button"
            aria-label={`Previous match in ${slotLabel}`}
            onClick={() => runSearch(searchTerm, "previous")}
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            aria-label={`Next match in ${slotLabel}`}
            onClick={() => runSearch(searchTerm, "next")}
          >
            <span aria-hidden="true">↓</span>
          </button>
          <button
            type="button"
            aria-label={`Close search in ${slotLabel}`}
            onClick={closeSearch}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
      {!hasTerminal && (
        <div className="terminal-empty">
          <span className="console-provider-name">{provider.display_name}</span>
          <span className={`availability ${available ? "available" : ""}`}>
            <span className="status-dot" />
            {available ? "Available" : "Unavailable"}
          </span>
          {phase === "starting" ? (
            <span className="terminal-starting">Starting…</span>
          ) : (
            <button
              className="terminal-start-button"
              type="button"
              aria-label={
                phase === "error"
                  ? `Retry ${slotId.replace("slot-", "Slot ")}`
                  : `Configure ${slotId.replace("slot-", "Slot ")} session`
              }
              disabled={startDisabled}
              onClick={onStart}
            >
              {phase === "error" ? "Try again" : "Start"}
            </button>
          )}
        </div>
      )}
      <footer className="terminal-statusbar">
        <span className={`terminal-phase terminal-phase-${phase}`}>
          {terminalStatus(phase, exitEvent)}
        </span>
        {session && (
          <>
            <span>{provider.display_name}</span>
            <span title={session.workspacePath}>{session.workspacePath}</span>
            <span>{session.sessionMode === "new" ? "New" : "Continue"}</span>
          </>
        )}
        {error && (
          <span className="terminal-error" role="alert">
            {error}
          </span>
        )}
        {(phase === "running" || phase === "stopping") && (
          <button
            className="terminal-stop-button"
            type="button"
            aria-label={`Stop ${slotId.replace("slot-", "Slot ")}`}
            disabled={phase === "stopping"}
            onClick={onStop}
          >
            {phase === "stopping" ? "Stopping…" : "Stop"}
          </button>
        )}
        {(phase === "stopped" || phase === "exited") && (
          <button
            className="terminal-start-again-button"
            type="button"
            aria-label={`Start again in ${slotId.replace("slot-", "Slot ")}`}
            disabled={startDisabled}
            onClick={onStart}
          >
            Start again
          </button>
        )}
      </footer>
    </div>
  );
}
