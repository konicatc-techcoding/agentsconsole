# AgentOS Console — 工作交接狀態

最後更新：2026-07-24

## 下次對話直接使用

```text
請先讀取 status.md，接著執行 $finn-review，review AgentOS Console 的 PR #2。
```

LOO-5 已完成、通過 review 並合併至 `main`。LOO-6 已完成實作、驗證與
PR 建立，目前等待 `$finn-review`，不可由 builder 自行 merge。

## Source of truth

- Workspace：`/Users/zackchiu/CodexCLI/agentsconsole`
- Git branch：`LOO-6-launch-cli-terminal`
- 已合併基線：`1889625 Merge pull request #1 from konicatc-techcoding/LOO-5-cli-provider-console`
- 目前 Linear issue：`LOO-6 從 Provider 卡片在 macOS Terminal 啟動 CLI session`
- Linear URL：<https://linear.app/loopent/issue/LOO-6/從-provider-卡片在-macos-terminal-啟動-cli-session>
- Linear 狀態：`In Review`
- Linear label：`agent-ready`
- 目前 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/2>
- PR 狀態：Open，等待 review
- Feature commit：`5c8a7a2 feat: launch CLI sessions in Terminal`
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

## LOO-6 實作內容

LOO-6 已加入從每張可用 provider 卡片啟動 macOS Terminal.app 的功能：

- Launch modal 要求有效的本機 workspace 絕對路徑。
- 支援 `New session` 與 `Continue last session`。
- 每次開啟獨立 Terminal 視窗，使用固定且不可自訂的 CLI 命令。
- 保留各 CLI 原生互動與 approval 流程。
- 本階段不重寫 UI、不內嵌 terminal、不追蹤 CLI process。
- Backend 保留最小跨平台 launcher 邊界，但只實作 macOS。

完整 acceptance criteria、non-goals 與驗證方式以 Linear `LOO-6` 為準。

## LOO-6 驗證結果

- Backend tests：20 passed
- Frontend tests：10 passed
- Frontend production build：passed
- `git diff --check`：passed
- 實機瀏覽器驗證：
  - 四個真實 CLI 都顯示 Available 與 Launch
  - Modal、provider selection、invalid path error、workspace 預填正常
  - 完整 reload 後選擇與 workspace 清除
  - Browser console 無 warning 或 error
- 實機 Terminal 驗證：
  - Codex 在獨立 Terminal tty 啟動
  - Codex process cwd 為 `/Users/zackchiu/CodexCLI/agentsconsole`

Backend 測試仍有一則 Starlette TestClient 的 upstream deprecation warning，
不影響測試結果或 runtime。

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

1. 執行 `$finn-review` review PR #2。
2. 若 review 要求修改，依 Finn-loop label 交回 `$finn-build`。
3. 若 review 通過，由使用者決定是否 merge。
4. Merge 後更新本檔與 Linear 狀態，再執行 `$finn-spec` 定義下一項功能。

## 本檔注意事項

`status.md` 是納入 Git 追蹤的開發進度與工作交接文件。功能狀態、active
issue 或接續流程改變時應同步更新；不得用它取代 Linear issue 的完整規格。
