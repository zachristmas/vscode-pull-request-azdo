# Upstream (microsoft/vscode-pull-request-github) scoping notes

Generated 2026-07-16 by codebase analysis. Baseline for porting decisions.

## Baseline numbers

- Fork point with microsoft/vscode-pull-request-github: `e890f13` (2020-12-17). This repo shares full git ancestry with it; remote `ms` points at microsoft's repo (blob-less partial clone, blobs fetch lazily).
- Upstream since fork point (as of `d621ff1`, 2026-07-16): 3,015 commits, 599 files, +93,371 / -22,846.
- Upstream churn since 2021: `src/github` 1,249 commits, `src/view` 607, `webviews` 541, `src/common` 281, `src/issues` 234, `src/lm` 128, `src/notifications` 45. Roughly 250 commits/yr still landing on the data layer.
- Upstream sizes: `src/github` 38 files / 26.3k LOC; `src/view` 43 files / 10.3k; `webviews/` 9.4k; `src/lm` 20 files / 1.6k; `src/issues` 13 files / 4.9k.
- This fork's ADO layer: `src/azdo` 17 files / ~6.6k LOC. Contribution surface: 39 commands / 14 settings vs upstream 172 commands / 71 settings. Engine gap: fork `vscode ^1.97`, upstream `^1.130` + node >= 20.
- A trial `git merge ms/main` produces 202 conflicted files and resurrects `src/github`, `src/issues`, `src/lm`, `src/notifications` wholesale. Do not attempt a wholesale merge.

## Architecture coupling (why re-fork was rejected)

- `ms/main` has NO provider abstraction. `src/github/interface.ts` is DTOs only. GraphQL is threaded directly through the god-classes: `pullRequestModel.ts` (87KB, 91 public members), `githubRepository.ts` (80KB, 62), `folderRepositoryManager.ts` (126KB, 82), `issueModel.ts`, plus 60KB of `.gql` and `utils.ts` (69KB of parseGraphQL\* converters).
- Containment is decent: octokit/graphql referenced in only 15 files (all `src/github/`) + 3 outside (`src/view/compareChangesTreeDataProvider.ts`, `src/view/createPullRequestDataModel.ts`, `src/lm/tools/fetchNotificationTool.ts`). The other ~50 files in `src/view`, `src/lm`, `src/issues`, `src/notifications` import classes/DTOs, not GraphQL.
- Webview message protocol (`src/github/views.ts` + `webviews/common/message.ts`) is mostly provider-neutral DTOs, with leaks (`GithubItemStateEnum`, `isEnterprise`, `canAssignCopilot`, merge-queue fields).
- Re-fork estimate was ~14-20 engineer-weeks to parity and re-diverges immediately (no interface stability upstream). Verdict: stay on fork, port features individually.

## Portable upstream features (with upstream release refs)

Review flow / diff UX:

- Multi-diff editor (`githubPullRequests.focusedMode: multiDiff`, 0.80), open-PR-changes-by-URI (0.126), Open All Diffs (0.36), Go To Next Diff in PR (0.56)
- Viewed-file checkboxes incl. folders (0.38-0.52), Reset Viewed Files, git status colors on PR files (0.34), quick diff gutter (0.58-0.60)
- "Changes since last review" (0.48) -- note ADO has native PR iterations, which map better than GitHub's model
- Suggest-a-change from editor comments (0.58); convert local changes to suggestion comments (0.96)
- Conflict resolution from PR description (0.80 checked-out, 0.88 non-checked-out, `conflictResolutionCoordinator.ts`)
- File-level comments (0.64), 1000-thread support (0.68), outdated-comment badges + Diff Comment with HEAD (0.86)

Create-PR flow (`createPRViewProvider.ts`, 68KB, rewritten 0.23 -> 0.70 -> 0.134):

- Branch pickers, PR templates (0.126), draft-by-default, auto-merge checkbox (0.44; maps to ADO auto-complete), Commit & Create PR SCM action (0.48), post-create branch behaviors, branch-name caching (0.134)

Branch/worktree lifecycle:

- Checkout PR in Worktree (0.140), worktree cleanup/delete offers (0.136), auto-delete branch after merge (0.126), local PR branch discovery (0.126), checkout by number/URL (0.34, 0.116)

Webview/overview:

- Multiple PR descriptions at once (0.130), webview restore after reload (0.118), ctrl+F in description (0.104), cancel review (0.122), convert-to-draft (0.126; ADO has draft PRs), change target branch (0.126), image paste/upload (0.144; ADO has attachments API), emoji completions, markdown alerts, commit status per commit (0.124), re-request review (0.60)

LM / Copilot-chat (portable -- thin 2-5KB wrappers in `src/lm/tools/*` over the model classes, consume vscode.lm):

- `#activePullRequest` / `#openPullRequest` chat tools (0.110-0.120), create-PR tool + resolve-review-comment tool (0.136), AI PR title/description (0.76, 0.106, 0.126), Apply Suggestion using AI (0.128-0.136); package.json declares 9 languageModelTools + 6 chatSkills

Accessibility & perf: a11y pass (0.74), Accessibility Help (0.88), polling back-off (0.154), API-usage reduction (0.120, 0.142), diff pre-fetch (0.54, 0.116), activation perf (0.66)

## NOT portable (GitHub-service-coupled)

Copilot coding agent (copilotApi/copilotPrWatcher/copilotRemoteAgent, 0.110-0.130), Notifications view (`src/notifications/`), Issues integration (`src/issues/` -- ADO equivalent is work items; fork has minimal `src/azdo/workItem.ts`), merge queues (0.78, 0.128), Codespaces checkout, vscode.dev permalinks, CODEOWNERS completions, GHE support (0.52), verified-commit badges (0.156-0.158).

## Recommended port order (from scoping)

1. Multi-diff editor for PR changes -- mostly VS Code API-side, biggest daily-review win
2. Viewed-file checkboxes + changes-since-last-review (use ADO iterations natively)
3. LM tools: `#activePullRequest` chat context + AI PR title/description
4. Create-PR view modernization (ADO auto-complete = their auto-merge)
5. Worktree checkout + post-merge branch cleanup (nearly verbatim from 0.126/0.136/0.140)
