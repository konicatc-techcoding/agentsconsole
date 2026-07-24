# AgentOS Console — 工作交接狀態

最後更新：2026-07-24

## 下次對話直接使用

```text
請先讀取 status.md，接著執行 $finn-build，實作已標記 agent-ready 的 LOO-6。
```

LOO-5 已完成、通過 review 並合併至 `main`。LOO-6 已完成規格訪談並由
使用者套用 `agent-ready`，目前可執行 `$finn-build`。

## Source of truth

- Workspace：`/Users/zackchiu/CodexCLI/agentsconsole`
- Git branch：`main`
- 已合併基線：`1889625 Merge pull request #1 from konicatc-techcoding/LOO-5-cli-provider-console`
- 目前 Linear issue：`LOO-6 從 Provider 卡片在 macOS Terminal 啟動 CLI session`
- Linear URL：<https://linear.app/loopent/issue/LOO-6/從-provider-卡片在-macos-terminal-啟動-cli-session>
- Linear 狀態：`Backlog`
- Linear label：`agent-ready`
- 上一項 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/1>
- 上一項 PR 狀態：Merged
- 上一項 merge commit：`1889625f1a08afda6e494827a2dc0256c8468215`
- Required check：`smoke` — `SUCCESS`
- 上一項 CI run：<https://github.com/konicatc-techcoding/agentsconsole/actions/runs/29996928250/job/89172702937>
- 本機 `main` 已同步至 `origin/main`
- 功能分支 `LOO-5-cli-provider-console` 目前保留

## 已完成內容

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

## 下一項功能

LOO-6 將從每張可用的 provider 卡片啟動 macOS Terminal.app：

- Launch modal 要求有效的本機 workspace 絕對路徑。
- 支援 `New session` 與 `Continue last session`。
- 每次開啟獨立 Terminal 視窗，使用固定且不可自訂的 CLI 命令。
- 保留各 CLI 原生互動與 approval 流程。
- 本階段不重寫 UI、不內嵌 terminal、不追蹤 CLI process。
- Backend 保留最小跨平台 launcher 邊界，但只實作 macOS。

完整 acceptance criteria、non-goals 與驗證方式以 Linear `LOO-6` 為準。

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

1. 執行 `$finn-build`，claim 並實作 `LOO-6`。
2. 完成 issue 指定的 backend、frontend 與人工驗證。
3. 開啟 PR 後執行 `$finn-review`。
4. Merge 仍由使用者決定。

## 本檔注意事項

`status.md` 是納入 Git 追蹤的開發進度與工作交接文件。功能狀態、active
issue 或接續流程改變時應同步更新；不得用它取代 Linear issue 的完整規格。
