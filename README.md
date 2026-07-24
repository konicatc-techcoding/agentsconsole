# AgentOS Console

A localhost-only control surface for discovering the AI command-line tools
installed on this Mac. It can detect and select a provider, then open its
native interactive CLI in Terminal.app. It does not send prompts or manage
launched processes.

## Requirements

- Python 3.12 or newer
- Node.js 22 or newer
- Any of the supported CLIs available on the backend process `PATH`:
  `hermes`, `codex`, `claude`, or `agy`

## Backend

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e "./backend[dev]"
.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

The provider endpoint is available at
`http://127.0.0.1:8000/api/providers`.

## Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` requests to the local
FastAPI server.

## Launching a CLI

On macOS, each available provider card has a `Launch` button. Choose an
existing absolute default workspace and select how the provider should start.
Use `Save` to validate and persist the default workspace without starting a
CLI. The modal's `Start` button opens a separate Terminal.app window and
leaves all interaction and approval handling to the native CLI. Starting a
session does not change the saved default workspace.

Workspace preferences are stored separately for each provider in this
browser's local storage:

- `New session` starts in the default workspace. An optional single-level
  folder name creates a new child folder and starts there.
- `Continue session` offers up to five unique workspaces previously started
  for that provider, newest first. If there is no recent workspace, it falls
  back to the saved default.

These recent paths identify workspaces, not native CLI session IDs. Browser
site data is the current source of truth; a future native app may replace it
with app-managed data and a generated Markdown summary.

The launch endpoint accepts only the fixed provider commands documented by
the UI. It rejects relative, missing, file, and filesystem-root base
workspaces. New folder names cannot be absolute, nested, `.` or `..`, and an
existing name is never overwritten or reused. The endpoint does not accept
custom arguments or permission-bypass flags and does not track or stop the
Terminal process after launch. Non-macOS launch requests return an
unsupported-platform error without creating a folder.

`POST /api/workspaces/validate` applies the same base-workspace validation
without opening Terminal.app.

## Verification

```bash
.venv/bin/pytest backend
cd frontend
npm test
npm run build
```

The tests mock CLI discovery and never invoke the real tools installed on the
machine.
