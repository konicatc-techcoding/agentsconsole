import { useCallback, useEffect, useState } from "react";

import { defaultRuntime } from "./runtime";
import { RECENT_WORKSPACE_LIMIT } from "./runtime/preferences";
import type { RuntimeAdapter } from "./runtime/types";
import type {
  Provider,
  SessionMode,
  WorkspacePreferences,
} from "./types";

function isAvailable(provider: Provider): boolean {
  return provider.installed && provider.error === null;
}

interface AppProps {
  runtime?: RuntimeAdapter;
}

export default function App({ runtime = defaultRuntime }: AppProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [launchTarget, setLaunchTarget] = useState<Provider | null>(null);
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

  const refresh = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    setStorageReady(false);
    setStorageError(null);
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
    await Promise.all([providerTask, preferenceTask]);
    setLoading(false);
  }, [runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openLaunch = (provider: Provider) => {
    const preference = workspacePreferences[provider.id];
    setSelectedId(provider.id);
    setLaunchTarget(provider);
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
      const result = await runtime.launchProvider({
        provider_id: launchTarget.id,
        workspace_path: workspacePath,
        session_mode: sessionMode,
        ...(sessionMode === "new" && newFolder
          ? { new_folder: newFolder }
          : {}),
      });
      const previous = workspacePreferences[launchTarget.id];
      const next = {
        ...workspacePreferences,
        [launchTarget.id]: {
          defaultWorkspace: previous?.defaultWorkspace ?? "",
          recentWorkspaces: [
            result.workspace_path,
            ...(previous?.recentWorkspaces ?? []).filter(
              (path) => path !== result.workspace_path,
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
      setLaunchTarget(null);
      setLaunchNotice(
        `${launchTarget.display_name} launched in ${result.workspace_path}`,
      );
      setLaunchWarning(warning ?? null);
    } catch (error) {
      setLaunchError(
        error instanceof Error ? error.message : "CLI launch failed",
      );
    } finally {
      setLaunching(false);
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

  return (
    <main className="shell">
      <section className="intro" aria-labelledby="provider-heading">
        <div>
          <p className="section-label">CLI PROVIDERS</p>
          <h1 id="provider-heading">AI Agent Console</h1>
          <p>
            Discover the AI command-line tools available on this Mac. Workspace
            preferences stay local to this device.
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
              className={`provider-card ${selectedProvider ? "selected" : ""} ${
                available ? "" : "unavailable"
              }`}
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
                  className={`availability ${available ? "available" : ""}`}
                >
                  <span className="status-dot" />
                  {available ? "Available" : "Unavailable"}
                </span>
                <span className="provider-name">{provider.display_name}</span>
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
          <p className="loading-message">Scanning local CLI providers…</p>
        )}
      </section>

      {launchTarget && (
        <div className="modal-backdrop">
          <section
            className="launch-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="launch-heading"
          >
            <p className="section-label">LAUNCH CLI</p>
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
                  {launching ? "Starting…" : "Start"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
