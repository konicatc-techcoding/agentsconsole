# AgentOS Console

A local control surface for discovering the AI command-line tools installed
on this Mac. It runs either as a browser-based React/FastAPI application or as
a native Tauri 2 macOS application using the same React UI. It can detect and
select a provider, then open its native interactive CLI in Terminal.app. It
does not send prompts or manage launched processes.

## Requirements

- Python 3.12 or newer
- Node.js 22 or newer
- macOS with Xcode command-line build tools
- For the native app, stable Rust installed through official
  [rustup](https://rustup.rs/), not Homebrew
- Any of the supported CLIs available on the active runtime's `PATH`:
  `hermes`, `codex`, `claude`, or `agy`

Install the frontend dependencies once:

```bash
cd frontend
npm install
```

## Web mode

Start FastAPI from the repository root:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e "./backend[dev]"
.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

The provider endpoint is available at
`http://127.0.0.1:8000/api/providers`.

In another terminal, start Vite:

```bash
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` requests to the local
FastAPI server.

## Tauri macOS mode

Install the official stable toolchain and verify the native target:

```bash
rustup toolchain install stable --profile minimal
rustup component add rustfmt
rustc --version
cargo --version
rustup target list --installed
```

Start the native development app from `frontend/`:

```bash
cd frontend
npm run tauri:dev
```

Tauri starts the Vite development server itself. Do not start FastAPI for this
mode: Provider discovery, workspace validation, and fixed Terminal.app launch
are handled by typed Rust commands inside the app.

Build an unsigned macOS application:

```bash
cd frontend
npm run tauri:build
```

The app is written to
`src-tauri/target/release/bundle/macos/AgentOS Console.app`. This build does
not sign, notarize, create a DMG, or configure an updater.

## Launching a CLI

On macOS, each available provider card has a `Launch` button. Choose an
existing absolute default workspace and select how the provider should start.
Use `Save` to validate and persist the default workspace without starting a
CLI. The modal's `Start` button opens a separate Terminal.app window and
leaves all interaction and approval handling to the native CLI. Starting a
session does not change the saved default workspace.

- `New session` starts in the default workspace. An optional single-level
  folder name creates a new child folder and starts there.
- `Continue session` offers up to five unique workspaces previously started
  for that provider, newest first. If there is no recent workspace, it falls
  back to the saved default.

These recent paths identify workspaces, not native CLI session IDs. Web and
Tauri keep separate preferences and do not synchronize:

- Web mode continues to use the current browser origin's local storage.
- Tauri mode uses `workspace-preferences.json` as its source of truth and
  generates `workspace-preferences.md` as a human-readable summary. On macOS,
  both are under
  `~/Library/Application Support/com.konicatc.agentos-console/`.

On the first Tauri launch without a JSON file, the app migrates the existing
WebView-origin `agentos-console.workspace-preferences.v1` value. The old key is
removed only after both App-managed files are written successfully. Once JSON
exists it always wins; residual local storage is not merged.

Do not edit the generated Markdown to change app state. If the JSON file is
invalid, the app preserves it, shows its full path, and disables Save and
Start. Fix, rename, or delete that JSON outside the app, then use `Refresh` to
retry. Missing workspace paths remain in history until a later Save or Start
validates them. If Terminal launches but the history write fails, the launch
remains successful and the app displays a separate history warning.

Both runtimes accept only the fixed provider commands documented by the UI.
They reject relative, missing, file, and filesystem-root base workspaces. New
folder names cannot be absolute, nested, `.` or `..`, and an existing name is
never overwritten or reused. Neither runtime accepts custom arguments or
permission-bypass flags, and neither tracks or stops the Terminal process
after launch. The Web backend retains its non-macOS unsupported-platform
boundary.

`POST /api/workspaces/validate` applies the same base-workspace validation
without opening Terminal.app.

## Verification

```bash
.venv/bin/pytest backend
cd frontend
npm test
npm run build
cd ../src-tauri
cargo test
cd ../frontend
npm run tauri:build
```

The automated tests mock CLI discovery and Terminal launch. They never invoke
the real tools installed on the machine. Manual Tauri verification should be
performed without FastAPI running and should cover real discovery, valid and
invalid Save, and one New and Continue launch.
