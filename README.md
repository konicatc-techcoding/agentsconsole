# AgentOS Console

A local control surface for discovering the AI command-line tools installed
on this Mac. It runs either as a browser-based React/FastAPI application or as
a native Tauri 2 macOS application using the same React UI. Web mode can open
a selected provider in Terminal.app. Tauri mode additionally provides four
independent embedded terminals backed by managed PTY sessions.

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

Tauri mode also uses a Console-oriented shell with a compact title, a
collapsible Provider sidebar, and four layout slots. All four Slots contain an
embedded xterm terminal backed by the native multi-session PTY engine. Sidebar
launches continue to open independently in Terminal.app.
Slot assignments are stored separately in
`console-layout.json` under the same App Data directory:

- A missing file is initialized with Hermes, Codex, Claude, and Antigravity in
  Slot 1 through Slot 4.
- Multiple slots may use the same Provider because each slot keeps its own
  fixed identity.
- Changing a slot creates an in-app draft. Use `Save Layout` to persist it;
  `Refresh` remains disabled until the draft is saved or manually reverted.
- An unsaved Slot Provider may still be started in its embedded terminal.
  Starting it does not save the draft layout.
- An invalid layout file is preserved and reported with its full path. Fix,
  rename, or delete it outside the app, then use `Refresh`.

The Tauri header can collapse the Provider sidebar so the Console uses the
full window width. It also provides `All` and Slot 1 through Slot 4 view
controls:

- `All` restores the fixed 2×2 order.
- Selecting one Slot fills the Console; two Slots split left to right in
  selection order.
- With three Slots, the first selected Slot fills the left side while the next
  two stack on the right.
- Selecting all four Slots uses the fixed 2×2 order but retains the custom
  selection queue, so removing one restores the expected three-Slot priority.
- At least one Slot remains visible. Hidden Slots stay mounted and continue
  running, receiving output, and reporting their lifecycle phase in the header.
  Showing one again preserves its terminal buffer and refits it to the new size.

Sidebar and Slot view choices are in-memory UI state. `Refresh` preserves them,
but reopening or reloading the App restores the expanded sidebar and `All`.
They are not written to Console layout or workspace preference storage.

Each Slot also reports whether it needs attention. A Slot whose terminal does
not hold keyboard focus is marked when it receives new output, and marked
differently when its session exits or fails. The header's Slot controls carry
both marks, and are the only indication for a hidden Slot. Stopping a session
yourself does not mark it. A mark clears once that Slot is both visible and its
terminal holds keyboard focus, so in the `All` layout only the Slot you click
into clears. These marks are separate from the existing lifecycle phase dot, are
in-memory like the Slot view choices, and are never persisted.

The terminal frame itself answers only the first of those two questions. A
visible Slot that received output while unfocused is ringed with a glow, bright
enough to catch from across the window; it pulses three times when it first
appears, waiting a moment beforehand so that revealing a hidden Slot does not
pulse while the layout is still moving, and then holds steady. A continuously
chatty CLI pulses once, not forever, and Reduce Motion keeps the glow while
dropping the pulse. An ended session deliberately gets no frame glow at all:
carrying both marks on the frame reads as noise rather than signal. Because the
end of a session takes precedence over its output, a glowing Slot goes dark the
moment its session ends — the mark moves to the header rather than disappearing.

Command+1 through Command+4 move keyboard focus between terminals by screen
position rather than by Slot identity. Command+1 focuses the leftmost visible
terminal, Command+2 the next, and so on in the same left-to-right, top-to-bottom
order the layout uses above. In the `All` layout those numbers line up with Slot
1 through Slot 4, but a custom layout follows the visible order instead, so with
Slot 3, Slot 1, and Slot 4 selected, Command+2 focuses Slot 1. Each visible
Slot's title bar carries its current number as a badge that updates with the
layout. A number beyond the visible count does nothing, and these keys never
change the layout, so a hidden Slot cannot be reached this way. A Slot with no
session running can still be focused. Command+0 restores the `All` 2×2 layout
and leaves keyboard focus where it was. The Console consumes all five
combinations, so none reaches a CLI and none triggers the WebView's own
Command+0 zoom reset, and all five do nothing while a dialog is open. The
terminal currently holding keyboard focus is drawn with an outline, kept
visually separate from the attention marks above. Focus is in-memory like the
other view choices.

Each Slot's title bar is tinted with its Provider's own colour and carries a
matching accent bar on its left edge, so the four Slots stay distinguishable at
a glance. The colour follows whichever Provider is currently selected in that
Slot, including an unsaved layout draft, and applies even when that Provider is
unavailable, because it identifies the Provider rather than its status. Several
Slots running the same Provider share the same colour.

Web mode keeps the existing Provider card page and never reads, writes, or
synchronizes `console-layout.json`. Provider colours are Console-only and do not
apply to the Provider cards.

The embedded terminal reuses the existing New/Continue workspace dialog and
starts the selected Provider in that Slot. An optional Session name (up to 48
characters) identifies the work in the Header, terminal title, and global
session dialog. Blank names use `Provider · workspace-folder`. Names are
in-memory only: `Refresh` preserves them, while an App reload clears them.
Stopped, exited, and failed sessions retain their name for Start again; changing
an inactive Slot's Provider clears it.

The Tauri Header also shows the number of Starting, Running, or Stopping
sessions and a matching `Stop All` action. Its confirmation dialog lists each
active Slot's name, Provider, workspace, and phase. `已完成 — Stop All` attempts
to stop every active embedded session without closing the App, reports partial
failures, and can retry the remaining sessions. A session already Starting is
allowed to finish starting before Stop; a session already Stopping reuses its
existing stop operation.

For unfinished work, select the Starting or Running sessions in that dialog and
choose `未完成 — 先更新 status.md`. The App sends this prompt plus Enter to each
selected terminal:

```text
請在目前 workspace 新增或更新 status.md，記錄已完成項目、未完成項目、驗證結果與下一步。不要 commit 或 push；完成後回覆 STATUS_READY。
```

Delivery is reported independently as Queued, Sent, or Failed. Starting
sessions queue the prompt until their PTY is ready, and failed deliveries can
be retried. A shared-workspace warning is informational and does not block
sending. `Sent` confirms terminal input delivery only: the App does not inspect
`STATUS_READY`, edit `status.md`, or perform Git actions.

The header also carries a global terminal font size control. It starts at 16px
and steps by 1px between 10px and 20px, with the matching button disabled at
each end. A change applies to all four Slots at once, including hidden ones, and
each terminal keeps its existing output and scrollback across the change while
its running session is resized to the new rows and columns. The size is
in-memory: `Refresh` preserves it and an App reload returns to 16px.

Command+F searches that Slot's own output. The search bar floats over the
terminal, so opening or closing it never resizes the terminal or the running
session. Typing highlights every match and moves to the first one; Enter and
Shift+Enter cycle forward and backward, and the current match is marked
distinctly from the others so it stays findable on a crowded screen. A term with
no match is shown as such. Command+F while the bar is already open returns the
keyboard to the input without altering the existing term, and Escape closes the
bar and hands focus back to the terminal. Search works on stopped and exited
terminals as long as their output is still there, each Slot searches
independently, and the bar's state is in-memory only.

`http` and `https` addresses in terminal output open in the system browser on
Command+Click. A plain click never opens anything, so placing the cursor and
dragging a selection keep working as before. Both kinds of terminal link are
covered: the plain-text addresses a CLI prints, and the OSC 8 hyperlinks a CLI
declares through escape sequences. Nothing else is treated as a link — other
schemes and bare domains stay plain text — and the scheme is checked again
before anything is opened, so a link can never navigate the Console away from
itself.

Each terminal renders ordered ANSI output, sends raw keyboard input and control
sequences, supports Command+C/Command+V, fits to window resizes, and keeps 5,000
lines of scrollback. Each Slot independently reports Idle, Starting, Running,
Stopped, Exited, or Error. Stop terminates that Slot's PTY process tree while
preserving visible output; Start again opens the session dialog again.

The PTY remains exposed only through fixed typed Tauri commands. It accepts
one of the fixed Slot IDs from Slot 1 through Slot 4, one of the four registered
Providers, the existing New/Continue mode, a validated workspace, and terminal
rows/columns. It does not accept an executable, shell command, custom arguments,
environment settings, or permission-bypass flags. Each Slot can run at most one
embedded session, for a maximum of four concurrent sessions. Input and output
remain binary-safe, resize is supported, and stale or cross-Slot session IDs are
rejected. Stop or app shutdown terminates the relevant PTY process trees.
Closing or reloading while sessions are active requires one confirmation and
cleanup of every active Slot. Output and process identifiers are not persisted,
so a reopened App starts with every Slot at Idle. Web mode has no PTY commands,
and the existing Terminal.app launcher remains independent.

A Slot otherwise inherits the App's environment, with one exception: the Claude
Slot does not receive `CLAUDE_CODE_CHILD_SESSION`. Claude Code sets that marker
on processes it starts, and a `claude` CLI that sees it treats itself as a child
session and stops saving its transcript — so an App launched from a Claude Code
session would hand its Claude Slot a CLI that silently keeps no history, and
Continue would later reconnect to a conversation missing everything said through
the App. The variable is removed rather than blanked, only for the Claude Slot,
and every other variable is passed through untouched.

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
invalid Save, one New and Continue launch, a named embedded session, selective
status handoff delivery, and Stop All with the App remaining open.

Continuous integration runs two required checks on every pull request. `smoke`
runs the backend and frontend tests plus the frontend build on Linux, and
`rust` runs `cargo fmt --all --check` and `cargo test` on macOS. Neither the
unsigned `.app` build nor manual Tauri verification runs in CI.
