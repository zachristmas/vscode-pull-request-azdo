# Changelog

## 2.0.0

First stable release: the extension is out of preview. Ships the full 1.6.x line as a stable build, and adds comment reactions, `@mention` resolution, and resolved coexistence with Microsoft's GitHub Pull Requests extension.

- Out of preview. Dropped the `preview` flag; this is the first release published as a stable (non-preview) build.
- Azure DevOps comment likes. The single thumbs-up reaction shown in the ADO web UI now renders on comments and can be toggled from VS Code.
- `@mention` resolution. Mentions in comment text resolve to users and notify them.
- Resolved coexistence with the GitHub Pull Requests extension. This extension scopes its commenting ranges and thread routing to its own document schemes plus the checked-out PR's changed files, and drops a stale `onFileSystem:newIssue` activation event. There is no view/command/scheme clash; the only residual is VS Code's single shared comment gutter when the same file is under an open PR on both platforms, which is inherent to VS Code and handled by it. The former "Known issue" is removed.
- Review threads now appear on tree-opened (`pr_azdo`) diffs for a checked-out PR, not only on the working-tree copy of the file.
- PR header actions are always visible and roomier on the description page.
- Inline diff-hunk excerpt on description-page thread cards.
- Build-validation policy rows note when they need Build (read) permission to show details.
- Dev: fixed a circular-import init crash (`utils.ts`/`diffHunk.ts`) that had kept the Electron test suite from actually running in CI since the 1.6 line; bounded the (still non-blocking) CI test step.

## 1.6.0

Deep links in both directions, the restored create-PR flow, and thread-card context/navigation on the description page.

- Copy links FROM VS Code: `Copy Pull Request URL`, `Copy Link to File in Pull Request` (links to the file's diff in the PR files view; works from a PR tree file node or the active PR diff editor), and `Copy VS Code Deep Link to Pull Request`. Line anchors are not emitted for file links because the ADO PR files view has no verified line-anchor URL params; the toast notes this when a selection exists.
- Open PRs IN VS Code from a `vscode://` deep link: `vscode://zacharychristmas.azdo-pull-requests-multiproject/open-pr?org={orgUrl}&project={project}&repo={repo}&pr={id}[&path={/file}&line={n}]` finds the workspace folder cloning that repo, opens the PR description page, and with `path`/`line` opens the file's diff with the cursor on that line. Links arriving before activation are queued; previously a URI handler was registered but nothing subscribed, so incoming URIs were silently dropped.
- Create Pull Request is back: `Create Pull Request` and `Create Draft Pull Request` from the palette or the `+` icon on the PR view. The whole flow was repaired for Azure DevOps: a real `GitPullRequest` payload (the old code still sent GitHub-shaped params to a stubbed API), the target-branch picker prefilled from ADO `defaultBranch` (was "undefined"), publish-branch no longer crashes on quick-pick cancel, the branch-exists validator actually runs, and unresolved-repository failures surface real error messages instead of TypeErrors or silent no-ops.
- Clicking a thread's file chip on the description page now opens the diff with the cursor on the thread's line instead of Ln 1 Col 1.
- Description-page thread chips include the thread's line number (`/src/rateLimiter.ts:17`); file-level threads keep the bare path.

## 1.5.2

Field fixes from the 2026-07-17 screenshot/triage session.

- Fix a startup error ("A project name is required in order to reference a Git repository by name") in workspaces with legacy `visualstudio.com` remotes: parse project-omitted remote URL shapes (`https://org.visualstudio.com/_git/repo`, `DefaultCollection/_git/repo`, `https://dev.azure.com/org/_git/repo`), fall back to an org-wide repository search when the project-scoped lookup misses, and never issue Git API calls with an empty repository id (unresolvable remotes such as wiki repos now log and no-op instead of erroring).
- Fix added-file diffs failing to open on PRs that aren't checked out (upstream #109): added files whose head commit isn't local are now fetched from Azure DevOps like modified files, and the base side renders as an empty pane instead of erroring. Deleted files' mirrored one-sided case verified working.
- Render description-page timeline threads created outside the extension (raw REST/integrations): threads missing the id-1/commentType shape now show as comment cards (position-less when they have no file context) instead of being dropped, and an author-less comment can no longer blank the timeline.
- Don't cache an empty policy-type map when the fetch fails; policy display names recover on the next fetch.
- Repair the test harness (mock drift vs the current VS Code git API, ts-auto-mock transformer wiring, preprocess-svg script); the PullRequestOverview suite runs green again, and `MOCHA_GREP` scopes a run to one suite.

## 1.5.1

- Docs only: README rewritten around the 1.5 feature set, with screenshots of the policy panel, auto-complete, voting, inline review threads, and the merged-PR view. No code changes.

## 1.5.0

A combined release covering three waves of work: repairing the v1.4 review/complete flows,
adding branch-policy and auto-complete support, and a full UX modernization of the PR webviews.

> **Versioning note:** there is no standalone `1.4.0` tag. The `fix/v1.4-repair` work and the
> v1.5 feature work ship together as `1.5.0`; the version jumps from `1.3.0` to `1.5.0` deliberately.

### Completion & auto-complete

- Route every "complete PR" entry point (overview, checked-out-PR sidebar, command palette) through the working `PullRequestModel.completePullRequest` path instead of the commented-out merge stub (AC-01, AC-03).
- Set and cancel auto-complete, with a banner showing who armed it and the selected options, and a Cancel action (AC-02).
- Restrict the merge-strategy choices to those the branch's "Limit merge types" policy allows (AC-04).
- Optional merge-commit-message field on completion (AC-05).
- Offer local branch cleanup after a PR merges, including when the remote source branch was already deleted (AC-08).
- Completion confirmations now disclose that completing deletes the source branch and completes linked work items, instead of a bare "Complete this pull request?" (previously silent destructive defaults).

### Branch policies

- Fetch and display branch-policy evaluations in a "why can't this complete" panel, degrading gracefully where the evaluations API is unavailable (POL-01).
- Distinct merge-status copy per async status instead of collapsing everything to "conflicts" (POL-02).
- Build-validation rows with result text, a click-through to the build, and a re-run/re-queue button with a busy state (POL-04).
- Surface completion blockers in the active-PR sidebar (POL-05) and as a signal on PR list tree items (POL-08).
- Report the real merge/status result and surface the merge-failure message (POL-06).
- Keep PR-level statuses, treat empty as NotSet, and self-limit the status refresh poll to while checks are pending (POL-09).
- Show a "Required" badge on reviewer rows driven by min-reviewer/required-reviewer policies (POL-10).
- Gate pending blocking policies before the git-mergeability check so "Set auto-complete" is reachable on policy-governed repos.

### Votes & reviewers

- Vote on a PR (approve / approve-with-suggestions / wait-for-author / reject / reset) from commands, tree/palette menus, and the sidebar (VOTE-01, VOTE-02).
- Correct reviewer data shape in the sidebar (VOTE-03) and five distinct vote glyphs/colors with inline text rather than tooltip-only (VOTE-07).
- Fixed voting wiping the server-side required-reviewer flag, a no-vote row showing the "Reset Vote" action label, and reviewer avatars always resolving to undefined.

### Drafts

- Mark a draft PR ready for review, wired end-to-end (DLA-01).
- Convert a published PR to draft, with a confirmation that warns Azure DevOps resets all reviewer votes (DLA-02).

### Comments & threads

- Render comment thread positions from the server-tracked `threadContext` so comments stay glued to their code across pushes, instead of drifting to stale creation-time coordinates (ITER-01).
- Removed the non-functional reaction picker (no Azure DevOps equivalent).
- Threads default to collapsed on the checked-out branch.

### PR browsing

- Added an "All Pull Requests" category so completed/abandoned PRs can be browsed to (previously unreachable).
- Show file changes for merged PRs whose source branch was deleted; fall back to the target commit when no common commit is found; guard an unguarded merge-base access that crashed PR node expansion.

### UX modernization

- UX-01: "Your review" sidebar card, an always-visible current-vote row, a controlled vote select, busy/success/failure cast feedback (aria-live), and a reset-vote link.
- UX-02: read-only outcome summary card on completed/abandoned PRs; edit, vote, and add/remove affordances are gated off once a PR is finished.
- UX-03: comment section pass, single-card comments, a thread-owned container with a left rail and colored status pill, resolved-thread collapse, a full-width ghost reply field, theme-aware code blocks, composer hints, and an empty-description placeholder.
- UX-04: one editor tab per PR (keyed by PR id) instead of a reused singleton panel.
- UX-05: a design-token system (radius, spacing, surface, semantic color) applied across both webviews, plus responsive sidebar spacing.

### Reliability & accessibility

- Guarantee-of-reply for the webview message contract: a host handler that throws now rejects the awaiting UI instead of leaving it pending forever, and the client bounds every pending request with a timeout and clears settled entries. Fixes a stuck "Queuing..." requeue button, a Delete-branch button that never re-enabled, an uncaught rejection on every sidebar mount, and a dropped auto-complete-cancel recovery.
- Made previously mouse-only controls keyboard-operable: the status/policy Show/Hide toggles, the thread file chip, the reviewer/work-item remove buttons, and the title Edit/Copy-Link/Convert-to-draft actions now work via keyboard and reveal on focus.
- Hidden PR tabs no longer poll in the background; they refresh when brought back to the foreground, and the armed-auto-complete wait backs off from 3s to 15s (UX-04).
- The Edit and Reply composers focus their textarea on open.

## 1.0.0

- Autodetect Azure DevOps URL and project name from remote.
- Fixing a lot of bugs and preparation for AI integration.

## 0.2.3

- Fixed [#86](https://github.com/ankitbko/vscode-pull-request-azdo/issues/86) thanks to [danigt91](https://github.com/danigt91)

## 0.2.2

- Reintroduced PAT token.
- Fixed [#63](https://github.com/ankitbko/vscode-pull-request-azdo/issues/63)

## 0.2.1

- Fixed continuous popup for authentication.

## 0.2.0

- Fixed [#68](https://github.com/ankitbko/vscode-pull-request-azdo/issues/68) - Changed the authentication mechanism from PAT to OAuth using vscode provided authentication session. This will require users to re-authenticate.

## 0.0.25

- Removed explicit check of azdo url to resolve [#55](https://github.com/ankitbko/vscode-pull-request-azdo/issues/55)

## 0.0.24

- Fixed [#50](https://github.com/ankitbko/vscode-pull-request-azdo/issues/50) - Comments duplicate in review mode
- Fixed [#51](https://github.com/ankitbko/vscode-pull-request-azdo/issues/51) - Comments appear on wrong side in review mode
- Fixed [#52](https://github.com/ankitbko/vscode-pull-request-azdo/issues/52) - Comments when deleted from server does not disappear completely
- Added workplace trust setting
- Git extension activation is now forced before activation of this extension

## 0.0.23

- Fixed [#45](https://github.com/ankitbko/vscode-pull-request-azdo/issues/45) - Seeing duplicate review comments.

## 0.0.22

- Added support for marking files as reviewed [ankitbko/vscode-pull-request-azdo#7](https://github.com/ankitbko/vscode-pull-request-azdo/issues/7)

## 0.0.21

### Changes

- Fixed [ankitbko/vscode-pull-request-azdo#37](https://github.com/ankitbko/vscode-pull-request-azdo/issues/37)

## 0.0.20

### Changes

- Suggest Edit not works.
- Edits can now be applied from PR Description page. Read more in the [wiki](https://github.com/ankitbko/vscode-pull-request-azdo/wiki/Suggest-Edit).

## 0.0.19

### Changes

- Fixed a bug where new thread couldn't be created on left side files.
- Reworked build system

## 0.0.18

### Changes

- Fix [ankitbko/vscode-pull-request-azdo#29](https://github.com/ankitbko/vscode-pull-request-azdo/issues/29)

## 0.0.17

### Changes

- Functionality to add and remove reviewers from PR.

## 0.0.16

### Changes

- visualstudio domain remotes should now resolve. Fixes [ankitbko/vscode-pull-request-azdo#25](https://github.com/ankitbko/vscode-pull-request-azdo/issues/25)

## 0.0.15

### Changes

- Improved logging.

## 0.0.14

### Changes

- Mardown rendering in PR Description panel.

## 0.0.13

### Changes

- Work Item integration with PR. **The PAT token now requires `vso.work_write` permission**.

## 0.0.12

### Changes

- Fixed bug [ankitbko/vscode-pull-request-azdo#18](https://github.com/ankitbko/vscode-pull-request-azdo/issues/18)

## 0.0.11

### Changes

- Proposed API flag is disabled.
- **Released to VS Code Stable.**

## 0.0.10

### Changes

- Diff options now properly work.
- Changed default diff option to merge-base.

## 0.0.9

### Changes

- Status shows properly in Dashboard
- Added system text to timeline view
- Adapted to Secrets API changes in vscode

## 0.0.8

### Changes

- Fixed [ankitbko/vscode-pull-request-azdo#8](https://github.com/ankitbko/vscode-pull-request-azdo/issues/8)
- Tests now work

## 0.0.7

### Changes

- Fixed overflow in batches calculation while getting files in PR

## 0.0.6

### Changes

- Disabled resolveRemote to fix [ankitbko/vscode-pull-request-azdo#5](https://github.com/ankitbko/vscode-pull-request-azdo/issues/5)
- Added key check on secretStore onDidChange.

## 0.0.5

### Changes

- Specified allowCrossOriginAuthentication as true as attempt to fix fix [ankitbko/vscode-pull-request-azdo#4](https://github.com/ankitbko/vscode-pull-request-azdo/issues/4)

## 0.0.4

### Changes

- Added ssh.dev.azure.com to list of valid hosts - Fixes [ankitbko/vscode-pull-request-azdo#3](https://github.com/ankitbko/vscode-pull-request-azdo/issues/3)

## 0.0.3

### Changes

- Changed URI Scheme
- Backported #2538 from upstream

## 0.0.2

### Changes

- Changed command names and view names to make it globally unique.

## 0.0.1

### Changes

First release with following features -

- Authenticating and connecting VS Code to Azure Devops.
- Listing and browsing PRs from within VS Code.
- Reviewing PRs from within VS Code with in-editor commenting.
- Validating PRs from within VS Code with easy checkouts.
