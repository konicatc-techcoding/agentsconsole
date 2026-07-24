import { useCallback, useEffect, useState } from "react";

import { fetchProviders, launchProvider } from "./api";
import type { Provider, SessionMode } from "./types";

const WORKSPACE_PREFERENCES_KEY = "agentos-console.workspace-preferences.v1";

interface WorkspacePreference {
  defaultWorkspace: string;
  lastStartedWorkspace: string;
}

type WorkspacePreferences = Record<string, WorkspacePreference>;

function isAvailable(provider: Provider): boolean {
  return provider.installed && provider.error === null;
}

function readWorkspacePreferences(): WorkspacePreferences {
  try {
    const stored = JSON.parse(
      localStorage.getItem(WORKSPACE_PREFERENCES_KEY) ?? "{}",
    ) as unknown;
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(stored).filter(
        ([, value]) =>
          value &&
          typeof value === "object" &&
          "defaultWorkspace" in value &&
          typeof value.defaultWorkspace === "string" &&
          "lastStartedWorkspace" in value &&
          typeof value.lastStartedWorkspace === "string",
      ),
    ) as WorkspacePreferences;
  } catch {
    return {};
  }
}

function saveWorkspacePreferences(preferences: WorkspacePreferences): void {
  try {
    localStorage.setItem(
      WORKSPACE_PREFERENCES_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // A successful Terminal launch remains successful if storage is unavailable.
  }
}

export default function App() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [launchTarget, setLaunchTarget] = useState<Provider | null>(null);
  const [workspacePath, setWorkspacePath] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [workspacePreferences, setWorkspacePreferences] =
    useState<WorkspacePreferences>(readWorkspacePreferences);
  const [sessionMode, setSessionMode] = useState<SessionMode>("new");
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const discovered = await fetchProviders();
      setProviders(discovered);
      setSelectedId((current) => {
        const selected = discovered.find((provider) => provider.id === current);
        return selected && isAvailable(selected) ? current : null;
      });
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "Provider discovery failed",
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
  };

  const selectSessionMode = (mode: SessionMode) => {
    setSessionMode(mode);
    setNewFolder("");
    if (!launchTarget) {
      return;
    }
    const preference = workspacePreferences[launchTarget.id];
    setWorkspacePath(
      mode === "continue"
        ? preference?.lastStartedWorkspace ||
            preference?.defaultWorkspace ||
            ""
        : preference?.defaultWorkspace || "",
    );
  };

  const closeLaunch = () => {
    if (!launching) {
      setLaunchTarget(null);
      setLaunchError(null);
    }
  };

  const submitLaunch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!launchTarget || launching) {
      return;
    }

    setLaunching(true);
    setLaunchError(null);
    setLaunchNotice(null);
    try {
      const result = await launchProvider({
        provider_id: launchTarget.id,
        workspace_path: workspacePath,
        session_mode: sessionMode,
        ...(sessionMode === "new" && newFolder
          ? { new_folder: newFolder }
          : {}),
      });
      setWorkspacePreferences((current) => {
        const previous = current[launchTarget.id];
        const next = {
          ...current,
          [launchTarget.id]: {
            defaultWorkspace:
              sessionMode === "new"
                ? workspacePath
                : (previous?.defaultWorkspace ?? ""),
            lastStartedWorkspace: result.workspace_path,
          },
        };
        saveWorkspacePreferences(next);
        return next;
      });
      setLaunchTarget(null);
      setLaunchNotice(
        `${launchTarget.display_name} launched in ${result.workspace_path}`,
      );
    } catch (error) {
      setLaunchError(
        error instanceof Error ? error.message : "CLI launch failed",
      );
    } finally {
      setLaunching(false);
    }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            AO
          </span>
          <div>
            <p className="eyebrow">LOCAL CONTROL PLANE</p>
            <h1>AgentOS Console</h1>
          </div>
        </div>
        <button
          className="refresh-button"
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <span aria-hidden="true">↻</span>
          {loading ? "Discovering…" : "Refresh"}
        </button>
      </header>

      <section className="intro" aria-labelledby="provider-heading">
        <div>
          <p className="section-label">CLI PROVIDERS</p>
          <h2 id="provider-heading">Choose your workspace engine</h2>
          <p>
            Discover the AI command-line tools available on this Mac. Workspace
            preferences stay local to this browser.
          </p>
        </div>
        <div className="read-only-badge">
          <span className="status-dot" />
          Read-only discovery
        </div>
      </section>

      {pageError && (
        <div className="page-error" role="alert">
          <strong>Discovery unavailable.</strong> {pageError}
        </div>
      )}

      {launchNotice && (
        <div className="launch-notice" role="status">
          {launchNotice}
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
                  disabled={!available}
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
              <fieldset disabled={launching}>
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
                  Continue last session
                </label>
              </fieldset>

              <label className="workspace-field">
                <span>
                  {sessionMode === "new"
                    ? "Default workspace absolute path"
                    : "Workspace absolute path"}
                </span>
                <input
                  type="text"
                  value={workspacePath}
                  onChange={(event) => setWorkspacePath(event.target.value)}
                  placeholder="/Users/name/project"
                  autoFocus
                  disabled={launching}
                  required
                />
              </label>

              {sessionMode === "new" ? (
                <>
                  <p className="workspace-hint">
                    Saved as this provider&apos;s default after a successful
                    start.
                  </p>
                  <label className="workspace-field">
                    <span>New folder (optional)</span>
                    <input
                      type="text"
                      value={newFolder}
                      onChange={(event) => setNewFolder(event.target.value)}
                      placeholder="project-folder"
                      disabled={launching}
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
                <p className="workspace-hint">
                  Uses this provider&apos;s last started workspace when
                  available.
                </p>
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
                  disabled={launching}
                >
                  Cancel
                </button>
                <button
                  className="modal-launch-button"
                  type="submit"
                  disabled={launching}
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
