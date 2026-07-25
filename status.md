# AgentOS Console — 工作交接狀態

最後更新：2026-07-25

## 下次對話直接使用

```text
請先讀取 status.md。LOO-8 與 PR #4 已完成；下一步使用 $finn-spec
確認下一階段 Tauri App 規格，不要直接開始實作。
```

LOO-8 已完成 Tauri App-managed workspace JSON、generated Markdown、
localStorage migration 與 recovery 行為，PR #4 已通過 `$finn-review`
並合併。目前沒有下一項 agent-ready issue。

## Source of truth

- Workspace：`/Users/zackchiu/CodexCLI/agentsconsole`
- Git branch：`main`
- 最新合併基線：`400f2af LOO-8 Add app-managed workspace storage (#4)`
- 最近完成的 Linear issue：`LOO-8 將 Tauri workspace preferences 遷移至 App-managed JSON 與 Markdown`
- LOO-8 URL：<https://linear.app/loopent/issue/LOO-8/將-tauri-workspace-preferences-遷移至-app-managed-json-與-markdown>
- LOO-8 狀態：`Done`
- LOO-8 label：`agent-ready`
- LOO-8 assignee：Zack Chiu
- LOO-8 relation：`blocked by LOO-7`；LOO-7 已 Done
- LOO-8 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/4>
- PR #4 狀態：Merged
- PR #4 merge commit：`400f2afb0aee85e89b97ab1c6ead26d04a5e335d`
- PR #4 review：`loop-approved`
- PR #4 required check：`smoke` — `SUCCESS`
- PR #4 CI run：<https://github.com/konicatc-techcoding/agentsconsole/actions/runs/30148237277/job/89654018425>
- LOO-8 implementation commit：`cd22466 feat: add app-managed workspace storage`
- LOO-6 Linear 狀態：`Done`
- LOO-6 Linear URL：<https://linear.app/loopent/issue/LOO-6/從-provider-卡片在-macos-terminal-啟動-cli-session>
- LOO-6 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/2>
- PR #2 狀態：Merged
- PR #2 merge commit：`5c776d2c0203942f5aa168695c05bf2bad5ec3df`
- 最近完成的 Linear issue：`LOO-7 建立 macOS Tauri Foundation 並保留 Web runtime`
- LOO-7 URL：<https://linear.app/loopent/issue/LOO-7/建立-macos-tauri-foundation-並保留-web-runtime>
- LOO-7 狀態：`Done`
- LOO-7 label：`agent-ready`
- LOO-7 assignee：Zack Chiu
- LOO-7 relation：`blocked by LOO-6` 關聯仍保留；LOO-6 已 Done，前置條件已完成
- LOO-7 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/3>
- PR #3 狀態：Merged
- PR #3 merge commit：`ea58a5401a33dda177d269408e8ab8849efd268f`
- PR #3 review：`loop-approved`
- PR #3 required check：`smoke` — `SUCCESS`
- PR #3 CI run：<https://github.com/konicatc-techcoding/agentsconsole/actions/runs/30100603737/job/89505379949>
- Implementation commit：`05d499c feat: add Tauri macOS foundation`
- 上一項 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/1>
- 上一項 PR 狀態：Merged
- 上一項 merge commit：`1889625f1a08afda6e494827a2dc0256c8468215`
- PR #2 required check：`smoke` — `SUCCESS`
- PR #2 implementation CI run：<https://github.com/konicatc-techcoding/agentsconsole/actions/runs/30077709874/job/89432038401>
- 本機 `main` 已同步至 `origin/main`

## LOO-5 基線內容

- FastAPI `GET /api/providers`，固定偵測：
  - Hermes CLI：`hermes`
  - Codex CLI：`codex`
  - Claude CLI：`claude`
  - Antigravity CLI：`agy`
- 使用 PATH、`--version` argument array 與 timeout 做唯讀偵測。
- 單一 CLI 缺失、失敗或 timeout 不影響其他 provider。
- 正確略過 Codex 版本前的警告行。
- React/Vite 英文介面顯示四張 provider 卡片。
- 顯示 available/unavailable、版本、命令及可展開的執行檔路徑。
- Provider 選擇只存在 React 記憶體；重新載入頁面會清除。
- `Refresh` 重新偵測，但不重新載入整頁。
- 沒有 Run、Create task、terminal、prompt submission 或其他 CLI 執行功能。
- README 與服務限制為 localhost。
- 未修改 `/Users/zackchiu/dev/AgenticOS-UI`。

## 驗證結果

- Backend tests：7 passed
- Frontend tests：5 passed
- Frontend production build：passed
- Python dependency check：passed
- npm production audit：0 vulnerabilities
- `git diff --check`：passed
- 實機瀏覽器驗證：
  - 四個真實 CLI 都顯示 Available
  - Codex 選擇與路徑展開正常
  - Refresh 正常
  - 完整重新載入後選擇清除
  - Browser console 無錯誤

Backend 測試有一則 Starlette TestClient 的 upstream deprecation warning，
不影響測試結果或 runtime。

## LOO-6 實作內容

LOO-6 已加入從每張可用 provider 卡片啟動 macOS Terminal.app 的功能：

- 卡片保留 `Launch` 開啟 modal，modal 最後動作改為 `Start`／`Starting…`。
- 移除與卡片高亮重複的首頁 `SESSION SELECTION` 欄。
- 首頁主標題改為帶柔和光暈的 `AI Agent Console`，移除舊的
  `LOCAL CONTROL PLANE` 品牌列，並將 Refresh 放在 Read-only discovery
  上方，使主要內容與 provider grid 向上移；卡片尺寸與四欄結構不變。
- 每個 provider 分別將 Default Workspace 與最近五個 Workspace
  保存於目前 browser origin 的 localStorage。
- Default Workspace 必須明確按 `Save` 才會更新；Save 會先呼叫 backend
  驗證路徑，但不會啟動 Terminal 或 CLI。
- `Start` 不會自動改寫 Default Workspace。
- `New session` 使用有效的 Default Workspace，並可選擇安全建立一層
  New Folder；不覆寫或重用既有名稱。
- `Continue session` 可選同 provider 最近成功啟動的五個 Workspace；
  去除重複、最新優先，沒有最近紀錄時退回 Default Workspace。
- 舊版 `lastStartedWorkspace` localStorage 資料會遷移為 recent workspace。
- 每次開啟獨立 Terminal 視窗，使用固定且不可自訂的 CLI 命令。
- 保留各 CLI 原生互動與 approval 流程。
- 本階段不重寫 UI、不內嵌 terminal、不追蹤 CLI process。
- Recent workspace 只記錄路徑，不是 CLI 原生 session ID registry。
- 未來 native app 可改用 app-managed JSON 作為資料來源，再產生 Markdown
  摘要；本次 Web 階段不建立本機 JSON/Markdown。
- Backend 保留最小跨平台 launcher 邊界，但只實作 macOS。

完整 acceptance criteria、non-goals 與驗證方式以 Linear `LOO-6` 為準。

## LOO-6 驗證結果

- Backend tests：34 passed
- Frontend tests：15 passed
- Frontend production build：passed
- `git diff --check`：passed
- 實機瀏覽器驗證：
  - 四個真實 CLI 都顯示 Available 與 Launch
  - 首頁不再顯示重複的 `SESSION SELECTION`
  - New/Continue 欄位切換、Save/Start 文案與 modal 版面正常
  - Save 路徑驗證成功，Continue 顯示 Recent workspace selector
  - 精簡首頁標題列、Refresh 位置與光暈顯示正常，內容向上移且卡片不受影響
  - 自動測試確認 per-provider 隔離、reload 持久化、舊資料遷移、
    recent-five 去重排序、Save/Start 鎖定、Continue fallback，以及
    browser storage 寫入失敗時不會假報 Default Workspace 保存成功
  - Browser console 無 warning 或 error
- Runtime schema 驗證：
  - 已重新啟動 backend
  - OpenAPI `LaunchRequest` 已包含選填 `new_folder`
  - `POST /api/workspaces/validate` 可獨立驗證並解析 workspace 路徑
- 實機 Terminal 驗證：
  - 原始 LOO-6 驗證已確認 Codex 在獨立 Terminal tty 啟動
  - 原始驗證的 Codex process cwd 為 `/Users/zackchiu/CodexCLI/agentsconsole`
  - 本次沒有額外啟動真實 CLI；新增 folder 行為由 backend 測試覆蓋

Backend 測試仍有一則 Starlette TestClient 的 upstream deprecation warning，
不影響測試結果或 runtime。

## LOO-7 Tauri Foundation

LOO-7 已完成實作：

- 使用 Tauri 2 建立 macOS App shell，沿用現有 React/Vite UI。
- App 名稱為 `AgentOS Console`，bundle identifier 為
  `com.konicatc.agentos-console`。
- 主視窗預設 `1280 × 900`，最小 `960 × 700`，可自由縮放。
- 建立 runtime adapter：Web 繼續呼叫 FastAPI；Tauri 改呼叫 typed Rust
  commands，React component 不直接處理 transport。
- Rust 承接 Provider discovery、workspace validation 與固定
  Terminal.app launch；Tauri runtime 不依賴 FastAPI。
- Web runtime、FastAPI 與現有 localStorage schema 均保留。
- Rust 使用官方 `rustup` stable；本機已安裝並驗證 `rustc 1.97.1`、
  `cargo 1.97.1` 與 `aarch64-apple-darwin` target。
- Rust Provider discovery 保留 PATH 實際命中的 executable path，不將
  Codex symlink 改寫成內部 standalone release path。
- Tauri capability 僅使用 core default；App 只註冊三個固定 commands，
  沒有 shell 或 filesystem plugin。
- 本階段不做 embedded PTY、2×2 terminal 版面、App-managed JSON/Markdown
  storage、跨平台、簽署、公證或 updater。

完整 acceptance criteria、non-goals 與驗證方式以 Linear `LOO-7` 為準。

## LOO-7 驗證結果

- Rust tests：13 passed
- Frontend tests：18 passed
- Backend tests：34 passed
- Frontend production build：passed
- Unsigned Tauri macOS `.app` build：passed
- 真實 Tauri App smoke（未啟動 FastAPI）：
  - `AI Agent Console` 首頁與既有四張卡片正常
  - 四個 Provider 均為 Available
  - Codex executable path 為 `/Users/zackchiu/.local/bin/codex`
  - filesystem root Save 安全拒絕
  - 有效 workspace Save 成功
  - Codex New 與 Continue 均成功在 Terminal.app 啟動
  - recent workspace selector 正常帶入啟動過的 workspace
- Web runtime smoke：
  - 四個 Provider 均為 Available
  - FastAPI workspace Save 與 Codex Launch 成功
  - Browser console 無 warning 或 error

## LOO-8 App-managed workspace storage

LOO-8 已完成實作：

- Tauri 在 macOS App Data 目錄使用 `workspace-preferences.json` 作為唯一
  source of truth，並單向產生 `workspace-preferences.md`。
- Version 1 schema 固定保存四個 Provider 的 Default Workspace 與最多五個
  recent workspace，不保存 CLI session ID、prompt、output 或完整歷史。
- JSON 不存在時才讀取並遷移 Tauri origin 的舊 localStorage；兩個檔案都
  寫入成功後才刪除舊 key，JSON 已存在時不讀取或合併舊資料。
- App 啟動時同步載入 Provider 與 storage；preferences ready 前 Launch
  停用，Refresh 可在外部修復 JSON 後重新載入。
- 損壞或 schema 無效的 JSON 會保留原檔並顯示完整路徑，不會被 Save／Start
  覆寫。
- Save 驗證成功後才同步更新 JSON／Markdown；成功 launch 後才更新 recent。
- Terminal 已成功啟動但 history 保存失敗時，保留 launch success 並顯示
  獨立 warning。
- Web runtime 繼續使用 browser localStorage，與 Tauri App Data 不同步。
- Tauri capability 仍只有 `core:default`，沒有通用 filesystem 或 shell
  plugin。

## LOO-8 驗證結果

- Backend tests：34 passed
- Frontend tests：25 passed
- Rust tests：21 passed
- Frontend production build：passed
- Unsigned Tauri macOS `.app` build：passed
- `cargo fmt --all --check`：passed
- `git diff --check`：passed
- `cargo clippy`：本機 stable toolchain 未安裝選配 clippy component，因此
  未執行，也未為此修改 toolchain 或 dependency。
- 未對真實 App Data 執行 migration smoke，避免未經額外 backup／restore
  決策就改動使用者現有 preferences；Rust 測試以暫存目錄覆蓋初始化、
  migration normalization、JSON precedence、損壞檔保留、Markdown
  regeneration 與寫入 rollback。

## 本機預覽方式

Terminal 1：

```bash
cd /Users/zackchiu/CodexCLI/agentsconsole
.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Terminal 2：

```bash
cd /Users/zackchiu/CodexCLI/agentsconsole/frontend
npm run dev
```

瀏覽器開啟：<http://127.0.0.1:5173>

停止時在兩個 Terminal 分別按 `Control + C`。

## 接續流程

1. 使用 `$finn-spec` 確認下一階段 Tauri App 的範圍與順序。
2. 規格確認並建立 issue 後，由使用者明確加上 `agent-ready`，再交給
   `$finn-build`。
3. 在新 issue 建立前，不直接實作下一階段功能。

## 本檔注意事項

`status.md` 是納入 Git 追蹤的開發進度與工作交接文件。功能狀態、active
issue 或接續流程改變時應同步更新；不得用它取代 Linear issue 的完整規格。
