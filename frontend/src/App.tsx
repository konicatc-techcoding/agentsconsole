import { useCallback, useEffect, useState } from "react";

import { fetchProviders, launchProvider } from "./api";
import type { Provider, SessionMode } from "./types";

function isAvailable(provider: Provider): boolean {
  return provider.installed && provider.error === null;
}

export default function App() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [launchTarget, setLaunchTarget] = useState<Provider | null>(null);
  const [workspacePath, setWorkspacePath] = useState("");
  const [lastWorkspacePath, setLastWorkspacePath] = useState("");
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

  const selected = providers.find((provider) => provider.id === selectedId);

  const openLaunch = (provider: Provider) => {
    setSelectedId(provider.id);
    setLaunchTarget(provider);
    setWorkspacePath(lastWorkspacePath);
    setSessionMode("new");
    setLaunchError(null);
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
      });
      setLastWorkspacePath(result.workspace_path);
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
            Discover the AI command-line tools available on this Mac. Selection
            stays in this browser session.
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

      <footer className="selection-bar">
        <div>
          <p className="section-label">SESSION SELECTION</p>
          <p className="selection-copy">
            {selected
              ? `Current selection: ${selected.display_name}`
              : "No CLI selected"}
          </p>
        </div>
        <p className="selection-note">Resets when this page reloads</p>
      </footer>

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
              Choose a local workspace and how this CLI session should start.
            </p>

            <form onSubmit={(event) => void submitLaunch(event)}>
              <label className="workspace-field">
                <span>Workspace absolute path</span>
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

              <fieldset disabled={launching}>
                <legend>Session</legend>
                <label>
                  <input
                    type="radio"
                    name="session-mode"
                    value="new"
                    checked={sessionMode === "new"}
                    onChange={() => setSessionMode("new")}
                  />
                  New session
                </label>
                <label>
                  <input
                    type="radio"
                    name="session-mode"
                    value="continue"
                    checked={sessionMode === "continue"}
                    onChange={() => setSessionMode("continue")}
                  />
                  Continue last session
                </label>
              </fieldset>

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
