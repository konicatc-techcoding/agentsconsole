import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef } from "react";

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
  startDisabled,
  runtime,
  onStart,
  onStop,
  onExit,
  onSize,
  onOutput,
  onFocusChange,
}: TerminalSlotProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef(session);
  const phaseRef = useRef(phase);
  const onExitRef = useRef(onExit);
  const onSizeRef = useRef(onSize);
  const onOutputRef = useRef(onOutput);
  const onFocusChangeRef = useRef(onFocusChange);
  const pendingOutputRef = useRef<PtyOutputEvent[]>([]);
  const previousSessionIdRef = useRef<string | null>(null);

  sessionRef.current = session;
  phaseRef.current = phase;
  onExitRef.current = onExit;
  onSizeRef.current = onSize;
  onOutputRef.current = onOutput;
  onFocusChangeRef.current = onFocusChange;

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
        aria-label={`${slotId.replace("slot-", "Slot ")}${
          displayName ? ` · ${displayName}` : ""
        } terminal`}
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
