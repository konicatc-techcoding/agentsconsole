import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";

import type { RuntimeAdapter } from "./runtime/types";
import type {
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
  provider: Provider;
  phase: TerminalPhase;
  session: PtySession | null;
  exitEvent: PtyExitEvent | null;
  error: string | null;
  resetToken: number;
  startDisabled: boolean;
  runtime: RuntimeAdapter;
  onStart(): void;
  onStop(): void;
  onExit(event: PtyExitEvent): void;
  onSize(rows: number, columns: number): void;
}

const encoder = new TextEncoder();

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
  provider,
  phase,
  session,
  exitEvent,
  error,
  resetToken,
  startDisabled,
  runtime,
  onStart,
  onStop,
  onExit,
  onSize,
}: TerminalSlotProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef(session);
  const phaseRef = useRef(phase);
  const onExitRef = useRef(onExit);
  const onSizeRef = useRef(onSize);
  const pendingOutputRef = useRef<PtyOutputEvent[]>([]);
  const previousSessionIdRef = useRef<string | null>(null);

  sessionRef.current = session;
  phaseRef.current = phase;
  onExitRef.current = onExit;
  onSizeRef.current = onSize;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !runtime.onPtyOutput || !runtime.onPtyExit) {
      return;
    }

    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
      fontSize: 12,
      scrollback: 5000,
      theme: {
        background: "#080c12",
        foreground: "#d9e1ee",
        cursor: "#8ca4ff",
        selectionBackground: "#334a78",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(viewport);
    terminalRef.current = terminal;
    fitRef.current = fit;

    const sendInput = (value: string) => {
      const active = sessionRef.current;
      if (!active || !runtime.writePtyInput) {
        return;
      }
      void runtime.writePtyInput({
        slotId: "slot-1",
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

    const reportSize = () => {
      try {
        fit.fit();
      } catch {
        return;
      }
      if (terminal.rows > 0 && terminal.cols > 0) {
        onSizeRef.current(terminal.rows, terminal.cols);
        const active = sessionRef.current;
        if (active && runtime.resizePty) {
          void runtime.resizePty({
            slotId: "slot-1",
            sessionId: active.sessionId,
            rows: terminal.rows,
            columns: terminal.cols,
          });
        }
      }
    };
    reportSize();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(reportSize);
    resizeObserver?.observe(viewport);

    let disposed = false;
    const unlisteners: Array<() => void> = [];
    void runtime
      .onPtyOutput((event) => {
        if (event.slotId !== "slot-1") {
          return;
        }
        const active = sessionRef.current;
        if (active?.sessionId === event.sessionId) {
          terminal.write(new Uint8Array(event.data));
        } else if (phaseRef.current === "starting") {
          pendingOutputRef.current.push(event);
        }
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
        if (event.slotId === "slot-1") {
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
      inputDisposable.dispose();
      for (const unlisten of unlisteners) {
        unlisten();
      }
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [runtime]);

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
      try {
        fitRef.current?.fit();
      } catch {
        // The viewport may still be settling; ResizeObserver will retry.
      }
      if (terminal.rows > 0 && terminal.cols > 0) {
        onSizeRef.current(terminal.rows, terminal.cols);
        if (runtime.resizePty) {
          void runtime.resizePty({
            slotId: "slot-1",
            sessionId,
            rows: terminal.rows,
            columns: terminal.cols,
          });
        }
      }
    }
  }, [runtime, session]);

  useEffect(() => {
    if (phase === "idle") {
      terminalRef.current?.reset();
      pendingOutputRef.current = [];
      previousSessionIdRef.current = null;
    }
  }, [phase, resetToken]);

  const available = provider.installed && provider.error === null;
  const hasTerminal = session !== null || phase === "stopped" || phase === "exited";

  return (
    <div className="terminal-slot">
      <div
        className={`terminal-viewport ${hasTerminal ? "" : "terminal-hidden"}`}
        ref={viewportRef}
        aria-label="Slot 1 terminal"
      />
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
