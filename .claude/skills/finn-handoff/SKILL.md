---
name: finn-handoff
description: Use after a Finn-loop PR for this repo has been merged and the user asks to wrap up, hand off, package, deploy, or update status.md — e.g. "PR #NN merged", "把分支清掉", "打包並部署", "更新 status.md", "照 LOO-NN 一次做完". Covers everything between "the code PR merged" and "next /finn-spec can start".
---

# Finn-loop handoff

One pass closes one merged issue: clean branches, sync both worktrees, rebuild
and redeploy the packaged App when code changed, record the outcome in
`status.md`, and ship that record through its own PR. The App is used from
Finder, so a merge that never reaches `/Volumes/OWC1M2/AgentOSConsole/` is not
finished. Never `git push` to `main` directly and never merge — the user merges.

## 1. Confirm the merge

```bash
git fetch --prune origin
gh pr view <N> --json state,mergeCommit,headRefName,labels,additions,deletions,changedFiles --jq '{state, merge: .mergeCommit.oid, head: .headRefName, labels: [.labels[].name], additions, deletions, changedFiles}'
git log --oneline -1 origin/main
git show --stat --oneline <merge-sha>
```

Require `state == MERGED` and `git merge-base --is-ancestor <merge-sha> origin/main`;
otherwise stop and say so. Normally the merge SHA *is* `origin/main`; if
`origin/main` has already moved past it, the baseline recorded below is the
tip, and say so.

Also fetch the Linear issue named by the PR's `Closes LOO-NN` (Linear
connector `get_issue`) — its exact title, URL and state go into `status.md`
verbatim, and its description plus the PR body are the only sources for the
"what shipped / root cause" narrative. Keep for step 4: the
`git log --oneline -1` line verbatim (the new `最新合併基線`), the labels
(`loop-approved` etc.), the check results
(`gh pr view <N> --json statusCheckRollup`), and `git show --stat` as the
canonical file list and `+A／−D` counts (`變更範圍`). Short SHAs everywhere
in `status.md`. If you resume at step 4 in a fresh session, re-run this step
first, and take packaging facts from the last section of
`/Volumes/OWC1M2/AgentOSConsole/BUILDS.md` — never write facts you did not
just read.

## 2. Clean branches and sync both worktrees

This repo squash-merges, so `git branch -d` refuses to delete the work branch
("not fully merged"). Keep the upstream set and let git compare against it —
never reach for `-D`:

```bash
git switch --detach origin/main
git diff --quiet origin/main <branch> -- <paths the PR touched> && echo identical
git branch -d <branch>          # passes because upstream still exists
git push origin --delete <branch>
git -C /Volumes/1TBM2/AI_Drive/Codex_Projects/agentsconsole pull --ff-only
```

Both worktrees must end clean and at the same SHA. If `-d` still refuses,
`git branch --set-upstream-to=origin/<branch> <branch>` first (the branch may
have been detached from its upstream by an earlier step).

## 3. Package and deploy — only if code changed

Look at step 1's `git show --stat`. If every path is `*.md`, `.claude/`,
`.github/` or `docs/`, skip to step 4 and say the packaged App is unchanged.
Otherwise:

1. `pgrep -x agentos-console` — if the App is running, **stop and ask the user
   to quit it**; do not overwrite a running bundle.
2. `ls /Volumes/AgentOSBuild || hdiutil attach /Volumes/1TBM2/AI_Drive/agentos-build.sparseimage`
   (ExFAT cannot host the Rust build; the APFS image is the target dir).
3. From `frontend/`: `CARGO_TARGET_DIR=/Volumes/AgentOSBuild/target npm run tauri:build`
   — run in the background, it prints `Finished 1 bundle at: …/AgentOS Console.app`.
4. Deploy with `ditto`, never `cp -R` (it breaks the bundle signature):
   ```bash
   SRC="/Volumes/AgentOSBuild/target/release/bundle/macos/AgentOS Console.app"
   DST=/Volumes/OWC1M2/AgentOSConsole
   ditto "$SRC" "$DST/builds/$(date +%F)-<short-sha>/AgentOS Console.app"
   ditto "$SRC" "$DST/AgentOS Console.app"
   ```
5. Prove the deployed binary contains the change — `strings …/Contents/MacOS/agentos-console | grep <a literal from the diff>` — before claiming it is deployed.
6. Append a row to the table in `$DST/BUILDS.md` and a `## <date>-<short-sha>`
   section at the end, matching the existing entries (source commit, what
   changed, build time, "未簽章、未公證、無 DMG、無 updater、無 icon").

## 4. Update `status.md`

Edit these places, in this order, matching the neighbouring wording and
wrapping at the file's ~76-column width:

| Where | Change |
|---|---|
| `最後更新：` | today, `YYYY-MM-DD` |
| `## 下次對話直接使用` code block | baseline SHA, `LOO-12 至 LOO-NN`; if redeployed, replace the whole `（<date> 更新為 <sha>，含 LOO-NN 的 …）` clause |
| `## 目前功能狀態` first paragraph | one sentence for the new issue, after the previous issue's sentence — or after the feature-list sentence if the previous issue has none |
| `## Source of truth` → `最新合併基線：` | the `git log --oneline -1` line verbatim |
| `## Source of truth` → `打包產物` bullet | the `（目前為 \`<sha>\`）` SHA, only if redeployed |
| `## Source of truth` → issue block | change the label of the current `最近完成的 Linear issue：` line to `前一個：` (leave its URL/狀態 lines alone); insert a new three-line block above it: `最近完成的 Linear issue：\`LOO-NN <title>\``, `LOO-NN URL：<…>`, `LOO-NN 狀態：\`Done\`；PR <…>，merge commit \`<sha>\`，review \`<label>\`，\`smoke\` 與 \`rust\` 皆 \`SUCCESS\`` |
| After the previous issue's `## LOO-MM 驗證結果` section (LOO sections stay in ascending order) | insert `## LOO-NN <title>` — what shipped, root cause if a fix, scope kept per NGs — then `## LOO-NN 驗證結果` with bullets in this order: Linear / GitHub (PR, merge SHA, label, checks) / 變更範圍 (files, `+A／−D`) / anything a future session must not rediscover (CI incident, dead end, diagnosis trick) / 打包 (date, archive dir, how the binary was verified) / 分支收尾 |
| `## 未完成事項`, `## 後續候選` | only when this issue itself opened, closed, or changed the subject of an item; running lists inside them are otherwise left as they are |

Wrap prose you add at the file's ~76-column width; URLs, issue-title lines
and the verbatim baseline line are single long lines by design. `README.md`
is normally already updated by the code PR; touch it only if the merge changed
behavior it does not describe. Then `git diff --check`.

## 5. Ship the record

```bash
git switch -c docs/loo-NN-handoff
git add status.md          # plus README.md or .claude/skills/ only if this pass changed them
git commit -m "docs: record LOO-NN and <one-line outcome>"
git push -u origin docs/loo-NN-handoff
gh pr create --base main --head docs/loo-NN-handoff --title "docs: record LOO-NN and <outcome>" --body "…"
```

The body says `Refs LOO-NN` — **not** `Closes`: the issue is already Done and a
docs PR has no issue of its own (see `status.md` 未完成事項 for the standing
policy gap). List what the record covers and note that `smoke`/`rust` are
docs-only. Report the PR URL. When the user says it merged, run steps 1–2 for
`docs/loo-NN-handoff` (no packaging needed).

## If CI sticks

A `rust` job that fails at "Set up job" or a run queued for 10+ minutes is
GitHub's macOS runner, not the change. Wait until the whole run finishes, then
`gh run rerun <run-id> --failed`. Do not reopen the PR — a new run re-queues
both jobs.
