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
existing absolute workspace path and start either a new session or the most
recent session for that provider. A successful request opens a separate
Terminal.app window in the selected workspace and leaves all interaction and
approval handling to the native CLI.

The launch endpoint accepts only the fixed provider commands documented by
the UI. It rejects relative, missing, file, and filesystem-root workspaces,
does not accept custom arguments or permission-bypass flags, and does not
track or stop the Terminal process after launch. Workspace selection stays in
React memory and resets on a full page reload. Non-macOS launch requests return
an unsupported-platform error.

## Verification

```bash
.venv/bin/pytest backend
cd frontend
npm test
npm run build
```

The tests mock CLI discovery and never invoke the real tools installed on the
machine.
