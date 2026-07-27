# AgentOS Console — 工作交接狀態

最後更新：2026-07-27

## 下次對話直接使用

```text
請先讀取 status.md。LOO-12 至 LOO-17 已依序合併；四個 Slot 已完成
embedded terminal rollout、自適應版面、Session 顯示名稱、全域 Stop All、
status.md handoff 與 Slot 注意力指示。Finn-loop 三個 skill 已安裝於
.claude/skills，綁定 Linear team LOO。下一步完成 README／status 文件
commit、push 後，執行 /finn-spec 建立下一個規格。
```

LOO-12 將 PTY engine 擴展為最多四個獨立 session 並啟用 Slot 2；
LOO-13、LOO-14 接續啟用 Slot 3、4。Tauri 目前四格皆支援完整
Start／Stop／retry、clipboard、resize 與關閉清理；外部 Terminal.app
Launch、Web runtime、workspace storage 與 Console layout schema 維持不變。
LOO-15 加入可收合 Sidebar 與 queue-driven 自適應 Slot 版面；隱藏中的
terminal component 與 CLI session 仍持續運作。
LOO-16 加入全域 active session 計數、可處理 Starting／Running／Stopping
的 Stop All、可選 session 的 status.md handoff，以及只存在 React 記憶體
的 Session 顯示名稱。
LOO-17 加入 Slot 注意力指示：未持有鍵盤焦點的 Slot 收到新輸出或 session
結束時，以終端邊框光暈與 Header 標記提示，兩者皆只存在 React 記憶體。
本輪並安裝 Finn-loop 的 finn-spec／finn-build／finn-review 三個 skill，
LOO-17 是第一個完全由該流程產出的 issue 與 PR。

## Source of truth

- Workspace（Codex 原始開發區）：
  `/Volumes/1TBM2/AI_Drive/Codex_Projects/agentsconsole`，branch `main`
- Workspace（Claude Code 工作區）：
  `/Volumes/1TBM2/AI_Drive/ClaudeCode_Projects/agentsconsole`；每個 issue
  各自從預設分支開工作分支，Finn-loop builder 使用 `LOO-NNN-short-slug`。
  本 repo 以 squash merge 合併，長期分支重複使用會需要 force-push，因此
  合併後即丟棄工作分支。
- 兩個 workspace 是同一個 repo 的 git worktree，兩邊都可以繼續開發。
  `status.md` 為共用追蹤檔案，任一邊的修改合併後都會影響另一邊；同一個
  分支無法同時在兩個 worktree checkout，切換開發環境時先合併回 `main`，
  再於另一個 worktree `git pull`。
- 最新合併基線：`9146473 feat: add slot attention indicators (#16)`
- Finn-loop：`.claude/skills` 已安裝 finn-spec／finn-build／finn-review，
  綁定 Linear team `LOO`；GitHub labels `loop-approved`、
  `loop-changes-requested`、`needs-human-review` 均已建立
- 目前 Linear issue：無；下一步使用 `/finn-spec` 建立新規格
- 最近完成的 Linear issue：`LOO-17 新增 Slot 注意力指示，標記需要處理的 embedded session`
- LOO-17 URL：<https://linear.app/loopent/issue/LOO-17/新增-slot-注意力指示標記需要處理的-embedded-session>
- LOO-17 狀態：`Done`
- LOO-17 label：`agent-ready`
- LOO-17 assignee：Zack Chiu
- LOO-17 blocker：無
- LOO-17 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/16>
- PR #16 狀態：Merged
- PR #16 merge commit：`9146473a809a3a19fc961a201524696dff55aa39`
- PR #16 review：`loop-approved`（由 `finn-review` 產生）
- PR #16 required check：`smoke` — `SUCCESS`
- 前一個完成的 Linear issue：`LOO-16 新增全域 Stop All、Session 顯示名稱與 status handoff`
- LOO-16 URL：<https://linear.app/loopent/issue/LOO-16/新增全域-stop-allsession-顯示名稱與-status-handoff>
- LOO-16 狀態：`Done`
- LOO-16 label：`agent-ready`
- LOO-16 assignee：Zack Chiu
- LOO-16 blocker：無
- LOO-16 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/12>
- PR #12 狀態：Merged
- PR #12 merge commit：`54a88cd4c4aa8b884ebc0cdf013024381f000187`
- PR #12 required check：`smoke` — `SUCCESS`
- 前一個完成的 Linear issue：`LOO-15 新增可收合 Sidebar 與可選 Slot 的自適應 Console 版面`
- LOO-15 URL：<https://linear.app/loopent/issue/LOO-15/新增可收合-sidebar-與可選-slot-的自適應-console-版面>
- LOO-15 狀態：`Done`
- LOO-15 label：`agent-ready`
- LOO-15 assignee：Zack Chiu
- LOO-15 blocker：無
- LOO-15 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/11>
- PR #11 狀態：Merged
- PR #11 merge commit：`ea7fa517fe0a16f8d3f6a62c17e355ef207505d7`
- PR #11 review：`loop-approved`
- PR #11 required check：`smoke` — `SUCCESS`
- 前一個完成的 Linear issue：`LOO-14 啟用 Slot 4 embedded terminal 並完成四格獨立互動`
- LOO-14 URL：<https://linear.app/loopent/issue/LOO-14/啟用-slot-4-embedded-terminal-並完成四格獨立互動>
- LOO-14 狀態：`Done`
- LOO-14 label：`agent-ready`
- LOO-14 assignee：Zack Chiu
- LOO-14 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/10>
- PR #10 狀態：Merged
- PR #10 merge commit：`8102c195b01ce8d580ae5cb832ee152a3494cae1`
- PR #10 required check：`smoke` — `SUCCESS`
- 前一個完成的 Linear issue：`LOO-13 啟用 Slot 3 embedded terminal 與三 Slot 獨立互動`
- LOO-13 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/9>
- PR #9 merge commit：`e980e1df4e8dc2210ec863752d4c001625fec482`
- PR #9 required check：`smoke` — `SUCCESS`
- 前一個完成的 Linear issue：`LOO-12 擴展 multi-session PTY engine 並啟用 Slot 2 embedded terminal`
- LOO-12 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/8>
- PR #8 merge commit：`943d8d6585d478fac28f22a32bd2cc38a592b8b3`
- PR #8 required check：`smoke` — `SUCCESS`
- LOO-11 Linear issue：`建立 Slot 1 embedded terminal UI 與完整互動生命週期`
- LOO-11 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/7>
- PR #7 merge commit：`fb5645a70bc3a64e6a7ecc417e8180b4cf4d3a19`
- 前一個完成的 Linear issue：`LOO-10 建立 Slot 1 embedded terminal 的 Rust PTY session engine`
- LOO-10 URL：<https://linear.app/loopent/issue/LOO-10/建立-slot-1-embedded-terminal-的-rust-pty-session-engine>
- LOO-10 狀態：`Done`
- LOO-10 label：`agent-ready`
- LOO-10 assignee：Zack Chiu
- LOO-10 relation：`blocked by LOO-9`；LOO-9 已 Done；LOO-10 blocks LOO-11
- LOO-10 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/6>
- PR #6 狀態：Merged
- PR #6 merge commit：`7b9565d551a8b78d8fc23ed78ace8f4fbbd219a5`
- PR #6 review：`loop-approved`
- 最近完成的 Linear issue：`LOO-9 建立 Tauri Console 佈局與可保存的四 Slot Provider 配置`
- LOO-9 URL：<https://linear.app/loopent/issue/LOO-9/建立-tauri-console-佈局與可保存的四-slot-provider-配置>
- LOO-9 狀態：`Done`
- LOO-9 label：`agent-ready`
- LOO-9 assignee：Zack Chiu
- LOO-9 relation：`blocked by LOO-8`；LOO-8 已 Done
- LOO-9 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/5>
- PR #5 狀態：Merged
- PR #5 merge commit：`95d61ff9de33deefae01cf95c6213926e0138433`
- PR #5 review：`loop-approved`
- PR #5 required check：`smoke` — `SUCCESS`
- PR #5 CI run：<https://github.com/konicatc-techcoding/agentsconsole/actions/runs/30152494047/job/89665112674>
- LOO-9 implementation commit：`3b9f0f6 feat: add Tauri console slot layout`
- LOO-9 handoff commit：`822d15d docs: record LOO-9 review handoff`
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

## LOO-9 Tauri Console 佈局

LOO-9 已完成實作，PR #5 已通過 `$finn-review` 並合併：

- Tauri 使用緊貼標題字高、帶既有光暈的 `AI Agent Console` header。
- Header 下方為固定 200px sidebar 與佔滿剩餘區域的 2×2 Console grid；
  既有最小視窗 960×700 維持四格，不改成單欄。
- Sidebar 頂部固定 Refresh 與 Read-only discovery，中段四個 Provider 可獨立
  捲動，底部固定保存狀態與 `Save Layout`。
- 四個固定 Slot 各自保存 Provider mapping，允許多個 Slot 指派相同
  Provider；目前只顯示 `Embedded terminal coming next`，不建立 process 或
  Running 狀態。
- Tauri App Data 新增獨立 version 1 `console-layout.json`，只保存 exactly
  four `slotId`／`providerId`，不修改 workspace schema 或 Markdown。
- Slot 修改先形成 draft；未保存時顯示 `Unsaved changes` 並停用 Refresh。
  `Save Layout` 明確保存，失敗時保留 draft 與上一份有效 JSON。
- 無效 JSON 保留原檔與完整路徑，顯示 locked default fallback；外部修復後
  可用 Refresh 重試。
- Sidebar Launch 完整沿用既有 modal、Default Workspace、New／Continue 與
  外部 Terminal.app；Web runtime 繼續使用原有 Provider 卡片首頁。
- Tauri capability 未加入 generic filesystem 或 shell permission。

## LOO-9 驗證結果

- Backend tests：34 passed（另有一則 upstream Starlette TestClient
  deprecation warning）
- Frontend tests：34 passed
- Rust tests：27 passed
- Frontend production build：passed
- Unsigned Tauri macOS `.app` build：passed
- `cargo fmt --all --check`：passed
- `git diff --check`：passed
- 真實 Tauri App smoke（未啟動 FastAPI）：
  - 最新 bundle 的 compact header、200px sidebar 與全高 2×2 Console 正常
  - Hermes、Codex、Claude、Antigravity 均獨立偵測為 Available
  - Slot 1 與 Slot 2 可同時設為 Codex，Unsaved／Save／Refresh gating 正常
  - 保存後回復預設 mapping，重新啟動仍為 `Saved`
  - Slot 未顯示虛假的 Running／Launched 狀態

## LOO-10 Slot 1 PTY foundation

LOO-10 已完成並透過 PR #6 合併：

- Tauri Rust backend 新增只接受固定 `slot-1` 的 PTY session engine；同時間
  最多一個 active session，session ID 為 opaque 且 stale ID 無法操作新
  session。
- Hermes、Codex、Claude、Antigravity 的 New／Continue 完全沿用既有固定
  launcher mapping，frontend 無法傳入 executable、shell command、自訂
  arguments、environment 或 permission-bypass flags。
- Start 沿用 workspace validation、Provider PATH recheck 與安全的一層 New
  Folder 規則；spawn 失敗時保留已建立資料夾並在 structured error 回報路徑。
- PTY 使用 resolved workspace 作為 cwd，支援 binary-safe ordered output、
  raw input、Ctrl/control sequences、resize、自然 exit 與完整 process-tree
  Stop。
- Review 修正後，Stop 以整個 Unix process group 消失作為成功條件；即使
  leader 已退出，仍會在 grace period 後 SIGKILL 殘留 descendants。PTY
  reader／writer 也會在 spawn child 前完成準備，避免 setup failure 留下
  untracked child。
- frontend event 無法送達或 App backend 結束時執行 cleanup，避免 CLI 成為
  orphan；明確 Stop 的 cleanup failure 會回傳 structured error。
- frontend 只新增 typed Tauri runtime boundary 與 output/exit subscription；
  Web runtime 不提供 PTY；xterm、Start/Stop UI、clipboard 與 close
  confirmation 由後續 LOO-11 實作。
- Start 不寫入 workspace preferences、recent workspaces、console layout、
  Markdown、terminal output、process ID 或 native CLI session ID。
- capability 仍只有 `core:default`；沒有新增 generic shell 或 filesystem
  permission。Sidebar 外部 Terminal.app Launch 保持原行為。

## LOO-10 驗證結果

- Rust tests：38 passed（其中 11 個 PTY fake-adapter／lifecycle tests）
- Frontend tests：36 passed
- Backend tests：34 passed（另有一則 upstream Starlette TestClient
  deprecation warning）
- Frontend production build：passed
- Unsigned Tauri macOS `.app` build：passed
- `cargo fmt --all --check`：passed
- `git diff --check`：passed
- 真實 Tauri UI smoke：LOO-10 階段未執行；其 runtime regression 與 PTY
  lifecycle 由 frontend/Rust fake tests 覆蓋，LOO-11 已補上真實 App smoke。

## LOO-11 Slot 1 embedded terminal UI

LOO-11 已完成、通過 `$finn-review`，並透過 PR #7 合併：

- Tauri Slot 1 使用 `@xterm/xterm` 與 FitAddon 呈現真實 embedded terminal；
  Slot 2–4 仍為 placeholder，Web provider card 頁不變。
- Slot 1 沿用既有 Provider、New／Continue、default workspace、Save、recent
  workspace 與安全 New Folder 規則；未保存的 Slot 1 Provider draft 可直接
  Start，但不會自動保存 layout。
- ordered binary output、raw keyboard/control input、Ctrl+C、Command+C／V、
  5,000 行 scrollback 與視窗 resize 均已接到 typed PTY runtime。
- 狀態包含 Idle、Starting、Running、Stopped、Exited、Error；Stop 後保留
  output，Start again 會重新開啟 session dialog。
- 執行期間只鎖定 Slot 1 Provider selector；sidebar external Launch、Refresh、
  其他 Slot 與 Save Layout 維持各自既有規則。
- 關閉或 Command+R reload 遇到 active session 時先要求確認並停止 process
  tree；unexpected WebView reload 與 backend shutdown 也會清理。重新開啟
  App 不恢復 terminal output、process ID 或 native session。
- capability 維持 `core:default`；關閉 App 透過固定 Rust command 完成，沒有
  新增 generic window、shell 或 filesystem permission。
- Review 修正後，Idle Start、Start again、modal submit 與 submit handler
  共用 Provider／workspace preferences／layout availability gate。

## LOO-11 驗證結果

- Frontend tests：48 passed（App 33、runtime 11、TerminalSlot 4）
- Rust tests：38 passed
- Backend tests：34 passed（另有一則 upstream Starlette TestClient
  deprecation warning）
- Frontend production build：passed（xterm 使主 chunk 產生非阻擋的
  500 kB size warning）
- Unsigned Tauri macOS `.app` build：passed
- `cargo fmt --all --check`：passed
- `git diff --check`：passed
- 真實 Tauri App smoke：
  - 未保存的 Codex Slot 1 draft 可用既有 workspace 啟動，ANSI UI 正常
  - 真實 Codex prompt 輸入／輸出、Ctrl+C、Command+C／V 與 resize 正常
  - Stop、自然 exit、Start again、Continue recent workspace 與 output 保留正常
  - 執行中關閉會確認；`Stop and Close` 後 App 與 CLI child 均消失
  - 重開 App 為乾淨 Idle，沒有恢復舊 output 或 process

## LOO-12–14 Multi-slot embedded terminal rollout

LOO-12、LOO-13、LOO-14 均已完成並透過 PR #8、#9、#10 合併：

- Rust PTY engine 支援固定 `slot-1` 至 `slot-4`，每個 Slot 最多一個 active
  session，全 App 最多四個；所有操作同時驗證 Slot ID 與 opaque session ID。
- 四個 Slot 均使用相同的 embedded terminal 生命週期，並各自保存 phase、
  session、output、terminal size、pending state、reset token 與 error。
- 四格可同時執行相同或不同 Provider；input、output、resize、Stop、自然 exit
  與 Start again 不會跨 Slot。
- 執行中只鎖定該 Slot 的 Provider selector；其他 Slot、外部 Launch 與
  Save Layout 保留既有規則。
- 關閉或 reload 時以單一確認列出所有 active Slots，嘗試停止全部 session；
  部分清理失敗時保留失敗的 Slot 與錯誤資訊。
- Provider-scoped workspace preferences、recent workspace、Console layout
  schema、Web runtime 與 Tauri capability 均未改變。
- 不保存 terminal output、PID、PTY session 或 native CLI session。

## LOO-12–14 最終驗證結果

- Linear：LOO-12、LOO-13、LOO-14 均為 `Done`
- GitHub：PR #8、#9、#10 均已合併，`smoke` required check 均為 `SUCCESS`
- Frontend tests：52 passed
- Backend tests：34 passed（另有一則既有 Starlette TestClient deprecation warning）
- Rust tests：40 passed
- Frontend production build：passed（既有 xterm chunk-size warning 不阻擋）
- Unsigned Tauri macOS `.app` build：PR #8、#9、#10 均 passed
- `cargo fmt --all --check`：passed
- `git diff --check`：passed
- LOO-13 真實 Tauri smoke 已驗證三個 Codex Slot 同時獨立輸入輸出、Stop 與
  關閉清理；LOO-14 以四 Slot 自動化 regression 與 production bundle build
  完成驗證，未另跑四個真實 CLI 同時互動 smoke。

## LOO-15 自適應 Console 版面

LOO-15 已完成、通過 `$finn-review`，並透過 PR #11 合併：

- Tauri Header 新增 Sidebar 展開／收合開關，以及 `All`、Slot 1–4
  顯示控制；Web runtime 維持既有 Provider card 頁面。
- `All` 維持固定 Slot 1／2 在上、Slot 3／4 在下的 2×2；自訂模式依點擊
  queue 顯示一格全畫面、兩格左右、三格主要 Slot 加右側上下排列。
- 自訂模式加入第四格時使用固定 2×2，但保留 queue；移除一格後依原 queue
  恢復三格主次順序，且至少保留一個可見 Slot。
- 隱藏 Slot 僅離開可見版面，React terminal component、phase、session、
  error、workspace 與 terminal buffer 均保留；重新顯示時自動 fit 並
  resize PTY。
- Header Slot 控制持續反映 hidden session 的 lifecycle phase；既有
  Start／Stop／retry、Provider locking、close／reload cleanup 與 stale
  event isolation 維持不變。
- Sidebar 與 Slot view state 只存在 React 記憶體；一般 Refresh 保留，
  App 重開或 reload 回復 Sidebar 展開與 `All`，不修改任何 storage schema。

## LOO-15 驗證結果

- Linear：LOO-15 為 `Done`
- GitHub：PR #11 已合併，`smoke` required check 為 `SUCCESS`
- Frontend tests：56 passed
- Backend tests：34 passed（另有一則既有 Starlette TestClient deprecation warning）
- Rust tests：40 passed
- Frontend production build：passed（既有 xterm chunk-size warning 不阻擋）
- Unsigned Tauri macOS `.app` build：passed
- `cargo fmt --all --check`：passed
- `git diff --check`：passed
- 真實 Tauri App smoke：Hermes 與 Codex 同時 Running；隱藏 Slot 1 時
  session 與 Header phase 持續為 Running，重新顯示後兩個 session 均保持
  Running，最後皆透過 App 正常停止。

## LOO-16 全域 Session 控制與顯示名稱

LOO-16 已完成並透過 PR #12 合併：

- Tauri Header 顯示 Starting、Running、Stopping 的 active session 數量，
  並提供 Tauri-only `Stop All (N)`；沒有 active session 時 disabled。
- Stop All dialog 列出 Slot ID、Session name、Provider、workspace 與 phase；
  `已完成 — Stop All` 平行處理所有 active sessions，不關閉 App，部分失敗
  仍保留成功結果、列出錯誤並只重試剩餘 active Slot。
- Starting session 會等待啟動後停止；Stopping session 沿用既有 stop promise，
  不重複呼叫 native stop。
- `未完成 — 先更新 status.md` 可勾選 Starting／Running session，傳送固定
  prompt 與 Enter；Starting 先顯示 Queued，送達顯示 Sent，失敗可個別重試。
- 多個選取 session 使用相同 workspace 時顯示非阻擋警告；App 不直接修改
  `status.md`、不解析 `STATUS_READY`，也不執行 commit 或 push。
- Embedded Start modal 支援 optional Session name：trim、最多 48 字元、
  禁止換行／控制字元；留白時使用 `Provider · workspace資料夾名`。
- Header Slot 控制、terminal header、accessible name 與 Stop All dialog
  均保留 `Slot N · Session name`；Start failure、Stopped／Exited 與
  Start again 保留名稱，更換 inactive Slot Provider 或 App reload 時清除。
- Session name、handoff delivery 與 dialog state 只存在 React 記憶體；
  Provider Refresh 保留目前名稱，未新增 storage schema 或 Rust command。
- Web runtime、Sidebar Terminal.app Launch、Rust PTY engine、typed contracts、
  process cleanup、Slot visibility 與 close／reload cleanup 維持原行為。

## LOO-16 驗證結果

- Linear：LOO-16 為 `Done`
- GitHub：PR #12 已合併，`smoke` required check 為 `SUCCESS`
- Frontend tests：63 passed
- Backend tests：34 passed（另有一則既有 Starlette TestClient deprecation warning）
- Rust tests：40 passed
- Frontend production build：passed（既有 xterm chunk-size warning 不阻擋）
- Unsigned Tauri macOS `.app` build：passed
- `cargo fmt --all --check`：passed
- `git diff --check`：passed
- 本次未執行真實 CLI 的手動 Tauri smoke；Stop All、Starting queue、
  partial failure retry、Session name 生命週期與既有 terminal regression
  由 frontend/Rust 自動化測試及 production bundle build 覆蓋。

## LOO-17 Slot 注意力指示

LOO-17 已完成並透過 PR #16 合併。這是第一個完全由 Finn-loop 流程產出的
issue 與 PR：`/finn-spec` 訪談建立規格、`/finn-build` 實作並開 PR、
`/finn-review` 給出 `loop-approved`，合併仍由人工決定：

- App 為四個 embedded Slot 各自維護注意力狀態 `none`／`output`／
  `terminated`；`terminated` 覆寫 `output`，不會被後續輸出降級。
- `TerminalSlot` 新增 `onOutput` 與 `onFocusChange`，把已寫入終端的 PTY
  輸出與 xterm focus／blur 回報給 App；跨 Slot 與 stale session 事件仍被
  忽略。
- 可見且未持有焦點的 Slot 以 `.console-slot` 邊框光暈提示，`output` 與
  `terminated` 使用可區分的兩種光暈；Header 的 Slot 控制另有獨立標記，
  是隱藏 Slot 唯一的提示來源，並反映在 `aria-label` 與 `title`。
- 標記在該 Slot 同時可見且其終端持有鍵盤焦點時清除，因此 `All` 版面下只有
  點進去的那一格會清除。沒有任何終端持有焦點時，可見 Slot 收到輸出仍會被
  標記。
- `exited` 與 `error` 產生 `terminated`；使用者主動 Stop 造成的 `stopped`
  不標記。
- 注意力狀態只存在 React 記憶體：`Refresh` 保留，App 重新載入清空；未新增
  storage schema、Rust command 或 PTY 契約變更。
- capability 仍為 `core:default`，未發送 macOS 系統通知；Web runtime、
  既有 phase 圓點、`Stop All`、status.md handoff 與 Slot view 佇列行為
  均未改變。

## LOO-17 驗證結果

- Linear：LOO-17 為 `Done`
- GitHub：PR #16 已合併，`smoke` required check 為 `SUCCESS`（36 秒）
- Frontend tests：67 passed（既有 63 加新增 4）
- Frontend production build：passed（既有 xterm chunk-size warning 不阻擋）
- `git diff --check`：clean
- 新增的 4 個測試已在移除實作後確認會失敗，非空測試
- 本次未在 Claude Code worktree 執行 `pytest backend` 與 `cargo test`：
  變更僅限 `frontend/src`，且該 worktree 尚未建立 `.venv` 與 Rust build
  cache；CI 的 `smoke` 已涵蓋 backend 測試與 frontend build
- 真實 Tauri App 手動 smoke：已完成。四個 Provider 均偵測為 Available，
  2×2 版面、Header 的 active session 計數與 Slot 顯示控制正常；LOO-17 的
  弱光暈、強標記、Header 標記、focus 清除與 Stop 不標記均由人工確認符合
  Linear issue 的 How to verify 九個步驟

## 本機預覽方式

以下指令在目前使用的 worktree 根目錄執行，路徑見上方兩個 Workspace。
每個 worktree 各自需要自己的 `.venv` 與 `frontend/node_modules`，兩邊
不共用。

### Web mode

Terminal 1：

```bash
.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Terminal 2：

```bash
cd frontend
npm run dev
```

瀏覽器開啟：<http://127.0.0.1:5173>

停止時在兩個 Terminal 分別按 `Control + C`。

### Tauri mode

外接硬碟是 ExFAT，不支援延伸屬性，macOS 會產生 `._*` AppleDouble 伴隨檔。
Tauri 的 build script 把權限 `.toml` 寫進 `OUT_DIR` 後會用萬用字元掃回來
解析，掃到 AppleDouble 檔就會 panic（`stream did not contain valid
UTF-8`）。這些檔案是建置過程中即時產生的，事前清除無效，因此**不能**直接
在外接碟上建置 Tauri。

解法是把建置目錄放在 APFS 稀疏映像裡。映像已建立於
`/Volumes/1TBM2/AI_Drive/agentos-build.sparseimage`（20 GB 上限，稀疏，
用多少佔多少）。重開機或重新插拔外接碟後不會自動掛載，每次先掛載：

```bash
hdiutil attach /Volumes/1TBM2/AI_Drive/agentos-build.sparseimage
```

再從 worktree 的 `frontend/` 啟動，不要啟動 FastAPI：

```bash
CARGO_TARGET_DIR=/Volumes/AgentOSBuild/target npm run tauri:dev
```

內建碟長期只剩約 4 GB，放不下約 6 至 7 GB 的 debug build，所以不建議改用
內建碟。Codex worktree 的 `src-tauri/target` 殘留 875 個指向舊路徑
`/Users/zackchiu/CodexCLI/agentsconsole` 的檔案，該快取已失效無法沿用。

## 接續流程

1. 先確認本次 README／status 文件 diff，取得使用者確認後 commit。若目前
   不在 `main`（例如 Claude Code worktree 的 `claude/*` 分支），文件改動
   同樣要 push 分支並開 PR，待 required check `smoke` 通過後才合併，不可
   直接推 `main`。合併後在另一個 worktree `git pull`，確保兩個 worktree
   都與 `origin/main` 同步且工作樹乾淨。
2. 執行 `/finn-spec` 訪談並建立下一個 issue。`agent-ready` 標籤一律由人工
   在 Linear 掛上，skill 不會自行套用，那是動工前的核准閘門。
3. 掛上標籤後執行 `/loop /finn-build` 認領並實作，完成後建立 PR；審查可另
   開 session 執行 `/loop /finn-review`。兩者都不會合併，merge 由人工決定。
4. 若要在目前外接硬碟工作區執行本機 backend 或既有 Rust build cache，
   先重建 `.venv` 並清除舊工作區留下的 build cache 絕對路徑。
5. 在外接硬碟上執行 `npm test` 前先清除 `._*` AppleDouble 檔案，否則
   vitest 會把它們當成測試檔而產生假失敗。`.gitignore` 已排除這些檔案，
   但不影響 vitest 的檔案掃描。

## 本檔注意事項

`status.md` 是納入 Git 追蹤的開發進度與工作交接文件。功能狀態、active
issue 或接續流程改變時應同步更新；不得用它取代 Linear issue 的完整規格。

使用者通知 PR 已 merge 時，先同步 `main`，再更新 `README.md` 與
`status.md`：README 只描述已完成行為，不預告未實作功能；status 記錄最新
合併基線、完成 issue 與下一步。先提供 diff 讓使用者確認，確認後才依序
commit、push；若文件沒有實際變更，不建立空 commit。完成文件同步並保持
乾淨工作樹後，再開始下一次 `/finn-spec`。
