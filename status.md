# AgentOS Console — 工作交接狀態

最後更新：2026-08-21

## 下次對話直接使用

```text
請先讀取 status.md。LOO-12 至 LOO-34 已依序合併；LOO-33 與 LOO-34 之間另有
兩個沒有 Linear issue 的 PR：PR #50（切換介面風格 + styles.css token 化，
來自 design_handoff_console_restyle/ 的設計交接）與 PR #52（修正打包版從
沒有圖示，使用者提供來源圖）。main 最新基線為 8386755（dee14ab 之後一個純
文件 commit），Linear 的 agent-ready 佇列為空。

**目前部署的 App 領先 main**：分支 feat/slot-pid-session-display（commit
34c61b8，已 push 到 origin，尚未開 PR、尚未 review、尚未合併）新增 Slot
標題列 PID／Claude session id 顯示，使用者直接指示 push 並部署，不經過
finn-loop。App 已打包並部署於 /Volumes/OWC1M2/AgentOSConsole/
（2026-08-21 更新為 34c61b8），從 Finder 點開即可正常使用，細節見
BUILDS.md 的「2026-08-21-34c61b8」條目。**下一個 session 若要接續這件事**，
先確認這個分支的 PR 狀態（可能還沒開、可能已經開了、可能已經合併），
合併後若 merge commit 內容與 34c61b8 相同可以不用重建，只要更新這裡的
基線記錄；內容不同則要重建部署。

沒有功能性缺陷；唯一的未完成事項是 documentation-only PR 是否豁免
Closes LOO-NNN 這個流程決定，已被推遲三次。搜尋有兩項已知的 xterm 上游限制
且決定不修。下一步視使用者指示：可能是幫 feat/slot-pid-session-display
開 PR，也可能是 /finn-spec；候選見「後續候選」（第 6 項是交接包裡尚未實作
的完整方角改版）。
```

## 未完成事項

1. **documentation-only PR 是否豁免 `Closes LOO-NNN`，這個決定已被刻意推遲
   三次。** `.claude/skills/finn-review/SKILL.md` 第 26 至 28 行寫明「No linked
   issue is a must-fix finding」，沒有任何例外條款；但本 repo 的 handoff PR
   （#34、#36、#38、#39、#41、#42）沒有對應的 Linear issue 可關，寫
   `Closes LOO-NNN` 反而會誤關掉程式碼的 issue。
   經過：曾有人把豁免寫進 skill，2026-07-28 又還原且未進版控；#36 的審查提出
   後由人工直接合併，標籤 `loop-changes-requested` 留到現在；#42 的審查再次
   提出並改標 `needs-human-review`，同樣直接合併。
   三個選項：在 skill 明文豁免（建議限定「diff 只含 `README.md` 與
   `status.md`」，避免有人把程式碼混進文件 PR 躲過審查）、每個 handoff 建一個
   文件 issue、或允許 `Refs LOO-NNN` 只連結不關閉。
   **這不是缺陷，是流程落差**，不影響軟體行為，因此排在功能之後。記於此是
   為了讓下一個 session 知道它已被討論過，不必重新調查。

LOO-23 至 LOO-31 的實機驗證均已完成，無遺留項目。先前列在此處的三項都已
結案：「注意力光暈太弱」由 LOO-29 處理，「App 把 `CLAUDE_CODE_*` 標記傳給
子 CLI」由 LOO-30 處理，「打包版從 Finder 啟動全部 Unavailable」由 LOO-31
處理。搜尋的兩項 xterm 上游限制已決定維持現狀，見「搜尋的兩項實機限制」。

## 目前功能狀態

四個 Slot 已完成 embedded terminal rollout、自適應版面、Session 顯示名稱、
全域 Stop All、status.md handoff、Slot 注意力指示、provider 專屬色標題列、
全域字級控制、終端搜尋、Command+Click 開啟連結與 Cmd+0 至 Cmd+4 的位置編址
快捷鍵。LOO-32 將四格終端之間的間隔由 10px 縮為 4px，周圍留白不變。LOO-33
讓 Slot 內的 CLI 在 App 環境缺少 `TERM`、`COLORTERM`、`LANG` 時得到預設值，
修正打包版 Claude 選單無高亮。PR #50 在 Header 加入 `Style`
控制：三組色彩主題（Blueprint／Graphite／Daylight）× 三種圓角（Square／
Soft／Round），寫在 `<html>` 的 `data-theme`／`data-radius` 並存
localStorage；`styles.css` 的顏色與圓角全面改用 `themes.css` 的 CSS 變數，
xterm 主題跟著 `data-theme` 即時換色。PR #52 修正打包版 `.app` 一直沒有
圖示的缺陷（`tauri.conf.json` 缺 `bundle.icon`），Finder／Dock 現在顯示
正式圖示。LOO-34 讓 Claude slot 的 Continue 不再交給 `claude --continue`
自己挑對話：App 由 workspace 推出 CLI 的 project 目錄，挑出最新且程序未在
執行中的 transcript，再以 `claude --resume <id>` 啟動，Slot 狀態列以 `↩`
標出接的是哪一個；背景 agent 的對話自此接得到。終端邊框的注意力光暈自
LOO-29 起只標記新輸出，session 結束改由 Header 標記。CI 有 `smoke` 與 `rust` 兩個 required
check，快取已納入 rustc 版本，`cargo test` 帶 `--locked`。Finn-loop 的
finn-spec／finn-build／finn-review 三個 skill 安裝於 `.claude/skills`，綁定
Linear team `LOO`；LOO-33 收尾時新增第四個 skill `finn-handoff`，把合併後的
分支清理、打包部署、`status.md` 更新與 handoff PR 固定成一套流程。

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
LOO-18 讓每格終端標題列以 provider 專屬色標示：15% 透明度底色加 4px 左側
強邊，顏色跟隨目前選取的 provider，並在 `:root` 首次引入 CSS 自訂屬性作為
唯一色彩來源。
LOO-19 在 CI 新增 `rust` job，補上 `src-tauri` 一直沒有的自動化覆蓋。合併後
已由人工把 `rust` 加入 `main` 的 required status checks，Rust 測試失敗自此
會實際擋下合併。
LOO-20 修正該 job 的兩項缺陷：快取 key 與 restore-keys 納入 rustc 版本，
`cargo test` 加上 `--locked`，並把 `rustfmt` 寫進 `rust-toolchain.toml` 的
components。
LOO-21 新增 Header 的全域終端字級控制，範圍 10 至 20px、每次加減 1，四格
同步套用且不重建 Terminal 物件；LOO-22 接著把預設值由 12px 改為 16px。
LOO-23 加入每格終端的 scrollback 搜尋，但合併後即發現完全失效；LOO-24 找出
並修正根因（缺 `allowProposedApi`）並補上真實模組的回歸測試；LOO-25 再修正
標示對比與焦點陷阱。三者的完整經過見下方章節。

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
- 最新合併基線：`dee14ab feat: let the App pick which Claude conversation a Continue resumes (#54)`
- 前一個合併基線：`77c4d29 fix: give the packaged App a real icon (#52)`
- PR #52 沒有 Linear issue（使用者直接指示套用圖示，非 `/finn-spec` 產出）
- 再前一個合併基線：`740ee61 feat: add appearance switching and tokenize styles.css colours (#50)`
- PR #50 也沒有 Linear issue（設計交接直接指示實作，非 `/finn-spec` 產出）；
  規格來源 `design_handoff_console_restyle/` 已從 Claude Code worktree 刪除
  （原為 untracked、不入版控，任務完成後使用者要求移除）
- 更早的合併基線：`eaa2e67 fix: give each Slot's CLI TERM, COLORTERM, and LANG when the App has none (#47)`
- Finn-loop：`.claude/skills` 已安裝 finn-spec／finn-build／finn-review，
  以及 2026-08-15 新增的 finn-handoff（合併後的收尾：清分支、打包部署、
  更新本檔、開 handoff PR），綁定 Linear team `LOO`；GitHub labels `loop-approved`、
  `loop-changes-requested`、`needs-human-review` 均已建立
- `main` required status checks：`smoke`（ubuntu-latest，backend 與 frontend）
  與 `rust`（macos-latest，`cargo fmt --all --check` 與 `cargo test`），
  `strict` 為 true，即合併前分支必須為最新
- 目前 Linear issue：無；下一步使用 `/finn-spec` 建立新規格
- 打包產物：`/Volumes/OWC1M2/AgentOSConsole/`，頂層為使用中的
  `AgentOS Console.app`（目前為 `34c61b8`，來自尚未合併的分支
  `feat/slot-pid-session-display`，領先 `main` 的 `8386755`——見上方
  「下次對話直接使用」），
  `builds/` 存歷次版本，
  `BUILDS.md` 記錄各版對應的 commit。無 updater，更新須重新 build 後以
  `ditto` 覆蓋——**用 `ditto` 而非 `cp -R`**，後者可能破壞 app bundle 的簽章
- 最近完成的 Linear issue：`LOO-34 Claude 的 Continue session 改用 --resume <session-id>，由 App 決定要接哪一個`
- LOO-34 URL：<https://linear.app/loopent/issue/LOO-34/claude-的-continue-session-改用-resume-session-id由-app-決定要接哪一個>
- LOO-34 狀態：`Done`；PR <https://github.com/konicatc-techcoding/agentsconsole/pull/54>，
  merge commit `dee14ab`，review `loop-approved`，`smoke` 與 `rust` 皆 `SUCCESS`
- 前一個：`LOO-33 為 Slot 內的 CLI 補上缺失的 TERM、COLORTERM 與 LANG，修正打包版 Claude 選單無高亮`
- LOO-33 URL：<https://linear.app/loopent/issue/LOO-33/為-slot-內的-cli-補上缺失的-termcolorterm-與-lang修正打包版-claude-選單無高亮>
- LOO-33 狀態：`Done`；PR <https://github.com/konicatc-techcoding/agentsconsole/pull/47>，
  merge commit `eaa2e67`，review `loop-approved`，`smoke` 與 `rust` 皆 `SUCCESS`
- 前一個：`LOO-32 縮小 Console 四格終端之間的間隔至 4px`
- LOO-32 URL：<https://linear.app/loopent/issue/LOO-32/縮小-console-四格終端之間的間隔至-4px>
- LOO-32 狀態：`Done`；PR <https://github.com/konicatc-techcoding/agentsconsole/pull/45>，
  merge commit `7409adf`，review `loop-approved`，`smoke` 與 `rust` 皆 `SUCCESS`
- 前一個：`LOO-31 修正打包版從 Finder 啟動時 PATH 不完整導致四個 provider 全部 Unavailable`
- LOO-31 URL：<https://linear.app/loopent/issue/LOO-31/修正打包版從-finder-啟動時-path-不完整導致四個-provider-全部-unavailable>
- LOO-31 狀態：`Done`；PR <https://github.com/konicatc-techcoding/agentsconsole/pull/43>，
  merge commit `999bb34`，review `loop-approved`，`smoke` 與 `rust` 皆 `SUCCESS`
- 前一個：`LOO-30 清除傳給 Claude Slot 的 CLAUDE_CODE_CHILD_SESSION，避免子 CLI 靜默停用 transcript`
- LOO-30 URL：<https://linear.app/loopent/issue/LOO-30/清除傳給-claude-slot-的-claude-code-child-session避免子-cli-靜默停用-transcript>
- LOO-30 狀態：`Done`；PR <https://github.com/konicatc-techcoding/agentsconsole/pull/40>，
  merge commit `8e65b61`，review `loop-approved`，`smoke` 與 `rust` 皆 `SUCCESS`
- 前一個：`LOO-29 加強 Slot 注意力標記的視覺強度，並讓終端邊框只標記新輸出`
- LOO-29 URL：<https://linear.app/loopent/issue/LOO-29/加強-slot-注意力標記的視覺強度並讓終端邊框只標記新輸出>
- LOO-29 狀態：`Done`；PR <https://github.com/konicatc-techcoding/agentsconsole/pull/37>，
  merge commit `497d921`，review `loop-approved`，`smoke` 與 `rust` 皆 `SUCCESS`。
  **該 issue 在實作期間依實機回饋修訂過兩次**，標題與 AC-2 皆與初版相反，
  詳見下方章節
- 前一個：`LOO-28 新增 Cmd+1～4 依畫面位置快速聚焦終端，Cmd+0 回到 All 版面`
- LOO-28 URL：<https://linear.app/loopent/issue/LOO-28/新增-cmd14-依畫面位置快速聚焦終端cmd0-回到-all-版面>
- LOO-28 狀態：`Done`；PR <https://github.com/konicatc-techcoding/agentsconsole/pull/35>，
  merge commit `96b77c0`，review `loop-approved`，`smoke` 與 `rust` 皆 `SUCCESS`
- 前一個：`LOO-27 支援 OSC 8 超連結，讓 Codex 這類 CLI 的連結也能 Command+Click 開啟`
- LOO-27 URL：<https://linear.app/loopent/issue/LOO-27/支援-osc-8-超連結讓-codex-這類-cli-的連結也能-commandclick-開啟>
- LOO-27 狀態：`Done`；PR <https://github.com/konicatc-techcoding/agentsconsole/pull/33>，
  merge commit `8f126e2`，review `loop-approved`，`smoke` 與 `rust` 皆 `SUCCESS`
- 前一個：`LOO-26 終端內的 http／https 網址可用 Command+Click 以系統瀏覽器開啟`
- LOO-26 URL：<https://linear.app/loopent/issue/LOO-26/終端內的-httphttps-網址可用-commandclick-以系統瀏覽器開啟>
- LOO-26 狀態：`Done`；PR <https://github.com/konicatc-techcoding/agentsconsole/pull/32>，
  merge commit `6092c73`，review `loop-approved`，`smoke` 與 `rust` 皆 `SUCCESS`
- 前一個完成的 Linear issue：`LOO-25 改善搜尋標示對比並修正搜尋列已開時的焦點陷阱`
- LOO-25 URL：<https://linear.app/loopent/issue/LOO-25/改善搜尋標示對比並修正搜尋列已開時的焦點陷阱>
- LOO-25 狀態：`Done`；PR <https://github.com/konicatc-techcoding/agentsconsole/pull/30>，
  merge commit `2d0fe24`，review `loop-approved`，`smoke` 與 `rust` 皆 `SUCCESS`
- 前一個：`LOO-24 修正終端搜尋完全失效並補上真實模組的回歸測試`（priority `High`）
- LOO-24 URL：<https://linear.app/loopent/issue/LOO-24/修正終端搜尋完全失效並補上真實模組的回歸測試>
- LOO-24 狀態：`Done`；PR <https://github.com/konicatc-techcoding/agentsconsole/pull/29>，
  merge commit `d55d9b8`，review `loop-approved`，`smoke` 與 `rust` 皆 `SUCCESS`
- 前一個：`LOO-23 為每格終端新增 scrollback 搜尋`
- LOO-23 URL：<https://linear.app/loopent/issue/LOO-23/為每格終端新增-scrollback-搜尋>
- LOO-23 狀態：`Done`；PR <https://github.com/konicatc-techcoding/agentsconsole/pull/28>，
  merge commit `81c883a`，review `loop-approved`，`smoke` 與 `rust` 皆 `SUCCESS`。
  **注意：該 PR 合併時功能實際上完全不能用**，詳見下方章節
- 前一個完成的 Linear issue：`LOO-22 將終端預設字級由 12px 改為 16px`
- LOO-22 URL：<https://linear.app/loopent/issue/LOO-22/將終端預設字級由-12px-改為-16px>
- LOO-22 狀態：`Done`
- LOO-22 label：`agent-ready`
- LOO-22 relation：`related to LOO-21`
- LOO-22 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/26>
- PR #26 狀態：Merged
- PR #26 merge commit：`e1afde2`
- PR #26 review：`loop-approved`（由 `finn-review` 產生）
- PR #26 required check：`smoke` — `SUCCESS`；`rust` — `SUCCESS`
- 前一個完成的 Linear issue：`LOO-21 新增全域終端字體大小控制`
- LOO-21 URL：<https://linear.app/loopent/issue/LOO-21/新增全域終端字體大小控制>
- LOO-21 狀態：`Done`
- LOO-21 label：`agent-ready`
- LOO-21 assignee：Zack Chiu
- LOO-21 blocker：無
- LOO-21 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/24>
- PR #24 狀態：Merged
- PR #24 merge commit：`fee0c70`
- PR #24 review：`loop-approved`（由 `finn-review` 產生）
- PR #24 required check：`smoke` — `SUCCESS`；`rust` — `SUCCESS`
- 前一個完成的 Linear issue：`LOO-20 修正 rust CI job 的快取失效與 lockfile 檢查`
- LOO-20 URL：<https://linear.app/loopent/issue/LOO-20/修正-rust-ci-job-的快取失效與-lockfile-檢查>
- LOO-20 狀態：`Done`
- LOO-20 label：`agent-ready`
- LOO-20 assignee：Zack Chiu
- LOO-20 blocker：無
- LOO-20 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/22>
- PR #22 狀態：Merged
- PR #22 merge commit：`4d3871f`
- PR #22 review：無 `finn-review` 審查。這是 LOO-17 以來第一個沒有跑
  `/loop /finn-review` 就合併的 PR，兩個 required check 皆綠燈，程式碼由
  人工確認
- PR #22 required check：`smoke` — `SUCCESS`；`rust` — `SUCCESS`
- 前一個完成的 Linear issue：`LOO-19 在 CI 加入 Rust 測試 job，補上 src-tauri 的自動化覆蓋`
- LOO-19 URL：<https://linear.app/loopent/issue/LOO-19/在-ci-加入-rust-測試-job補上-src-tauri-的自動化覆蓋>
- LOO-19 狀態：`Done`
- LOO-19 label：`agent-ready`
- LOO-19 assignee：Zack Chiu
- LOO-19 blocker：無
- LOO-19 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/20>
- PR #20 狀態：Merged
- PR #20 merge commit：`2ce988f`
- PR #20 review：`loop-approved`（由 `finn-review` 產生）
- PR #20 required check：`smoke` — `SUCCESS`；`rust` — `SUCCESS`
- 前一個完成的 Linear issue：`LOO-18 讓每格終端標題列以 provider 專屬色標示`
- LOO-18 URL：<https://linear.app/loopent/issue/LOO-18/讓每格終端標題列以-provider-專屬色標示>
- LOO-18 狀態：`Done`
- LOO-18 label：`agent-ready`
- LOO-18 assignee：Zack Chiu
- LOO-18 blocker：無
- LOO-18 GitHub PR：<https://github.com/konicatc-techcoding/agentsconsole/pull/18>
- PR #18 狀態：Merged
- PR #18 merge commit：`16f06b8`
- PR #18 review：`loop-approved`（由 `finn-review` 產生）
- PR #18 required check：`smoke` — `SUCCESS`
- 前一個完成的 Linear issue：`LOO-17 新增 Slot 注意力指示，標記需要處理的 embedded session`
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

## LOO-18 Provider 專屬色標題列

LOO-18 已完成並透過 PR #18 合併，同樣由 `/finn-spec` → `/finn-build` →
`/finn-review` 全程產出：

- `:root` 首次引入 CSS 自訂屬性作為唯一色彩來源：`--hermes-color: #E5A93D`、
  `--codex-color: #10A37F`、`--claude-color: #D97757`、
  `--antigravity-color: #4285F4`。
- `.console-slot-header` 以 `data-provider-id` 屬性選擇器對應到
  `--slot-provider-color`，背景使用
  `color-mix(in srgb, var(--slot-provider-color) 15%, transparent)`，
  左側加 `border-left: 4px solid var(--slot-provider-color)`。
- 顏色跟隨該 Slot 目前選取的 provider，包含尚未 `Save Layout` 的 draft；
  provider 不可用時仍上色，因為顏色代表身分而非狀態；多個 Slot 指派同一
  provider 時顯示相同顏色。
- Hermes 的 `#E5A93D` 與 LOO-17 terminated 標記的 `#ffa24a` 色相接近屬於
  已知並接受的情況，靠位置區分：provider 色在標題列，注意力標記在
  `.console-slot` 邊框與 Header 按鈕。
- Web runtime、標題列文字顏色、`select` 樣式與既有底線分隔線均未改變；
  未新增 storage schema，也未修改 `src-tauri/`。

## LOO-18 驗證結果

- Linear：LOO-18 為 `Done`
- GitHub：PR #18 已合併，`smoke` required check 為 `SUCCESS`（34 秒）
- Frontend tests：68 passed（既有 67 加新增 1）
- Frontend production build：passed（既有 xterm chunk-size warning 不阻擋）
- `git diff --check`：clean
- 新增的測試已在移除實作後確認會失敗，非空測試
- 真實 Tauri App：已啟動並由人工確認四色的實機呈現與可辨識度可接受，包含
  Hermes 琥珀色與 LOO-17 terminated 橘色相鄰時不致混淆。How to verify 的
  八個步驟未逐項執行，draft 即時更新與同 provider 同色等項目仍只有自動化
  測試覆蓋
- 說明：jsdom 不計算 `color-mix`，自動化測試只能驗證 `data-provider-id`
  是否正確對應，顏色的實際呈現必須在真實 WebView 確認

## LOO-19 CI Rust 覆蓋

LOO-19 已完成並透過 PR #20 合併，由 `/finn-spec` → `/finn-build` →
`/finn-review` 全程產出：

- `.github/workflows/finn-loop-smoke.yml` 新增與 `smoke` 並行的 `rust` job，
  `runs-on: macos-latest`，沿用既有的 `pull_request` 與 push 到 `main` 觸發。
- 以官方 rustup 安裝 stable toolchain 並補上 `rustfmt` component；
  `src-tauri/rust-toolchain.toml` 只指定 channel，未列 component，因此
  workflow 明確安裝是必要的。
- `actions/cache@v4` 快取 `~/.cargo/registry`、`~/.cargo/git` 與
  `src-tauri/target`，key 以 `src-tauri/Cargo.lock` 的 hash 組成並附
  `restore-keys` fallback。
- 在 `src-tauri` 依序執行 `cargo fmt --all --check` 與 `cargo test`。
- workflow 內沒有任何 `paths`／`paths-ignore`。這是刻意的：required check
  若因過濾條件而未執行，GitHub 會判定為永久 pending，反而鎖死所有未觸及
  Rust 的 PR。
- 既有 `smoke` job 完全未動，仍在 `ubuntu-latest` 執行 backend 與 frontend。
- 未修改任何 Rust 程式碼或測試，變更僅限 workflow 檔案。

合併後已由人工把 `rust` 加入 `main` 的 required status checks。在那之前
`finn-review` 只讀得到 `smoke`，新 job 綠或紅都不會影響合併判定；補上之後
Rust 測試失敗會成為 `[CI]` must-fix，進入 Finn-loop 的自動修復迴圈。

## LOO-19 驗證結果

- Linear：LOO-19 為 `Done`
- GitHub：PR #20 已合併，`smoke` 與 `rust` 兩個 required check 皆為 `SUCCESS`
- `rust` job：於 `macos-latest` 執行，`cargo test` 輸出 `40 passed; 0 failed`。
  **這是這 40 個測試首次在本機 macOS 以外的環境通過**，先前規格中標記的
  「從未在其他環境執行過」風險已排除
- `smoke` job：36 秒；`rust` job：1 分 52 秒（首次冷建置，無快取可命中）
- 格式檢查負面驗證：builder 於本機暫時在 `src-tauri/src/providers.rs` 插入
  錯誤格式後確認 `cargo fmt --all --check` 回傳非零，再還原
- branch protection：`required_status_checks.contexts` 已為
  `["smoke", "rust"]`，`strict` 為 true
- `finn-review` 提出兩項 Should fix，均未阻擋合併：快取 key 未包含 rustc
  版本（stable 滾動更新後會退化成「還原無用 target 加完整重建」且不寫回新
  cache）；`cargo` 指令未加 `--locked`（lockfile 與 `Cargo.toml` 不同步時
  CI 不會失敗）。兩者已由 LOO-20 處理完畢

## LOO-20 rust CI 快取與 lockfile 修正

LOO-20 已完成並透過 PR #22 合併，處理 `finn-review` 對 PR #20 提出的兩項
Should fix：

- `Set up Rust` 簡化為 `rustup toolchain install`，改由
  `src-tauri/rust-toolchain.toml` 決定 toolchain 與 component；該檔新增
  `components = ["rustfmt"]`，`channel`、`profile`、`targets` 未變。這讓
  本機與 CI 一致，新 clone 下來即可執行 `cargo fmt`。
- 新增 `Resolve rustc version` 步驟，以
  `rustc --version | cut -d ' ' -f 2` 取出乾淨版本號寫入 `$GITHUB_OUTPUT`，
  避免原始字串的空白與括號污染 cache key。
- 快取 key 改為
  `${{ runner.os }}-cargo-${{ steps.rustc.outputs.version }}-${{ hashFiles('src-tauri/Cargo.lock') }}`，
  `restore-keys` 同樣限縮在相同 rustc 版本，不再退回到僅 `-cargo-`。
- `cargo test` 加上 `--locked`，`Cargo.lock` 與 `Cargo.toml` 不同步時 CI
  會失敗而非在 runner 上默默改寫 lockfile。
- **`cargo fmt --all --check` 刻意不加 `--locked`。** `finn-review` 的原始
  建議是兩個指令都加，但實測 `cargo fmt` 不支援該旗標，會以
  `error: unexpected argument '--locked' found` 失敗。這一點寫進 LOO-20 的
  AC-5 作為明文契約，避免日後被當成漏做而補上。

## LOO-20 驗證結果

- Linear：LOO-20 為 `Done`
- GitHub：PR #22 已合併，`smoke` 與 `rust` 兩個 required check 皆為 `SUCCESS`
- `smoke` job：37 秒；`rust` job：2 分 33 秒
- `rust` 本次耗時較 PR #21 的 39 秒長，屬預期行為：cache key 改變必然
  miss 一次並完整重建，新 key 的快取效果要到下一個 PR 才觀察得到
- 變更範圍：`.github/workflows/finn-loop-smoke.yml` 與
  `src-tauri/rust-toolchain.toml` 兩個檔案，未觸及任何原始碼或 `Cargo.lock`
- 本 PR 未經 `finn-review` 審查即合併，詳見 Source of truth 的 PR #22 記錄

## LOO-21 全域終端字級控制

LOO-21 已完成並透過 PR #24 合併，由 `/finn-spec` → `/finn-build` →
`/finn-review` 全程產出：

- Header 新增全域字級控制，顯示目前字級並提供縮小與放大按鈕，與
  `Sessions · N active` 及 Slot 顯示控制並列。範圍 10 至 20px、每次加減 1、
  預設 12px，達到邊界時對應按鈕 disabled。
- `TerminalSlot` 新增選填的 `fontSize` prop 與匯出的 `DEFAULT_FONT_SIZE`；
  App 以單一 state 傳給四格，隱藏中的 Slot 同樣套用。
- **關鍵實作**：Terminal 建構子讀取 `fontSizeRef.current` 而非 `fontSize`
  本身，使建立 Terminal 的 effect 不因字級變動而重跑；字級變更改由獨立
  effect 寫入 `terminal.options.fontSize` 後呼叫 `fitAndReport()`。這是
  AC-4 的要求——若改為重建 Terminal，該 Slot 的 5,000 行 scrollback 會被
  清空，而該災難在 jsdom 測試中抓不到。
- 字級只存在 React 記憶體：`Refresh` 保留，App 重新載入回復預設。
- 未新增 storage schema、未修改 `src-tauri/` 或 Web runtime。

## LOO-21 驗證結果

- Linear：LOO-21 為 `Done`
- GitHub：PR #24 已合併，`smoke` 與 `rust` 兩個 required check 皆為
  `SUCCESS`（各 38 秒）
- Frontend tests：70 passed（既有 68 加新增 2）
- Frontend production build：passed（既有 xterm chunk-size warning 不阻擋）
- `git diff --check`：clean
- 新增的 2 個測試已在移除實作後確認會失敗，非空測試
- **真實 Tauri App 手動 smoke：未完成。** App 曾於 2026-07-27 啟動，但
  scrollback 是否保留、CLI 畫面是否隨新行列數正確重繪這兩項核心驗收未逐項
  確認。jsdom 不排版 xterm，自動化測試只能斷言 `options.fontSize` 的設定與
  `resizePty` 呼叫，實際呈現必須實機驗證。LOO-22 的 How to verify 第 6 步
  涵蓋同樣的檢查，可於該 issue 驗收時一併完成

## LOO-22 預設字級改為 16px

LOO-22 已完成並透過 PR #26 合併：

- `TerminalSlot.tsx` 的 `DEFAULT_FONT_SIZE` 由 `12` 改為 `16`，仍是 `App.tsx`
  引用的唯一預設值來源。字級範圍、步進與控制項行為皆未變。
- `App.test.tsx` 的字級測試同步更新，且**維持原本的覆蓋意圖**：遞減次數由 4
  改為 8，測試路徑仍實際觸及下限 10px 與上限 20px 並確認按鈕 disabled。
  單純把 12 換成 16 會讓遞減碰不到下限，`toBeDisabled()` 那條斷言將永遠不被
  真正驗證，但測試仍全綠——這是 issue AC-5 明文要求避免的靜默退化。

## LOO-22 驗證結果

- Linear：LOO-22 為 `Done`
- GitHub：PR #26 已合併，`smoke`（41 秒）與 `rust`（21 秒）皆為 `SUCCESS`
- Frontend tests：70 passed，總數不變
- Frontend production build：passed（既有 xterm chunk-size warning 不阻擋）
- `git diff --check`：clean
- 變更範圍：`frontend/src/TerminalSlot.tsx` 一行與 `frontend/src/App.test.tsx`
  十四行，未觸及其他檔案
- **實機驗證已完成**（2026-07-28）：Tauri App 啟動後 Header 顯示 `16px`，
  四格終端皆為該字級；在 Slot 3（Antigravity）與 Slot 4（Hermes）各有一個
  Running session、且已累積 scrollback 的狀態下調整字級，確認既有輸出未被
  清空、CLI 畫面隨新行列數正確重繪。這三項是 LOO-21 與 LOO-22 唯一無法由
  自動化涵蓋的驗收——jsdom 不排版 xterm，測試只能斷言 `options.fontSize`
  的設定與 `resizePty` 呼叫

## LOO-23／24／25 終端搜尋

三個 issue 構成同一條線：功能上線、發現完全失效、修正並補上防護、再修使用性。
完整經過值得留存，因為它揭露了自動化流程的一個真實盲點。

**LOO-23（PR #28）** 加入 `@xterm/addon-search`，每格一個 `SearchAddon`，
`Command+F` 開啟浮層搜尋列，`Enter`／`Shift+Enter` 上下循環，`Escape` 關閉。
搜尋列採 `position: absolute` 浮層，開關不改變終端可用區域、不觸發
`fitAndReport()` 與 `resizePty`。

**但它從合併起就完全不能用。** `Terminal` 建構時未設 `allowProposedApi: true`，
而 `findNext` 帶著 `decorations` 呼叫；xterm 的 `registerDecoration` 有
`_checkProposedApi()` 守衛會拋出例外，且 `findNext` 內部的
`_highlightAllMatches` 執行於 `_findNextAndSelect` **之前**，因此每次搜尋都在
標示階段中斷、從未實際搜尋。例外被 React 事件系統吞掉，畫面毫無反應也不崩潰。

**為什麼沒被攔下**：`src/test/setup.ts` 把 `@xterm/addon-search` 與
`@xterm/xterm` 完整 mock，假的 `findNext()` **永遠回傳 `true`**。72 個測試全綠、
`finn-review` 給 `loop-approved`、`smoke` 與 `rust` 兩個 required check 皆通過，
但沒有任何一環碰得到真實整合。唯一發現它的是人工實機操作。

**LOO-24（PR #29）** 修正根因並補上防護：

- `Terminal` 選項抽為匯出的 `createTerminalOptions(fontSize)`，含
  `allowProposedApi: true`，成為元件與測試的單一來源。若測試自行另寫一份選項，
  元件漏掉該選項仍會全綠，防護等於零——這是刻意的結構要求。
- 新增 `TerminalSlot.search.test.ts`，以 `vi.importActual` 取得未被 mock 的真實
  模組驗證 `findNext` 不拋例外。該測試不呼叫 `terminal.open()`，因為 jsdom 缺
  canvas 與 `matchMedia` 會失敗。
- 加入輸入法組字閘門：`compositionstart` 至 `compositionend` 期間不執行搜尋。

**LOO-25（PR #30）** 修正實機才看得出的兩個問題：

- 標示對比。原本 `matchBackground` 與 `activeMatchBackground` 同屬藍色系，且
  `matchBackground` 與終端 `selectionBackground` 是同一色值 `#334a78`，搜尋結果
  與一般選取範圍無法區分。現為 `matchBackground: #16305c`、作用中
  `activeMatchBackground: #6b4f00` 加 `activeMatchBorder: #ffd54a`。採深底色加亮
  邊框而非亮黃底色，是因為 xterm 的 `ISearchDecorationOptions` **無法設定文字
  顏色**，亮黃底配淺色前景 `#d9e1ee` 會使該段文字難以辨讀。
- 焦點陷阱。`Command+F` 原本只呼叫 `setSearchOpen(true)`，而 focus 的 effect
  依賴 `[searchOpen]`；搜尋列已開時狀態不變、effect 不重跑，焦點無法取回，
  此時 `Escape` 被送進 CLI，使用者無法關閉搜尋列。修正後於處理器內直接
  `focus()`，且不呼叫 `select()`，保留既有關鍵字與游標位置。

**一條被實機推翻的 review 意見**：`finn-review` 對 PR #29 提出 Should fix，
認為組字閘門假設 `compositionend` 後不再有 `change`，各引擎不一致。但本專案
只有 WKWebView 一個引擎，實機確認中文送出後正確停在**第一個**符合處，該情況
不成立。且該建議若照字面實作（相同字串就跳過）會使 `Enter` 無法前進，因為
循環使用的正是同一個字串。已寫入 LOO-25 的 NG-1。

## LOO-23／24／25 驗證結果

- Linear：LOO-23、LOO-24、LOO-25 均為 `Done`
- GitHub：PR #28、#29、#30 均已合併，三者的 `smoke` 與 `rust` 皆為 `SUCCESS`，
  且均取得 `loop-approved`
- Frontend tests：76 passed（四個測試檔，含新增的
  `TerminalSlot.search.test.ts`）
- 實機驗證：三者皆已完成（2026-07-28）。搜尋在 LOO-24 修正後確實可用、多個
  符合處會被標示、中文送出後停在第一個符合處；LOO-25 的焦點修正完全成立——
  搜尋列已開時 `Command+F` 取回焦點、關鍵字未被全選、`Escape` 可關閉
- 教訓：對於「只有真實環境才成立」的整合，mock 會讓測試看似有覆蓋而實際為零。
  這類功能的實機驗證不是收尾的可選步驟，而是唯一的防線

## LOO-26／27 終端連結開啟

兩個 issue 構成同一條線：純文字網址與 OSC 8 超連結是 xterm 裡兩條完全獨立的
路徑，第一次只涵蓋了其中一條。

**LOO-26（PR #32）** 安裝 `@xterm/addon-web-links`，以 `LINK_URL_REGEX` 只
linkify `http`／`https`，自訂 handler 檢查 `event.metaKey` 後透過
`runtime.openExternalUrl` 開啟。Command+Click 而非單擊，是為了不搶走終端原本的
游標定位與拖曳選取。

這是本專案**首次跨出 `core:default`**。新增 `tauri-plugin-opener`，capability
的權限寫得比規格要求更嚴：

```json
{ "identifier": "opener:allow-open-url",
  "allow": [{ "url": "http://*" }, { "url": "https://*" }] }
```

只取 `opener:allow-open-url` 一項（未用 `opener:default`，未授予開啟本機路徑或
reveal in dir），並用 `allow` 清單把可開啟的 URL 限制在兩種 scheme。加上應用層的
`isOpenableUrl()`，共三層防護。

**LOO-27（PR #33）** 補上遺漏的另一條路徑。Codex CLI 以 OSC 8 轉義序列宣告
超連結，那由 xterm 的 `linkHandler` 處理，與 addon 無關；未設定時 xterm 會退回
瀏覽器 `confirm`，在 WKWebView 中通不到 opener，表現為 Command+Click 毫無反應。
修正後設定 `linkHandler`，`allowNonHttpProtocols: false` 明確寫死，並抽出
`openLinkOnCommandClick()` 讓兩條路徑共用同一份判斷，避免日後 drift。

診斷關鍵是實機的視覺特徵：OSC 8 連結在 hover **之前**就有點狀底線，
`WebLinksAddon` 建立的連結只在 hover 時才畫底線。

## LOO-26／27 驗證結果

- Linear：LOO-26、LOO-27 均為 `Done`
- GitHub：PR #32、#33 已合併，`smoke` 與 `rust` 皆 `SUCCESS`，皆取得
  `loop-approved`
- Frontend tests：81 passed（4 個檔案）
- PR #33 提出負面驗證：移除 `linkHandler` 後新增的兩個測試會失敗
- 實機驗證已完成：Codex 那格的 OSC 8 連結、其他格的純文字網址皆可
  Command+Click 開啟；一般點擊不觸發，拖曳選取正常
- 註記：此功能無法由自動化涵蓋兩條路徑是否都接上——jsdom 不處理 OSC 8 轉義
  序列，LOO-26 的測試驗證的是它實際實作的純文字路徑，並未說謊，只是規格當初
  沒有想到 OSC 8。這是規格盲點而非測試造假，與 LOO-23 的 mock 問題性質不同

## LOO-28 位置編址的終端快捷鍵

LOO-28 已完成並透過 PR #35 合併，由 `/finn-spec` → `/finn-build` →
`/finn-review` 全程產出：

- Cmd+1 至 Cmd+4 依**畫面位置**移動鍵盤焦點，不是依 Slot 身分。訪談時使用者
  明確選了位置編址：只顯示兩三格時要能從左邊數過去按。All 版面下兩套編號
  一致，自訂版面下則跟著顯示佇列，例如佇列為 Slot 3、1、4 時 `⌘2` 是 Slot 1。
- 位置順序抽成 `displayedSlotOrder(queue)`，grid 排列與快捷鍵**共用同一個
  函式**。原本這段邏輯內嵌在 render 裡，若快捷鍵另寫一份，兩者日後必然 drift。
- 超出可見格數的號碼無作用；快捷鍵一律不改變版面，隱藏的 Slot 不在編址範圍
  內，因此「按了會不會把隱藏的格叫出來」這個問題根本不存在。
- Cmd+0 回到 All 的 2×2 且不移動焦點。數字鍵管焦點、0 管版面，職責分開。
- 五個組合鍵在 `dialogOpenRef` 為真時**仍然 preventDefault 但不執行動作**。
  順序是刻意的：先吞掉再判斷，否則對話框開著時 Cmd+0 會落回 WebView 自己的
  縮放重設。
- `TerminalSlot` 新增 `focusToken` prop，App 以遞增 token 要求聚焦，而非傳
  boolean。這樣連按同一個鍵、或該格已持有焦點時都仍會重新 `focus()`；初始值
  0 使掛載時不會偷走焦點。
- 焦點外框用 `outline`，刻意避開 LOO-17 兩種注意力光暈使用的 `border-color`
  與 `box-shadow`，兩者不會互相覆蓋。
- `.terminal-hidden` 由 `visibility: hidden` 改為 `opacity: 0`。這是 AC-10
  的必要條件：`visibility: hidden` 的元素不可聚焦，Idle 格會按不進去。實際
  遮住空終端的是疊在上層的 `.terminal-empty` 覆蓋層，不是這個屬性。
- `CONSOLE_SHORTCUT_DIGITS` 由 `TerminalSlot` 匯出、App 引用，xterm 的
  `attachCustomKeyEventHandler` 用它擋下數字鍵不當成終端輸入；回傳 `false`
  只阻止 xterm 處理，事件仍會到達 App 的 window 監聽器。
- 未新增 storage schema、未修改 `src-tauri/`、未註冊 macOS 原生選單或系統層級
  全域快捷鍵，Web runtime 不受影響。

## LOO-28 驗證結果

- Linear：LOO-28 為 `Done`
- GitHub：PR #35 已合併，`smoke` 與 `rust` 皆為 `SUCCESS`，取得 `loop-approved`
- Frontend tests：87 passed（既有 81 加新增 6），4 個檔案
- 變更範圍：`frontend/src` 六個檔案，345 行新增、9 行刪除，未觸及 `src-tauri/`
- `test/setup.ts` 的 xterm mock 原本 `focus()` 是空函式、`open()` 什麼都不做，
  斷言必然全綠而毫無意義——正是 LOO-23 那個 mock 盲點的形狀。本次改為 `open()`
  真的建立 helper textarea、`focus()` 真的聚焦它，讓 App 的 `focusin` 監聽器
  在測試中確實被觸發
- **實機驗證已完成**（2026-07-29）。依 issue 的 How to verify 展開為 17 項
  逐一執行，全數通過，包含四項自動化完全碰不到的：三格版面下 `⌘2` 正確聚焦
  右上的 Slot 1 而非 Slot 2（位置編址與身分編址分歧的關鍵一步）；三種對話框
  開啟時 Cmd+0～4 皆無作用且未落回 WebView 縮放；Cmd+F 搜尋列開著時按快捷鍵
  可跨格移動焦點且原格關鍵字未被清除；Idle 格可被聚焦。全程沒有任何字元漏進
  CLI
- 唯一發現與 LOO-28 無關：LOO-17 的注意力光暈功能正確但視覺上不夠顯眼，
  已由 LOO-29 處理

## LOO-29 注意力光暈：規格被實機推翻兩次

LOO-29 已完成並透過 PR #37 合併。**這是目前為止唯一一個規格在實作期間被實機
回饋反轉的 issue**，過程比結果值得記。

最終行為：

- 終端邊框只標記 `output`。靜態光暈由 `0 0 10px` @ 35% 提升為
  `0 0 0 1px` @ 75% ＋ `0 0 22px 2px` @ 65%，出現時延遲 0.4 秒後脈動 3 次、
  每次 1.2 秒，之後停在靜態強度。
- **`terminated` 在終端邊框完全沒有樣式**。`styles.css` 裡沒有
  `.console-slot-attention-terminated` 規則，也沒有 `.console-slot-attention`
  裸規則，class 掛上去對應到零。session 結束改由 Header 的橘色方點與生命週期
  圓點負責。
- `prefers-reduced-motion: reduce` 關閉脈動、保留靜態加強。
- 全部只動 `styles.css`，`App.tsx` 一行未改。

**三個必須留住的實作理由**：

1. **不能加粗 `border`。** `.console-slot` 的 `border` 是 1px，加粗會縮小終端
   可用區域並觸發 `fitAndReport()` 與 `resizePty`——標記亮起就重排 CLI 畫面。
   可用的是 `box-shadow`、`border-color` 與動畫這些不影響 layout 的通道。這與
   LOO-23 把搜尋列做成浮層是同一個約束。
2. **不能用 `outline`。** 那個通道被 LOO-28 的焦點外框佔走了。
3. **0.4 秒延遲是為了隱藏格重新顯示的情境。** 顯示一個被標記的隱藏 Slot 會讓
   整個 grid 重排，脈動夾在重排中間看起來是雜訊。CSS 無法區分「剛被標記」與
   「剛被顯示」，所以延遲對兩者同時生效；因為延遲期間標記已是全強度靜態光暈，
   等待不會遮蔽任何資訊。

**兩次被實機推翻的規格**，兩次都在合併前修訂 Linear 才繼續：

- 初版 AC-3 是 `0.8 秒 × 3`、無延遲。實機看是「急促」而非「呼吸」，且隱藏格
  切回來時脈動與版面重排同時發生，使用者形容為雜亂。改為 1.2 秒並加延遲。
- 初版 AC-2 要求 `terminated` **明顯強於** `output`，AC-10 還特地要求確認橘色
  與 Hermes 琥珀色可分辨。實機結論相反：同一個邊框承載兩種光暈互相競爭，比
  只有一種更難讀。AC-2 反轉為「不得產生任何視覺效果」，AC-10 改為保護 Header
  橘方點，原 AC-10 刪除——那個色彩衝突連同橘色一起退場了。

**一個副作用必須知道**：`terminated` 覆寫 `output` 的邏輯沒變，而 `terminated`
現在沒有樣式，所以**正在發光的 Slot 會在 session 結束的瞬間熄滅**。畫面上看
起來像「安靜下來、處理完了」，實際是「結束了」。這是刻意的結果不是標記遺失，
`styles.css` 該規則上方已有註解說明，避免日後被當成缺陷修掉。

**流程上的教訓**：這個 issue 是「PR 開著時直接改比合併後另開 issue 快」的實
例——三個 commit、兩輪實機回饋，全程沒有重跑 `finn-build`。代價是**規格要自己
維持誠實**：每次改動都同步修訂 Linear，否則 `finn-review` 拿舊契約對照新 diff
必然判不通過。第三次審查另外抓到 PR body 仍停在第一版設計（scope ledger 引用
已被推翻的 AC），合併前已重寫，PR 標題也一併改掉——標題會直接成為 `main` 上
的 commit message，而原標題的「marks」是複數，與「拿掉一個」的實際結果不符。

## LOO-29 驗證結果

- Linear：LOO-29 為 `Done`
- GitHub：PR #37 已合併，`smoke` 與 `rust` 皆為 `SUCCESS`，取得 `loop-approved`
  （共審查三次，最後一次對 head 檔案而非只看 diff 驗證 `terminated` 確實零效果）
- Frontend tests：87 passed，總數不變。**本 issue 刻意不新增自動化測試**：
  jsdom 不計算 CSS 也不執行動畫，針對光暈強度或脈動次數的斷言只會驗證到測試
  自己寫下的字串，那正是 LOO-23 的 mock 盲點形狀
- 變更範圍：`frontend/src/styles.css` 單一檔案
- 實機驗證已全數完成：光暈明顯度、1.2 秒的呼吸感、持續輸出不重複脈動、隱藏格
  重新顯示不再雜亂、`terminated` 光暈確認消失、焦點外框與標記並存仍可區分、
  四格同時標記不干擾閱讀
- PR #37 合併時尚缺的兩項已於合併後補完，皆正常：`prefers-reduced-motion`
  開啟時不脈動且保留靜態光暈；session 結束時 Header 橘色方點照常出現。
  後者是 AC-10 的核心——終端邊框退出後，Header 是結束狀態唯一的提示來源，
  它若沒出現，這個 issue 等於把結束標記整個弄丟了。PR 描述停在合併當下的
  狀態，未再更新

## LOO-30 清除傳給 Claude Slot 的 session 標記

LOO-30 已完成並透過 PR #40 合併，結束了從 2026-07-28 就掛在「未完成事項」的
唯一功能性缺陷。詳細根因見下方「Continue session 的除錯記錄」。

- `SystemPtyAdapter::spawn` 在建好 `CommandBuilder` 後套用一份「待移除環境
  變數」清單。provider 為 `claude` 時清單是 `["CLAUDE_CODE_CHILD_SESSION"]`，
  其餘三家是空的。
- **清單由引擎依 provider 決定後傳給 adapter，不寫死在 `SystemPtyAdapter`
  裡。** 這是刻意的可測性結構：`PtyAdapter` 在測試中被 `FakeAdapter` 整個
  取代，規則若住在 adapter 內部就永遠斷言不到，全綠等於零覆蓋——LOO-23 的
  形狀。改成參數後 `FakeAdapter` 可以記錄它收到什麼，四個 provider × 兩種
  session mode 的組合全部可驗。
- 是**移除**不是設成空字串。Claude Code 兩種情況都視為標記存在，覆寫無效。
- **只清一個變數。** 其餘 12 個 `CLAUDE_CODE_*` 原封不動傳下去，包含兩個
  OAuth 相關的。當初 status.md 把「清哪些」列為未決的產品問題，但實測確認
  有害的只有被 Claude Code 警告訊息點名的那一個，其他的沒有證據，不賭。

## LOO-30 驗證結果

- Linear：LOO-30 為 `Done`
- GitHub：PR #40 已合併，`smoke` 與 `rust` 皆為 `SUCCESS`，取得 `loop-approved`
- 變更範圍：`src-tauri/src/pty_session.rs` 單一檔案，+89 行
- 七條 AC 全數實機驗證通過（2026-07-30）

**驗證方法值得留存：用 `ps eww` 直接讀 Slot 內 CLI 的程序環境。** 比在終端裡
叫 CLI 自己印可靠，也不必賭警告訊息會不會出現、文字有沒有改。同一次 App 執行
中三方對照：

| 程序 | `CLAUDE_CODE_*` 數量 | `CHILD_SESSION` |
|---|---|---|
| App 本身 | 13 | 有 |
| Slot：claude | 12 | **沒有** |
| Slot：codex | 13 | 有 |

codex 那格是同一次執行裡的對照組，同時排除了「其實環境本來就沒帶標記」這個
替代解釋——不必為了取得修正前對照而回 `main` 重建一次。

transcript 寫入的證據同樣具體。在 `/Users/zackchiu/ClaudeCodeCLI`（該資料夾
先前活動停在 7/29，無其他 session 干擾）先 New 再 Continue，同一個 `.jsonl`：

- New：15:11:46 → 15:13:13，26 筆記錄、42,620 bytes
- Continue：15:22:19 → 15:22:22，35 筆記錄、54,192 bytes
- 目錄檔案數維持 4 個不變，證明 Continue 是接上原 session 追加，而非另開

**選資料夾要避開有其他 session 在寫的路徑。** 本 repo 的 project 目錄
（`-Volumes-1TBM2-AI-Drive-ClaudeCode-Projects-agentsconsole`）當時有三個
Claude Code session 正在寫入，「檔案變大」在那裡不構成證據，`--continue`
還會接到正在進行的對話並與之共寫同一個檔案。

AC-5（乾淨環境行為不變）另在一般 Terminal 啟動確認，四個 provider 皆正常。

## LOO-31 打包版的 PATH：第一次打包就撞上的阻斷缺陷

LOO-31 已完成並透過 PR #43 合併。**它是首次打包後三分鐘內就出現的缺陷，而且
在此之前二十幾個 issue、無數次實機驗證都不可能發現它。**

**根因**：macOS 只給 launchd 啟動的 App 一份裸 `PATH`——
`/usr/bin:/bin:/usr/sbin:/sbin`，四個目錄。四個 CLI 都裝在 `~/.local/bin`，
因此 `resolve_executable()` 一個都找不到，四個 provider 全部 Unavailable，
整個打包版無法使用。`tauri:dev` 繼承的是終端機環境，`PATH` 一直完整，所以
這條路徑從未被走到過。

**修法**（`src-tauri/src/providers.rs`）：

- App 啟動與每次 `Refresh` 都以 `$SHELL -l -c 'printf %s "$PATH"'` 向登入
  shell 要一份 `PATH`，逾時 `LOGIN_SHELL_TIMEOUT` 為 3 秒。
- **只用 `-l` 不用 `-i`**。實測確認本機 `PATH` 設於 `.zprofile`（login 會讀），
  `-l` 已足夠；`-i` 會執行 `.zshrc`、帶入互動副作用與更高的卡住風險。
- `merge_search_path()` 把探測結果與程序既有的 `PATH` **聯集**：既有項目保留
  原位與優先序，探測到的接在後面，重複去除。探測失敗、逾時、`$SHELL` 未設定
  或回傳空字串時，改用 `FALLBACK_DIRECTORIES` 四個常見位置，同樣聯集。
  **任何情況都不會比修正前更糟。**
- `LoginShellProbe` 抽成 trait，測試注入替身，不會真的執行使用者的 shell。
- 有效路徑快取於 `search_path_cell()`，`refresh_search_path()` 供 Refresh 重探。
- 同一份路徑也交給 Slot 內啟動的 CLI。**這一半同樣重要**：只修偵測的話，CLI
  能啟動但找不到 `git`、`node`，會在使用中途以難以歸因的方式失敗。
- provider 不可用時，Sidebar 的 `Executable path` 列出實際搜尋過的目錄，
  不再只寫 `Not found in PATH`。

## LOO-31 驗證結果

- Linear：LOO-31 為 `Done`
- GitHub：PR #43 已合併，`smoke` 與 `rust` 皆 `SUCCESS`，取得 `loop-approved`
- 變更範圍：6 個檔案，+359／−7
- **九條 AC 中七條實機驗證通過**（2026-07-31），兩條僅自動化涵蓋

實機驗證用的是打包後**從 Finder 點開**的 `.app`，這是唯一算數的方式——
`tauri:dev` 與從終端機 `open` 都會把呼叫端環境整份帶過去，測不出差別。過程中
就曾因此誤判過一次 launchd 的 `PATH`。

| AC | 依據 |
|---|---|
| AC-1 合併語意與順序 | 搜尋清單前四個是 launchd 裸值，探測結果接在後面 |
| AC-4 Refresh 重新探測 | 註解掉 `.zprofile` 兩行 → 四個 Unavailable → 還原 → 恢復 |
| AC-5 三處共用入口 | 偵測、Slot 啟動、版本查詢皆正常 |
| AC-6 子 CLI 的 PATH | Slot 內 `echo $PATH` 完整、`git --version` 回 2.54.0 |
| AC-7 顯示搜尋路徑 | 改名 `hermes` 後展開，列出 16 個目錄且含 `~/.local/bin` |
| AC-8 Finder 啟動四格 Available | 最終判準 |
| AC-9 dev 模式不退化 | 終端機啟動四個仍 Available |

AC-2（回退清單）與 AC-3（3 秒逾時）僅自動化涵蓋：要驗得刻意破壞或拖慢使用者
的 shell，代價高於價值。

**AC-4 驗出了測試碰不到的東西。** 原本評估它「自動化涵蓋度較好、可略過」，
實機做出來才看到：同一個執行中的 App 不重啟，只因為 `~/.zprofile` 改了就從
四個 Available 變成四個 Unavailable、還原後又全部回來。Rust 測試只能斷言探測
函式被再呼叫一次，證明不了整條路徑真的重走了一遍。

**AC-7 的顯示設計值得留意。** 那份清單讓「找不到」自己說明原因：清單裡有
`~/.local/bin`，代表該目錄確實被搜尋了，找不到純粹是因為檔案被改名。若修正
失效，清單只會有四個裸目錄。下次再遇到同類問題，展開就知道，不必再用
`ps eww` 查一次程序環境。

## LOO-32 縮小 Console 四格終端間隔

LOO-32 已完成並透過 PR #45 合併，全程走 `/finn-spec` → `/finn-build` →
`/finn-review` 流程：

- `.console-grid` 的 `gap` 由 `10px` 改為 `4px`，唯一的程式碼變更是
  `frontend/src/styles.css` 一行；1／2／3／4 格所有版面模式共用同一個
  gap，全部一起縮小。
- 依 NG-1 至 NG-3，視窗邊緣 padding、sidebar 與 Console 之間、警示區與
  grid 之間的留白維持不變；Slot 邊框、圓角與注意力光暈樣式也未動，4px
  下相鄰 Slot 的光暈較貼近屬預期結果。
- 純 CSS 變更，未新增自動化測試；既有 `npm test` 與 build 維持通過。

## LOO-32 驗證結果

- Linear：LOO-32 為 `Done`
- GitHub：PR #45 已合併（merge commit `7409adf`），review `loop-approved`，
  `smoke` 與 `rust` 皆 `SUCCESS`
- CI 插曲：第一次 run 的 `rust` job 在「Set up job」就失敗，macOS runner
  根本沒啟動，checkout 之後的步驟一步都沒執行；`smoke` 同時排隊超過
  10 分鐘。這是 GitHub Actions 的基礎設施故障，與變更無關（CSS-only
  碰不到 Rust）。處法：等整個 run 結束後 `gh run rerun <run-id> --failed`
  只重跑失敗的 job（run 進行中無法重跑）。**不必重開 PR**——新 run 兩個
  job 都要重新排隊，只會更慢。重跑後兩個 check 皆綠。
- 打包：2026-08-07 已重新建置並以 `ditto` 部署至
  `/Volumes/OWC1M2/AgentOSConsole/`，存檔於 `builds/2026-08-07-7409adf/`，
  `BUILDS.md` 已更新。建置沿用 APFS 映像既有快取，Rust 編譯僅 18 秒。
- 分支收尾：本地與遠端 `LOO-32-console-grid-gap` 及本地
  `docs/loo-31-handoff` 均已刪除，兩個 worktree 皆與 `origin/main` 同步
  且工作樹乾淨。

## LOO-33 為 Slot 內的 CLI 補上 TERM、COLORTERM 與 LANG

LOO-33 已完成並透過 PR #47 合併，全程走 `/finn-spec` → `/finn-build` →
`/finn-review` 流程。**這是第三個「Finder 啟動的環境太裸」缺陷**：LOO-30 是
session 標記、LOO-31 是 `PATH`，這次是終端能力變數。

**根因**：從 Finder 啟動的 App 繼承 launchd 的 11 個環境變數，其中沒有
`TERM`、`COLORTERM`、`LANG`；`portable-pty` 只額外補 `SHELL`。Claude Code
（Node／Ink，走 `supports-color`）在這種環境下把顏色**與粗體**一併關閉，
背景 agent 選單因此看不到高亮、狀態星號沒有顏色；同一個 CLI 在 Terminal.app
裡完全正常。Codex（ratatui）不論環境都輸出顏色，所以另一格看起來沒事，
反而掩蓋了問題。

**修法**（`src-tauri/src/pty_session.rs`）：

- `SystemPtyAdapter::spawn` 在建好 `CommandBuilder` 後，對四個 provider 一律
  補上 `TERM=xterm-256color`、`COLORTERM=truecolor`、`LANG=en_US.UTF-8`——
  **只在該變數缺失時補，既有值一律不覆寫**，因此 `tauri:dev` 或從終端機
  啟動時行為不變。
- LOO-31 的 `PATH` 聯集與 LOO-30 的 `CLAUDE_CODE_CHILD_SESSION` 移除維持不變。
- Rust 單元測試涵蓋「缺失→補上」與「已存在→保留」兩種情況。
- README 的環境繼承段落已隨 PR 更新。

## LOO-33 驗證結果

- Linear：LOO-33 為 `Done`
- GitHub：PR #47 已合併（merge commit `eaa2e67`），review `loop-approved`，
  `smoke` 與 `rust` 皆 `SUCCESS`
- 變更範圍：`README.md` 與 `src-tauri/src/pty_session.rs` 兩個檔案，
  +139／−8
- 診斷方法沿用 LOO-30：對執行中的 App 及其 `claude` 子程序直接 `ps eww`
  讀環境，確認 App 本身只有 launchd 的 11 個變數、子 CLI 缺少三個終端
  變數。**遇到「打包版看起來怪、dev 模式正常」的症狀，先用這招比對兩邊
  環境，不要從 CLI 本身找起。**
- 打包：2026-08-15 15:57 已從 `eaa2e67` 重新建置並以 `ditto` 部署至
  `/Volumes/OWC1M2/AgentOSConsole/`，存檔於 `builds/2026-08-15-eaa2e67/`，
  `BUILDS.md` 已更新。建置沿用 APFS 映像既有快取，Rust 編譯僅 16 秒；
  已以 `strings` 確認部署的二進位含 `xterm-256color`、`truecolor`、
  `en_US.UTF-8` 三個字面值。
- 分支收尾：本地與遠端 `LOO-33-slot-terminal-env-defaults` 均已刪除，兩個
  worktree 皆與 `origin/main`（`eaa2e67`）同步且工作樹乾淨。

## LOO-34 Continue 改由 App 挑對話再 `claude --resume`

LOO-34 已完成並透過 PR #54 合併，全程走 `/finn-spec` → `/finn-build` →
`/finn-review` 流程。起點是使用者回報：在一個 session 打 `/stop` 之後，
Continue 就回 `No conversation found to continue`。

**根因**：`claude --continue` 自己挑對話，規則是
`if (E.sessionKind) return false`（讀 CLI 2.1.237 的二進位確認）。背景 agent
的 transcript 每一筆都帶 `"sessionKind":"bg"`，所以永遠被跳過。`/stop` 不是
肇因——它的說明是 "transcript and worktree are kept"，檔案確實保留，標記也
不會因為停止而消失。由此衍生兩個症狀：workspace 只有背景對話時直接報找不到；
workspace 混有非背景對話時**靜悄悄接到舊的那筆**，畫面上沒有任何線索。
對照組是 `/resume`，它只濾掉 `sessionKind` 為 `daemon`／`daemon-worker`，
`bg` 列得出來——問題出在 `--continue` 這個旗標的選擇，不是 CLI 沒能力接。

**修法**（新增 `src-tauri/src/claude_resume.rs` 與
`backend/app/claude_resume.py`）：

- 由 workspace 路徑推出 CLI 的 project 目錄。`project_slug` 重現 CLI 的
  `replace(/[^a-zA-Z0-9]/g, "-")`；超過 200 字元時 CLI 會截斷再接自己的
  hash，那種情況回 `None` 不猜
- 取 mtime 最新、且 transcript 自身記錄的 `cwd` 與該 workspace 相符的那筆。
  **slug 是有損的**（`/`、`_`、空白都變 `-`，本機真的有一組撞名），所以歸屬
  由 `cwd` 決定而不是目錄名；`cwd` 不在第一筆記錄上（實測落在第 4 與第 7
  行），因此掃描前 64 行，讀不到就跳過而不假設相符
- 跳過程序仍存活的 session（`sessions/*.json` 配 pid，signal 0 判定，
  `EPERM` 算活著）。**每次 Continue 重算、不快取**，因為停掉的背景 session
  隨時可能從 Agent View 被重新拉起
- 挑得出來就跑 `claude --resume <id>`；挑不出來退回原本的 `--continue`，
  由 CLI 自己報「沒有東西可接」，行為與過去一致
- `provider_command()` 改回傳
  `ProviderCommand { executable, arguments, resumed_session_id }`，Slot 狀態列
  在 `Continue` 標記後顯示 `↩ 3f2c1c05`，完整 id 在 hover 的 title
- 其他三家不經過這條路：codex／hermes／antigravity 的固定參數與測試不變

## LOO-34 驗證結果

- Linear：LOO-34 為 `Done`
- GitHub：PR #54 已合併（merge commit `dee14ab`），review `loop-approved`，
  `smoke` 與 `rust` 皆 `SUCCESS`
- 變更範圍：13 個檔案，+1210／−36。新增 `src-tauri/src/claude_resume.rs`、
  `backend/app/claude_resume.py`、`backend/tests/test_claude_resume.py`；
  另改 `launcher.rs`／`launcher.py`／`pty_session.rs`／`lib.rs`／
  `TerminalSlot.tsx`／`types.ts`／`styles.css`／各自的測試與 `README.md`
- 兩個驗收 workspace 以真實 `~/.claude`（唯讀）確認：
  `~/ClaudeCodeCLI/PromptAgent` 解出 `26624ea6…`（`--continue` 完全跳過的
  那筆）；`~/ClaudeCodeCLI` 解出 `3f2c1c05…`（8/20 09:50 的背景對話，而非
  `--continue` 會接到的 8/19 16:51 `a13aa2d3…`）
- **打包驗證有個會誤導人的陷阱，別重走**：`--resume` 剛好 8 bytes，arm64
  release build 把它編成 `mov`／`movk` 立即值直接寫進指令，rodata 裡沒有
  這串，`strings | grep -- --resume` 與逐位元組搜尋都會落空，看起來像功能
  沒進去。反組譯在 `0x100215a60` 與 `0x10022e230` 兩處看到建出
  `0x656d757365722d2d`（`"--resume"` 的小端）後 `str x8, [x0]`，確認無誤。
  **驗證打包產物一律挑 9 bytes 以上的字面值**；本次用 `CLAUDE_CONFIG_DIR`，
  部署版有、`77c4d29` 存檔版沒有
- 打包：2026-08-20 11:46 已從 `dee14ab` 重新建置並以 `ditto` 部署至
  `/Volumes/OWC1M2/AgentOSConsole/`，存檔於 `builds/2026-08-20-dee14ab/`，
  `BUILDS.md` 已更新。沿用 APFS 映像既有快取，Rust 編譯 16.45 秒
- 分支收尾：本地與遠端 `LOO-34-claude-resume-session` 均已刪除，兩個
  worktree 皆與 `origin/main`（`dee14ab`）同步且工作樹乾淨

## 切換介面風格與 styles.css token 化（PR #50）

這一輪**沒有走 Finn-loop**：規格來自設計交接包
`design_handoff_console_restyle/`（`THEME_SWITCHING.md` 為實作指南、
`Agent Console Redesign.dc.html` 為可互動的視覺原型、`frontend-src/` 提供
四個現成檔案），由人工直接指示 Claude Code 依步驟實作，因此沒有 Linear
issue。交接資料夾留在工作樹、不入版控。

**做了什麼**（PR #50，squash merge `740ee61`，7 個檔案，+697／−244）：

- 新增 `frontend/src/themes.css`：三組色彩 token（`blueprint` 為現況深藍、
  `graphite` 中性灰、`daylight` 淺色）× 三組圓角 token（`square`／`soft`／
  `round`），由 `<html>` 的 `data-theme` 與 `data-radius` 兩個正交屬性選
  擇；`main.tsx` 在 `styles.css` 之前匯入。預設 `blueprint` + `square`
  （方角工程風），`round` 接近改版前外觀。
- 新增 `useAppearance.ts`（讀寫兩個屬性、localStorage 持久化，key
  `agentsconsole.appearance.theme`／`.radius`）與 `AppearanceControls.tsx`
  （`Style` 下拉 + 三顆圓角按鈕）。`App.tsx` 只改三處：兩個 import、一行
  hook、元件插在 `.tauri-header-controls` 內 `.terminal-font-controls` 之前。
- `styles.css` 依交接對照表把所有硬編碼顏色與 `border-radius` 換成變數，
  **只剩四個 provider 品牌色**（`grep -nE '#[0-9a-fA-F]{3,6}'` 恰為 4 筆）。
  漸層、scrim、modal 陰影、status-dot 光暈改用 `--body-bg`／`--scrim`／
  `--shadow-modal`／`--glow`；h1 光暈、card selected、input focus ring、
  Header 注意力點與 `.console-slot-attention-output`（含 `@keyframes`）的
  `rgb()` 改為 `color-mix(in srgb, var(--primary-line|--warn|--primary) N%,
  transparent)`，三個主題都跟主色走。
- 對照表以外的判斷：disabled 狀態的 `#303847`／`#151a22` → `--line-2`／
  `--bg-raised`；`#e4efcf`（handoff 按鈕字）→ `--warn`；`#4a5fd4` →
  `--primary-line`；`.terminal-search` 底 → `--bg-chrome`。**一處刻意偏離對
  照表**：`.terminal-slot` 的 `#080c12` 表上是 `--bg-sunken`，但 xterm 底色
  依指示用 `--bg-window`，兩者在 Daylight 差很多（`#eef0f4` vs `#fff`）會
  在終端四周留 6px 灰邊，所以 `.terminal-slot` 也用 `--bg-window`。
  `.slot-view-attention-terminated` 的 `border-radius: 2px` 不在表上，保留。
- `TerminalSlot.tsx`（唯一允許動的地方）：新增 `readTerminalTheme()`，以
  `getComputedStyle(document.documentElement)` 讀 `--bg-window`
  （background）、`--text-2`（foreground）、`--text`（cursor）、
  `--primary-line` + `59` alpha（selectionBackground，只在六位 hex 時附加）
  組成 xterm theme；每項保留原色 fallback，jsdom 與 CSS 未載入時外觀不變。
  掛載 effect 內加 `MutationObserver` 監聽 `<html>` 的 `data-theme`，變更時
  設 `terminal.options.theme`，原地重繪、不重建 Terminal、session 不中斷；
  cleanup 時 `disconnect()`。session／PTY／launcher／storage／Tauri／runtime
  邏輯完全未動。
- 已知的視覺取捨：Daylight + Round 時 h1 保留藍色光暈（`themes.css` 只在
  `square` 關掉裝飾層），深色字上有淡藍暈，可讀但略突兀；屬交接設計本身
  的決定，未動。
- 交接 `README.md` 用的 `--line-strong`／`--line-control` 是舊命名，
  `themes.css` 與 `THEME_SWITCHING.md` 一致用 `--line-2`／`--line-3`，以後者
  為準。

## 切換介面風格 驗證結果

- GitHub：PR <https://github.com/konicatc-techcoding/agentsconsole/pull/50>
  已合併（merge commit `740ee61`），`smoke` 與 `rust` 皆 `SUCCESS`；未跑
  `/finn-review`、無 review label、無 Linear issue，由人工判斷合併
- 變更範圍：`frontend/src/` 下 `App.tsx`、`main.tsx`、`TerminalSlot.tsx`、
  `styles.css` 修改，`themes.css`、`useAppearance.ts`、
  `AppearanceControls.tsx` 新增；+697／−244
- `cd frontend && npm test`：4 檔 88 tests 全數通過（App 55、TerminalSlot
  21、search 1、runtime 11），**未調整任何斷言**；`tsc -b` 與
  `npm run build` 通過；`git diff --check` 乾淨。stderr 的
  `HTMLCanvasElement.prototype.getContext` 訊息為既有（stash 後基線同樣出
  現），來自 search 測試載入真實 xterm 模組。
- 實機：`tauri:dev` 由使用者操作確認三個主題 × 三種圓角切換正常、xterm 隨
  `data-theme` 即時換色、風格重開後保留。Web runtime 另以 vite dev 確認
  token 解析與屬性切換。
- 打包：兩次。2026-08-15 22:58 先從分支 commit `37eb622` 建置部署（合併
  前，存檔 `builds/2026-08-15-37eb622/`）；合併後 2026-08-16 00:00 從
  `740ee61` 重建並以 `ditto` 部署至 `/Volumes/OWC1M2/AgentOSConsole/` 頂
  層，存檔於 `builds/2026-08-16-740ee61/`，`BUILDS.md` 兩筆皆已記錄。兩次
  建置的 binary **md5 完全相同**（squash 後原始碼一字不差、cargo 可重現），
  建置沿用快取，Rust 編譯 17 秒，12 MB。前端資產以 brotli 壓縮嵌入
  binary，`strings` 抓不到字面值——改以 build 產出的 `frontend/dist` 含
  `[data-theme=daylight]` 選擇器與 `agentsconsole.appearance.theme`，加上
  來源、頂層、存檔三份 binary md5 一致來驗證。**以後前端-only 的變更都要
  用這招驗證部署**，`strings` 只對 Rust 側字面值有效。
- 分支收尾：本地與遠端 `claude/console-theme-switching` 均已刪除，兩個
  worktree 皆與 `origin/main`（`740ee61`）同步；Claude Code worktree 僅餘
  untracked 的 `design_handoff_console_restyle/`。之後使用者要求直接刪除
  這份交接資料，已移至 `~/.Trash`（非 `rm -rf`，可從垃圾桶救回）。

## App icon（PR #52）

**根因**：`tauri.conf.json` 的 `bundle` 從 LOO-7 建立 Tauri Foundation 起
就沒有 `icon` 欄位。`src-tauri/icons/` 雖然一直有 scaffold 留下的
`icon.icns`／`icon.png`，但 macOS 打包在沒有明確 `bundle.icon` 時完全不帶
圖示——檢查歷次部署的 `.app` 都只有 `Contents/MacOS` 與 `Info.plist`，
沒有 `Contents/Resources`，`Info.plist` 也沒有 `CFBundleIconFile`。這正是
「後續候選」原第 1 項的根因；過去誤以為是「沒放 icon 檔」，其實檔案在，
只是沒被引用，Finder／Dock 因此顯示通用文件圖示。

**修法**：使用者提供 `~/Downloads/export/` 內 1024px、含透明通道的來源圖
（`AICLI-icon-1024.png`），以 `npx tauri icon <source> --output
src-tauri/icons` 產出完整圖示集；該指令同時會產 iOS／Android／Windows 一整
組，因為 `bundle.targets` 只有 `["app"]`，全數刪除只留 macOS 五個檔案
（`icon.icns`、`icon.png`、`32x32.png`、`128x128.png`、`128x128@2x.png`）。
`tauri.conf.json` 的 `bundle.icon` 明確列出前四者路徑。

**驗證方式**：先用建置產物（非正式部署那份）重建一次，確認
`Contents/Resources/icon.icns` 存在且 `Info.plist` 有
`CFBundleIconFile = icon.icns`；把 `.icns` 用 `sips -s format png` 轉回
PNG 檢視，經過 macOS squircle 遮罩後與來源圖一致，才進入正式部署。這個
「先用建置產物本身、不碰正式部署副本」的做法，是為了在確認視覺結果前不
讓未合併變更影響到 `/Volumes/OWC1M2/AgentOSConsole/` 目前使用中的版本。

## App icon 驗證結果

- GitHub：PR <https://github.com/konicatc-techcoding/agentsconsole/pull/52>
  已合併（merge commit `77c4d29`），`smoke` 與 `rust` 皆 `SUCCESS`；無
  Linear issue，由人工判斷合併
- 變更範圍：`src-tauri/tauri.conf.json` 修改，`src-tauri/icons/icon.icns`／
  `icon.png` 修改，`32x32.png`／`128x128.png`／`128x128@2x.png` 新增；無
  Rust 或前端原始碼變更，`smoke`／`rust` 兩個 required check 涵蓋的程式碼
  路徑其實沒動到，綠燈只代表沒有連帶破壞
- 未跑 `npm test` 或 `cargo test`：這次異動只有設定檔與二進位圖示資產，
  沒有任何 `.ts`／`.tsx`／`.rs` 變更
- 打包：2026-08-19 13:45 從 `main` 的 `77c4d29` 建置並以 `ditto` 部署至
  `/Volumes/OWC1M2/AgentOSConsole/` 頂層，存檔於 `builds/2026-08-19-77c4d29/`，
  `BUILDS.md` 已記錄。建置沿用既有快取，Rust 編譯 21 秒；大小 11 MB
  （比前一版小 1 MB，屬預期，來源圖示的中介產物本來就比 scaffold 版小）。
  三份 binary（建置來源、頂層、存檔）md5 一致，且 `Info.plist` 的
  `CFBundleIconFile` 與 `Contents/Resources/icon.icns` 均已確認存在
- 分支收尾：本地與遠端 `claude/app-icon` 均已刪除，兩個 worktree 皆與
  `origin/main`（`77c4d29`）同步

## Continue session 的除錯記錄

2026-07-28 調查「Claude CLI 的 continue 不會帶入先前對話，其餘三家正常」。
結論是 App 的環境繼承缺陷，記錄於此避免日後重複調查。

**Continue 另有一個與本節無關的根因，見「LOO-34」章節。** 兩者要分清楚：
本節是 transcript 根本沒被寫出來（App 傳了 `CLAUDE_CODE_CHILD_SESSION`
下去，已由 LOO-30 修正）；LOO-34 是 transcript 明明存在，但 `--continue`
自己把背景 agent 的對話跳過。遇到 Continue 的症狀先分辨是哪一種。

**根因**：`portable-pty` 的 `CommandBuilder::new()` 以 `std::env::vars_os()`
完整繼承父程序環境。當 App 由某個 Claude Code session 啟動時，
`CLAUDE_CODE_CHILD_SESSION=1` 會傳到 Slot 內的 `claude` CLI，Claude Code 判定
自己是子 session 便**關閉 transcript 儲存**，終端底部顯示「Transcript saving is
off — inherited CLAUDE_CODE_CHILD_SESSION marker」。沒有 transcript，
`--continue` 自然回報 No conversation found。

**受控實驗**：同一個 New Folder 流程，帶標記時專案目錄只有 `memory/`、無
`.jsonl`；以 `env -u CLAUDE_CODE_CHILD_SESSION …` 重啟 App 後立刻寫出 68 KB
transcript，Stop 後 Continue 也正確接上。

**過程中被推翻的五個假設**，列出以免重走：旗標傳遞錯誤（Claude 有回
No conversation found，代表確實在查）；環境未繼承（實為完整繼承）；
`canonicalize()` 造成路徑偏移（`realpath` 完全相同，無 firmlink 變體）；
Stop 的 SIGKILL 毀掉檔案（先前的 transcript 完好存活）；New Folder 專屬缺陷
（清除標記後該路徑正常寫入）。

**各 CLI 的 continue 語意不同**，這是當初誤判方向的原因之一：

| CLI | Continue 語意 | 依據 |
|---|---|---|
| claude | 綁 cwd | `--help` 明寫「in the current directory」 |
| codex | 綁 cwd | 實機觀察（`--help` 未提） |
| antigravity | 綁 cwd | 實機觀察（`--help` 未提） |
| hermes | 全域最後一個 | 實機觀察 + `--no-restore-cwd` 佐證 |

四家皆將 session 存於家目錄（`~/.claude/projects/`、`~/.codex/`、`~/.hermes/`），
沒有任何一家存在 workspace 資料夾內；「跟著 workspace」的正確理解是集中式儲存
以 workspace 路徑當索引。

**此段的開發者注意事項已由 LOO-30 解除。** 原本從 Claude Code session 啟動本
App 供人工驗證時，必須以 `env -u` 手動清除標記，否則使用者的 Claude session
測試會白做。LOO-30 之後 App 自己會在 spawn 前移除
`CLAUDE_CODE_CHILD_SESSION`，直接啟動即可：

```bash
CARGO_TARGET_DIR=/Volumes/AgentOSBuild/target npm run tauri:dev
```

原本那條 `env -u` 指令清五個變數，範圍比修正大，現已不需要。保留於此僅供理解
當初的迴避方式：

```bash
env -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ID \
    -u CLAUDE_CODE_HOST_SESSION_ID -u CLAUDE_CODE_ENTRYPOINT \
    -u CLAUDE_CODE_EXECPATH \
    CARGO_TARGET_DIR=/Volumes/AgentOSBuild/target npm run tauri:dev
```

## 搜尋的兩項實機限制

以下兩點在實機驗證時才發現，均為 xterm 上游行為，**已決定維持現狀不修改**，
記錄於此避免日後重複調查。

**一、`activeMatchBackground` 是不會顯示的死設定。** `SEARCH_DECORATIONS` 裡的
`activeMatchBackground: "#6b4f00"` 實際上永遠看不到。addon-search 跳到作用中
符合處時會**選取**它，而 xterm 的選取層繪製在 decoration 之上，
`selectionBackground: "#334a78"` 因此蓋掉了該底色。邊框不受選取層覆蓋，所以
`activeMatchBorder: "#ffd54a"` 的亮黃邊框正常顯示。LOO-25 的目標（作用中符合處
一眼可辨）仍然達成，只是靠邊框而非底色。看到該色值卻在畫面上找不到它時，
不必再次調查。

**二、替代緩衝區的 CLI 沒有 decoration，也沒有 scrollback。** Claude Code 這類
全螢幕 TUI 跑在 alternate screen buffer；xterm 的 `registerDecoration` 在該模式
下直接回傳 `undefined`（型別文件明載 "undefined if the alt buffer is active"），
因此那些格子完全沒有搜尋標示，畫面上只看得到 `findNext` 造成的選取效果。
連帶地，替代緩衝區沒有 scrollback，該格的搜尋範圍實際上只有目前可見畫面，
而非 5,000 行歷史。Codex 這類走一般緩衝區的 CLI 則完全符合設計。這是兩種格子
表現不同的原因。

## 後續候選

依價值密度排序，尚未建立 issue。原第 1 項「App icon」已由 PR #52 完成
（見「App icon」章節），故此處移除、以下重新編號：

1. **持久化** — Session 名稱、Sidebar 收合、Slot view 選擇與終端字級目前都只
   在記憶體。要做就一次把四項納入同一次 `console-layout.json` schema v2 升級；
   Rust struct 有 `deny_unknown_fields`，需處理舊檔遷移。
2. **`App.tsx` 拆分** — 已超過 2000 行。**不建議當成獨立 issue**：純重構寫不出
   可觀察的 AC，而 `finn-review` 需要對照完整 diff 判斷是否越界，大型搬移正是
   自動審查最不可靠的場景。建議在後續功能開發時以小塊順手切出。
3. **Header 注意力小圓點的視覺強度** — LOO-29 的 NG-1 刻意沒動
   `.slot-view-attention*`。終端邊框既然已收斂成只標記新輸出，Header 現在是
   session 結束的唯一提示來源，6px 圓點夠不夠用值得實機再看一次。
4. **其他三家 CLI 的父 session 標記** — LOO-30 的 NG-2 刻意沒查。hermes、
   codex、antigravity 是否也有類似的「偵測到父 session 就改變行為」機制未知。
   目前沒有任何症狀，屬預防性調查，優先度低。
5. **遠端分支清理** — 遠端仍有 42 個已合併的歷史分支（不含 `main`，即
   LOO-5 至 LOO-31 的工作分支與歷次 docs handoff）；LOO-32 的分支已於
   2026-08-07 隨收尾刪除。本機維持只剩兩個 worktree 各自佔用的分支。
   屬雜務，不需佔用 Finn-loop 排程。
6. **交接包 README 描述的完整方角改版尚未實作** — PR #50 只做了
   `THEME_SWITCHING.md` 的範圍（主題切換 + token 化）。原始交接包
   `design_handoff_console_restyle/`（`README.md` 描述 header 42px、slot
   header 30px 的密度、1px hairline 網格、狀態方點與 45° 菱形注意力標記、
   workspace 列與 status bar 等版面改動；`Agent Console Redesign.dc.html`
   是可互動的參考稿）已於 2026-08-19 應使用者要求從本機刪除（移至
   `~/.Trash`，未進版控故 git 歷史也沒有）。若之後要做，token 已就位，
   只需改 `styles.css` 與少量 class，但視覺參考需要使用者重新提供。

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

1. 程式碼 PR 合併後執行 `/finn-handoff`：它會確認合併、清分支、同步兩個
   worktree、在有程式碼變更時重新打包並以 `ditto` 部署、更新本檔，最後開
   `docs/loo-NN-handoff` PR。文件改動一律走 PR，待 required check 通過後
   由人工合併，不可直接推 `main`；合併後再跑一次 `/finn-handoff` 清掉
   handoff 分支，確保兩個 worktree 都與 `origin/main` 同步且工作樹乾淨。
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
