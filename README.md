# AgentOS Console

A localhost-only control surface for discovering the AI command-line tools
installed on this Mac. This first slice is intentionally read-only: it can
detect and select a provider, but it cannot launch a task or send a prompt.

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

## Verification

```bash
.venv/bin/pytest backend
cd frontend
npm test
npm run build
```

The tests mock CLI discovery and never invoke the real tools installed on the
machine.
