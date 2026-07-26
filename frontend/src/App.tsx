import { useCallback, useEffect, useRef, useState } from "react";

import { defaultRuntime } from "./runtime";
import {
  CONSOLE_PROVIDERS,
  consoleLayoutsEqual,
  defaultConsoleLayout,
} from "./runtime/consoleLayout";
import { RECENT_WORKSPACE_LIMIT } from "./runtime/preferences";
import type { RuntimeAdapter } from "./runtime/types";
import TerminalSlot, { type TerminalPhase } from "./TerminalSlot";
import type {
  ConsoleLayout,
  ConsoleProviderId,
  Provider,
  PtyExitEvent,
  PtySession,
  SessionMode,
  WorkspacePreferences,
} from "./types";

function isAvailable(provider: Provider): boolean {
  return provider.installed && provider.error === null;
}

interface AppProps {
  runtime?: RuntimeAdapter;
}

type LaunchDestination = "external" | "slot-1";
type WindowAction = "close" | "reload";

interface TerminalState {
  phase: TerminalPhase;
  session: PtySession | null;
  exitEvent: PtyExitEvent | null;
  error: string | null;
}

const IDLE_TERMINAL: TerminalState = {
  phase: "idle",
  session: null,
  exitEvent: null,
  error: null,
};

function readPendingExit(
  ref: React.MutableRefObject<PtyExitEvent | null>,
): PtyExitEvent | null {
  return ref.current;
}

export default function App({ runtime = defaultRuntime }: AppProps) {
  const isTauri = runtime.kind === "tauri";
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [launchTarget, setLaunchTarget] = useState<Provider | null>(null);
  const [launchDestination, setLaunchDestination] =
    useState<LaunchDestination>("external");
  const [workspacePath, setWorkspacePath] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [workspacePreferences, setWorkspacePreferences] =
    useState<WorkspacePreferences>({});
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<SessionMode>("new");
  const [launching, setLaunching] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);
  const [launchWarning, setLaunchWarning] = useState<string | null>(null);
  const [savedConsoleLayout, setSavedConsoleLayout] =
    useState<ConsoleLayout | null>(null);
  const [consoleLayout, setConsoleLayout] =
    useState<ConsoleLayout>(defaultConsoleLayout);
  const [layoutReady, setLayoutReady] = useState(!isTauri);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [savingLayout, setSavingLayout] = useState(false);
  const [terminalState, setTerminalState] =
    useState<TerminalState>(IDLE_TERMINAL);
  const [terminalResetToken, setTerminalResetToken] = useState(0);
  const [terminalSize, setTerminalSize] = useState({
    rows: 24,
    columns: 80,
  });
  const [windowAction, setWindowAction] = useState<WindowAction | null>(null);
  const [windowActionError, setWindowActionError] = useState<string | null>(
    null,
  );
  const terminalStateRef = useRef(terminalState);
  const pendingExitRef = useRef<PtyExitEvent | null>(null);
  const pendingStartRef = useRef<Promise<PtySession> | null>(null);

  const updateTerminalState = useCallback((next: TerminalState) => {
    terminalStateRef.current = next;
    setTerminalState(next);
  }, []);

  const layoutDirty =
    isTauri && layoutReady
      ? !consoleLayoutsEqual(savedConsoleLayout, consoleLayout)
      : false;

  const refresh = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    setStorageReady(false);
    setStorageError(null);
    if (isTauri) {
      setLayoutReady(false);
      setLayoutError(null);
    }
    const providerTask = runtime
      .fetchProviders()
      .then((discovered) => {
        setProviders(discovered);
        setSelectedId((current) => {
          const selected = discovered.find(
            (provider) => provider.id === current,
          );
          return selected && isAvailable(selected) ? current : null;
        });
      })
      .catch((error: unknown) => {
        setPageError(
          error instanceof Error ? error.message : "Provider discovery failed",
        );
      });
    const preferenceTask = runtime
      .loadWorkspacePreferences()
      .then((preferences) => {
        setWorkspacePreferences(preferences);
        setStorageReady(true);
      })
      .catch((error: unknown) => {
        setStorageError(
          error instanceof Error
            ? error.message
            : "Workspace preferences could not be loaded",
        );
      });
    const layoutTask =
      isTauri && runtime.loadConsoleLayout
        ? runtime
            .loadConsoleLayout()
            .then((layout) => {
              setSavedConsoleLayout(layout);
              setConsoleLayout(layout);
              setLayoutReady(true);
            })
            .catch((error: unknown) => {
              setSavedConsoleLayout(null);
              setConsoleLayout(defaultConsoleLayout());
              setLayoutError(
                error instanceof Error
                  ? error.message
                  : "Console layout could not be loaded",
              );
            })
        : Promise.resolve();
    await Promise.all([providerTask, preferenceTask, layoutTask]);
    setLoading(false);
  }, [isTauri, runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openLaunch = (
    provider: Provider,
    destination: LaunchDestination = "external",
  ) => {
    const preference = workspacePreferences[provider.id];
    setSelectedId(provider.id);
    setLaunchTarget(provider);
    setLaunchDestination(destination);
    setWorkspacePath(preference?.defaultWorkspace ?? "");
    setNewFolder("");
    setSessionMode("new");
    setLaunchError(null);
    setSaveNotice(null);
  };

  const selectSessionMode = (mode: SessionMode) => {
    setSessionMode(mode);
    setNewFolder("");
    if (!launchTarget) {
      return;
    }
    const preference = workspacePreferences[launchTarget.id];
    const recentWorkspaces = preference?.recentWorkspaces ?? [];
    setWorkspacePath(
      mode === "continue"
        ? recentWorkspaces[0] || preference?.defaultWorkspace || ""
        : preference?.defaultWorkspace || "",
    );
    setLaunchError(null);
    setSaveNotice(null);
  };

  const closeLaunch = () => {
    if (!launching && !savingDefault) {
      setLaunchTarget(null);
      setLaunchError(null);
      setSaveNotice(null);
    }
  };

  const updateConsoleSlot = (
    slotId: ConsoleLayout["slots"][number]["slotId"],
    providerId: ConsoleProviderId,
  ) => {
    if (
      slotId === "slot-1" &&
      terminalState.phase !== "starting" &&
      terminalState.phase !== "running" &&
      terminalState.phase !== "stopping" &&
      consoleLayout.slots[0]?.providerId !== providerId
    ) {
      updateTerminalState(IDLE_TERMINAL);
      setTerminalResetToken((value) => value + 1);
    }
    setConsoleLayout((current) => ({
      ...current,
      slots: current.slots.map((slot) =>
        slot.slotId === slotId ? { ...slot, providerId } : slot,
      ),
    }));
    setLayoutError(null);
  };

  const saveConsoleLayout = async () => {
    if (
      !isTauri ||
      !runtime.saveConsoleLayout ||
      !layoutReady ||
      !layoutDirty ||
      savingLayout
    ) {
      return;
    }

    setSavingLayout(true);
    setLayoutError(null);
    try {
      const saved = await runtime.saveConsoleLayout(consoleLayout);
      setSavedConsoleLayout(saved);
      setConsoleLayout(saved);
    } catch (error) {
      setLayoutError(
        error instanceof Error
          ? error.message
          : "Console layout could not be saved",
      );
    } finally {
      setSavingLayout(false);
    }
  };

  const saveDefaultWorkspace = async () => {
    if (!launchTarget || launching || savingDefault) {
      return;
    }

    setSavingDefault(true);
    setLaunchError(null);
    setSaveNotice(null);
    try {
      const result = await runtime.validateWorkspace(workspacePath);
      const previous = workspacePreferences[launchTarget.id];
      const next = {
        ...workspacePreferences,
        [launchTarget.id]: {
          defaultWorkspace: result.workspace_path,
          recentWorkspaces: previous?.recentWorkspaces ?? [],
        },
      };
      await runtime.saveWorkspacePreferences(next, "default");
      setWorkspacePreferences(next);
      setWorkspacePath(result.workspace_path);
      setSaveNotice("Default workspace saved");
    } catch (error) {
      setLaunchError(
        error instanceof Error ? error.message : "Workspace validation failed",
      );
    } finally {
      setSavingDefault(false);
    }
  };

  const persistRecentWorkspace = async (
    provider: Provider,
    resolvedWorkspace: string,
  ) => {
    const previous = workspacePreferences[provider.id];
    const next = {
      ...workspacePreferences,
      [provider.id]: {
        defaultWorkspace: previous?.defaultWorkspace ?? "",
        recentWorkspaces: [
          resolvedWorkspace,
          ...(previous?.recentWorkspaces ?? []).filter(
            (path) => path !== resolvedWorkspace,
          ),
        ].slice(0, RECENT_WORKSPACE_LIMIT),
      },
    };
    let warning: string | undefined;
    try {
      ({ warning } = await runtime.saveWorkspacePreferences(next, "history"));
    } catch {
      warning = "CLI launched, but history was not saved";
    }
    setWorkspacePreferences(next);
    setLaunchWarning(warning ?? null);
  };

  const submitLaunch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!launchTarget || launching || savingDefault || !workspacePath) {
      return;
    }

    setLaunching(true);
    setLaunchError(null);
    setLaunchNotice(null);
    setLaunchWarning(null);
    try {
      if (launchDestination === "slot-1" && runtime.startPtySession) {
        pendingExitRef.current = null;
        updateTerminalState({
          phase: "starting",
          session: null,
          exitEvent: null,
          error: null,
        });
        const startPromise = runtime.startPtySession({
          slotId: "slot-1",
          providerId: launchTarget.id as ConsoleProviderId,
          workspacePath,
          sessionMode,
          ...(sessionMode === "new" && newFolder ? { newFolder } : {}),
          rows: terminalSize.rows,
          columns: terminalSize.columns,
        });
        pendingStartRef.current = startPromise;
        const session = await startPromise;
        pendingStartRef.current = null;
        const observedExit = readPendingExit(pendingExitRef);
        const earlyExit =
          observedExit?.sessionId === session.sessionId ? observedExit : null;
        updateTerminalState({
          phase: earlyExit ? "exited" : "running",
          session,
          exitEvent: earlyExit,
          error: null,
        });
        await persistRecentWorkspace(launchTarget, session.workspacePath);
        setLaunchTarget(null);
      } else {
        const result = await runtime.launchProvider({
          provider_id: launchTarget.id,
          workspace_path: workspacePath,
          session_mode: sessionMode,
          ...(sessionMode === "new" && newFolder
            ? { new_folder: newFolder }
            : {}),
        });
        await persistRecentWorkspace(launchTarget, result.workspace_path);
        setLaunchTarget(null);
        setLaunchNotice(
          `${launchTarget.display_name} launched in ${result.workspace_path}`,
        );
      }
    } catch (error) {
      pendingStartRef.current = null;
      if (launchDestination === "slot-1") {
        updateTerminalState({
          phase: "error",
          session: null,
          exitEvent: null,
          error: error instanceof Error ? error.message : "PTY start failed",
        });
      }
      setLaunchError(
        error instanceof Error
          ? error.message
          : launchDestination === "slot-1"
            ? "PTY start failed"
            : "CLI launch failed",
      );
    } finally {
      setLaunching(false);
    }
  };

  const handleTerminalExit = useCallback(
    (event: PtyExitEvent) => {
      const current = terminalStateRef.current;
      if (current.phase === "starting") {
        pendingExitRef.current = event;
        return;
      }
      if (current.session?.sessionId !== event.sessionId) {
        return;
      }
      updateTerminalState({
        phase:
          current.phase === "stopping" || event.reason === "stopped"
            ? "stopped"
            : "exited",
        session: current.session,
        exitEvent: event,
        error: null,
      });
    },
    [updateTerminalState],
  );

  const stopTerminal = useCallback(async () => {
    const current = terminalStateRef.current;
    if (!current.session || !runtime.stopPtySession) {
      return;
    }
    updateTerminalState({ ...current, phase: "stopping", error: null });
    try {
      await runtime.stopPtySession({
        slotId: "slot-1",
        sessionId: current.session.sessionId,
      });
      const latest = terminalStateRef.current;
      updateTerminalState({
        phase: "stopped",
        session: current.session,
        exitEvent: latest.exitEvent,
        error: null,
      });
    } catch (error) {
      updateTerminalState({
        ...current,
        phase: "running",
        error:
          error instanceof Error
            ? error.message
            : "PTY process tree could not be terminated",
      });
      throw error;
    }
  }, [runtime, updateTerminalState]);

  const terminalIsActive = useCallback(() => {
    const phase = terminalStateRef.current.phase;
    return phase === "starting" || phase === "running" || phase === "stopping";
  }, []);

  const requestWindowAction = useCallback(
    (action: WindowAction): boolean => {
      if (!terminalIsActive()) {
        return false;
      }
      setWindowActionError(null);
      setWindowAction(action);
      return true;
    },
    [terminalIsActive],
  );

  useEffect(() => {
    if (!isTauri || !runtime.onCloseRequested) {
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void runtime
      .onCloseRequested(() => requestWindowAction("close"))
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [isTauri, requestWindowAction, runtime]);

  useEffect(() => {
    if (!isTauri) {
      return;
    }
    const interceptReload = (event: KeyboardEvent) => {
      if (
        event.metaKey &&
        event.key.toLowerCase() === "r" &&
        requestWindowAction("reload")
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", interceptReload);
    return () => window.removeEventListener("keydown", interceptReload);
  }, [isTauri, requestWindowAction]);

  useEffect(
    () => () => {
      const current = terminalStateRef.current;
      if (
        current.session &&
        (current.phase === "running" || current.phase === "stopping") &&
        runtime.stopPtySession
      ) {
        void runtime.stopPtySession({
          slotId: "slot-1",
          sessionId: current.session.sessionId,
        });
      }
    },
    [runtime],
  );

  const confirmWindowAction = async () => {
    const action = windowAction;
    if (!action) {
      return;
    }
    setWindowActionError(null);
    try {
      if (
        terminalStateRef.current.phase === "starting" &&
        pendingStartRef.current
      ) {
        await pendingStartRef.current;
      }
      if (
        terminalStateRef.current.phase === "running" ||
        terminalStateRef.current.phase === "stopping"
      ) {
        await stopTerminal();
      }
      if (action === "close") {
        await runtime.closeWindow?.();
      } else {
        await runtime.reloadWindow?.();
      }
      setWindowAction(null);
    } catch (error) {
      setWindowActionError(
        error instanceof Error
          ? error.message
          : "Slot 1 could not be stopped",
      );
    }
  };

  const activePreference = launchTarget
    ? workspacePreferences[launchTarget.id]
    : undefined;
  const continueWorkspaces = activePreference?.recentWorkspaces.length
    ? activePreference.recentWorkspaces
    : activePreference?.defaultWorkspace
      ? [activePreference.defaultWorkspace]
      : [];
  const modalBusy = launching || savingDefault;
  const providersById = new Map(
    providers.map((provider) => [provider.id, provider]),
  );
  const providerForConsole = (providerId: ConsoleProviderId): Provider => {
    const option = CONSOLE_PROVIDERS.find(
      (provider) => provider.id === providerId,
    )!;
    return (
      providersById.get(providerId) ?? {
        id: option.id,
        display_name: option.displayName,
        command: option.command,
        installed: false,
        path: null,
        version: null,
        error: loading
          ? "Provider discovery in progress"
          : "Provider discovery unavailable",
      }
    );
  };

  return (
    <main className={isTauri ? "tauri-shell" : "shell"}>
      {isTauri ? (
        <>
          <header className="tauri-header">
            <h1>AI Agent Console</h1>
          </header>

          <div className="tauri-body">
            <aside className="provider-sidebar" aria-label="CLI providers">
              <div className="sidebar-discovery">
                <button
                  className="refresh-button"
                  type="button"
                  onClick={() => void refresh()}
                  disabled={loading || savingLayout || layoutDirty}
                >
                  <span aria-hidden="true">↻</span>
                  {loading ? "Discovering…" : "Refresh"}
                </button>
                <div className="read-only-badge">
                  <span className="status-dot" />
                  Read-only discovery
                </div>
              </div>

              <div className="sidebar-provider-list">
                {CONSOLE_PROVIDERS.map((option) => {
                  const provider = providerForConsole(option.id);
                  const available = isAvailable(provider);
                  return (
                    <article
                      className={`sidebar-provider ${
                        available ? "" : "unavailable"
                      }`}
                      key={option.id}
                    >
                      <div className="sidebar-provider-heading">
                        <span className="sidebar-provider-name">
                          {provider.display_name}
                        </span>
                        <span
                          className={`availability ${
                            available ? "available" : ""
                          }`}
                        >
                          <span className="status-dot" />
                          {available ? "Available" : "Unavailable"}
                        </span>
                      </div>
                      <span className="sidebar-provider-version">
                        {provider.version ?? "Version unavailable"}
                      </span>
                      {provider.error && (
                        <span className="sidebar-provider-error">
                          {provider.error}
                        </span>
                      )}
                      <details className="sidebar-provider-path">
                        <summary>Executable path</summary>
                        <code>{provider.path ?? "Not found in PATH"}</code>
                      </details>
                      <button
                        className="sidebar-launch-button"
                        type="button"
                        aria-label={`Launch ${provider.display_name}`}
                        disabled={!available || !storageReady}
                        onClick={() => openLaunch(provider)}
                      >
                        Launch
                      </button>
                    </article>
                  );
                })}
              </div>

              <div className="layout-save-panel">
                <span
                  className={`layout-save-status ${
                    layoutDirty ? "unsaved" : ""
                  }`}
                  role="status"
                >
                  {savingLayout
                    ? "Saving…"
                    : layoutDirty
                      ? "Unsaved changes"
                      : layoutReady
                        ? "Saved"
                        : "Layout unavailable"}
                </span>
                <button
                  className="save-layout-button"
                  type="button"
                  onClick={() => void saveConsoleLayout()}
                  disabled={!layoutReady || !layoutDirty || savingLayout}
                >
                  {savingLayout ? "Saving…" : "Save Layout"}
                </button>
              </div>
            </aside>

            <section className="console-main" aria-label="Console layout">
              <div className="console-alerts">
                {pageError && (
                  <div className="page-error" role="alert">
                    <strong>Discovery unavailable.</strong> {pageError}
                  </div>
                )}
                {storageError && (
                  <div className="page-error" role="alert">
                    <strong>Workspace storage unavailable.</strong>{" "}
                    {storageError}
                  </div>
                )}
                {layoutError && (
                  <div className="page-error" role="alert">
                    <strong>Console layout unavailable.</strong> {layoutError}
                  </div>
                )}
                {launchNotice && (
                  <div className="launch-notice" role="status">
                    {launchNotice}
                  </div>
                )}
                {launchWarning && (
                  <div className="page-error" role="alert">
                    {launchWarning}
                  </div>
                )}
              </div>

              <div className="console-grid">
                {consoleLayout.slots.map((slot, index) => {
                  const provider = providerForConsole(slot.providerId);
                  const available = isAvailable(provider);
                  return (
                    <article className="console-slot" key={slot.slotId}>
                      <header className="console-slot-header">
                        <span>Slot {index + 1}</span>
                        <label>
                          <span className="sr-only">
                            Slot {index + 1} provider
                          </span>
                          <select
                            aria-label={`Slot ${index + 1} provider`}
                            value={slot.providerId}
                            disabled={
                              !layoutReady ||
                              savingLayout ||
                              (slot.slotId === "slot-1" &&
                                (terminalState.phase === "starting" ||
                                  terminalState.phase === "running" ||
                                  terminalState.phase === "stopping"))
                            }
                            onChange={(event) =>
                              updateConsoleSlot(
                                slot.slotId,
                                event.target.value as ConsoleProviderId,
                              )
                            }
                          >
                            {CONSOLE_PROVIDERS.map((option) => (
                              <option value={option.id} key={option.id}>
                                {option.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                      </header>
                      {slot.slotId === "slot-1" ? (
                        <TerminalSlot
                          provider={provider}
                          phase={terminalState.phase}
                          session={terminalState.session}
                          exitEvent={terminalState.exitEvent}
                          error={terminalState.error}
                          resetToken={terminalResetToken}
                          startDisabled={
                            !layoutReady ||
                            Boolean(layoutError) ||
                            !storageReady ||
                            !available ||
                            !runtime.startPtySession
                          }
                          runtime={runtime}
                          onStart={() => openLaunch(provider, "slot-1")}
                          onStop={() => {
                            void stopTerminal().catch(() => {});
                          }}
                          onExit={handleTerminalExit}
                          onSize={(rows, columns) =>
                            setTerminalSize({ rows, columns })
                          }
                        />
                      ) : (
                        <div className="console-placeholder">
                          <span className="console-provider-name">
                            {provider.display_name}
                          </span>
                          <span
                            className={`availability ${
                              available ? "available" : ""
                            }`}
                          >
                            <span className="status-dot" />
                            {available ? "Available" : "Unavailable"}
                          </span>
                          <p>Embedded terminal coming next</p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      ) : (
        <>
          <section className="intro" aria-labelledby="provider-heading">
            <div>
              <p className="section-label">CLI PROVIDERS</p>
              <h1 id="provider-heading">AI Agent Console</h1>
              <p>
                Discover the AI command-line tools available on this Mac.
                Workspace preferences stay local to this device.
              </p>
            </div>
            <div className="intro-actions">
              <button
                className="refresh-button"
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
              >
                <span aria-hidden="true">↻</span>
                {loading ? "Discovering…" : "Refresh"}
              </button>
              <div className="read-only-badge">
                <span className="status-dot" />
                Read-only discovery
              </div>
            </div>
          </section>

          {pageError && (
            <div className="page-error" role="alert">
              <strong>Discovery unavailable.</strong> {pageError}
            </div>
          )}

          {storageError && (
            <div className="page-error" role="alert">
              <strong>Workspace storage unavailable.</strong> {storageError}
            </div>
          )}

          {launchNotice && (
            <div className="launch-notice" role="status">
              {launchNotice}
            </div>
          )}

          {launchWarning && (
            <div className="page-error" role="alert">
              {launchWarning}
            </div>
          )}

          <section className="provider-grid" aria-live="polite">
            {providers.map((provider, index) => {
              const available = isAvailable(provider);
              const selectedProvider = selectedId === provider.id;
              return (
                <article
                  className={`provider-card ${
                    selectedProvider ? "selected" : ""
                  } ${available ? "" : "unavailable"}`}
                  key={provider.id}
                >
                  <button
                    className="provider-select"
                    type="button"
                    aria-pressed={selectedProvider}
                    aria-label={`${provider.display_name} — ${
                      available ? "Available" : "Unavailable"
                    }`}
                    disabled={!available}
                    onClick={() => setSelectedId(provider.id)}
                  >
                    <span className="provider-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`availability ${
                        available ? "available" : ""
                      }`}
                    >
                      <span className="status-dot" />
                      {available ? "Available" : "Unavailable"}
                    </span>
                    <span className="provider-name">
                      {provider.display_name}
                    </span>
                    <span className="provider-command">
                      <code>{provider.command}</code>
                    </span>
                    <span className="provider-version">
                      {provider.version ?? "Version unavailable"}
                    </span>
                    {provider.error && (
                      <span className="provider-error">{provider.error}</span>
                    )}
                  </button>
                  <div className="provider-footer">
                    <details>
                      <summary>Executable path</summary>
                      <code>{provider.path ?? "Not found in PATH"}</code>
                    </details>
                    <button
                      className="launch-button"
                      type="button"
                      aria-label={`Launch ${provider.display_name}`}
                      disabled={!available || !storageReady}
                      onClick={() => openLaunch(provider)}
                    >
                      Launch
                    </button>
                  </div>
                </article>
              );
            })}
            {loading && providers.length === 0 && (
              <p className="loading-message">
                Scanning local CLI providers…
              </p>
            )}
          </section>
        </>
      )}

      {launchTarget && (
        <div className="modal-backdrop">
          <section
            className="launch-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="launch-heading"
          >
            <p className="section-label">
              {launchDestination === "slot-1"
                ? "EMBEDDED TERMINAL"
                : "LAUNCH CLI"}
            </p>
            <h2 id="launch-heading">{launchTarget.display_name}</h2>
            <p className="modal-copy">
              Choose how this CLI session should start and where it should run.
            </p>

            <form onSubmit={(event) => void submitLaunch(event)}>
              <fieldset disabled={modalBusy}>
                <legend>Session</legend>
                <label>
                  <input
                    type="radio"
                    name="session-mode"
                    value="new"
                    checked={sessionMode === "new"}
                    onChange={() => selectSessionMode("new")}
                  />
                  New session
                </label>
                <label>
                  <input
                    type="radio"
                    name="session-mode"
                    value="continue"
                    checked={sessionMode === "continue"}
                    onChange={() => selectSessionMode("continue")}
                  />
                  Continue session
                </label>
              </fieldset>

              {sessionMode === "new" ? (
                <>
                  <div className="workspace-field">
                    <label htmlFor="default-workspace">
                      Default workspace path
                    </label>
                    <div className="workspace-save-row">
                      <input
                        id="default-workspace"
                        type="text"
                        value={workspacePath}
                        onChange={(event) => {
                          setWorkspacePath(event.target.value);
                          setSaveNotice(null);
                        }}
                        placeholder="/Users/name/project"
                        autoFocus
                        disabled={modalBusy}
                        required
                      />
                      <button
                        className="save-workspace-button"
                        type="button"
                        onClick={() => void saveDefaultWorkspace()}
                        disabled={modalBusy || !workspacePath}
                      >
                        {savingDefault ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                  <p className="workspace-hint">
                    Save validates this path without starting a CLI.
                  </p>
                  <label className="workspace-field">
                    <span>New folder (optional)</span>
                    <input
                      type="text"
                      value={newFolder}
                      onChange={(event) => setNewFolder(event.target.value)}
                      placeholder="project-folder"
                      disabled={modalBusy}
                    />
                  </label>
                  {newFolder && (
                    <p className="workspace-preview">
                      Start in:{" "}
                      <code>
                        {workspacePath.replace(/\/+$/, "")}/{newFolder}
                      </code>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label className="workspace-field">
                    <span>Recent workspace</span>
                    <select
                      value={workspacePath}
                      onChange={(event) => setWorkspacePath(event.target.value)}
                      autoFocus
                      disabled={modalBusy || continueWorkspaces.length === 0}
                      required
                    >
                      {continueWorkspaces.length === 0 ? (
                        <option value="">No recent workspace available</option>
                      ) : (
                        continueWorkspaces.map((path) => (
                          <option value={path} key={path}>
                            {path}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <p className="workspace-hint">
                    Shows up to five workspaces previously started for this
                    provider.
                  </p>
                </>
              )}

              {saveNotice && (
                <div className="modal-success" role="status">
                  {saveNotice}
                </div>
              )}

              {launchError && (
                <div className="modal-error" role="alert">
                  {launchError}
                </div>
              )}

              <div className="modal-actions">
                <button
                  className="cancel-button"
                  type="button"
                  onClick={closeLaunch}
                  disabled={modalBusy}
                >
                  Cancel
                </button>
                <button
                  className="modal-launch-button"
                  type="submit"
                  disabled={modalBusy || !workspacePath}
                >
                  {launching
                    ? "Starting…"
                    : launchDestination === "slot-1"
                      ? "Start in Slot 1"
                      : "Start"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {windowAction && (
        <div className="modal-backdrop">
          <section
            className="launch-modal close-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-confirmation-heading"
          >
            <p className="section-label">ACTIVE TERMINAL</p>
            <h2 id="close-confirmation-heading">Slot 1 is running</h2>
            <p className="modal-copy">
              Stop the active process tree before{" "}
              {windowAction === "close" ? "closing" : "reloading"} the App.
            </p>
            {windowActionError && (
              <div className="modal-error" role="alert">
                {windowActionError}
              </div>
            )}
            <div className="modal-actions">
              <button
                className="cancel-button"
                type="button"
                onClick={() => {
                  setWindowAction(null);
                  setWindowActionError(null);
                }}
              >
                Cancel
              </button>
              <button
                className="modal-launch-button"
                type="button"
                onClick={() => void confirmWindowAction()}
              >
                Stop and {windowAction === "close" ? "Close" : "Reload"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
