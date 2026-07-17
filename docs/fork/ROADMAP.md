# ROADMAP: AzDO Pull Requests (Multi-Project)

Generated 2026-07-16. Companion to [UPSTREAM-SCOPING.md](UPSTREAM-SCOPING.md) (divergence numbers, architecture coupling, re-fork rejection) and [ISSUE-TRIAGE.md](ISSUE-TRIAGE.md) (upstream issue dispositions).

**Inputs and method.** Half 1: a complete release-by-release walk of `ms/main` `CHANGELOG.md` from 0.16.0 through 0.158.0 (122 releases, 388 classified entries; coverage mechanically verified, no release skipped). Half 2: a code-level audit of eight ADO-native feature areas against this fork's source and the bundled `azure-devops-node-api@10.2.2` typings (`GitApi.d.ts`, `GitInterfaces.d.ts`, `PolicyApi.d.ts`, `WorkItemTrackingApi.d.ts`), with REST routes verified on Microsoft Learn where the old client lacks a method. Every "current behavior" claim below carries a file:line ref that was read, not assumed. A completeness-critic pass ran over both halves; its corrections are folded in (see _Reclassifications_ and the `ADD-*` items).

**How to read this doc**

- Section 1, Milestones: the prioritized backlog, grouped into release-sized chunks. Items reference detail entries by ID.
- Section 2, ADO-native gap reference (Half 2): per area, how ADO models it, what the fork does today, and gaps with IDs (`VOTE-*`, `POL-*`, `AC-*`, `ITER-*`, `THR-*`, `WI-*`, `DLA-*`, `REST-*`, `ADD-*`).
- Section 3, Upstream inventory (Half 1): the complete portable/partial catalog (`U-*` IDs), then the not-portable / already-in-fork / superseded lists.
- Section 4, Cross-cutting engineering notes: node-api 10.2.2 limitations with REST fallbacks, throttling, authenticated media, taxonomy.
- Section 5, Execution guide: per-item workflow, verification gates, dependency order, and model/delegation routing.

**Size scale**: XS <0.5 day, S ~1 day, M 2-4 days, L 1-2 weeks, XL >2 weeks. Sized for _this_ fork, including ADO data-layer work.

**Classification taxonomy** (Half 1): `portable` (port as-is or with thin ADO data calls), `partial` (concept ports; implementation diverges), `not-portable` (GitHub-service-coupled), `already-in-fork` (verified present), `superseded-by-ado-native`. The critic found `superseded` was being used with two conflicting meanings: (a) ADO delivers the end-user feature for free, vs (b) ADO merely provides a _primitive_ the extension still must build UI on. Items in bucket (b), notably auto-complete and changes-since-last-review, were reclassified `partial` and appear in milestones; only true bucket-(a) items remain `superseded`.

**Reclassifications applied after the critic pass** (the inventory in Section 3 already reflects these):

| Item                                                                 | Was             | Now          | Why                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | --------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fork-repository flows (0.19, 0.74.1, 0.36.1-0.44)                    | not-portable    | partial      | `azure-devops-node-api@10.2.2` ships the full fork surface: `getForks`/`createForkSyncRequest` (GitApi.d.ts:33-36), `GitPullRequest.forkSource` (GitInterfaces.d.ts:1506), `parentRepository` create option (:2188). ADO org-internal forks map cleanly. See ADD-01. |
| Changes since last review (0.48; 0.126 rider)                        | superseded      | partial      | Iterations are the enabling _primitive_, not a supersession. No ADO API exposes a reviewer's last-seen iteration; client-side derivation required (ITER-05).                                                                                                         |
| Auto-merge in Overview (0.46)                                        | superseded      | partial      | Same taxonomy error: ADO auto-complete is a missing high-priority feature (AC-02), not something we get for free.                                                                                                                                                    |
| Draft/pending-review batching family (0.26, 0.29, 0.36, 0.42, 0.110) | superseded      | not-portable | ADO has no batch/draft review; `CommentThreadStatus.Pending` is a per-thread status, not a review. The fork's pending plumbing is dead code (THR-06 decides its fate).                                                                                               |
| Add Projects to PRs (0.82)                                           | superseded      | not-portable | GitHub Projects has no ADO PR-level equivalent (Boards attach to work items, not PRs).                                                                                                                                                                               |
| Create revert PRs (0.94)                                             | portable [M]    | partial [S]  | ADO has a first-class server-side revert API (REST-10); porting upstream's client-side shape is wrong.                                                                                                                                                               |
| GitHub Issues view (0.116-0.120)                                     | superseded [XL] | not-portable | Issues integration is out; the work-items equivalent is tracked as WI-\* gaps, not an inherited XL port.                                                                                                                                                             |
| hasBranch arg fix (0.140)                                            | not-portable    | partial [XS] | Provider-agnostic branch-association fix; apply during any worktree/branch-association port.                                                                                                                                                                         |
| GitHub-CLI checkout recognition (0.76)                               | not-portable    | partial      | `az repos pr checkout` is the direct ADO analog.                                                                                                                                                                                                                     |

---

## 1. Milestones

Ordering principle: impact on a daily ADO code reviewer per unit of effort. v1.4 repairs things that are **broken or lying today** (small, high-trust wins). v1.5 and v1.6 build the two ADO-native pillars (policy visibility, iterations). v1.7 through v1.9 round out threads/content, create flow, and scale.

### v1.4: Repair. Every control does what it says (~2 weeks)

The audit found six UI surfaces that silently no-op or actively lie. Fixing them is cheap and rebuilds trust before feature work.

| #   | Item                                                                                                                                        | Size | Detail  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------- |
| 1   | ~~"Ready for review" button + `azdopr.readyForReview` command are dead end-to-end. Wire draft publish.~~ ✅                                 | S    | DLA-01  |
| 2   | ~~Add "Convert to draft" (rides on 1; ADO resets votes on draft-conversion, confirm and prompt)~~ ✅                                        | XS   | DLA-02  |
| 3   | ~~Work-item transition checkbox is a silent no-op (`completeWorkitem` vs `transitionWorkItems` name mismatch)~~ ✅                          | XS   | AC-01   |
| 4   | `azdopr.merge` palette command + activity-bar MergeSimple call a commented-out stub. Reroute all three call sites to `completePullRequest`. | M    | AC-03   |
| 5   | ~~Activity-bar "Request Changes" silently no-ops, "Approve" posts a plain comment. Map to votes (-5 / +10).~~ ✅                            | S    | VOTE-02 |
| 6   | ~~Activity-bar reviewer list renders a mismatched shape (broken names/avatars/votes); hoist `convertIdentityRefWithVoteToReviewer`~~ ✅     | XS   | VOTE-03 |
| 7   | Vote commands: approve / approve-with-suggestions / wait-for-author / reject / reset from palette + PR tree context menu                    | S    | VOTE-01 |
| 8   | `RejectedByPolicy` mislabeled as merge conflicts in overview copy                                                                           | XS   | POL-02  |
| 9   | Completion failure still replies `state: Completed` to the webview; surface `mergeFailureMessage` persistently                              | XS   | POL-06  |
| 10  | Status-check rollup: keep PR-level (iteration-less) statuses; empty list must not read as Succeeded                                         | S    | POL-09  |
| 11  | Work-item unlink produces invalid `/relations/-1` patch for commit-linked items. Guard + explain.                                           | XS   | WI-05   |
| 12  | Thread positions render from stale `orig*` coordinates instead of server-tracked `threadContext`; comments drift after pushes               | S    | ITER-01 |

### v1.5: Policy visibility & auto-complete, the ADO flagship (~6-8 weeks)

On policy-governed repos the fork's "checks" section is empty while the PR is actually blocked, and "complete now" is almost never available; auto-complete is how ADO PRs actually merge. This milestone is the single biggest daily-driver upgrade.

| #   | Item                                                                                                                                                                                                                                                    | Size        | Detail              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------- |
| 1   | Policy-evaluations panel: fetch `getPolicyEvaluations` per PR, render each policy row (min reviewers, comment resolution, build validation, work-item linking, required reviewers) with blocking/optional + status. The "why can't this complete" view. | L           | POL-01              |
| 2   | Build-validation click-through (build number/result via BuildApi, `_links.web`) + Re-run via `requeuePolicyEvaluation`                                                                                                                                  | M           | POL-04              |
| 3   | Set / show / cancel auto-complete with full completion options; banner "Auto-complete set by X"; badge in tree                                                                                                                                          | L           | AC-02               |
| 4   | Restrict merge-strategy dropdown by "Limit merge types" policy; pick a valid default                                                                                                                                                                    | M           | AC-04               |
| 5   | Merge-commit-message input on complete + auto-complete forms                                                                                                                                                                                            | S           | AC-05               |
| 6   | "Required" badge on reviewer rows                                                                                                                                                                                                                       | XS          | POL-10              |
| 7   | Five distinct vote glyphs (stop collapsing +10/+5 and 0/-5)                                                                                                                                                                                             | XS          | VOTE-07             |
| 8   | Blocker signal on PR tree items (mergeStatus decoration; zero extra API calls)                                                                                                                                                                          | S           | POL-08              |
| 9   | Active-PR sidebar shows the same compact blocker summary (statuses are hardcoded `[]` there today)                                                                                                                                                      | S           | POL-05              |
| 10  | Post-completion local-branch cleanup offer (upstream 0.126 auto-delete analog)                                                                                                                                                                          | S           | AC-08               |
| 11  | Stretch: policy bypass with reason for admins; configurable completion-option defaults                                                                                                                                                                  | S+XS        | POL-07/AC-06, AC-07 |
| 12  | Stretch: work-item-linking policy warning in the Work Items section                                                                                                                                                                                     | (in POL-01) | WI-03               |

### v1.6: Iterations & review flow (~8-10 weeks; candidate to split into 1.6a data layer / 1.6b UX)

ADO's iterations are strictly stronger than GitHub's changes-since-review: server-computed diffs between any push pair, with comment threads positionally re-tracked. The fork currently uses iterations only to compute a max ID; diffs are hand-rolled commit diffs (the `commitNode.ts:56` TODO admits commits are the wrong unit). This milestone also carries the upstream multi-diff work because it lands in the same tree/diff plumbing.

| #   | Item                                                                                                                                                                                                  | Size | Detail                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------- |
| 1   | Cache the iterations list on the PR model (do first; everything below consumes it)                                                                                                                    | XS   | ITER-08                   |
| 2   | Switch file-change source from raw commit diffs to `getPullRequestIterationChanges` (rename-aware, server-paged, yields `changeTrackingId`). Likely fixes upstream-issue #109's empty-fileName diffs. | M    | ITER-03                   |
| 3   | Anchor new comment threads with `iterationContext` + `changeTrackingId` ("must be set" per API docs) so comments survive force-pushes                                                                 | M    | ITER-02                   |
| 4   | Updates tree category + "Compare iteration M...N" picker (ADO web Updates-tab parity), threads fetched per compared pair                                                                              | L    | ITER-04                   |
| 5   | "Changes since my last review": persist last-seen iteration per PR (globalState), optionally seeded from vote system-thread timestamps; tree badge when new iterations arrive                         | M    | ITER-05                   |
| 6   | Auto-unmark viewed files touched by a later iteration (bump viewed-store to v3 with iterationId)                                                                                                      | S    | ITER-07                   |
| 7   | Vote-reset-on-push detection: diff reviewer votes across refreshes, banner "your approval was reset by iteration N"                                                                                   | M    | VOTE-05                   |
| 8   | Vote/requiredness signal in the PR tree ("awaiting my vote", required-first sort in Assigned To Me)                                                                                                   | M    | VOTE-04                   |
| 9   | Resurrect outdated-thread detection via iteration tracking (upstream 0.86 analog, ADO-native)                                                                                                         | M    | ITER-06                   |
| 10  | Upstream: multi-diff focused mode (0.80) + open-PR-changes-by-URI (0.126) + Open All Diffs (0.36) + Go To Next Diff (0.56)                                                                            | M    | Section 3: chunks F/B/J/I |
| 11  | Upstream: mark-viewed keybinding + close-on-viewed (0.54), diff pre-fetch (0.54/0.116)                                                                                                                | S+M  | Section 3: chunks I/C     |

### v1.7: Threads, work items & content (~5-6 weeks)

| #   | Item                                                                                                              | Size | Detail  |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---- | ------- |
| 1   | Native `vscode.CommentThreadState` (resolved dimming/collapse; built-in Comments-panel filter starts working)     | S    | THR-01  |
| 2   | One-click Resolve / Reactivate on the comment widget (today: gear icon then modal quick-pick, 3 interactions)     | S    | THR-02  |
| 3   | Comment-resolution policy awareness + unresolved-count in tree and overview                                       | M    | THR-03  |
| 4   | "Show resolved" filter in overview timeline; rely on native filter in editor                                      | M    | THR-04  |
| 5   | Thread-status select correctness (controlled value, threads with Unknown status get a control, human labels)      | S    | THR-05  |
| 6   | Parse vote system-threads into first-class timeline events; render `votedFor` (team rollup) under group reviewers | S    | VOTE-08 |
| 7   | Render images in descriptions/comments via authenticated fetch (avatarCache pattern). Fixes triage #71.           | M    | DLA-06  |
| 8   | Image paste/drop, upload to PR attachments, insert markdown (upstream 0.144 analog; API fully present in 10.2.2)  | M    | DLA-07  |
| 9   | Work-item cards show State/assignee/type color (data already fetched)                                             | XS   | WI-01   |
| 10  | Work-item picker text search (WIQL `CONTAINS WORDS` v1; almsearch REST stretch)                                   | S    | WI-02   |
| 11  | Linkify `#id` / `AB#id` in rendered markdown (authoring completion = stretch)                                     | M    | WI-07   |
| 12  | Labels: render chips in overview header + tree tooltip (`getPullRequestLabels`)                                   | S    | DLA-04  |
| 13  | Comment likes: show `usersLiked` + toggle (display half is nearly free)                                           | S    | REST-08 |
| 14  | Stretch: @mention authoring with `@<GUID>` markup + identity completion (triage #48 pairs with this)              | M    | ADD-04  |

### v1.8: Create & ship the loop (~5-7 weeks)

| #   | Item                                                                                                                                                                                                        | Size | Detail                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------- |
| 1   | Revive PR creation: wire `folderRepositoryManager.createPullRequest` to the working-but-unreachable `azdoRepository.createPullRequest`; quick-input MVP with target branch, title/description, draft option | L    | DLA-03                        |
| 2   | Create-flow riders: attach work items at create (`GitPullRequest.workItemRefs`), pre-populated from AB#/branch-name tokens                                                                                  | M    | WI-04                         |
| 3   | "You recently pushed, create a PR?" toast via `getSuggestions`                                                                                                                                              | S    | REST-11                       |
| 4   | Commit & Create PR SCM action (upstream 0.48)                                                                                                                                                               | S    | Section 3: chunk I            |
| 5   | Cherry-pick / Revert actions on completed PRs over ADO's native async APIs                                                                                                                                  | M    | REST-10                       |
| 6   | Conflict file listing when mergeStatus == Conflicts (in-editor resolution explicitly out of scope)                                                                                                          | M    | REST-06                       |
| 7   | Delete remote source branch after abandon / for surviving branches (`updateRefs` zero-OID)                                                                                                                  | S    | REST-14                       |
| 8   | "Find PR for commit" command (`getPullRequestQuery`), regression archaeology                                                                                                                                | S    | REST-12                       |
| 9   | Re-request review / reset votes (`updatePullRequestReviewers`)                                                                                                                                              | S    | VOTE-06                       |
| 10  | Create-PR upstream niceties as follow-ups: template files, branch-name title-ize, description survives failed push; see ADD-05 for the ADO-specific create-surface notes                                    | M    | ADD-05, Section 3: chunks A/B |

### v1.9: Scale, breadth & assist (~6-8 weeks)

| #   | Item                                                                                                                                        | Size  | Detail                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------- |
| 1   | Auto-refresh polling with back-off (fork has NO polling loop today) honoring ADO throttling (Retry-After / X-RateLimit-\*)                  | M     | Section 3: chunk A + ADD-03 |
| 2   | Project-wide "All my PRs" view (`getPullRequestsByProject`; opens without local checkout). Pairs with triage #49 (group/team-assigned PRs). | M     | REST-15                     |
| 3   | Team/group reviewers: add teams, `votedFor` rollup write-side, Identity Picker REST for user/group search                                   | M     | ADD-02, Section 3: chunk H  |
| 4   | Reviewer decline/flag-for-attention (`hasDeclined` needs raw REST 7.1)                                                                      | S     | VOTE-09                     |
| 5   | LM/chat tools: `#activePullRequest` + AI PR title/description via vscode.lm (thin wrappers over model classes)                              | L     | Section 3: chunks D/G/B/C   |
| 6   | Worktree checkout (0.140-0.150): one mostly provider-neutral upstream file; includes the hasBranch arg fix                                  | M     | Section 3: chunk A          |
| 7   | Per-commit CI status in Commits tree (`getCommitsBatch includeStatuses`, upstream 0.124 analog)                                             | S     | REST-16                     |
| 8   | Share PR by email (`sharePullRequest`)                                                                                                      | S     | REST-13                     |
| 9   | Webview restore after reload (0.118) + multiple PR descriptions (0.130)                                                                     | M+M   | Section 3: chunks C/B       |
| 10  | A11y pass (0.74/0.88 batches) + activation perf (0.66) + PR-list perf (0.116)                                                               | M+M+L | Section 3: chunks G/F/H/C   |
| 11  | Fork-repo support exploration: render `forkSource`, fork-aware branch association (org-internal forks)                                      | L     | ADD-01                      |
| 12  | Pending-thread lane decision: drop dead draft-review plumbing or build client-side batching on `Pending` status                             | M     | THR-06                      |

**Not scheduled (backlog pool):** everything else in Section 3 marked portable/partial, mostly S/XS polish batches (webview robustness, tree fixes, markdown rendering, checkout edge cases). Pull them into milestones opportunistically when touching the same files. The XL create-PR webview (0.70-0.78 + 0.126-0.134 evolution) is deliberately deferred until the v1.8 MVP proves the data layer; ADO's 4000-char PR description limit and template conventions differ enough that the webview port needs its own design pass (ADD-05).

---

## 2. ADO-native gap reference (Half 2)

Each area: how ADO models it (from the local `azure-devops-node-api@10.2.2` typings plus Microsoft Learn for missing pieces), what the fork does today (verified file:line refs), then the gap list. Impact is rated for a daily ADO code reviewer. Cross-area duplicates are annotated; the canonical entry carries the plan.

### 2.1 Reviewer votes, required vs optional reviewers, vote reset (VOTE-\*)

<details><summary><b>How ADO models it</b> (API reference, click to expand)</summary>

**ADO model (from local azure-devops-node-api 10.2.2 typings)**
**Data shape** - `IdentityRefWithVote extends IdentityRef` (interfaces/GitInterfaces.d.ts:2634-2655):

- `vote?: number` - spectrum documented inline: `10 approved / 5 approved with suggestions / 0 no vote / -5 waiting for author / -10 rejected` (GitInterfaces.d.ts:2648-2650)
- `isRequired?: boolean` - "Branches can have policies that require particular reviewers" (GitInterfaces.d.ts:2642)
- `isFlagged?: boolean` - reviewer flagged for attention (GitInterfaces.d.ts:2638)
- `votedFor?: IdentityRefWithVote[]` - group/team vote rollup: groups can be reviewers but can't vote directly; member votes roll up (GitInterfaces.d.ts:2652-2654)
- `GitPullRequest.reviewers?: IdentityRefWithVote[]` (GitInterfaces.d.ts:1560-1562) - reviewers+votes ride along on every PR fetch, including list queries.

**Operations** - GitApi.d.ts:

- `createPullRequestReviewer(reviewer, repositoryId, pullRequestId, reviewerId, project?)` (GitApi.d.ts:850) - dual purpose: "Add a reviewer to a pull request or cast a vote"; casting own vote requires reviewerId == self; when adding others, vote must be 0 (doc at GitApi.d.ts:842-844). Body accepts `isRequired`.
- `createPullRequestReviewers(reviewers: IdentityRef[], ...)` (GitApi.d.ts:859) - batch add, plain `IdentityRef[]` so no isRequired in batch.
- `getPullRequestReviewer` / `getPullRequestReviewers` (GitApi.d.ts:877, 885).
- `updatePullRequestReviewer(reviewer, ..., reviewerId, ...)` (GitApi.d.ts:895) - "Edit a reviewer entry. These fields are patchable: isFlagged" (GitApi.d.ts:887).
- `updatePullRequestReviewers(patchVotes: IdentityRefWithVote[], ...)` (GitApi.d.ts:904) - "Reset the votes of multiple reviewers... only supports updating votes" (GitApi.d.ts:897-899). This is the re-request-review primitive.
- `deletePullRequestReviewer` (GitApi.d.ts:868).
- `GitPullRequestSearchCriteria.reviewerId` (GitInterfaces.d.ts:1857-1860) - server-side "PRs where I am a reviewer" query.

**Vote reset on push** - a side effect of the _Minimum number of reviewers_ branch policy's `resetOnSourcePush` setting (and "reset conditions"); readable via `PolicyApi.getPolicyConfigurations(project, scope?, policyType?)` (PolicyApi.d.ts:8, settings blob is untyped) and per-PR via `getPolicyEvaluations(project, artifactId, ...)` (PolicyApi.d.ts:12). There is no per-reviewer "vote is stale" field - the server just zeroes `vote`; detecting a reset client-side means diffing polled reviewer state or parsing vote system threads. Server push exists only as SignalR events (`Real time event (SignalR) for reviewer votes being reset` / `for a reviewer vote update`, GitInterfaces.d.ts:2891-2896) which the node API does not expose as callable methods.

**Vote history** - votes land in the PR thread stream as system threads (`Comment.commentType === CommentType.System`), which is the only API-visible record of _when_ a vote happened relative to iterations.

</details>

<details><summary><b>Current fork state</b> (verified refs, click to expand)</summary>

**What the fork does today**
**Data layer (solid, full spectrum modeled):**

- `PullRequestVote` enum carries all five ADO values (src/azdo/interface.ts:133-139); `ReviewState = { reviewer, state: PullRequestVote, isRequired }` (src/azdo/interface.ts:61-65).
- `PullRequestModel.submitVote(vote)` casts the authenticated user's vote via `createPullRequestReviewer({vote}, repoId, prId, authenticatedUser.id)` (src/azdo/pullRequestModel.ts:477-489).
- `addReviewer(userid, isRequired)` supports required OR optional add (src/azdo/pullRequestModel.ts:491-503); `removeReviewer` (505-512). No use of `updatePullRequestReviewers` (reset votes), `updatePullRequestReviewer` (isFlagged), `getPullRequestReviewers`, or `votedFor` anywhere (grep for `isFlagged|votedFor` across src/ + webviews/ returns nothing).

**Editor overview webview (the ONLY functional voting surface):**

- Reviewers converted via `convertIdentityRefWithVoteToReviewer` preserving vote + isRequired (src/azdo/pullRequestOverview.ts:921-932) and sent to the webview (pullRequestOverview.ts:249).
- Sidebar renders a full-spectrum VotePanel - select of Approve / Approve with Suggestion / Wait for author / Rejected / Reset Vote + "Cast Vote" button (webviews/components/sidebar.tsx:117-153, order at 125); current-user vote looked up at sidebar.tsx:21 and the button disables when selection == current vote (sidebar.tsx:147).
- Required vs optional reviewers ARE split into two labeled panels, "Required Reviewers" / "Optional Reviewers", filtered on `isRequired`, each with its own add button (sidebar.tsx:22-34; add plumbing webviews/common/context.tsx:85-92 -> 'pr.add-reviewers' handler src/azdo/pullRequestOverview.ts:317-318, 347-395 - identity-search quickpick).
- Message handlers: 'pr.vote' (pullRequestOverview.ts:295-296 -> 781-798, refreshes PR list on success at 790), 'pr.remove-reviewer' (319-320, 479-496).
- Per-reviewer vote rendering collapses the spectrum visually: REVIEW_STATE map gives +10 and +5 the SAME checkIcon, and 0 and -5 the SAME pendingIcon - only the hover tooltip differs; -10 gets deleteIcon (webviews/components/reviewer.tsx:41-47). Remove-reviewer affordance only appears when the reviewer's vote is 0 (reviewer.tsx:22-23).

**Activity-bar "active PR" view (broken/dead voting surfaces):**

- Provider has `approvePullRequest` submitting +10 (src/azdo/activityBarViewProvider.ts:185-201) handling 'pr.approve' (activityBarViewProvider.ts:70-71), but NO webview code ever posts 'pr.approve' (grep webviews/ for `pr.approve`: zero hits) - dead code.
- The comment box dropdown offers Comment / Approve / Request Changes (webviews/components/comment.tsx:430-434, 458): the Approve branch is commented out so it falls through to a plain comment (comment.tsx:445-448); Request Changes posts 'pr.request-changes' (webviews/common/context.tsx:133-134) which NO provider handles (case lists: src/azdo/pullRequestOverview.ts:289-341; src/azdo/activityBarViewProvider.ts:60-74) - unhandled messages get no reply (src/common/webview.ts:58-66), so the button silently does nothing.
- Reviewer list in this view is shape-broken: provider sends raw `IdentityRefWithVote[]` (activityBarViewProvider.ts:113, 145) but merge.tsx renders them through `<Reviewer>` which destructures `reviewState.reviewer` (webviews/components/merge.tsx:70-74; reviewer.tsx:16) - `reviewer` is undefined for the raw shape. No required/optional split there either. Bonus bug: `isAuthor` compares identity GUID to `createdBy.uniqueName` (email) - always false (activityBarViewProvider.ts:144).

**Tree view (vote-blind):**

- PR node label/description/tooltip show only ✓-checked-out, #number, [DRAFT], title, author (src/view/treeNodes/pullRequestNode.ts:317-341). No vote, no required-reviewer marker, no "needs my review" signal - grep for `vote|isRequired` under src/view/ returns nothing.
- Categories: All Active / Created By Me / Assigned To Me, the last using server-side `reviewerId` search (src/azdo/folderRepositoryManager.ts:773-790) - so "PRs where I'm a reviewer" exists, but it doesn't distinguish "I already voted" from "awaiting my vote", nor required-ness.

**Commands:** package.json contributes 39 commands, none for voting (verified full list - checkout/merge/close/comment/thread-status etc.); src/commands.ts has zero vote/approve hits. Voting requires opening the description webview.

**Iterations / vote reset:** no code correlates votes with iterations; nothing detects or surfaces a policy vote-reset. Vote events appear in the timeline only as generic system-thread text via `SystemThreadView` rendering `thread.comments[0].content` (webviews/components/timeline.tsx:67-91; guard src/common/timelineEvent.ts:125-127); the GitHub-era `ReviewEventView`/`DESCRIPTORS` (timeline.tsx:130-178) is dead code. `getStatusChecks` reads only the PR statuses API (src/azdo/pullRequestModel.ts:712-755); PolicyApi is never imported (grep: zero hits), so min-reviewer / reset-on-push policy state is invisible.

</details>

<details><summary><b>node-api 10.2.2 limitations for this area</b></summary>

azure-devops-node-api 10.2.2 covers essentially the whole vote surface: cast/reset own vote and add reviewer with `isRequired` (createPullRequestReviewer, GitApi.d.ts:850), list reviewers (getPullRequestReviewers, GitApi.d.ts:885), reset others' votes (updatePullRequestReviewers, GitApi.d.ts:904), patch `isFlagged` (updatePullRequestReviewer, GitApi.d.ts:895), delete reviewer (GitApi.d.ts:868). Gaps needing raw REST or workarounds:

1. **`hasDeclined` (reviewer declines a review)** - field absent from 10.2.2's IdentityRefWithVote (GitInterfaces.d.ts:2634-2655 has only isFlagged/isRequired/reviewerUrl/vote/votedFor). Current docs list it as patchable alongside isFlagged (verified on learn.microsoft.com: "Edit a reviewer entry. These fields are patchable: isFlagged, hasDeclined"). Raw REST: `PATCH https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/reviewers/{reviewerId}?api-version=7.1` with body `{ "hasDeclined": true }`; the field also comes back on GET reviewers at api-version 7.1.
2. **Batch add with requiredness** - `createPullRequestReviewers` takes plain `IdentityRef[]` (GitApi.d.ts:859) so isRequired can't be set in batch; loop `createPullRequestReviewer` per user instead (what the fork already does one-at-a-time). Newer api-versions (7.1) support `PUT .../reviewers?api-version=7.1` with `IdentityRefWithVote[]` including isRequired.
3. **Real-time vote/reset events** - SignalR-only (`ReviewerVotesResetEvent`/vote-updated, GitInterfaces.d.ts:2891-2896); not exposed by any node-api version. Client must poll `getPullRequestReviewers` (cheap, single route) and diff.
4. **Reset-on-push policy detection** - PolicyApi.getPolicyConfigurations exists in 10.2.2 (PolicyApi.d.ts:8) but `PolicyConfiguration.settings` is untyped; read `settings.resetOnSourcePush` (and `scope[].refName/matchKind`) from the Minimum-number-of-reviewers policy type `fa4e907d-c16b-4a4c-9dfa-4906e5d171dd` via `GET {project}/_apis/policy/configurations?api-version=7.1`.

</details>

#### VOTE-01 [high] [S] Vote without opening the description webview: commands + tree/SCM context menus

- Current: Voting exists ONLY in the editor-overview sidebar VotePanel (webviews/components/sidebar.tsx:21, 127-153 -> 'pr.vote' -> src/azdo/pullRequestOverview.ts:295-296, 781-798 -> PullRequestModel.submitVote src/azdo/pullRequestModel.ts:477-489). package.json contributes no vote/approve/reject command (full 39-command list verified) and src/commands.ts has zero vote hits, so there is no palette command, no tree-node context action, and no keybindable way to approve.
- Desired: azdopr.approve / azdopr.approveWithSuggestions / azdopr.waitForAuthor / azdopr.reject / azdopr.resetVote commands operating on the checked-out PR or a selected PR tree node (contextValue 'pullrequest' already exists, src/view/treeNodes/pullRequestNode.ts:335-337), plus a single 'Vote...' quickpick showing the 5 options with the current vote pre-marked. Approving a just-reviewed PR should be one action, like the ADO web 'Approve' button.
- Key files: `src/commands.ts`, `package.json`, `src/azdo/pullRequestModel.ts`, `src/view/treeNodes/pullRequestNode.ts`
- API: GitApi.createPullRequestReviewer (GitApi.d.ts:850)
- Notes: All plumbing exists (submitVote + refreshList); this is pure command wiring. Highest value-per-day for a daily reviewer.

#### VOTE-02 [high] [S] Active-PR sidebar review actions are dead: Request Changes silently no-ops, Approve posts a plain comment

- Current: AddCommentSimple in the activity-bar view offers Comment/Approve/Request Changes (webviews/components/comment.tsx:430-434, 458). The Approve case is commented out and falls through to a plain comment (comment.tsx:445-450); Request Changes posts 'pr.request-changes' (webviews/common/context.tsx:133-134) which neither provider handles (case lists src/azdo/activityBarViewProvider.ts:60-74, src/azdo/pullRequestOverview.ts:289-341), and unhandled messages never reply (src/common/webview.ts:58-66) so the click hangs silently. Meanwhile the provider's approvePullRequest handler for 'pr.approve' (activityBarViewProvider.ts:70-71, 185-201) has no sender in webviews/ (grep: zero hits).
- Desired: The checked-out-PR sidebar supports comment-and-vote in one gesture: Approve -> submitVote(+10), Request Changes -> submitVote(-5) (ADO's closest idiom: waiting-for-author), optionally posting the typed text as a comment first. No silent failures.
- Key files: `src/azdo/activityBarViewProvider.ts`, `webviews/components/comment.tsx`, `webviews/common/context.tsx`
- API: GitApi.createPullRequestReviewer (GitApi.d.ts:850)
- Notes: This is a live UX trap today: a reviewer who clicks Request Changes believes they voted -5; the PR records nothing. Consider replacing the GitHub-idiom dropdown with the ADO vote spectrum.

#### VOTE-03 [medium] [XS] Activity-bar reviewer list renders a mismatched shape (broken) and loses required/optional + vote data

- Current: The provider sends raw IdentityRefWithVote[] as `reviewers` (src/azdo/activityBarViewProvider.ts:113, 145) but merge.tsx maps them through <Reviewer> which expects ReviewState and destructures `.reviewer` (webviews/components/merge.tsx:70-74; webviews/components/reviewer.tsx:16) - undefined at render, so names/avatars/votes don't display. No required/optional distinction in this view. Related: isAuthor compares identity GUID to uniqueName email, always false (activityBarViewProvider.ts:144). Vote updates match reviewers by uniqueName here (activityBarViewProvider.ts:174-182) vs by id in the overview (pullRequestOverview.ts:769-779).
- Desired: Reuse convertIdentityRefWithVoteToReviewer (currently private in pullRequestOverview.ts:921-932; hoist to a shared util) so the checked-out PR's sidebar shows the same required/optional-grouped, vote-iconed reviewer list as the overview, and isAuthor works.
- Key files: `src/azdo/activityBarViewProvider.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`
- API: GitInterfaces.IdentityRefWithVote (GitInterfaces.d.ts:2634-2655)
- Notes: Bug fix + small refactor; prerequisite for the sidebar-vote gap above.

#### VOTE-04 [high] [M] Vote and requiredness invisible in the PR tree: no 'awaiting my vote' signal or category

- Current: PR tree items show only checkout-tick/#/DRAFT/title/author (src/view/treeNodes/pullRequestNode.ts:317-341); grep for vote/isRequired under src/view/ returns nothing. 'Assigned To Me' uses reviewerId search (src/azdo/folderRepositoryManager.ts:783-790) but mixes PRs I've already approved with PRs awaiting my vote, and hides whether I'm a required reviewer. Reviewer data is already on each listed PR (GitPullRequest.reviewers, GitInterfaces.d.ts:1560-1562) - fetched but not displayed.
- Desired: Tree item description/tooltip/icon reflect my vote state (e.g. ✔ approved, ✋ waiting-for-author, ● awaiting my vote, ⚑ required), plus rejected/waiting counts in the tooltip; 'Assigned To Me' split or sorted into 'Awaiting my review (required first)' vs 'Voted'. This is the #1 daily triage question for an ADO reviewer.
- Key files: `src/view/treeNodes/pullRequestNode.ts`, `src/view/treeNodes/categoryNode.ts`, `src/azdo/folderRepositoryManager.ts`
- API: GitPullRequestSearchCriteria.reviewerId (GitInterfaces.d.ts:1860); GitPullRequest.reviewers (GitInterfaces.d.ts:1562)
- Notes: Zero extra API calls needed - data already rides on the list response; just needs currentUser.id matching as done in sidebar.tsx:21.

#### VOTE-05 [high] [M] Vote-reset-on-push is invisible: no stale-vote detection, no re-vote prompt, no iteration correlation

- Current: Nothing tracks vote-vs-iteration: submitVote stores nothing (src/azdo/pullRequestModel.ts:477-489); the overview shows only the instantaneous vote (webviews/components/sidebar.tsx:21); no PolicyApi import anywhere (grep: zero hits) so the resetOnSourcePush policy is unreadable; no polling diff of reviewers, so when a push zeroes my +10 the extension shows 'no vote' with no explanation, and an approved-looking PR list entry silently reverts.
- Desired: On PR refresh, diff previous reviewer votes against current (cache last-seen vote per PR) and surface 'Your approval was reset by a new push (iteration 5)' as a notification + overview banner; show 'you voted on iteration N of M' by locating my vote system-thread among iterations; optionally read the min-reviewers policy to warn 'this branch resets votes on push' at vote time.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/sidebar.tsx`, `src/azdo/folderRepositoryManager.ts`
- API: GitApi.getPullRequestReviewers (GitApi.d.ts:885); GitApi.getPullRequestIterations (used at src/azdo/pullRequestModel.ts:385); PolicyApi.getPolicyConfigurations (PolicyApi.d.ts:8); SignalR reset events not callable (GitInterfaces.d.ts:2891-2896) - poll instead
- Notes: For teams running reset-on-push (common with min-reviewer policies), a reviewer who approved yesterday must notice the reset themselves today; the web UI shows it, the extension doesn't.

#### VOTE-06 [medium] [S] Re-request review / reset a reviewer's vote (updatePullRequestReviewers) unsupported

- Current: No call to updatePullRequestReviewers anywhere (grep src/ for updatePullRequestReviewers: only submitVote/addReviewer/removeReviewer exist, src/azdo/pullRequestModel.ts:477-512). As a PR author, after pushing fixes there is no way to nudge/reset a -5/-10 reviewer - the GitHub fork's re-request-review idiom (upstream 0.60) has no ADO port.
- Desired: 'Reset vote & re-request review' action on a reviewer row (overview sidebar) and a bulk 'Re-request all reviews' for the author, mapping to updatePullRequestReviewers(patchVotes) which zeroes votes; pairs naturally with a notification comment.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/reviewer.tsx`, `webviews/common/context.tsx`
- API: GitApi.updatePullRequestReviewers (GitApi.d.ts:904, doc 897-899)
- Notes: Vote-only endpoint - cannot change isRequired (that's policy-driven), per the d.ts doc.

#### VOTE-07 [medium] [XS] Vote spectrum collapsed in reviewer rows: +10/+5 and 0/-5 visually identical

- Current: REVIEW_STATE maps vote 10 and 5 to the same checkIcon, and 0 and -5 to the same pendingIcon; only hover tooltips differ; -10 uses the generic deleteIcon (webviews/components/reviewer.tsx:41-47). A rejected PR and a no-vote reviewer are indistinguishable at a glance from waiting-for-author, and approved-with-suggestions loses its 'suggestions' signal.
- Desired: Five distinct glyphs/colors matching ADO web (green check, green check+dot, orange clock/hand for waiting-for-author, gray hollow for no vote, red X for rejected) with the vote text inline, not tooltip-only; required reviewers marked (e.g. asterisk/'Required' pill) inside the row as well, since the two panels lose that context in the simple view.
- Key files: `webviews/components/reviewer.tsx`, `webviews/components/icon.tsx`
- API: IdentityRefWithVote.vote (GitInterfaces.d.ts:2650)

#### VOTE-08 [medium] [S] Vote events in the timeline are unparsed system-text; group vote rollup (votedFor) never shown

- Current: Vote system threads render via SystemThreadView as raw `thread.comments[0].content` with a commit icon (webviews/components/timeline.tsx:67-91; guard src/common/timelineEvent.ts:125-127), indistinguishable from ref-update noise; the GitHub ReviewEventView (timeline.tsx:139-178) is dead code. `votedFor` (team reviewer rollup, GitInterfaces.d.ts:2652-2654) is unused (grep: zero hits), so when a team is a required reviewer nobody can see WHICH member's vote satisfied it.
- Desired: Parse system threads whose properties carry CodeReviewVoteResult into first-class timeline entries with vote icon + colored verb ('approved with suggestions', 'rejected'); render votedFor members under group reviewer rows in the sidebar.
- Key files: `webviews/components/timeline.tsx`, `src/common/timelineEvent.ts`, `webviews/components/reviewer.tsx`
- API: Comment.commentType === CommentType.System (GitInterfaces.d.ts, CommentType); IdentityRefWithVote.votedFor (GitInterfaces.d.ts:2654)

#### VOTE-09 [low] [S] Flag-for-attention (isFlagged) and decline-review (hasDeclined) unsupported

- Current: isFlagged is never read or written (grep src/+webviews/: zero hits) even though it's on the fetched reviewer objects (GitInterfaces.d.ts:2636-2638) and patchable via updatePullRequestReviewer (GitApi.d.ts:887, 895). hasDeclined doesn't exist in 10.2.2 typings at all, so declined reviewers show as plain no-vote.
- Desired: Show a flag badge on flagged reviewer rows and a 'Flag for attention' toggle on my own row; render declined reviewers as 'Declined' instead of no-vote, with a 'Decline review' action for me (raw REST PATCH reviewers/{id} api-version 7.1 with hasDeclined:true).
- Key files: `src/azdo/pullRequestModel.ts`, `webviews/components/reviewer.tsx`, `src/azdo/pullRequestOverview.ts`
- API: GitApi.updatePullRequestReviewer (GitApi.d.ts:895); PATCH https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repoId}/pullRequests/{prId}/reviewers/{reviewerId}?api-version=7.1 (hasDeclined)
- Notes: hasDeclined needs raw REST (see node_api_limitations); nice-to-have parity with newer ADO web UI.

#### VOTE-10 [low] [XS] Reviewer removal blocked once a vote is cast; add-reviewer quickpick can't toggle requiredness

- Current: The delete affordance only appears on hover when state === PullRequestVote.NO_VOTE (webviews/components/reviewer.tsx:22-23), so a mistakenly-added reviewer who voted can't be removed from the extension (ADO web allows it). Adding a reviewer forces the required/optional choice up-front via two separate + buttons (webviews/components/sidebar.tsx:22-34) and there is no way to flip an existing optional reviewer to required or vice versa.
- Desired: Allow remove regardless of vote state (with confirm); a context action on each reviewer row to toggle required/optional - note requiredness set at add-time via createPullRequestReviewer works (fork already passes isRequired, src/azdo/pullRequestModel.ts:498), but changing it later requires delete+re-add since updatePullRequestReviewers is vote-only.
- Key files: `webviews/components/reviewer.tsx`, `webviews/components/sidebar.tsx`, `src/azdo/pullRequestModel.ts`
- API: GitApi.deletePullRequestReviewer (GitApi.d.ts:868); GitApi.createPullRequestReviewer (GitApi.d.ts:850)

### 2.2 Branch policies, policy evaluations, completion blockers (POL-\*)

<details><summary><b>How ADO models it</b> (API reference, click to expand)</summary>

**How ADO models "checks" and completion blockers**
**1. Policy evaluations (the real blockers).** Branch policies are `PolicyConfiguration` objects (isBlocking/isEnabled flags at `interfaces/PolicyInterfaces.d.ts:21,29`; untyped `settings: any` at :37). Per PR, each applicable policy produces a `PolicyEvaluationRecord` (`PolicyInterfaces.d.ts:59-92`) with `status: PolicyEvaluationStatus` - Queued=0, Running=1, Approved=2, Rejected=3, NotApplicable=4, Broken=5 (`PolicyInterfaces.d.ts:96-121`) - plus `configuration` (embedded full PolicyConfiguration, :75) and untyped `context: any` (:79; for build-validation policies this carries buildId/buildDefinitionId/isExpired).

Client access, all present in local v10.2.2:

- `IPolicyApi.getPolicyEvaluations(project, artifactId, includeNotApplicable?, top?, skip?)` - `PolicyApi.d.ts:12` (per-PR list)
- `IPolicyApi.getPolicyEvaluation(project, evaluationId)` - `PolicyApi.d.ts:10`
- `IPolicyApi.requeuePolicyEvaluation(project, evaluationId)` - `PolicyApi.d.ts:11` (re-runs e.g. a build-validation build)
- `IPolicyApi.getPolicyConfigurations(project, scope?, policyType?)` - `PolicyApi.d.ts:8`; `getPolicyTypes(project)` - `PolicyApi.d.ts:16` (map type GUID -> display name at runtime)
- Client factory: `WebApi.getPolicyApi()` - `node_modules/azure-devops-node-api/WebApi.d.ts:70`

The `artifactId` is `vstfs:///CodeReview/CodeReviewId/{projectId}/{pullRequestId}` (verified on Microsoft Learn: PolicyEvaluationRecord.ArtifactId remarks, learn.microsoft.com/dotnet/api/microsoft.teamfoundation.policy.webapi.policyevaluationrecord.artifactid). REST equivalent: `GET {org}/{project}/_apis/policy/evaluations?artifactId=...&api-version=7.1-preview.1` (Evaluations API is preview-only).

**2. PR statuses (custom external checks, GitHub-commit-status analog).** `GitStatus` (`interfaces/GitInterfaces.d.ts:2320-2357`: context, state, description, targetUrl) extended by `GitPullRequestStatus` with `iterationId` (`GitInterfaces.d.ts:1881-1885`). Fetched via `GitApi.getPullRequestStatuses` (`GitApi.d.ts:96`) and iteration-scoped variants (`GitApi.d.ts:67-70`). These are only posted by external services - **build validation policies do NOT appear here**; they only appear as policy evaluations.

**3. Merge status on the PR itself.** `GitPullRequest.mergeStatus: PullRequestAsyncStatus` (`GitInterfaces.d.ts:1546`) - NotSet/Queued/Conflicts/Succeeded/RejectedByPolicy/Failure (`GitInterfaces.d.ts:2778-2803`); `mergeFailureMessage` (:1530) and `mergeFailureType` (:1534). Note `mergeStatus` only reflects the _merge preview_ (conflicts); a PR with failing policies but a clean merge shows Succeeded - policy blockage is only visible via evaluations.

**4. Completion & auto-complete.** `GitPullRequestCompletionOptions` (`GitInterfaces.d.ts:1630-1663`): bypassPolicy (:1634), bypassReason (:1638), deleteSourceBranch (:1642), mergeCommitMessage (:1646), mergeStrategy (:1650), transitionWorkItems (:1658). Auto-complete = `updatePullRequest({ autoCompleteSetBy: {id}, completionOptions })` - `autoCompleteSetBy` at `GitInterfaces.d.ts:1466`; server completes the PR when all blocking policies pass. Cancel by patching `autoCompleteSetBy` to empty-GUID identity.

**5. Build click-through.** `WebApi.getBuildApi()` (`WebApi.d.ts:60`); `IBuildApi.getBuild(project, buildId)` (`BuildApi.d.ts:21`), `getBuildTimeline` (`BuildApi.d.ts:94`) - buildId comes from the evaluation record's `context`. Web URL for click-through is in the build's `_links.web`.

</details>

<details><summary><b>Current fork state</b> (verified refs, click to expand)</summary>

**What the fork does today**
**Policy evaluations: not fetched at all.** Zero references to `getPolicyApi`, `getPolicyEvaluations`, or `PolicyApi` anywhere in `src/` - the only "policy" hits are CSP meta tags (src/azdo/pullRequestOverview.ts:962, src/azdo/activityBarViewProvider.ts:361) and the enum doc-comment in src/azdo/interface.ts:52-54. No `BuildApi` usage anywhere either. The extension only ever calls `connection.getGitApi()` (e.g. src/azdo/pullRequestModel.ts:218,716) plus the entitlement REST wrapper (src/azdo/entitlementApi.ts:87).

**Custom PR statuses: fetched and displayed.** `PullRequestModel.getStatusChecks()` (src/azdo/pullRequestModel.ts:712-755) calls `git.getPullRequestStatuses(repoId, prId)` (:718), filters to the highest iterationId and de-dupes by context name+genre keeping max id (:719-729), and maps to the fork's `PullRequestChecks` shape (src/azdo/interface.ts:208-220). The overview panel fetches it once per load (src/azdo/pullRequestOverview.ts:189) and posts it as `status` (:247). The webview renders it as a collapsible "checks" section with per-status icon, context, description, and Details link (webviews/components/merge.tsx:56-68, StatusCheckDetails :327-342). Since ADO build-validation policies do not post PR statuses, this section is empty on most policy-governed repos - the inherited GitHub "checks" UI shows nothing while the PR is actually blocked.

**Mergeability: raw mergeStatus only.** The overview posts `mergeable: pullRequest.item.mergeStatus` (src/azdo/pullRequestOverview.ts:248); `getMergability()` just re-fetches the PR and returns `item.mergeStatus` (src/azdo/pullRequestModel.ts:848-851). The webview polls it every 3s only while NotSet/Queued (webviews/components/merge.tsx:88-95). Display bug: `MergeStatus` shows the delete icon for RejectedByPolicy but the message text falls through to "This branch has conflicts that must be resolved." (merge.tsx:114-122) - a policy-blocked PR is described as conflicted. `PrActions` renders the merge UI only when `mergeable === Succeeded && hasWritePermission` (merge.tsx:181-187), so a policy-pending PR shows no actions and no explanation of what is missing.

**Completion: immediate-only, minimal options.** `completePullRequest()` sets status Completed with completionOptions limited to deleteSourceBranch, mergeStrategy, transitionWorkItems (src/azdo/pullRequestModel.ts:247-266). The ConfirmMerge form exposes only two checkboxes (merge.tsx:266-279). No auto-complete, no bypassPolicy/bypassReason, no mergeCommitMessage. On completion failure the only surfacing is a transient toast with `result.mergeFailureMessage` (src/azdo/pullRequestOverview.ts:906-908) - and the reply still claims `state: PullRequestStatus.Completed` (:910-913).

**Active-PR sidebar view: checks hardcoded empty.** activityBarViewProvider posts `status: { statuses: [] }` and `events: []` (src/azdo/activityBarViewProvider.ts:139-140), so the "simple" view never shows any check/status data at all, only `mergeable` (:137).

**PR list tree: no blocker signal.** `PRNode.getTreeItem()` builds label/tooltip/description from title, number, author, draft, and checked-out state only (src/view/treeNodes/pullRequestNode.ts:314-342) - no mergeStatus, status-check, or policy decoration.

**Reviewer display ignores requiredness.** `convertIdentityRefWithVoteToReviewer` maps `isRequired` (src/azdo/pullRequestOverview.ts:921-933) into ReviewState (src/azdo/interface.ts:61-65 region), but the Reviewer component never renders it (webviews/components/reviewer.tsx:15-46) - no Required badge, so the reviewer half of "2/3 required approvals" is invisible too.

**package.json:** no commands or settings related to policies, statuses, builds, or auto-complete (the `azdoprStatus:azdo` view id is the changes tree, package.json:186; the only status command is `azdopr.changeThreadStatus` for comment threads, package.json:363).

</details>

<details><summary><b>node-api 10.2.2 limitations for this area</b></summary>

No raw REST is required for this gap area - azure-devops-node-api 10.2.2 covers it: `WebApi.getPolicyApi()` (WebApi.d.ts:70), `getPolicyEvaluations`/`getPolicyEvaluation`/`requeuePolicyEvaluation` (PolicyApi.d.ts:10-12), `getPolicyConfigurations`/`getPolicyTypes` (PolicyApi.d.ts:8,16), `WebApi.getBuildApi()` (WebApi.d.ts:60) with `getBuild` (BuildApi.d.ts:21) and `getBuildTimeline` (BuildApi.d.ts:94), and PR statuses via GitApi (GitApi.d.ts:67-70,93-96).

Typing/ergonomic limitations to plan around:

1. `PolicyConfiguration.settings` is `any` (PolicyInterfaces.d.ts:37) - no typed shapes for minimumApproverCount, creatorVoteCounts, buildDefinitionId, requiredReviewerIds, scope/path filters. Define local interfaces per policy type.
2. `PolicyEvaluationRecord.context` is `any` (PolicyInterfaces.d.ts:79) - build-validation context (buildId, buildDefinitionId, isExpired, buildIsNotCurrent) must be read untyped.
3. No well-known policy-type GUID constants ship with the package - resolve display names at runtime via `getPolicyTypes(project)` (PolicyApi.d.ts:16) instead of hardcoding GUIDs.
4. The Policy Evaluations endpoint itself is preview-only server-side: `GET https://dev.azure.com/{org}/{project}/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/{projectId}/{pullRequestId}&api-version=7.1-preview.1` (requeue = `PATCH .../policy/evaluations/{evaluationId}?api-version=7.1-preview.1`). The 10.2.2 client negotiates the preview version automatically; fine for dev.azure.com cloud (the fork's stated target). artifactId template verified on Microsoft Learn (PolicyEvaluationRecord.ArtifactId remarks).

</details>

#### POL-01 [high] [L] Fetch and display policy evaluations - the 'why can't this complete' panel

- Current: No PolicyApi usage anywhere in src/ (grep verified; only CSP meta strings at src/azdo/pullRequestOverview.ts:962 and an enum comment at src/azdo/interface.ts:52-54). The overview's checks section only shows custom PR statuses from getPullRequestStatuses (src/azdo/pullRequestModel.ts:718), which build-validation/min-reviewer/comment-resolution policies never populate - so on a typical policy-governed ADO repo the section is empty while the PR is blocked.
- Desired: Overview (and refresh poll) fetches getPolicyEvaluations with artifactId vstfs:///CodeReview/CodeReviewId/{projectId}/{pullRequestId} and renders one row per evaluation: display name from configuration.type, status icon (Queued/Running/Approved/Rejected/Broken), blocking vs optional from configuration.isBlocking, and per-type detail from configuration.settings (e.g. 'Minimum reviewers: 2 required', 'Comment resolution', 'Build validation: <definition name>'). Summary line: 'N blocking policies not satisfied'. This is THE core daily-driver feature ADO reviewers expect from the web UI.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/azdoRepository.ts`, `src/azdo/pullRequestOverview.ts`, `src/azdo/interface.ts`, `webviews/common/cache.ts`, `webviews/components/merge.tsx`
- API: WebApi.getPolicyApi (WebApi.d.ts:70); IPolicyApi.getPolicyEvaluations (PolicyApi.d.ts:12); IPolicyApi.getPolicyTypes (PolicyApi.d.ts:16); PolicyEvaluationRecord/PolicyEvaluationStatus (PolicyInterfaces.d.ts:59-121)
- Notes: Needs projectId for the artifactId - azdoRepository already resolves project metadata (used at src/azdo/pullRequestModel.ts:692). Resolve policy type names via getPolicyTypes at runtime rather than hardcoding well-known GUIDs. settings/context are untyped any in 10.2.2 - define local interfaces for the ~6 common policy types.

#### POL-02 [high] [XS] Fix RejectedByPolicy mislabeled as merge conflicts

- Current: webviews/components/merge.tsx:114-122 - MergeStatus shows deleteIcon for RejectedByPolicy but the message falls into the else branch: 'This branch has conflicts that must be resolved.' A policy-blocked PR with a perfectly clean merge is described as conflicted. Failure state has the same problem.
- Desired: Distinct copy per PullRequestAsyncStatus value: RejectedByPolicy -> 'Completion is blocked by branch policy' (linking to the policy panel from the previous gap), Failure -> surface item.mergeFailureMessage/mergeFailureType (GitInterfaces.d.ts:1530,1534), Conflicts -> keep conflict copy.
- Key files: `webviews/components/merge.tsx`, `src/azdo/pullRequestOverview.ts`
- API: PullRequestAsyncStatus (GitInterfaces.d.ts:2778-2803); GitPullRequest.mergeFailureMessage (GitInterfaces.d.ts:1530)
- Notes: Pure webview string/branch fix; independent of the policy-evaluation fetch, ship first.

#### POL-03 [high] [M] Auto-complete (set / show / cancel) - ADO's answer to auto-merge _(canonical: AC-02)_

- Current: completePullRequest only performs immediate completion (src/azdo/pullRequestModel.ts:247-266); ConfirmMerge offers just deleteBranch + completeWorkitem checkboxes (webviews/components/merge.tsx:266-279); PrActions renders nothing actionable unless mergeable === Succeeded (merge.tsx:181-187). item.autoCompleteSetBy is never read or displayed anywhere (grep: no hits in src/ or webviews/).
- Desired: When blocking policies are pending, offer 'Set auto-complete' with the same merge-strategy dropdown plus completion options; show a banner 'Auto-complete set by <user>' with a Cancel button when item.autoCompleteSetBy is populated. Set via GitApi.updatePullRequest({ autoCompleteSetBy: { id: currentUserId }, completionOptions }); cancel by patching autoCompleteSetBy to the empty GUID. This is the single most-used completion path for daily ADO reviewers on policy-governed branches.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`, `webviews/common/cache.ts`
- API: GitApi.updatePullRequest (already used at src/azdo/pullRequestModel.ts:219,244,253); GitPullRequest.autoCompleteSetBy (GitInterfaces.d.ts:1466); GitPullRequestCompletionOptions (GitInterfaces.d.ts:1630-1663)
- Notes: Current user id is available via azdoRepository.getAuthenticatedUser (used at src/azdo/pullRequestOverview.ts:191). Upstream scoping doc's 'auto-merge checkbox (0.44)' maps to this - the ADO-native shape is much richer than the GitHub checkbox.

#### POL-04 [high] [M] Build validation click-through and re-run

- Current: No BuildApi usage anywhere in src/ (grep verified). The only click-through today is StatusCheckDetails' target_url link on custom statuses (webviews/components/merge.tsx:327-342); a failing build-validation policy is completely invisible, and there is no way to re-queue it.
- Desired: Build-validation evaluation rows show build number + result (from evaluation context.buildId via BuildApi.getBuild), 'Details' opens the build's \_links.web URL in the browser, and a 'Re-run' action calls requeuePolicyEvaluation (also covers expired builds, context.isExpired). Reviewer never has to open the ADO web UI to see why validation failed.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`, `package.json`
- API: WebApi.getBuildApi (WebApi.d.ts:60); IBuildApi.getBuild (BuildApi.d.ts:21); IPolicyApi.requeuePolicyEvaluation (PolicyApi.d.ts:11)
- Notes: Depends on the policy-evaluation gap. PolicyEvaluationRecord.context is any in 10.2.2 - buildId/buildDefinitionId/isExpired must be read untyped; define a local interface.

#### POL-05 [medium] [S] Surface completion blockers in the active-PR sidebar (activity bar view)

- Current: activityBarViewProvider hardcodes status: { statuses: [] } and events: [] in its pr.initialize payload (src/azdo/activityBarViewProvider.ts:139-140) - the checked-out-PR sidebar shows merge status only (:137), never any checks or policies.
- Desired: The sidebar view (the surface a reviewer keeps open while iterating) shows the same compact policy/status summary as the overview: 'Build failing · 2 active threads · 1/2 required reviewers', refreshed with the existing update cycle.
- Key files: `src/azdo/activityBarViewProvider.ts`, `webviews/activityBarView (webview side)`, `webviews/components/merge.tsx`
- API: PullRequestModel.getStatusChecks (src/azdo/pullRequestModel.ts:712); IPolicyApi.getPolicyEvaluations (PolicyApi.d.ts:12)
- Notes: Mostly plumbing once the overview-side fetch exists; the StatusChecks component is already shared.

#### POL-06 [medium] [XS] Persistent completion-failure surfacing (mergeFailureMessage)

- Current: On failed completion, the only signal is a transient toast (src/azdo/pullRequestOverview.ts:907), and the reply message then claims state: PullRequestStatus.Completed and mergeable: result.mergeStatus regardless (:910-913), so the webview can render a completed state for a PR that did not complete.
- Desired: Reply with the PR's real post-attempt status; render mergeFailureMessage/mergeFailureType persistently in the merge section until resolved.
- Key files: `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`
- API: GitPullRequest.mergeFailureMessage/mergeFailureType (GitInterfaces.d.ts:1530,1534)
- Notes: The :910-913 hardcoded Completed reply is arguably a bug independent of any new feature.

#### POL-07 [low] [S] Bypass policy on completion (for admins)

- Current: completionOptions passed by the fork contain only deleteSourceBranch, mergeStrategy, transitionWorkItems (src/azdo/pullRequestModel.ts:257-261); bypassPolicy/bypassReason/mergeCommitMessage are never exposed.
- Desired: When completion is policy-blocked and the user has bypass permission, ConfirmMerge offers 'Override branch policies and complete' with a required reason field; also expose a custom merge-commit-message input (parity with the ADO web complete dialog).
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`
- API: GitPullRequestCompletionOptions.bypassPolicy/bypassReason/mergeCommitMessage (GitInterfaces.d.ts:1634,1638,1646)
- Notes: Server enforces permission; the extension can attempt and surface the 403/policy error rather than pre-checking. Low frequency but painful when needed.

#### POL-08 [medium] [S] Blocker signal on PR list tree items

- Current: PRNode.getTreeItem shows only title/number/author/draft/checked-out marker (src/view/treeNodes/pullRequestNode.ts:314-342) - no mergeStatus, check, or policy decoration in 'Waiting For My Review' / 'Created By Me' queries.
- Desired: Lightweight decoration: conflict/RejectedByPolicy icon or description suffix from item.mergeStatus (already in the list payload, zero extra API calls); optionally lazy per-PR policy summary behind a setting to control API volume.
- Key files: `src/view/treeNodes/pullRequestNode.ts`, `src/view/treeNodes/categoryNode.ts`
- API: GitPullRequest.mergeStatus (GitInterfaces.d.ts:1546)
- Notes: mergeStatus-only version is S and free; per-node policy evaluation fetches would be M and needs throttling - recommend the free version first.

#### POL-09 [medium] [S] Status-check fetch drops PR-level statuses and never refreshes

- Current: getStatusChecks keeps only statuses whose iterationId equals the max (src/azdo/pullRequestModel.ts:719-720); statuses posted without iterationId (undefined -> 0) are silently dropped whenever any iteration-scoped status exists. Statuses are fetched once per overview load (src/azdo/pullRequestOverview.ts:189); the 3s webview poll checks mergeability only (webviews/components/merge.tsx:88-95). Also state defaults to Succeeded on an empty list because [].every() is true (pullRequestModel.ts:746).
- Desired: Keep PR-level (iterationId-less) statuses alongside latest-iteration ones, refresh statuses (and policy evaluations) on the same poll/refresh cycle, and treat an empty status list as NotSet rather than implicit success.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`
- API: GitApi.getPullRequestStatuses (GitApi.d.ts:96); GitApi.getPullRequestIterationStatuses (GitApi.d.ts:70); GitPullRequestStatus.iterationId (GitInterfaces.d.ts:1881-1885)
- Notes: The empty-list Succeeded default is currently masked because merge.tsx:56 hides the section when statuses.length is 0, but it will bite as soon as the summary state feeds a tree decoration or combined blocker rollup.

#### POL-10 [medium] [XS] Show 'Required' badge on reviewers (policy-driven requiredness)

- Current: isRequired is mapped into ReviewState (src/azdo/pullRequestOverview.ts:931) but the Reviewer component never renders it (webviews/components/reviewer.tsx:15-46) - required reviewers added by required-reviewer/min-reviewer policies are indistinguishable from optional ones.
- Desired: 'Required' label on reviewer rows (matching the ADO web UI), so the reviewer list corroborates the min-reviewers policy row ('2/3 required approvals').
- Key files: `webviews/components/reviewer.tsx`
- API: IdentityRefWithVote.isRequired (GitInterfaces.d.ts - IdentityRefWithVote)
- Notes: Data is already flowing to the webview; render-only change. Overlaps the votes/reviewers gap area - flagged here because requiredness is policy-driven.

### 2.3 Auto-complete and completion options (AC-\*)

<details><summary><b>How ADO models it</b> (API reference, click to expand)</summary>

**ADO model (from local azure-devops-node-api v10.2.2 typings)**
**Completing a PR** = `GitApi.updatePullRequest(gitPullRequestToUpdate, repositoryId, pullRequestId, project?)` (`GitApi.d.ts:91`) with `status: Completed`, `lastMergeSourceCommit`, and `completionOptions`.

**Setting auto-complete** = same `updatePullRequest` call but setting `autoCompleteSetBy` (an `IdentityRef`, `GitInterfaces.d.ts:1466` - "If set, auto-complete is enabled for this pull request and this is the identity that enabled it") plus `completionOptions` (`GitInterfaces.d.ts:1486`) while leaving status Active. **Cancelling auto-complete** = `updatePullRequest` with `autoCompleteSetBy = { id: '00000000-0000-0000-0000-000000000000' }` (zero GUID; documented REST behavior, works through the node-api wrapper since it serializes the body as-is).

**`GitPullRequestCompletionOptions`** (`GitInterfaces.d.ts:1630`): `bypassPolicy?: boolean` (:1634), `bypassReason?: string` (:1638), `deleteSourceBranch?: boolean` (:1642), `mergeCommitMessage?: string` (:1646), `mergeStrategy?: GitPullRequestMergeStrategy` (:1650), deprecated `squashMerge?: boolean` (:1654), `transitionWorkItems?: boolean` (:1658 - "attempt to transition any work items linked to the pull request into the next logical state"), `triggeredByAutoComplete` (:1662, internal).

**`GitPullRequestMergeStrategy` enum** (`GitInterfaces.d.ts:1763`): NoFastForward=1, Squash=2, Rebase=3, RebaseMerge=4 (semi-linear).

**Policy restriction of strategies**: the "Limit merge types" branch policy governs which strategies the server accepts at completion. v10.2.2 exposes `PolicyApi.getPolicyConfigurations(project, scope?, policyType?)` (`PolicyApi.d.ts:8`), `getPolicyEvaluations(project, artifactId, ...)` (`PolicyApi.d.ts:12`), and `getPolicyTypes(project)` / `getPolicyType(project, typeId)` (`PolicyApi.d.ts:15-16`) - discover the merge-strategy policy type GUID at runtime via `getPolicyTypes` rather than hardcoding. Policy settings carry `allowNoFastForward` / `allowSquash` / `allowRebase` / `allowRebaseMerge` booleans (same flags as `az repos policy merge-strategy`, per learn.microsoft.com/azure/devops/repos/git/branch-policies#limit-merge-types).

REST equivalent for everything above: `PATCH https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repositoryId}/pullrequests/{pullRequestId}?api-version=7.1`.

</details>

<details><summary><b>Current fork state</b> (verified refs, click to expand)</summary>

**What the fork does today**
**Completion path (works, partially):** The description webview's non-simple `Merge` component lets the user pick a strategy from all four ADO strategies (`webviews/components/merge.tsx:305-310` MERGE_METHODS map; `MergeSelect` :314-325) then `ConfirmMerge` (:244-288) shows two checkboxes - "Complete associated work items after merging" (`completeWorkitem`, default checked, :269) and "Delete branch after merging" (`deleteBranch`, default checked, :275) - and calls `complete()` (`webviews/common/context.tsx:149-153`), which posts `pr.complete`. `PullRequestOverviewPanel` routes it (`src/azdo/pullRequestOverview.ts:297-298`) to `completePullRequest` (:900-918), which calls `PullRequestModel.completePullRequest` (`src/azdo/pullRequestModel.ts:247-266`): `git.updatePullRequest({ status: Completed, lastMergeSourceCommit, completionOptions: { deleteSourceBranch, mergeStrategy, transitionWorkItems } }, ...)`.

**Silent bug - work-item transition never happens:** the webview sends `completeWorkitem` (`merge.tsx:257-258`, `context.tsx:149`), but the model reads `options.transitionWorkItems` (`pullRequestModel.ts:261`; interface `src/azdo/interface.ts:232-236` declares `transitionWorkItems`). The property name mismatch means `transitionWorkItems` is always `undefined` - the checked-by-default checkbox is a no-op and linked work items are never transitioned.

**No auto-complete anywhere:** grep for `autoComplete`/auto-complete across `src/` and `webviews/` finds zero fork code (only vscode.d.ts autocomplete-widget docs). `PullRequestModel.item` extends `GitPullRequest` (`src/azdo/interface.ts:141-145`), so `autoCompleteSetBy`/`completionOptions` ARE fetched on every PR, but the overview init payload (`pullRequestOverview.ts:222-258`) and webview cache shape (`webviews/common/cache.ts:57-58` only has defaultMergeMethod/mergeMethodsAvailability) never carry them: data fetched, never displayed, never actionable. A PR that already has auto-complete set shows no badge and cannot be cancelled.

**Merge-strategy availability is hardcoded:** `FolderRepositoryManager.getPullRequestRepositoryAccessAndMergeMethods` returns `hasWritePermission: true` and all four strategies `true` unconditionally (`src/azdo/folderRepositoryManager.ts:1343-1353`). No PolicyApi call exists anywhere in `src/azdo/` (grep for getPolicyConfigurations/PolicyApi: zero hits). The `(not enabled)` disabling UI in `MergeSelect` (`merge.tsx:318-321`) can therefore never trigger; a "Limit merge types" branch policy is only discovered as a server error at completion time. Default strategy comes from the `azdoPullRequests.defaultMergeMethod` setting (`package.json:136-146`, default Squash) via `getDefaultMergeMethod` (`pullRequestOverview.ts:983-993`).

**Dead/broken merge paths:** `FolderRepositoryManager.mergePullRequest` is a stub - signature takes GitHub-shaped `'merge'|'squash'|'rebase'` and the entire body is commented-out GitHub octokit code returning `undefined` (`folderRepositoryManager.ts:1048-1107`). Three UI paths still call it: (1) the `azdopr.merge` palette/context command (`src/commands.ts:372-391`, contributed at `package.json:229`, menu gated `azdo:inReviewMode` at :464) - after the "Are you sure" modal it awaits the stub and returns undefined; (2) the overview panel's `azdopr.merge` message handler (`pullRequestOverview.ts:737-758`) reads `result.merged` off undefined -> TypeError -> generic error toast; (3) the activity-bar "simple" view (`src/azdo/activityBarViewProvider.ts:66-67`, :323-347) whose `MergeSimple` dropdown (`merge.tsx:190-209`) posts `azdopr.merge` - so merging from the active-PR sidebar view is broken; the simple view has no `pr.complete` handler at all (case list at `activityBarViewProvider.ts:59-72`).

**Other completion options:** `mergeCommitMessage` is never sent (`pullRequestModel.ts:257-262`); the GitHub-era commit title/description inputs are commented out (`merge.tsx:290-303`). `bypassPolicy`/`bypassReason` are never sent. Completion UI is only reachable when `mergeable === Succeeded && hasWritePermission` (`merge.tsx:181-187`), so a policy-rejected or conflicted PR offers no action. Post-completion the `DeleteBranch` component is commented out (`merge.tsx:47,52`), though a `pr.deleteBranch` handler for local/remote cleanup exists (`pullRequestOverview.ts:625-716`).

</details>

<details><summary><b>node-api 10.2.2 limitations for this area</b></summary>

**`autoCompleteIgnoreConfigIds` is missing from v10.2.2** - `GitPullRequestCompletionOptions` in `GitInterfaces.d.ts:1630-1663` has only bypassPolicy/bypassReason/deleteSourceBranch/mergeCommitMessage/mergeStrategy/squashMerge/transitionWorkItems/triggeredByAutoComplete; no `autoCompleteIgnoreConfigIds` (verified by grep, exit 1). Current API has it ("List of any policy configuration Id's which auto-complete should not wait for. Only applies to optional policies (isBlocking == false)" - learn.microsoft.com azure-devops-extension-api GitPullRequestCompletionOptions). REST: `PATCH https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repositoryId}/pullrequests/{pullRequestId}?api-version=7.1` with `completionOptions.autoCompleteIgnoreConfigIds: number[]`. Practical workaround without raw REST: the node-api client serializes the request body as-is, so passing the extra property through a widened type on `updatePullRequest` works against the same route.

**Branch-scoped policy configurations route not wrapped** - v10.2.2 `GitApi.d.ts` has no method for `GET {org}/{project}/_apis/git/policy/configurations?repositoryId={repoId}&refName={ref}&api-version=7.1` (grep 'policy' in GitApi.d.ts: only a comment at :897), which is the endpoint that returns exactly the policies applicable to a branch (server-side prefix matching). v10 fallback: `PolicyApi.getPolicyConfigurations(project, scope?, policyType?)` (`PolicyApi.d.ts:8`) + client-side scope filtering, discovering the merge-strategy policy type GUID via `getPolicyTypes(project)` (`PolicyApi.d.ts:16`).

**Cancelling auto-complete** needs no new API: `updatePullRequest` with `autoCompleteSetBy: { id: '00000000-0000-0000-0000-000000000000' }` (zero GUID) clears it - supported by the v10.2.2 wrapper.

</details>

#### AC-01 [high] [XS] Work-item transition checkbox is a silent no-op (property name mismatch)

- Current: Webview sends `completeWorkitem` (webviews/components/merge.tsx:257-259, webviews/common/context.tsx:149) but PullRequestModel.completePullRequest reads `options.transitionWorkItems` (src/azdo/pullRequestModel.ts:261), so completionOptions.transitionWorkItems is always undefined and linked work items are never transitioned despite the checked-by-default checkbox.
- Desired: Checking 'Complete associated work items after merging' actually sends transitionWorkItems: true so ADO moves linked work items to the next state (e.g. Active -> Resolved) - table stakes for teams whose boards are driven by PR completion.
- Key files: `webviews/components/merge.tsx`, `webviews/common/context.tsx`, `src/azdo/interface.ts`
- API: GitPullRequestCompletionOptions.transitionWorkItems (GitInterfaces.d.ts:1658); GitApi.updatePullRequest (GitApi.d.ts:91)
- Notes: One-line rename in the webview (or map in the message handler). Add a regression test on the pr.complete message shape.

#### AC-02 [high] [L] Set / cancel auto-complete (the ADO analog of upstream 0.44 auto-merge checkbox)

- Current: Zero auto-complete code in the fork (grep autoComplete across src/ and webviews/: no hits). item.autoCompleteSetBy/completionOptions are fetched on every PR (PullRequest extends GitPullRequest, src/azdo/interface.ts:141) but never sent to the webview (init payload src/azdo/pullRequestOverview.ts:222-258, cache shape webviews/common/cache.ts:57-58) - fetched, not displayed, not actionable. Completion UI is also gated to mergeable === Succeeded (webviews/components/merge.tsx:181), which is exactly when auto-complete matters least.
- Desired: A 'Set auto-complete' button (with strategy + deleteSourceBranch + transitionWorkItems + merge commit message) available while policies/builds are still pending; an auto-complete banner showing who set it and the chosen options; a 'Cancel auto-complete' action; badge in the PR tree/description title. This is the single most-used completion workflow in policy-heavy ADO shops - you almost never merge manually, you set auto-complete and walk away.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`, `webviews/common/cache.ts`, `webviews/common/context.tsx`, `src/azdo/interface.ts`, `src/view/treeNodes/pullRequestNode.ts`
- API: GitApi.updatePullRequest (GitApi.d.ts:91) with autoCompleteSetBy (GitInterfaces.d.ts:1466) + completionOptions (GitInterfaces.d.ts:1486); cancel = autoCompleteSetBy: {id: '00000000-0000-0000-0000-000000000000'}
- Notes: Same updatePullRequest call as completion, just status stays Active and autoCompleteSetBy is set. Upstream 0.44 auto-merge checkbox is the UI pattern to mirror in both the merge form and (later) the create-PR flow. Waiting-on-optional-policies (autoCompleteIgnoreConfigIds) is a v10.2.2 typings gap - see node_api_limitations.

#### AC-03 [high] [M] azdopr.merge command and activity-bar MergeSimple call a commented-out stub

- Current: FolderRepositoryManager.mergePullRequest is entirely commented-out GitHub octokit code returning undefined (src/azdo/folderRepositoryManager.ts:1048-1107, '// TODO LATER'). Still wired to: azdopr.merge palette/context command (src/commands.ts:372-391; package.json:229, menu :464), the overview panel handler which TypeErrors on result.merged (src/azdo/pullRequestOverview.ts:737-758), and the activity-bar simple view (src/azdo/activityBarViewProvider.ts:66-67, 323-347) via MergeSimple (webviews/components/merge.tsx:190-209). The simple view has no pr.complete handler (case list activityBarViewProvider.ts:59-72), so completing a PR from the active-PR sidebar is impossible.
- Desired: All merge entry points route to the working completePullRequest path with the same options form (or the simple view opens the full overview to complete). No UI path should invoke the stub; the command either completes with confirmation + options or is removed from contributes.
- Key files: `src/azdo/folderRepositoryManager.ts`, `src/commands.ts`, `src/azdo/activityBarViewProvider.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`, `package.json`
- API: GitApi.updatePullRequest (GitApi.d.ts:91)
- Notes: Daily reviewers live in the activity-bar view when a PR is checked out; its merge dropdown failing with a generic 'Unable to merge pull request' toast is a trust-killer.

#### AC-04 [medium] [M] Merge strategies not restricted by 'Limit merge types' branch policy

- Current: getPullRequestRepositoryAccessAndMergeMethods hardcodes hasWritePermission: true and all four strategies available (src/azdo/folderRepositoryManager.ts:1343-1353); no PolicyApi usage anywhere in src/azdo/. The MergeSelect '(not enabled)' disabled-option UI (webviews/components/merge.tsx:318-321) can never trigger, so picking a policy-forbidden strategy fails only at completion time with a server error.
- Desired: Fetch the merge-strategy policy for the PR's target branch and disable disallowed options in MergeSelect (and pick a valid default over the user setting), matching what the ADO web UI shows. Also feeds the auto-complete form.
- Key files: `src/azdo/folderRepositoryManager.ts`, `src/azdo/azdoRepository.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`
- API: PolicyApi.getPolicyConfigurations (PolicyApi.d.ts:8); PolicyApi.getPolicyTypes (PolicyApi.d.ts:15-16); REST branch-scoped: GET {org}/{project}/\_apis/git/policy/configurations?repositoryId={id}&refName={ref}&api-version=7.1 (not wrapped in v10.2.2 GitApi)
- Notes: Policy settings carry allowNoFastForward/allowSquash/allowRebase/allowRebaseMerge + branch scope. With PolicyApi.getPolicyConfigurations you must filter scope client-side; the git-scoped REST route does the branch matching (incl. prefix match) server-side - prefer it. getDefaultMergeMethod (pullRequestOverview.ts:983-993) then needs the filtered availability.

#### AC-05 [medium] [S] No merge commit message input on completion

- Current: completePullRequest never sends mergeCommitMessage (src/azdo/pullRequestModel.ts:257-262); ConfirmMerge has no message field and the GitHub-era title/description helpers are commented out (webviews/components/merge.tsx:244-303). ADO always uses its default 'Merged PR {id}: {title}' message.
- Desired: An optional pre-filled commit message textarea in the confirm-merge and auto-complete forms (matching the ADO web completion dialog), especially valuable for squash merges where the message becomes the sole mainline commit.
- Key files: `webviews/components/merge.tsx`, `webviews/common/context.tsx`, `src/azdo/interface.ts`, `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`
- API: GitPullRequestCompletionOptions.mergeCommitMessage (GitInterfaces.d.ts:1646)

#### AC-06 [low] [S] No policy bypass on completion for admins _(canonical: POL-07)_

- Current: bypassPolicy/bypassReason never sent (src/azdo/pullRequestModel.ts:257-262); completion UI entirely hidden unless mergeable === Succeeded (webviews/components/merge.tsx:181-187), so a policy-rejected PR (PullRequestMergeability.RejectedByPolicy, src/azdo/interface.ts:52-54) offers no action at all - must fall back to the web UI.
- Desired: Users with bypass permission can complete with 'Override policies' plus a required reason, mirroring the ADO web dialog; PRs in RejectedByPolicy state surface that option instead of hiding all actions.
- Key files: `webviews/components/merge.tsx`, `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `src/azdo/interface.ts`
- API: GitPullRequestCompletionOptions.bypassPolicy (GitInterfaces.d.ts:1634); bypassReason (GitInterfaces.d.ts:1638)
- Notes: Server enforces the permission; extension just needs the affordance + clear error when denied. Low frequency but unblocks hotfix flows without leaving the editor.

#### AC-07 [low] [XS] Completion-option defaults not configurable (only defaultMergeMethod exists)

- Current: The only completion setting is azdoPullRequests.defaultMergeMethod (package.json:136-146). deleteSourceBranch and work-item transition checkboxes are hardcoded defaultChecked={true} (webviews/components/merge.tsx:269, 275); no setting for defaulting auto-complete on.
- Desired: Settings like azdoPullRequests.defaultDeleteSourceBranch, defaultTransitionWorkItems, and setAutoCompleteByDefault so a daily reviewer's habitual choices are pre-filled (ADO itself just shipped repo-level 'auto-complete on by default', sprint 270).
- Key files: `package.json`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`
- API: GitPullRequestCompletionOptions (GitInterfaces.d.ts:1630)

#### AC-08 [medium] [S] No post-completion local branch cleanup offer

- Current: After completion the webview only shows 'Pull request successfully merged.' with the DeleteBranch component commented out (webviews/components/merge.tsx:44-48); the working pr.deleteBranch handler with local/remote picks exists (src/azdo/pullRequestOverview.ts:625-716) but is unreachable in the completed state, and nothing prompts to switch off the now-merged branch even when deleteSourceBranch removed it on the server.
- Desired: On successful completion: if deleteSourceBranch was set, offer to delete the local branch and check out the default branch (upstream 0.126 auto-delete-branch-after-merge is the analog).
- Key files: `webviews/components/merge.tsx`, `src/azdo/pullRequestOverview.ts`, `src/view/reviewManager.ts`
- API: local git only; server side already covered by GitPullRequestCompletionOptions.deleteSourceBranch (GitInterfaces.d.ts:1642)

### 2.4 PR iterations: iteration diffs, thread tracking, changes-since (ITER-\*)

<details><summary><b>How ADO models it</b> (API reference, click to expand)</summary>

**How ADO models iterations (verified against local azure-devops-node-api 10.2.2 typings)**
Every push to a PR source branch creates a new **iteration** (ADO web UI calls them "Updates"). Iterations are the native unit for diffing, comment tracking, and statuses.

**GitApi methods** (`node_modules/azure-devops-node-api/GitApi.d.ts`, interface `IGitApi` lines 58-70):

- `getPullRequestIterations(repositoryId, pullRequestId, project?, includeCommits?)` - line 66. Returns `GitPullRequestIteration[]`.
- `getPullRequestIteration(repositoryId, pullRequestId, iterationId, project?)` - line 65.
- `getPullRequestIterationChanges(repositoryId, pullRequestId, iterationId, project?, top?, skip?, compareTo?)` - line 64. **`compareTo` gives iteration-M->N diffs**; returns `GitPullRequestIterationChanges`.
- `getPullRequestIterationCommits(repositoryId, pullRequestId, iterationId, project?, top?, skip?)` - line 58.
- `getPullRequestIterationStatus/Statuses(...)` - lines 69-70 (statuses are iteration-scoped).
- `getThreads(repositoryId, pullRequestId, project?, iteration?, baseIteration?)` - line 105; `getPullRequestThread(..., iteration?, baseIteration?)` - line 104. Passing an iteration pair makes the server **track** each thread's position into that diff.
- `createThread(commentThread, repositoryId, pullRequestId, project?)` - line 103. Iteration anchoring is carried in the body via `GitPullRequestCommentThread.pullRequestThreadContext`.

**Interfaces** (`node_modules/azure-devops-node-api/interfaces/GitInterfaces.d.ts`):

- `GitPullRequestIteration` - line 1667: `id`, `author`, `changeList: GitPullRequestChange[]`, `commits`, `commonRefCommit`, `sourceRefCommit`, `targetRefCommit`, `createdDate`, `reason` (incl. Retarget with `oldTargetRefName`/`newTargetRefName`), `push`.
- `GitPullRequestIterationChanges` - line 1736: `changeEntries: GitPullRequestChange[]` + `nextSkip`/`nextTop` server-driven paging.
- `GitPullRequestChange extends GitChange` - line 1595: adds **`changeTrackingId`** ("ID used to track files through multiple changes") - the key that ties a file in one iteration to the same file in another (renames included).
- `GitPullRequestCommentThreadContext` - line 1613: `changeTrackingId` (doc: "**Must be set for pull requests with iteration support**"), `iterationContext: CommentIterationContext`, `trackingCriteria: CommentTrackingCriteria`.
- `CommentIterationContext` - line 245: `firstComparingIteration` / `secondComparingIteration` = the diff pair being viewed when the thread was created.
- `CommentThreadContext` - line 312: `filePath` + left/right file start/end `CommentPosition`s. When a thread is returned from `getThreads(iteration, baseIteration)`, these are the **tracked (current)** positions in the requested diff.
- `CommentTrackingCriteria` - line 370: `origFilePath`, `origLeft/RightFileStart/End`, `firstComparingIteration`/`secondComparingIteration` - the **original** creation-time coordinates; doc: "If this property is filled out when the thread is returned, then the thread has been tracked from its original location."

**REST equivalents** (for reference; all covered by 10.2.2):

- `GET .../git/repositories/{repo}/pullRequests/{prId}/iterations?api-version=7.1`
- `GET .../pullRequests/{prId}/iterations/{iterationId}/changes?$compareTo={m}&$top&$skip&api-version=7.1`
- `GET .../pullRequests/{prId}/threads?$iteration={n}&$baseIteration={m}&api-version=7.1`

This is strictly stronger than GitHub's changes-since-last-review: iteration diffs are first-class and server-computed, and comment threads are positionally re-tracked into any iteration pair on request.

</details>

<details><summary><b>Current fork state</b> (verified refs, click to expand)</summary>

**What the fork does today (all refs verified by reading the files)**
**Iterations are used in exactly two places, both as a scalar "max id":**

1. `src/azdo/pullRequestModel.ts:379-398` `getAllActiveThreadsBetweenAllIterations()` - calls `getPullRequestIterations` (line 385) only to compute `max` (line 386), then `getAllActiveThreads(max, 1)` (line 388) -> `getThreads(repoId, prId, undefined, iteration, baseIteration)` (line 435). So all comment threads ARE fetched iteration-tracked (latest vs 1) - good - but the iterations list itself is discarded and re-fetched on every call. Call sites: `src/azdo/pullRequestOverview.ts:186`, `src/azdo/folderRepositoryManager.ts:260`, `src/view/reviewManager.ts:461`, `src/view/treeNodes/pullRequestNode.ts:221`.
2. `src/azdo/pullRequestModel.ts:718-720` `getStatusChecks()` - filters PR statuses to `iterationId === max(...)`, i.e. statuses are already latest-iteration-scoped.

**File diffs are commit-based, not iteration-based.** `getFileChangesInfo()` (`src/azdo/pullRequestModel.ts:760-846`) builds `GitBaseVersionDescriptor`s from `head.sha`/`base.sha` (lines 772-781), computes merge-base (789), then calls `getCommitDiffs` (paginated, lines 632-674, the v1.2 work) and `getFileDiffs` in batches (814-822). The `azdoPullRequests.diffBase` setting (package.json:58) picks mergeBase vs head as base (791-803). `changeTrackingId` is never obtained anywhere (it only exists on iteration change entries, `GitInterfaces.d.ts:1595`) - `grep changeTrackingId src/` has zero hits outside node_modules.

**The tree shows only full-PR diff + raw commits.** `PRNode.getChildren` (`src/view/treeNodes/pullRequestNode.ts:112-180`) renders Description + flat/tree file changes of the whole PR. Checked-out PRs get a "Commits" category (`src/view/treeNodes/repositoryChangesNode.ts:58-67` -> `commitsCategoryNode.ts:38-48` -> `pullRequestModel.getCommits()` at line 567 `getPullRequestCommits`), and `CommitNode.getChildren` diffs a single commit via `getCommitChanges`/`git.getChanges` (`src/view/treeNodes/commitNode.ts:52-56`, `pullRequestModel.ts:582-614`). The fork itself admits this is the wrong model - `commitNode.ts:56`: "TODO Map the file changes with commit id. But this is not possible in Azdo as azdo pr works on iterations not individual commits". There is **no iteration/Update node, no compare picker, no changes-since-last-review view**, and no iteration-related command or setting (`grep -i iteration package.json webviews/` - zero hits).

**New threads are posted with NO iteration anchoring.** `createThread` (`src/azdo/pullRequestModel.ts:278-335`) accepts an optional `prCommentThreadContext` (line 288) and sends it as `pullRequestThreadContext` (line 322), but **no caller ever supplies it**: `src/common/commonCommentHandler.ts:252-259` (the diff-editor path) passes only filePath/line/offsets; `src/commands.ts:161` (suggest-edit), `src/commands.ts:426`, `src/azdo/pullRequestOverview.ts:800-801`, and `src/azdo/activityBarViewProvider.ts:205` pass only the message. So neither `iterationContext` nor the "must be set" `changeTrackingId` is ever sent; the server anchors the thread to whatever the latest iteration is at POST time.

**Thread rendering prefers the stale original position over the tracked one.** `getPositionFromThread` (`src/azdo/utils.ts:328-337`) and `getDiffSide` (`utils.ts:339-352`) return `trackingCriteria.orig*FileStart` whenever `trackingCriteria` is present, falling back to `threadContext` otherwise; `commentingRanges.ts:64-70` does the same. Per `GitInterfaces.d.ts:370`, `orig*` are the creation-time coordinates and `threadContext` holds the server-tracked position for the requested iteration pair - so once a later push shifts lines, threads render at their old line numbers against new file content. Meanwhile file-matching uses the current `threadContext.filePath` (`pullRequestNode.ts:305`, `reviewManager.ts:448`), mixing tracked path with untracked position.

**Outdated-thread handling is stubbed dead.** `convertThreadToIReviewThread` hardcodes `isOutdated: false, originalLine: 0 // TODO` (`pullRequestModel.ts:347-348`). `reviewManager.getPullRequestData` hardcodes `outdatedComments = []` with the real logic commented out (`src/view/reviewManager.ts:464-468`); the downstream obsolete-file grouping keyed on `iterationContext.secondComparingIteration` (lines 477-517) is therefore unreachable.

**Viewed-state is not iteration-aware.** `FileReviewedStatusService` persists `{fileName, viewed}` keyed only by PR id (`src/azdo/fileReviewedStatusService.ts:19-28`); a new iteration that changes a file leaves it marked viewed.

**Webview:** `pullRequestOverview.updatePullRequest` sends `threads` + `commits` (`src/azdo/pullRequestOverview.ts:186-187, 239-240`) - no iterations/updates timeline. `reviewManager.pollForStatusChange` (`src/view/reviewManager.ts:181-186`) polls but has no notion of "new iteration arrived".

</details>

<details><summary><b>node-api 10.2.2 limitations for this area</b></summary>

azure-devops-node-api 10.2.2 fully covers this area - `getPullRequestIterations` (GitApi.d.ts:66, incl. `includeCommits`), `getPullRequestIterationChanges` with `compareTo`/`top`/`skip` (GitApi.d.ts:64), `getPullRequestIterationCommits` (58), iteration-scoped `getThreads`/`getPullRequestThread` (105/104), and iteration statuses (69-70). No raw REST needed for the iteration work itself. Two adjacent caveats: (1) known 10.2.2 typing bug on `getCommitDiffs`'s `diffCommonCommit` boolean (azure-devops-node-api issue #429), already worked around with an `as any` cast at src/azdo/pullRequestModel.ts:649-653 - irrelevant once diffs move to iteration changes; (2) a **platform** gap, not a version gap: no API (node-api or REST 7.1/7.2) exposes "the iteration a reviewer last viewed/voted on". "Changes since my last review" must be derived client-side - persist last-seen iterationId per PR in extension globalState, and/or infer from the vote system-thread `publishedDate` (system threads are already fetched by `getThreads` but filtered out via `isUserThread`, src/azdo/utils.ts:201) compared against `GitPullRequestIteration.createdDate`.

</details>

#### ITER-01 [high] [S] Thread positions rendered from stale orig\* coordinates instead of server-tracked positions

- Current: getPositionFromThread (src/azdo/utils.ts:328-337) and getDiffSide (utils.ts:339-352) prefer trackingCriteria.origLeft/RightFileStart over threadContext whenever trackingCriteria is present; commentingRanges.ts:64-70 repeats the pattern. Threads are fetched tracked to (maxIteration, 1) at pullRequestModel.ts:385-388, so threadContext holds the correct current position - but the fork displays the creation-time one. File matching meanwhile uses the tracked threadContext.filePath (pullRequestNode.ts:305, reviewManager.ts:448), so path and position come from different iterations.
- Desired: Comments stay glued to the code they were written about across pushes: use threadContext (tracked) position/side when the thread was fetched with an iteration pair matching the diff being displayed, keeping orig\* only for an 'originally on line N' affordance. A reviewer re-opening a PR after the author pushed sees every old comment on the right line.
- Key files: `src/azdo/utils.ts`, `src/common/commentingRanges.ts`, `src/azdo/pullRequestModel.ts`, `src/view/reviewCommentController.ts`
- API: GitInterfaces.d.ts:312 CommentThreadContext (tracked position); GitInterfaces.d.ts:370 CommentTrackingCriteria (orig\* = creation-time); GitApi.d.ts:105 getThreads(iteration, baseIteration)
- Notes: Semantics per d.ts docs: trackingCriteria presence means 'the thread HAS been tracked from its original location' - i.e. threadContext is current. Behavior should be confirmed against a live PR with a line-shifting second push before shipping, but the interface contract supports the inversion claim.

#### ITER-02 [high] [M] Anchor new comment threads with iterationContext + changeTrackingId

- Current: createThread (src/azdo/pullRequestModel.ts:278-335) supports an optional prCommentThreadContext (line 288 -> 322) but every caller omits it: commonCommentHandler.ts:252-259 (diff-editor comments), commands.ts:161 (suggest edit) and :426, pullRequestOverview.ts:800-801, activityBarViewProvider.ts:205. GitInterfaces.d.ts:1613 says changeTrackingId 'Must be set for pull requests with iteration support'. Result: the server anchors the thread to the latest iteration at POST time, so a comment composed against a diff fetched before the author's next push lands mis-anchored.
- Desired: When posting from a PR diff editor, send pullRequestThreadContext = { changeTrackingId (from the iteration changeList entry for the file), iterationContext: { firstComparingIteration: <base iteration of the viewed diff>, secondComparingIteration: <iteration whose content the editor shows> } }. Comments then track correctly across force-pushes and iteration compares - table stakes for a daily ADO reviewer on active PRs.
- Key files: `src/common/commonCommentHandler.ts`, `src/azdo/pullRequestModel.ts`, `src/common/uri.ts (PR URI params need iteration ids)`, `src/view/treeNodes/pullRequestNode.ts`
- API: GitApi.d.ts:103 createThread; GitInterfaces.d.ts:1613 GitPullRequestCommentThreadContext; GitInterfaces.d.ts:245 CommentIterationContext; GitInterfaces.d.ts:1595 GitPullRequestChange.changeTrackingId
- Notes: Depends on the iteration-based diff source gap (need iteration ids + changeTrackingId flowing into the PR URIs / file-change nodes). Do it together with that refactor.

#### ITER-03 [high] [M] Switch PR file-change source from raw commit diffs to native iteration changes

- Current: getFileChangesInfo (src/azdo/pullRequestModel.ts:760-846) diffs head.sha vs base.sha via getCommitDiffs (632-674, hand-paginated, with the issue-#429 'as any' workaround at 649-653) + batched getFileDiffs (814-822). Iterations' changeList/changeEntries and changeTrackingId are never fetched (zero grep hits for changeTrackingId in src/).
- Desired: Fetch getPullRequestIterations once per model refresh (cached), use getPullRequestIterationChanges(latest, compareTo=0/undefined) as the canonical PR change list - server-computed, rename-aware, paged via nextSkip/nextTop - keeping getFileDiffs only for hunk content. This yields changeTrackingId per file (prerequisite for thread anchoring) and makes any iteration pair diffable with the same code path.
- Key files: `src/azdo/pullRequestModel.ts`, `src/view/treeNodes/pullRequestNode.ts`, `src/view/reviewManager.ts`, `src/common/diffHunk.ts`
- API: GitApi.d.ts:64 getPullRequestIterationChanges(compareTo); GitApi.d.ts:66 getPullRequestIterations; GitInterfaces.d.ts:1736 GitPullRequestIterationChanges (nextSkip/nextTop); GitInterfaces.d.ts:1595 changeTrackingId
- Notes: Foundation for the three gaps above/below. Keep the diffBase=head option working by mapping it to a plain head-vs-target compare or keeping the old path behind it.

#### ITER-04 [high] [L] Iteration (Update) picker: browse changes-in-update-N and compare arbitrary iteration pairs

- Current: Tree shows only the full PR diff (pullRequestNode.ts:156-172) plus a Commits category for checked-out PRs (repositoryChangesNode.ts:58-67, commitsCategoryNode.ts:38-48) whose per-commit children (commitNode.ts:52-103) diff single commits via git.getChanges (pullRequestModel.ts:602) and carry no comments - commitNode.ts:56 TODO explicitly notes commits are the wrong unit for ADO. No command/setting/webview mentions iterations (grep of package.json and webviews/ = 0 hits).
- Desired: Parity with the ADO web 'Updates' tab: an Updates category (one node per iteration: author, date, reason incl. retarget, commit count) and/or a status-bar/quick-pick 'Compare iteration M...N' that re-renders the changed-files tree from getPullRequestIterationChanges(n, compareTo=m) with threads fetched via getThreads(n, m) so comment positions match the compared diff exactly.
- Key files: `src/view/treeNodes/pullRequestNode.ts`, `src/view/treeNodes/repositoryChangesNode.ts`, `new src/view/treeNodes/iterationNode.ts (replacing/augmenting commitNode.ts)`, `src/azdo/pullRequestModel.ts`, `src/commands.ts`, `package.json`
- API: GitApi.d.ts:64 getPullRequestIterationChanges; GitApi.d.ts:66 getPullRequestIterations(includeCommits); GitApi.d.ts:58 getPullRequestIterationCommits; GitApi.d.ts:105 getThreads(iteration, baseIteration)
- Notes: The upstream scoping doc's changes-since-last-review (0.48) is the GitHub-shaped cousin; ADO's server-side iteration diff makes this cheaper and exact here - no client-side patch juggling.

#### ITER-05 [high] [M] Changes since my last review (vote/last-seen iteration)

- Current: No equivalent exists. Threads are always fetched (max,1) (pullRequestModel.ts:385-388); polling (reviewManager.ts:181-186) has no new-iteration detection; nothing records which iteration the user last reviewed.
- Desired: One-click 'Changes since I last reviewed': remember last-seen iteration id per PR (extension globalState, same store pattern as fileReviewedStatusService), optionally seeded from the user's vote system-thread publishedDate vs iteration createdDate, then render getPullRequestIterationChanges(latest, compareTo=lastSeen) with getThreads(latest, lastSeen). Badge PRs in the tree when currentMaxIteration > lastSeen.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/fileReviewedStatusService.ts (or sibling service)`, `src/view/treeNodes/pullRequestNode.ts`, `src/view/prsTreeDataProvider or categoryNode.ts`, `src/commands.ts`, `package.json`
- API: GitApi.d.ts:64 getPullRequestIterationChanges(compareTo); GitApi.d.ts:105 getThreads(iteration, baseIteration); GitInterfaces.d.ts:1667 GitPullRequestIteration.createdDate/author
- Notes: Platform limitation: ADO exposes no per-reviewer last-viewed iteration API - client-side persistence is the honest approach (record it when the user opens the PR or votes via submitVote, pullRequestModel.ts:477-489). Builds directly on the iteration picker plumbing.

#### ITER-06 [medium] [M] Resurrect outdated-thread detection using iteration tracking

- Current: isOutdated hardcoded false and originalLine 0 with TODO (pullRequestModel.ts:347-348, convertThreadToIReviewThread); reviewManager.ts:464-468 hardcodes outdatedComments=[] (real filter commented out), making the obsolete-file-changes branch keyed on iterationContext.secondComparingIteration (reviewManager.ts:477-517) unreachable dead code.
- Desired: Mark a thread outdated when the server could not track it into the currently displayed iteration pair (e.g. tracked threadContext absent/zeroed for the latest compare, or trackingCriteria.secondComparingIteration < current iteration on a changed region). Outdated threads get a badge and a 'view on original Update N vs M diff' action using the thread's own iterationContext - mirrors upstream 0.86 outdated-comment badges but ADO-native.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/utils.ts`, `src/view/reviewManager.ts`, `src/view/reviewCommentController.ts`
- API: GitInterfaces.d.ts:370 CommentTrackingCriteria; GitInterfaces.d.ts:245 CommentIterationContext; GitApi.d.ts:104 getPullRequestThread(iteration, baseIteration)
- Notes: Exact 'untrackable' signal needs one live-PR experiment (delete the commented-on lines, re-fetch with (max,1), inspect payload) - the d.ts alone doesn't spell out how untracked threads are represented.

#### ITER-07 [medium] [S] Auto-unmark viewed files when a later iteration touches them

- Current: FileReviewedStatusService stores {fileName, viewed} keyed only by PR id (src/azdo/fileReviewedStatusService.ts:19-28); markFileAsViewed/unmark commands exist (package.json:410,416) but a new push changing a viewed file leaves it checkmarked.
- Desired: Persist the iteration id (or file objectId) alongside the viewed mark; on refresh, diff getPullRequestIterationChanges(latest, compareTo=viewedAtIteration) and flip touched files back to unviewed - so the checkbox means 'reviewed as of the current code', which is what a daily reviewer assumes it means.
- Key files: `src/azdo/fileReviewedStatusService.ts`, `src/azdo/pullRequestModel.ts`, `src/view/treeNodes/fileChangeNode.ts`
- API: GitApi.d.ts:64 getPullRequestIterationChanges(compareTo)
- Notes: Storage key is already versioned ('.fileReviewStatus.v2', fileReviewedStatusService.ts:20) - bump to v3 with {fileName, viewed, iterationId}.

#### ITER-08 [low] [XS] Cache the iterations list on the PR model (stop re-fetching per thread load)

- Current: getAllActiveThreadsBetweenAllIterations (pullRequestModel.ts:379-398) calls getPullRequestIterations on every invocation solely to compute max (line 386), and it is invoked from four hot paths (pullRequestOverview.ts:186, folderRepositoryManager.ts:260, reviewManager.ts:461, pullRequestNode.ts:221) - an extra REST round-trip each time, with the rich iteration payload (author, dates, commits, changeList) thrown away.
- Desired: Fetch iterations once per model refresh, cache like item.commits (pullRequestModel.ts:552-556 pattern), invalidate on poll/refresh; expose the cached list to the picker, since-last-review, and viewed-state features. Also serves upstream-scoping 'API-usage reduction (0.120, 0.142)' goals.
- Key files: `src/azdo/pullRequestModel.ts`
- API: GitApi.d.ts:66 getPullRequestIterations
- Notes: Do first - every other gap in this list consumes the cached list.

### 2.5 Comment thread statuses as first-class workflow (THR-\*)

<details><summary><b>How ADO models it</b> (API reference, click to expand)</summary>

**ADO model (from local azure-devops-node-api 10.2.2 typings)**

- **Enum**: `CommentThreadStatus` - `interfaces/GitInterfaces.d.ts:337-366`: Unknown=0, Active=1, Fixed=2, WontFix=3, Closed=4, ByDesign=5, Pending=6. Status lives on the thread, not the comment: `CommentThread.status?` at `GitInterfaces.d.ts:306`.
- **Read**: `GitApi.getThreads(repositoryId, pullRequestId, project?, iteration?, baseIteration?)` - `GitApi.d.ts:105` (iteration params give iteration-tracked thread positions). Single thread: `getPullRequestThread` - `GitApi.d.ts:104`.
- **Write**: `GitApi.updateThread(commentThread, repositoryId, pullRequestId, threadId, project?)` - `GitApi.d.ts:106`; a partial `{ status }` body is sufficient (REST `PATCH .../pullRequests/{prId}/threads/{threadId}?api-version=7.1`).
- **Create**: `GitApi.createThread` - `GitApi.d.ts:103`; caller sets initial `status` on the thread body.
- **Resolution semantics** (ADO web UI): resolved = Fixed/WontFix/Closed/ByDesign; unresolved = Active/Pending. The "Check for comment resolution" branch policy (policy type name **"Comment requirements"**, type id `fa4e907d-c16b-4a4c-9dfa-4906e5d171dd`; enumerate via Policy Types API to confirm per-org) blocks completion while unresolved threads exist (verified at learn.microsoft.com/azure/devops/repos/git/branch-policies#require-comment-resolution).
- **Policy visibility**: `PolicyApi.getPolicyConfigurations(project, scope?, policyType?)` - `PolicyApi.d.ts:8`; `PolicyApi.getPolicyEvaluations(project, artifactId, ...)` - `PolicyApi.d.ts:12`, where `artifactId = vstfs:///CodeReview/CodeReviewId/{projectId}/{pullRequestId}` (REST `GET /{project}/_apis/policy/evaluations?artifactId=...&api-version=7.1-preview.1`).
- **No native draft/pending review batching** in ADO: comments publish immediately; `Pending` is just another thread status (ADO web UI does not expose it as a picker option, nor ByDesign).
- VS Code side: `vscode.CommentThreadState` (Unresolved/Resolved) exists in the bundled typings - `src/@types/vscode.d.ts:17515`, `thread.state?` at `:17587` - this is the API that drives native resolved styling and the built-in comments-panel filter.

</details>

<details><summary><b>Current fork state</b> (verified refs, click to expand)</summary>

**What the fork does today (all refs read/verified)**
**Fetching** - thread statuses ARE fetched, for all statuses. `getAllActiveThreads` is a misnomer: it calls `GitApi.getThreads` with iteration/baseIteration and filters only `isDeleted` (`src/azdo/pullRequestModel.ts:429-441`). `getAllActiveThreadsBetweenAllIterations` (`pullRequestModel.ts:383-397`) diffs against `_reviewThreadsCache` and fires `onDidChangeReviewThreads`. Callers: overview open (`src/azdo/pullRequestOverview.ts:186`), review mode (`src/view/reviewManager.ts:461`), tree file nodes (`src/view/treeNodes/pullRequestNode.ts:221`), folderRepositoryManager.ts:260.

**Setting status - editor**: single command `azdopr.changeThreadStatus` (`src/commands.ts:633-642`; declared package.json:363-368, title "Change status", icon `$(settings)`, menu `comments/commentThread/title` package.json:690-695). It opens a quick-pick of enum key strings (`src/common/commonCommentHandler.ts:121-162`) built by `getCommentThreadStatusKeys` (`src/azdo/utils.ts:398-404`) offering Active, Fixed, WontFix, Closed, **Pending** (excludes Unknown and ByDesign), then calls `PullRequestModel.updateThreadStatus` (`pullRequestModel.ts:352-378`) -> `GitApi.updateThread` with `{status}`. So any status can be set, but always via gear-icon -> modal quick-pick; no one-click resolve.

**Setting status - overview webview**: each thread's first comment renders a bare `<select>` (`webviews/components/comment.tsx:152-161`, options map `comment.tsx:106-117` with ByDesign commented out, order Active/Pending/Fixed/WontFix/Closed) wired through `timeline.tsx:216-218,238-240` -> `webviews/common/context.tsx:74` -> `pr.change-thread-status` handler (`pullRequestOverview.ts:301-302,828-840`). Gates: only on the first comment (`comment.tsx:44-46`, computed as `c.id === 1` at `timeline.tsx:238`) and only when `!!threadStatus` (`comment.tsx:153`) - threads with status Unknown(0)/undefined get no control. `defaultValue` means the select goes stale if status changes elsewhere.

**Display**: editor comment widget label = `"Status: <EnumKey>"` text (`utils.ts:366-372`). `vscode.CommentThread.state` is NEVER set (zero hits in src outside vscode.d.ts) - no native resolved dimming/collapse, and the built-in Comments panel resolved-filter can't work. `IReviewThread.isResolved` is computed via `isCommentResolved` (`pullRequestModel.ts:340`, `utils.ts:412-418` - Fixed/WontFix/Closed/ByDesign) but **no UI consumes it**. Collapse state is based only on embedded-vs-tab editor (`src/view/reviewCommentController.ts:106,226-230`) or always-Expanded (`src/view/pullRequestCommentController.ts:145,227`), never on resolution.

**Unresolved count**: overview header shows "N/M comments resolved" (`webviews/components/header.tsx:61,199-207`, counting Active+Pending as unresolved) - that is the ONLY place. PR tree node description/tooltip is just "#N by login" (`pullRequestNode.ts:324-334`); nothing in status bar.

**Filtering**: none anywhere - no command, setting, or webview control filters threads by status (grep for resolved/unresolved in package.json and src: only the header counter).

**Policy**: no `PolicyApi` usage anywhere in src. Comment-resolution policy state is invisible. Worse, the overview merge box maps `PullRequestMergeability.RejectedByPolicy` to the failure icon but the message text falls through to "This branch has conflicts that must be resolved." (`webviews/components/merge.tsx:107-125`) - actively misleading when the blocker is unresolved comments.

**Pending/draft batching**: dead plumbing. `hasPendingReview` defaults false (`pullRequestModel.ts:84,123-130`) and nothing ever sets it true (the only real assignment site is commented out at `reviewCommentController.ts:608-611`), so `createOrReplyComment`'s `isDraft` is always false (`commonCommentHandler.ts:34`) and every comment posts immediately. New threads are always created `status: Active` (`pullRequestModel.ts:320`). No start-review/submit-review commands exist in package.json. Meanwhile "Pending" is offered as a manually settable status in both pickers - a semantic orphan.

</details>

<details><summary><b>node-api 10.2.2 limitations for this area</b></summary>

None for this area - azure-devops-node-api 10.2.2 covers everything needed: GitApi.getThreads with iteration/baseIteration (GitApi.d.ts:105), GitApi.updateThread for status changes (GitApi.d.ts:106), GitApi.createThread (GitApi.d.ts:103), CommentThreadStatus enum incl. Pending (GitInterfaces.d.ts:337-366), and PolicyApi.getPolicyConfigurations / getPolicyEvaluations (PolicyApi.d.ts:8, :12). Only caveats: (1) policy evaluations require the artifactId format `vstfs:///CodeReview/CodeReviewId/{projectId}/{pullRequestId}` - not obvious from the typings; REST equivalent is `GET https://dev.azure.com/{org}/{project}/_apis/policy/evaluations?artifactId=...&api-version=7.1-preview.1` (still a preview route even in 7.1). (2) The 'Comment requirements' policy type id (fa4e907d-c16b-4a4c-9dfa-4906e5d171dd) should be resolved at runtime via `GET /{project}/_apis/policy/types?api-version=7.1` rather than hard-coded.

</details>

#### THR-01 [high] [S] Native resolved/unresolved thread state in the editor (vscode.CommentThreadState)

- Current: Fork never sets vscode.CommentThread.state; resolution is conveyed only by the text label 'Status: Fixed' (src/azdo/utils.ts:366-372). isResolved is computed on IReviewThread (src/azdo/pullRequestModel.ts:340, utils.ts:412-418) but consumed nowhere. Collapse ignores resolution (src/view/reviewCommentController.ts:106,226-230; src/view/pullRequestCommentController.ts:145,227).
- Desired: Resolved threads (Fixed/WontFix/Closed/ByDesign) get state=Resolved: native dimmed styling, auto-collapse on open, and the built-in Comments panel filter ('show unresolved') works. State updates live off onDidChangeReviewThreads.
- Key files: `src/azdo/utils.ts`, `src/azdo/prComment.ts`, `src/view/reviewCommentController.ts`, `src/view/pullRequestCommentController.ts`
- API: vscode.CommentThreadState (src/@types/vscode.d.ts:17515, :17587); GitInterfaces.CommentThreadStatus (GitInterfaces.d.ts:337-366)
- Notes: Engine is ^1.97 so the API is available. Data already fetched - pure display gap. Unblocks the filtering gap for free via VS Code's built-in comments-panel filter.

#### THR-02 [high] [S] One-click Resolve / Reactivate actions on the comment widget

- Current: Only path is the gear icon 'Change status' -> modal quick-pick of raw enum keys (src/commands.ts:633-642; src/common/commonCommentHandler.ts:121-162; package.json:363-368,690-695). Resolving one thread = 3 interactions; quick-pick shows 'WontFix' spelling.
- Desired: Inline 'Resolve' button on active threads and 'Reactivate' on resolved ones (ADO web parity), driven by a context value per thread status; keep the quick-pick for Won't Fix/Closed/Pending. Human-readable labels ('Won't fix').
- Key files: `package.json`, `src/commands.ts`, `src/common/commonCommentHandler.ts`, `src/azdo/prComment.ts (thread contextValue)`
- API: GitApi.updateThread (GitApi.d.ts:106)
- Notes: updateThreadStatus already exists (pullRequestModel.ts:352-378); this is command/menu wiring plus a contextValue reflecting current status so when-clauses can toggle Resolve vs Reactivate.

#### THR-03 [high] [M] Comment-resolution policy awareness + unresolved count surfacing _(overlaps POL-01 (comment-resolution deliverable))_

- Current: No PolicyApi usage anywhere in src. Unresolved count exists only as overview header text 'N/M comments resolved' (webviews/components/header.tsx:61,199-207). Tree node shows '#N by login' only (src/view/treeNodes/pullRequestNode.ts:324-334). Merge box shows the conflicts message for RejectedByPolicy mergeability (webviews/components/merge.tsx:107-125).
- Desired: A daily reviewer sees why completion is blocked: fetch policy evaluations for the PR, render 'Comment requirements: 3 unresolved threads' (and other policies) in the overview merge/status section; show unresolved-thread count in the PR tree description and description node; fix the RejectedByPolicy text fallthrough.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`, `webviews/components/header.tsx`, `src/view/treeNodes/pullRequestNode.ts`, `src/view/treeNodes/descriptionNode.ts`
- API: PolicyApi.getPolicyEvaluations (PolicyApi.d.ts:12) with artifactId vstfs:///CodeReview/CodeReviewId/{projectId}/{prId}; PolicyApi.getPolicyConfigurations (PolicyApi.d.ts:8); REST GET /{project}/\_apis/policy/evaluations?artifactId=...&api-version=7.1-preview.1
- Notes: Policy type name 'Comment requirements' (type id fa4e907d-c16b-4a4c-9dfa-4906e5d171dd; confirm per-org via GET /\_apis/policy/types). This is also the natural seam for later build-validation/required-reviewer policy display. The merge.tsx text fix alone is XS and worth doing immediately.

#### THR-04 [medium] [M] Filter threads by status (show only active) in editor and overview timeline

- Current: No filtering anywhere: all non-deleted threads render regardless of status (fetch filters only isDeleted, src/azdo/pullRequestModel.ts:429-441); overview timeline renders every thread (webviews/components/timeline.tsx:201-241); no related command or setting in package.json.
- Desired: Toggle 'Show resolved comments' in the overview timeline (default off for closed statuses) and rely on native comments-panel filtering in the editor (falls out of the CommentThreadState gap); optionally a setting for default collapse/hide of resolved threads.
- Key files: `webviews/components/timeline.tsx`, `webviews/common/context.tsx`, `src/azdo/pullRequestOverview.ts`, `package.json (configuration)`
- API: none new - client-side over already-fetched GitInterfaces.CommentThread.status
- Notes: On big PRs with dozens of resolved threads the timeline and editor gutter are pure noise today; ADO web hides resolved threads behind a filter by default.

#### THR-05 [medium] [S] Overview thread-status control correctness and legibility

- Current: Status control is an unstyled <select> rendered only on the first comment when !!threadStatus (webviews/components/comment.tsx:152-161, gate at :153) - threads with status Unknown(0)/undefined get NO control; defaultValue makes it stale after external status changes; isFirstCommentInThread computed as c.id === 1 (timeline.tsx:238) breaks if comment 1 was deleted; labels are raw enum keys ('WontFix').
- Desired: A controlled status badge+menu on every code thread reflecting live status, human-readable labels, visible resolved/active color coding in the timeline.
- Key files: `webviews/components/comment.tsx`, `webviews/components/timeline.tsx`
- API: none new
- Notes: changeThreadStatus round-trip already returns the updated thread (pullRequestOverview.ts:828-840) but the webview never applies the reply to state - switch to controlled value and update on reply.

#### THR-06 [low] [M] Resolve the Pending-status / dead draft-review plumbing

- Current: hasPendingReview can never become true (only real assignment commented out, src/view/reviewCommentController.ts:608-611; default false at src/azdo/pullRequestModel.ts:84), so the isDraft branch in commonCommentHandler.ts:34 is dead and all comments post immediately; new threads are always Active (pullRequestModel.ts:320). Yet 'Pending' is user-settable in both pickers (utils.ts:398-404; comment.tsx:106-117) with no explanation, and header counts Pending as unresolved (header.tsx:199-207).
- Desired: Pick a lane: (a) minimal - drop Pending from pickers and delete dead hasPendingReview/inDraft plumbing (ADO web offers no Pending picker either), or (b) full - implement client-side review batching: queued comments created as status Pending threads, a 'Publish review' command flips them Active in bulk. For a daily ADO reviewer (a) removes a footgun; (b) is a genuine differentiator ADO web lacks.
- Key files: `src/azdo/utils.ts`, `src/common/commonCommentHandler.ts`, `src/azdo/pullRequestModel.ts`, `webviews/components/comment.tsx`, `src/view/reviewCommentController.ts`
- API: GitApi.createThread (GitApi.d.ts:103) with status: Pending; GitApi.updateThread (GitApi.d.ts:106)
- Notes: Note for option (b): Pending threads are visible to everyone in ADO web immediately (no server-side draft privacy), so 'batching' is about bulk-flip UX, not secrecy - set expectations in UI copy. Size assumes (b); (a) alone is XS.

### 2.6 Work item linking (WI-\*)

<details><summary><b>How ADO models it</b> (API reference, click to expand)</summary>

**How ADO models PR ↔ work item linking (from local azure-devops-node-api 10.2.2 typings)**
**Reading links (PR side):**

- `GitApi.getPullRequestWorkItemRefs(repositoryId, pullRequestId, project?)` -> `VSSInterfaces.ResourceRef[]` - `GitApi.d.ts:107` (interface) / `GitApi.d.ts:1114` (impl). `ResourceRef` is just `{id?, url?}` (`interfaces/common/VSSInterfaces.d.ts:221`), so full work item details always require a second call.
- `GitApi.getPullRequest(..., includeWorkItemRefs?)` can inline the refs on the PR object - `GitApi.d.ts:89/943`; the refs land on `GitPullRequest.workItemRefs` (`interfaces/GitInterfaces.d.ts:1590`).
- Important nuance: `getPullRequestWorkItemRefs` returns work items associated via the PR's **source-branch commits and branch links too**, not only items carrying an explicit PR ArtifactLink relation.

**Writing links (work item side):** there is no Git-side "add work item to PR" API. Linking = JSON-patch on the work item: `WorkItemTrackingApi.updateWorkItem(customHeaders, document, id, project?, ...)` - `WorkItemTrackingApi.d.ts:82/716` - adding a relation `{rel: 'ArtifactLink', url: <PR artifactId>, attributes: {name: 'Pull Request'}}`. The PR artifact URI is `GitPullRequest.artifactId` (`interfaces/GitInterfaces.d.ts:1462`), format `vstfs:///Git/PullRequestId/{projectId}%2F{repositoryId}%2F{pullRequestId}`; it is populated on single-PR GET (`getPullRequestById`) responses. Removing = `Operation.Remove` at `/relations/{index}`.

**Attaching at creation:** `GitPullRequest.workItemRefs` (`GitInterfaces.d.ts:1590`) can be set on the body passed to `GitApi.createPullRequest(gitPullRequestToCreate, repositoryId, project?)` (`GitApi.d.ts:924`-area) - ADO creates the ArtifactLinks server-side.

**Hydrating work items:** `WorkItemTrackingApi.getWorkItem(id, fields?, asOf?, expand?)` (`WorkItemTrackingApi.d.ts:703`), batch `getWorkItems(ids, fields?, ...)` (`WorkItemTrackingApi.d.ts:81/704`), `getWorkItemsBatch` (`:83/723`), WIQL search `queryByWiql(wiql, teamContext?, timePrecision?, top?)` (`WorkItemTrackingApi.d.ts:65/561`), and recent activity `getRecentActivityData()` (`WorkItemTrackingApi.d.ts:9/117`, account-wide, cross-project).

**Transition on completion:** `GitPullRequestCompletionOptions` (`GitInterfaces.d.ts:1630`) has `transitionWorkItems?: boolean` (`GitInterfaces.d.ts:1658`) - moves linked work items to next state when the PR completes.

**Policy (linking can be REQUIRED):** the "Work item linking" branch policy (well-known policy type `40e92b44-2fe1-4dd6-b3d8-74a9c21d0c6e`) blocks completion when a PR has no linked items. Evaluations are exposed via `PolicyApi.getPolicyEvaluations(project, artifactId, includeNotApplicable?, top?, skip?)` (`PolicyApi.d.ts:12/82`) where artifactId is the **CodeReview** form `vstfs:///CodeReview/CodeReviewId/{projectId}/{pullRequestId}`; records are `PolicyEvaluationRecord` (`interfaces/PolicyInterfaces.d.ts:59`) with `status?: PolicyEvaluationStatus` (`PolicyInterfaces.d.ts:91`). Configurations via `getPolicyConfigurations(project, scope?, policyType?)` (`PolicyApi.d.ts:8/50`).

</details>

<details><summary><b>Current fork state</b> (verified refs, click to expand)</summary>

**What the fork does TODAY (all verified by reading files)**
This area is one of the fork's better-served ADO-native features: work items are fetched, displayed, addable, and removable - but only inside the PR overview webview, with a sparse card, a weak picker, and zero policy awareness.

**Data layer - `src/azdo/workItem.ts` (whole file, 130 lines):**

- `AzdoWorkItem.getWorkItemById(id)` -> `getWorkItem(id, undefined, undefined, WorkItemExpand.All)` (`src/azdo/workItem.ts:31-40`)
- `getRecentWorkItems()` -> `getRecentActivityData()` (`src/azdo/workItem.ts:42-52`) - account-wide recent activity, not project-scoped, no text search
- `associateWorkItemWithPR(workItemId, pr)` -> JSON-patch `add /relations/-` with `rel: 'ArtifactLink'`, `url: pr.item.artifactId`, `attributes.name: 'pull request'` via `updateWorkItem` (`src/azdo/workItem.ts:54-90`); errors are swallowed into a warning toast and return `undefined` (`:83-89`)
- `disassociateWorkItemWithPR(workItem, pr)` -> `findIndex` of the matching ArtifactLink relation, then `remove /relations/{idx}` (`src/azdo/workItem.ts:92-125`). **No guard for `idx === -1`** - a work item that appears in the PR's refs via a commit/branch link (no PR ArtifactLink relation on the work item) produces patch path `/relations/-1`, which fails.
- `PullRequestModel.getWorkItemRefs()` -> `GitApi.getPullRequestWorkItemRefs` (`src/azdo/pullRequestModel.ts:268-276`, call at `:274`)
- artifactId is safe here: the overview always resolves the PR via `getPullRequestById` (`src/azdo/azdoRepository.ts:241-246`, via `resolvePullRequest` in `src/azdo/folderRepositoryManager.ts`), which populates `artifactId`.

**Wiring:** single `AzdoWorkItem` instance created at activation (`src/extension.ts:100-102`), passed through `registerCommands` (`src/extension.ts:129`) into `PullRequestOverviewPanel.createOrShow` only (`src/commands.ts:465, 496`). No other consumer.

**Overview webview (fetch + display):**

- `getWorkItemsWithPr` fetches refs then hydrates **one-by-one** (`N+1`) with `getWorkItemById` per ref (`src/azdo/pullRequestOverview.ts:499-506`, map at `:502`)
- Included in the `pr.initialize` payload (`src/azdo/pullRequestOverview.ts:192`, `:255`) so it refreshes with the panel
- Sidebar renders a "Work Items" section with an add (+) button gated on `hasWritePermission` (`webviews/components/sidebar.tsx:36-54`); each item shows **type text + "id: title"** hyperlinked to `_links.html.href`, with a hover-revealed delete icon (`webviews/components/sidebar.tsx:59-93`). **No `System.State`, no assignee, no work-item-type color/icon** - despite `WorkItemExpand.All` already fetching everything.

**Add flow:** `pr.associate-workItem` message -> QuickPick of recent work items; typing an **exact integer ID** live-fetches and appends that item (`src/azdo/pullRequestOverview.ts:508-558`, `WorkItemPick` at `:996-1010`). No title/text search. Webview appends the result locally (`webviews/common/context.tsx:160-166`).

**Remove flow:** `pr.remove-workItem` -> disassociate, verifies the relation is gone before replying success (`src/azdo/pullRequestOverview.ts:560-582`); webview filters the list (`webviews/common/context.tsx:168-174`).

**Completion:** merge UI has a "completeWorkitem" checkbox (default checked) (`webviews/components/merge.tsx:255-269`) -> `complete` (`webviews/common/context.tsx:149-153`) -> `completePullRequest` sets `completionOptions.transitionWorkItems` (`src/azdo/pullRequestModel.ts:247-266`, `:260`).

**What does NOT exist:**

- **No policy awareness anywhere.** Zero `PolicyApi` usage in `src/` (grep across `src/**/*.ts` returns nothing); "checks" are only the PR statuses API via `getStatusChecks` -> `getPullRequestStatuses` (`src/azdo/pullRequestModel.ts:712-755`). A failing work-item-linking (or any) branch policy is invisible, and Complete is offered regardless.
- **Create-PR flow cannot attach work items** - and is in fact stubbed dead: `FolderRepositoryManager.createPullRequest` returns `undefined` with a `// TODO later` body (`src/azdo/folderRepositoryManager.ts:961-963`); the quick-input flow builds GitHub-shaped `createParams` with no work item field (`src/view/reviewManager.ts:1007-1018`). The working `AzdoRepository.createPullRequest` (`src/azdo/azdoRepository.ts:159-170`) takes a full `GitPullRequest` (which supports `workItemRefs`) but is unreachable from this path.
- **No #-mention / AB#-style affordance**: descriptions and comments render through `ReactMarkdown` whose only custom renderer is `code` (`webviews/components/comment.tsx:253-265`, `:278`); `#123` is plain text - no linkification, no completion, no hover. (Server-side, ADO only auto-links `#id` typed in its own web UI.)
- **No presence outside the overview webview**: no work-item tree nodes, no commands, no `package.json` contributions (grep for "workitem" in `package.json` returns nothing).

</details>

<details><summary><b>node-api 10.2.2 limitations for this area</b></summary>

azure-devops-node-api 10.2.2 covers this area almost completely: `getPullRequestWorkItemRefs`, `updateWorkItem` (JSON-patch relations), `getWorkItems` batch, `queryByWiql`, `getRecentActivityData`, `getPolicyEvaluations`/`getPolicyConfigurations`, and `GitPullRequest.workItemRefs` on create are all present (line refs in ado_model).

Two things need raw REST:

1. **Full-text work item search** (the good "type words, find your bug" picker experience). Not in 10.2.2 (no Search client at all). REST: `POST https://almsearch.dev.azure.com/{organization}/{project}/_apis/search/workitemsearchresults?api-version=7.1` with body `{"searchText": "...", "$top": 25, "filters": {...}}` - verified via Microsoft Learn (Search > Fetch Work Item Search Results, azure-devops-rest-7.1). Requires the search extension/service enabled on the org. Fallback that stays inside 10.2.2: `queryByWiql` with `WHERE [System.Title] CONTAINS WORDS '...'` (`WorkItemTrackingApi.d.ts:561`) - good enough for v1 of the picker.
2. **Policy evaluations api-version note**: `PolicyApi.getPolicyEvaluations` exists in 10.2.2 (`PolicyApi.d.ts:82`) but the underlying REST resource is still preview server-side (`GET https://dev.azure.com/{org}/{project}/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/{projectId}/{prId}&api-version=7.1-preview.1`); the 10.2.2 client handles versioning itself, so no raw REST needed - just be aware evaluations use the CodeReview artifact URI, not the Git PullRequestId one used for linking.

</details>

#### WI-01 [medium] [XS] Work item cards omit State (and assignee/type color) despite fetching WorkItemExpand.All

- Current: Sidebar card shows only type text + 'id: title' hyperlink (webviews/components/sidebar.tsx:83-93); data layer already fetches every field via WorkItemExpand.All (src/azdo/workItem.ts:34) so System.State/System.AssignedTo are in the payload sent at src/azdo/pullRequestOverview.ts:255 but never rendered.
- Desired: Card shows work-item-type badge (colored like ADO web), System.State with state color, and assignee - the reviewer instantly sees whether the linked Bug is Active or already Done, which is the whole point of glancing at linked items during review.
- Key files: `webviews/components/sidebar.tsx`
- API: Already-fetched WorkItem.fields (System.State, System.AssignedTo, System.WorkItemType); optionally WorkItemTrackingApi.getWorkItemTypes for type color/icon
- Notes: Pure webview change; the type color/icon lookup (getWorkItemTypes) is the only optional extra fetch.

#### WI-02 [high] [S] Add-work-item picker has no text search - recent activity + exact ID only

- Current: QuickPick populated from account-wide getRecentActivityData (src/azdo/workItem.ts:42-52); typing only helps if it parses as an integer ID, which triggers a single getWorkItemById lookup (src/azdo/pullRequestOverview.ts:516-530). Searching by title/words is impossible; recent list is cross-project noise for multi-project users.
- Desired: Typing non-numeric text searches work items by title (debounced), scoped to the PR's project by default, showing id/type/state in results - matching the ADO web PR page's work item picker. Numeric input keeps the direct-ID behavior.
- Key files: `src/azdo/workItem.ts`, `src/azdo/pullRequestOverview.ts`
- API: WorkItemTrackingApi.queryByWiql (WorkItemTrackingApi.d.ts:561) with [System.Title] CONTAINS WORDS; optional: POST https://almsearch.dev.azure.com/{org}/{project}/_apis/search/workitemsearchresults?api-version=7.1
- Notes: WIQL CONTAINS WORDS is the zero-new-dependency v1; almsearch gives true fuzzy search but needs a raw REST call and the search service enabled.

#### WI-03 [high] [M] Work-item-linking branch policy (and all policy evaluations) invisible; Complete offered when policy would block _(overlaps POL-01 (work-item-linking deliverable))_

- Current: No PolicyApi usage anywhere in src/ (grep returns zero hits); 'checks' come solely from the PR statuses API via getStatusChecks (src/azdo/pullRequestModel.ts:712-755). A repo with the 'Work item linking' required policy shows a green-looking PR with zero linked items, and the Complete button (webviews/components/merge.tsx) is presented normally; completion then fails server-side with an opaque error.
- Desired: Overview shows policy evaluations (work-item-linking, min reviewers, comment resolution, build) alongside statuses; when the linking policy is unsatisfied, the Work Items section shows an inline warning ('This repo requires linked work items') and the Complete button is annotated/soft-blocked with the reason.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`, `webviews/components/sidebar.tsx`, `webviews/common/cache.ts`, `src/azdo/credentials.ts`
- API: PolicyApi.getPolicyEvaluations(project, 'vstfs:///CodeReview/CodeReviewId/{projectId}/{prId}') (PolicyApi.d.ts:82); PolicyApi.getPolicyConfigurations (PolicyApi.d.ts:50); PolicyEvaluationRecord (PolicyInterfaces.d.ts:59); work-item-linking policy type 40e92b44-2fe1-4dd6-b3d8-74a9c21d0c6e
- Notes: This gap is bigger than work items (it is the ADO analog of GitHub checks) - scoped here, the work-item-linking warning is the deliverable; the evaluations plumbing benefits every policy. Needs getPolicyApi() exposure from the connection (currently only Git/Core/WIT APIs are obtained).

#### WI-04 [high] [M] Cannot attach work items when creating a PR (create flow itself is stubbed dead)

- Current: FolderRepositoryManager.createPullRequest returns undefined with a '// TODO later' commented-out body (src/azdo/folderRepositoryManager.ts:961-963); reviewManager builds GitHub-shaped params with no work item field (src/view/reviewManager.ts:1007-1018). The working AzdoRepository.createPullRequest (src/azdo/azdoRepository.ts:159-170) accepts a full GitPullRequest but is unreachable from the command flow.
- Desired: Create-PR flow (once revived) offers a 'Link work items' step - pre-populated from AB#/'#id' tokens in branch name and commit messages plus the same search picker - and passes them as GitPullRequest.workItemRefs so ADO creates the links atomically and the linking policy passes from birth.
- Key files: `src/azdo/folderRepositoryManager.ts`, `src/view/reviewManager.ts`, `src/azdo/azdoRepository.ts`, `src/azdo/workItem.ts`
- API: GitPullRequest.workItemRefs (GitInterfaces.d.ts:1590); GitApi.createPullRequest; VSSInterfaces.ResourceRef (VSSInterfaces.d.ts:221)
- Notes: M sizing assumes the create-PR flow revival is tracked as its own (larger) gap in the create-PR area; the work-item attach increment on top of a working create flow is S. Daily ADO shops with the linking policy literally cannot use extension-created PRs without this.

#### WI-05 [low] [XS] Remove fails with invalid patch when work item is linked via commit/branch (no ArtifactLink relation)

- Current: disassociateWorkItemWithPR does findIndex for the PR ArtifactLink relation with no -1 guard, then patches /relations/{idx} (src/azdo/workItem.ts:100-112). getPullRequestWorkItemRefs also returns items associated through source-branch commits, which carry no PR ArtifactLink on the work item - for those idx is -1, producing patch path '/relations/-1' and a server error surfaced as 'Unable to removing PR link' (src/azdo/pullRequestOverview.ts:578-581).
- Desired: Guard idx === -1 and explain: 'This work item is linked via a commit/branch, not directly to the PR - remove the commit link from the work item to detach it', instead of a raw API error. Optionally render such items with a distinct 'via commit' badge and no delete icon.
- Key files: `src/azdo/workItem.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/sidebar.tsx`
- API: WorkItemTrackingApi.updateWorkItem (WorkItemTrackingApi.d.ts:716); WorkItem.relations
- Notes: Also worth normalizing the relation-URL comparison (already case-insensitive at workItem.ts:102) against URL-encoding differences in the vstfs URI.

#### WI-06 [low] [XS] N+1 work item hydration on every overview load

- Current: getWorkItemsWithPr maps each ref to an individual getWorkItemById call with WorkItemExpand.All (src/azdo/pullRequestOverview.ts:502; src/azdo/workItem.ts:34) - a PR with 10 linked items costs 11 sequential-ish requests fetching full relations/history-scale payloads.
- Desired: Single batch call fetching only the fields the sidebar needs (System.Title, System.State, System.WorkItemType, System.AssignedTo) plus \_links.html.
- Key files: `src/azdo/workItem.ts`, `src/azdo/pullRequestOverview.ts`
- API: WorkItemTrackingApi.getWorkItems(ids, fields) (WorkItemTrackingApi.d.ts:704); getWorkItemsBatch (WorkItemTrackingApi.d.ts:723)
- Notes: Note getWorkItems with fields cannot combine with expand - request \_links via getWorkItemsBatch $expand Links or keep fields-only and build the html link from org/project/id.

#### WI-07 [medium] [M] AB#/#-mention work item references in descriptions and comments are inert plain text

- Current: Description and comment bodies render via ReactMarkdown whose only custom renderer overrides code blocks (webviews/components/comment.tsx:253-265, 278); '#123' or 'AB#123' in a PR description is not linkified, has no hover, and typing gets no completion. No mention/linkification logic exists anywhere in webviews/ or src/ (grep 'AB#' hits nothing in src).
- Desired: Renderer linkifies #id / AB#id tokens to the work item URL with a hover tooltip (type/state/title); comment/description editors offer '#' completion backed by the same recent+search picker. Matches the muscle memory of the ADO web UI where #id auto-links.
- Key files: `webviews/components/comment.tsx`, `webviews/common/context.tsx`, `src/azdo/pullRequestOverview.ts`, `src/azdo/workItem.ts`
- API: WorkItemTrackingApi.getWorkItem (WorkItemTrackingApi.d.ts:703) for hover hydration
- Notes: Linkify-only (no completion, no hover) is an S. Note ADO server does NOT create links from #id in REST-submitted text - only its own web editor does - so this is display sugar plus an optional 'also link mentioned items?' prompt on save.

#### WI-08 [low] [S] Work items invisible outside the overview webview (no tree node, no command, no PR list hint)

- Current: AzdoWorkItem's only consumer is PullRequestOverviewPanel (src/commands.ts:465,496; src/extension.ts:100-129); src/view/ has zero work item references and package.json contributes no work-item command (grep for 'workitem' in package.json: no hits). A reviewer in the Changes tree cannot see or open linked work items without opening the full description panel.
- Desired: A 'Work Items' node under each PR in the tree (children open the work item in browser), and a command 'AzDO PR: Link Work Item' usable from the active-PR context - keeps the linking-policy workflow available without the webview.
- Key files: `src/view/treeNodes/`, `src/commands.ts`, `package.json`, `src/azdo/workItem.ts`, `src/azdo/pullRequestModel.ts`
- API: GitApi.getPullRequestWorkItemRefs (GitApi.d.ts:1114); WorkItemTrackingApi.getWorkItems (WorkItemTrackingApi.d.ts:704)
- Notes: Low impact because the overview panel already covers the core need; this is workflow polish for tree-centric reviewers.

### 2.7 Draft PRs, labels (tags), attachments and image paste (DLA-\*)

<details><summary><b>How ADO models it</b> (API reference, click to expand)</summary>

**Draft PRs**

- `GitPullRequest.isDraft?: boolean` - `interfaces/GitInterfaces.d.ts:1510`.
- Publish/unpublish = `GitApi.updatePullRequest(gitPullRequestToUpdate, repositoryId, pullRequestId, project?)` - `GitApi.d.ts:91` (impl decl `:963`) with body `{ isDraft: false }` (publish) or `{ isDraft: true }` (convert to draft). REST: `PATCH https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}?api-version=7.1`.
- Create as draft = `GitApi.createPullRequest(gitPullRequestToCreate, repositoryId, project?, supportsIterations?)` - `GitApi.d.ts:88` - with `isDraft: true` on the payload.

**PR labels (tags)**

- `GitPullRequest.labels?: TfsCoreInterfaces.WebApiTagDefinition[]` - `GitInterfaces.d.ts:1512-1514`. `WebApiTagDefinition` = `{ active?, id?, name?, url? }` - `interfaces/CoreInterfaces.d.ts:467-479`. **No color field** - ADO tags are colorless, unlike GitHub labels (fork's `ILabel {name, color}` at `src/azdo/interface.ts:105-108` is GitHub-shaped).
- Full CRUD in node-api 10.2.2: `createPullRequestLabel` (`GitApi.d.ts:72`), `deletePullRequestLabels` (`:73`), `getPullRequestLabel` (`:74`), `getPullRequestLabels` (`:75`). REST equivalent: `{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/labels?api-version=7.1-preview.1` (still a **preview** API per learn.microsoft.com GitHttpClientBase.CreatePullRequestLabelAsync - "[Preview API]").
- **No server-side label filter**: `GitPullRequestSearchCriteria` (`GitInterfaces.d.ts:1844-1877`) supports only creatorId/includeLinks/repositoryId/reviewerId/sourceRefName/sourceRepositoryId/status/targetRefName. List responses from `getPullRequests` (`GitApi.d.ts:90`) omit labels; `getPullRequestById` (`GitApi.d.ts:86`) returns them on the full contract. Batch label enrichment exists only in the newer PullRequestQuery REST API (`Include=Labels`, sprint 254 service update) - not in 10.2.2.

**Attachments**

- Full surface in node-api 10.2.2: `createAttachment(customHeaders, contentStream: NodeJS.ReadableStream, fileName, repositoryId, pullRequestId, project?)` -> `GitInterfaces.Attachment` (`GitApi.d.ts:50`, docs decl `:572`); `deleteAttachment` (`:51`); `getAttachmentContent` (`:52`) -> ReadableStream; `getAttachments` (`:53`); `getAttachmentZip` (`:54`). `Attachment` interface (`GitInterfaces.d.ts:40+`): `_links, author, contentHash, createdDate, description, displayName, id, ...url`. REST: `POST {org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/attachments/{fileName}?api-version=7.1-preview.1` with binary body (also "[Preview API]" per Learn). The returned attachment `url` is what the ADO web UI embeds as `![image](...)` markdown in descriptions/comments - fetching it requires authentication, which is exactly why images are broken in the fork's webview today.
- Note: attachments are scoped to an existing PR id, so paste-upload works for comments/description edits on an open PR but cannot be used before the PR exists.

</details>

<details><summary><b>Current fork state</b> (verified refs, click to expand)</summary>

**Draft PRs - data + display exist; every mutation path is broken or missing**

- Fetched & modeled: `PullRequestModel.isDraft` declared `src/azdo/pullRequestModel.ts:81`, populated from the ADO item at `src/azdo/pullRequestModel.ts:162`.
- Tree display: `[DRAFT]` text prefix in the PR node label - `src/view/treeNodes/pullRequestNode.ts:317,326`.
- Overview webview display: `isDraft` sent in `pr.initialize` payload (`src/azdo/pullRequestOverview.ts:250`; sidebar: `src/azdo/activityBarViewProvider.ts:138`); header renders "Draft" status (`webviews/components/header.tsx:43,181-185`); draft state suppresses the merge UI and shows a **Ready for review** button (`webviews/components/merge.tsx:128-151,174-183`).
- **BROKEN - publish does nothing**: the button posts `azdopr.readyForReview` (`webviews/common/context.tsx:56`), but neither the overview handler (case list `src/azdo/pullRequestOverview.ts:289-339`) nor the sidebar handler (`src/azdo/activityBarViewProvider.ts:59-72`) has a case for it - `grep -rn readyForReview src/` returns zero hits. The palette command `azdopr.readyForReview` is contributed (`package.json:234`, menu `:468`) but never registered in `src/commands.ts` (35 registrations, none matches), so invoking it errors "command not found".
- No model method sets `isDraft`: `PullRequestModel.updatePullRequest(title?, description?)` only patches those two fields (`src/azdo/pullRequestModel.ts:238-245`); `abandon`/`completePullRequest` are the only other `updatePullRequest` callers (`:219,:253`).
- No convert-to-draft anywhere (no command, no UI).
- PR creation (draft or otherwise) is dead: `FolderRepositoryManager.createPullRequest` is a stub - `// TODO later; return undefined;` with the GitHub octokit body commented out (`src/azdo/folderRepositoryManager.ts:961-963`); `ReviewManager.createPullRequest(draft = false)` (`src/view/reviewManager.ts:898`) builds GitHub-shaped params (`{head, base, owner, repo, draft}` `:1006-1016`) and feeds them into that stub (`:1018`); no create-PR command is contributed in `package.json` (only `azdopr.createComment` matches "create").

**Labels - a GitHub-shaped field flows to the webview state and is never rendered, fetched, or actionable**

- Type: `ILabel { name, color }` (`src/azdo/interface.ts:105-108`) - GitHub-shaped (ADO tags have no color); the PR item type `PullRequest extends GitPullRequest` (`interface.ts:141`) so `item.labels` is the raw ADO field.
- Fetch: tree lists come from `GitApi.getPullRequests` (`src/azdo/azdoRepository.ts:172-178`), whose responses omit labels; single fetch uses `getPullRequestById` (`azdoRepository.ts:241-246`). `convertAzdoPullRequestToRawPullRequest` (`src/azdo/utils.ts:29-43`) spreads the raw PR so labels pass through when present. The fork never calls `getPullRequestLabels`/`createPullRequestLabel`/`deletePullRequestLabels`.
- Display: `labels: pullRequest.item.labels` is posted to the webview (`src/azdo/pullRequestOverview.ts:230`; `src/azdo/activityBarViewProvider.ts:124`) and declared in webview state (`webviews/common/cache.ts:40`), but **no webview component reads `pr.labels`** - grep across `webviews/` finds no consumer. Tree item shows no labels either (`src/view/treeNodes/pullRequestNode.ts:314-342`).
- Filter/query: tree categories are hardcoded to Local / Created By Me / Assigned To Me / All Active (`src/view/treeNodes/workspaceFolderNode.ts:45-48`); `PRType.Query` exists only as dead code in `src/view/treeNodes/categoryNode.ts:128`. The GitHub `getLabels` plumbing is commented out (`src/azdo/folderRepositoryManager.ts:629-641`).

**Attachments / image paste - not fetched, not uploadable, and inbound images are broken**

- Zero attachment code: grep for `attachment|onPaste|paste` across `src/` and `webviews/` matches only `src/@types/vscode.d.ts` typings noise.
- Markdown bodies (description + comments) render via `ReactMarkdown` with a custom `code` renderer only (`webviews/components/comment.tsx:8,250-278`); images fall through to the default `<img src>` pointing at ADO attachment URLs. The webview CSP already allows `img-src vscode-resource: https: data:` (`src/azdo/pullRequestOverview.ts:962`; `src/azdo/activityBarViewProvider.ts:361`), so the failure is authentication on the ADO URL - matching `docs/fork/ISSUE-TRIAGE.md:27` (#71 "Description images don't load - extend avatarCache authenticated-fetch mechanism to attachment URLs").
- The designated reusable pattern exists: `src/azdo/avatarCache.ts` - `initAvatarCache(conn)` `:15`, `fetchAvatarAsDataUri(url)` `:32`, `resolveAvatarsDeep(value)` `:89` (authenticated fetch -> data URI).
- Comment textareas (`webviews/components/comment.tsx` ReplyToThread `:294+`) have no paste/drop handling; there is no editor-side DocumentPaste provider. Upstream GitHub extension added image paste/upload in 0.144 (per UPSTREAM-SCOPING inventory).

</details>

<details><summary><b>node-api 10.2.2 limitations for this area</b></summary>

azure-devops-node-api 10.2.2 covers this entire area - draft toggle (`updatePullRequest`, GitApi.d.ts:91), labels CRUD (GitApi.d.ts:72-75), and PR attachments (GitApi.d.ts:50-54) are all typed methods; no raw REST strictly required. Two caveats: (1) Labels and attachments are still **preview** REST APIs server-side (routes `.../pullRequests/{prId}/labels` and `.../pullRequests/{prId}/attachments/{fileName}`, `api-version=7.1-preview.1`) - the 10.2.2 client pins its own preview versions internally, fine for dev.azure.com cloud. (2) Batch label enrichment for PR **lists** does not exist in 10.2.2: `GitPullRequestSearchCriteria` (GitInterfaces.d.ts:1844-1877) has no label field and list responses omit `labels`; the only batch option is the newer PullRequestQuery REST API with `Include=Labels` (`POST {org}/{project}/_apis/git/repositories/{repo}/pullRequestQuery?api-version=7.2-preview.1`, sprint 254 service update) via raw REST - otherwise it's one `getPullRequestLabels` call per PR. Also note `createAttachment`'s first parameter is `customHeaders: any` (pass `{}`), and it takes a `NodeJS.ReadableStream` - webview pastes arrive as base64/ArrayBuffer and must be converted to a stream in the extension host.

</details>

#### DLA-01 [high] [S] Ready-for-review (publish draft) is wired in UI but dead end-to-end

- Current: Webview button posts 'azdopr.readyForReview' (webviews/common/context.tsx:56) with no matching case in pullRequestOverview.ts:289-339 or activityBarViewProvider.ts:59-72, so clicking silently does nothing (and the awaited reply never resolves). package.json:234 contributes the command but commands.ts never registers it, so palette invocation errors 'command not found'. No PullRequestModel method can set isDraft (updatePullRequest only patches title/description, src/azdo/pullRequestModel.ts:238-245).
- Desired: Click 'Ready for review' (webview, sidebar, palette, or tree context menu) -> PATCH {isDraft:false} -> draft badge clears everywhere and merge UI appears without reopening the panel.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `src/azdo/activityBarViewProvider.ts`, `src/commands.ts`, `package.json`
- API: GitApi.updatePullRequest (GitApi.d.ts:91) with {isDraft:false}; GitInterfaces.GitPullRequest.isDraft (GitInterfaces.d.ts:1510)
- Notes: Bug fix, not a feature - the UI promises this today. Add PullRequestModel.setReadyForReview(), handle the message in both webview hosts, register the command. Update webview state via the existing updatePR({isDraft:false}) path (merge.tsx:136 already does this optimistically).

#### DLA-02 [medium] [XS] No convert-to-draft

- Current: No command, menu item, or webview affordance sets isDraft=true; grep for isDraft mutations finds only the never-handled readyForReview path (webviews/common/context.tsx:56).
- Desired: 'Convert to draft' on the overview 'More actions' area and PR tree context menu, mirroring ADO web ('Mark as draft'). Upstream GitHub extension shipped this in 0.126.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `src/commands.ts`, `webviews/components/header.tsx`, `package.json`
- API: GitApi.updatePullRequest (GitApi.d.ts:91) with {isDraft:true}
- Notes: Trivial once gap 1 lands (same model method, inverted flag). ADO resets reviewer votes when a PR is marked as draft - surface a confirmation prompt.

#### DLA-03 [high] [L] PR creation is a dead stub, so create-as-draft is impossible

- Current: FolderRepositoryManager.createPullRequest returns undefined with the GitHub octokit body commented out (src/azdo/folderRepositoryManager.ts:961-963); ReviewManager.createPullRequest(draft=false) builds GitHub-shaped params and feeds the stub (src/view/reviewManager.ts:898,1006-1018); no create-PR command is contributed in package.json.
- Desired: Create a PR from the current branch with title/description/target-branch prompts and a 'Create as draft' option - the single biggest workflow hole for a daily ADO reviewer (must round-trip to the browser to open every PR).
- Key files: `src/azdo/folderRepositoryManager.ts`, `src/view/reviewManager.ts`, `src/azdo/azdoRepository.ts`, `src/commands.ts`, `package.json`
- API: GitApi.createPullRequest (GitApi.d.ts:88) with GitPullRequest {sourceRefName, targetRefName, title, description, isDraft}
- Notes: Larger than this gap area (owned by the create-PR-view scoping line, 0.23->0.134 upstream), but listed because draft lifecycle is incomplete without it. Minimum viable: quick-input flow already half-built in reviewManager.ts - replace GitHub param shape with GitInterfaces.GitPullRequest and implement the manager method; add isDraft quick-pick. The existing reviewManager prompts (title/description sources) survive as-is.

#### DLA-04 [medium] [S] PR labels (tags) fetched into webview state but rendered nowhere

- Current: pullRequestOverview.ts:230 and activityBarViewProvider.ts:124 post labels into webview state (declared webviews/common/cache.ts:40) but no component in webviews/ reads pr.labels; tree items show no labels (src/view/treeNodes/pullRequestNode.ts:314-342). List-fetched PRs (azdoRepository.ts:172-178 via getPullRequests) don't even carry labels since ADO list responses omit them.
- Desired: Label chips on the overview header (like ADO web) and label text in the tree item description/tooltip so a reviewer can spot 'hotfix'/'WIP'/'release-x' tags without opening the browser.
- Key files: `webviews/components/header.tsx`, `webviews/common/cache.ts`, `src/azdo/pullRequestOverview.ts`, `src/view/treeNodes/pullRequestNode.ts`, `src/azdo/interface.ts`
- API: GitPullRequest.labels (GitInterfaces.d.ts:1514); GitApi.getPullRequestById (GitApi.d.ts:86) - returns labels; GitApi.getPullRequestLabels (GitApi.d.ts:75) - per-PR fallback
- Notes: Overview is nearly free: getPullRequestById already returns labels and the payload already carries them - this is pure webview rendering. Tree display needs per-PR getPullRequestLabels (N+1; fetch lazily/cached, or skip tree in v1). Fix ILabel (interface.ts:105-108) - ADO WebApiTagDefinition has no color (CoreInterfaces.d.ts:467-479), so render neutral chips.

#### DLA-05 [low] [M] No label management (add/remove) or label filtering

- Current: Fork never calls createPullRequestLabel/deletePullRequestLabels (no hits in src/); the GitHub getLabels plumbing is commented out (src/azdo/folderRepositoryManager.ts:629-641); tree categories are hardcoded (workspaceFolderNode.ts:45-48) and PRType.Query is dead code (categoryNode.ts:128), so there is no query/filter surface to hang a label filter on.
- Desired: Add/remove tags from the overview (quick-pick of existing tags + free text), and a client-side label filter on tree categories (e.g. hide 'WIP'-tagged, or a configurable query). Teams using tags for release trains/hotfix triage currently get nothing.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/header.tsx`, `src/view/treeNodes/categoryNode.ts`, `src/commands.ts`, `package.json`
- API: GitApi.createPullRequestLabel (GitApi.d.ts:72); GitApi.deletePullRequestLabels (GitApi.d.ts:73); GitApi.getPullRequestLabels (GitApi.d.ts:75); REST POST/DELETE {org}/{project}/\_apis/git/repositories/{repo}/pullRequests/{id}/labels api-version=7.1-preview.1; batch enrichment: POST .../pullRequestQuery?api-version=7.2-preview.1 with Include=Labels (raw REST, not in 10.2.2)
- Notes: GitPullRequestSearchCriteria has no label field (GitInterfaces.d.ts:1844-1877) - filtering is necessarily client-side, which requires label enrichment of list results first (see N+1 note in the display gap). Lower priority than display; ship display first.

#### DLA-06 [high] [M] Images in PR descriptions/comments don't render (ISSUE-TRIAGE #71)

- Current: ReactMarkdown renders bodies with only a custom code renderer (webviews/components/comment.tsx:250-278); images fall through to default <img src> against ADO attachment URLs that require auth, so they 401. CSP already permits https:/data: img-src (pullRequestOverview.ts:962, activityBarViewProvider.ts:361). The authenticated-fetch pattern exists in src/azdo/avatarCache.ts (fetchAvatarAsDataUri :32, resolveAvatarsDeep :89) but is avatar-only.
- Desired: Any ![image] in a description or comment renders inline in the overview/sidebar webviews, exactly as in ADO web. Screenshots are the dominant repro medium in PR review; today reviewers must open the browser for every image.
- Key files: `webviews/components/comment.tsx`, `webviews/common/context.tsx`, `src/azdo/pullRequestOverview.ts`, `src/azdo/activityBarViewProvider.ts`, `src/azdo/avatarCache.ts`
- API: authenticated GET of attachment URL with the existing WebApi connection credentials (avatarCache pattern); GitApi.getAttachmentContent (GitApi.d.ts:52) for \_apis attachment URLs
- Notes: Two viable designs: (a) extension-host pre-pass - resolveAvatarsDeep-style walk that rewrites attachment image URLs in body markdown to data: URIs before posting to the webview (simplest, matches ISSUE-TRIAGE note, CSP already allows data:); (b) custom ReactMarkdown image renderer that requests each URL over postMessage. (a) recommended; cache by URL like avatarCache to avoid re-fetch on every pr.initialize.

#### DLA-07 [medium] [M] No image paste/drop upload to PR attachments

- Current: No paste/drop or attachment-upload code exists anywhere: grep attachment|onPaste|paste across src/ and webviews/ matches only src/@types/vscode.d.ts typings. Comment textareas (webviews/components/comment.tsx ReplyToThread) and description editing (pullRequestOverview.ts:879,890 -> updatePullRequest) are text-only.
- Desired: Paste or drop an image into a comment box or description editor -> upload to the PR's attachments -> markdown ![image](url) inserted at cursor and rendered (via the gap-6 pipeline). Upstream GitHub extension shipped this in 0.144; ADO web has paper-clip/drag-drop parity.
- Key files: `webviews/components/comment.tsx`, `webviews/common/context.tsx`, `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `src/azdo/activityBarViewProvider.ts`
- API: GitApi.createAttachment(customHeaders, contentStream, fileName, repositoryId, pullRequestId, project) (GitApi.d.ts:50) -> Attachment.url; REST POST {org}/{project}/\_apis/git/repositories/{repo}/pullRequests/{id}/attachments/{fileName}?api-version=7.1-preview.1 (binary body)
- Notes: Webview side: textarea onPaste reads clipboard image as base64, posts to extension host; host converts to a Readable stream for createAttachment (customHeaders pass {}), returns attachment url, webview inserts markdown. Do gap 6 first or pasted images will upload but not render. Scope limit: attachments require an existing PR id, so this covers comments/description edits, not a future create-PR form. Editor-side comment widgets (commentHandlerResolver/commonCommentHandler) would need a DocumentPasteEditProvider - defer that half; webview-only is the 80% win.

### 2.8 Remaining ADO Git REST surface (sweep) (REST-\*)

<details><summary><b>How ADO models it</b> (API reference, click to expand)</summary>

**ADO model (from local typings, node_modules/azure-devops-node-api)**
**PR lifecycle & merge** - `updatePullRequest` (GitApi.d.ts:91) is the universal mutator: status (abandon/complete), title/description, `isDraft` (GitInterfaces.d.ts:1510), retarget via `targetRefName`, and **auto-complete** via `autoCompleteSetBy` (GitInterfaces.d.ts:1466) + `completionOptions` (GitInterfaces.d.ts:1486). `GitPullRequestCompletionOptions` (GitInterfaces.d.ts:1630-1663) carries `bypassPolicy`, `bypassReason`, `deleteSourceBranch`, `mergeCommitMessage`, `mergeStrategy`, `transitionWorkItems`. REST: PATCH `.../git/repositories/{repo}/pullrequests/{id}?api-version=7.1`. Merge-health fields on `GitPullRequest`: `mergeFailureMessage` (:1530), `mergeOptions` (:1542), `labels` (:1514).

**Iterations** - every push = iteration. `getPullRequestIterations` (GitApi.d.ts:66), `getPullRequestIterationChanges` (:64, has `compareTo` param = native changes-between-iterations diff), `getPullRequestIterationCommits` (:58), iteration-scoped statuses (:67-71). `getThreads(repo, pr, project, iteration, baseIteration)` (:105) returns threads positioned against an iteration pair.

**Checks** - two layers: (1) **PR statuses** `getPullRequestStatuses`/`createPullRequestStatus` (:93-97, `GitPullRequestStatus extends GitStatus`, GitInterfaces.d.ts:1881) = custom statuses posted by services; (2) **branch policy evaluations** via PolicyApi: `getPolicyEvaluations(project, artifactId)` (PolicyApi.d.ts:12/82) and `requeuePolicyEvaluation` (:11/72) with `artifactId = vstfs:///CodeReview/CodeReviewId/{projectId}/{pullRequestId}` - this is where build-validation, min-reviewers, comment-resolution, work-item-linking gating lives. `getPolicyConfigurations` (:8/50) lists the configured policies.

**Social/collab** - comment likes `createLike`/`deleteLike`/`getLikes` (GitApi.d.ts:55-57), `Comment.usersLiked` (GitInterfaces.d.ts:240); share-PR-by-email `sharePullRequest` (GitApi.d.ts:92, `ShareNotificationContext` GitInterfaces.d.ts:2903 = message + receivers); PR labels/tags `createPullRequestLabel`/`deletePullRequestLabels`/`getPullRequestLabels` (GitApi.d.ts:72-75); PR attachments `createAttachment`/`getAttachments`/`deleteAttachment` (:50-54, `Attachment` GitInterfaces.d.ts:40).

**Post-merge ops** - `createCherryPick` (GitApi.d.ts:23, `GitCherryPick` GitInterfaces.d.ts:729) and `createRevert` (:131, GitInterfaces.d.ts:2314) are async server-side ref operations that stage a branch you then raise a PR from; each has conflict sub-APIs (:18-21, :127-130). `createMergeRequest` (:48) performs a server-side test merge of arbitrary commits.

**Conflicts** - `getPullRequestConflicts` (:61), `updatePullRequestConflict(s)` (:62-63), typed `GitConflict` subclasses per conflict kind (GitInterfaces.d.ts:817-926) with resolution payloads - the web UI's conflict-resolution page is built on these.

**Discovery** - `getPullRequestQuery` (:78, `GitPullRequestQuery`/`GitPullRequestQueryInput` GitInterfaces.d.ts:1784-1808) = batch "which PRs touched these commits" (types: lastMergeCommit/commit); `getSuggestions` (:136, `GitSuggestion` GitInterfaces.d.ts:2403) = the "you pushed X recently - create a PR" banner data; `getPullRequestsByProject` (:87) = project-wide PR search without enumerating repos; `GitPullRequestSearchCriteria` (GitInterfaces.d.ts:1844-1877: creatorId, reviewerId, source/targetRefName, sourceRepositoryId, status, repositoryId).

**Refs** - `updateRefs`/`updateRef` (:115-116, `GitRefUpdate` GitInterfaces.d.ts:2052; delete a branch by setting newObjectId to 40 zeros), `getRefs` (:114 with `includeStatuses`/`includeMyBranches`). Commit statuses per commit: `getStatuses` (:135), `createCommitStatus` (:134), `getCommitsBatch(searchCriteria, ..., includeStatuses)` (:30).

</details>

<details><summary><b>Current fork state</b> (verified refs, click to expand)</summary>

**What the fork calls today (complete inventory, verified by grep + read)**
**GitApi methods used** (23 of ~130): `getRepositories` (src/azdo/azdoRepository.ts:100), `getPullRequests` (:178), `getPullRequestById` (:246), `getBranch` (:273), `getBranches` (:299), `createPullRequest` (:164 - but see below, effectively dead), `getRepository` (src/azdo/folderRepositoryManager.ts:889); in src/azdo/pullRequestModel.ts: `updatePullRequest` (:219 abandon, :244 title/desc edit, :253 complete), `getPullRequestWorkItemRefs` (:274), `createThread` (:325), `updateThread` (:367), `getPullRequestIterations` (:385), `getThreads` (:435), `createComment` (:454), `getComments` (:474), `createPullRequestReviewer` (:483 self-vote, :497 add reviewer), `deletePullRequestReviewer` (:511), `updateComment` (:525), `getPullRequestCommits` (:567), `getChanges` (:602), `getBlobContent` (:626), `getCommitDiffs` (:650, paginated), `getFileDiffs` (:686), `getPullRequestStatuses` (:718), `getMergeBases` (:859).

**Never called** (grep across src/ and webviews/ returned zero hits): `sharePullRequest`, `getPullRequestQuery`, `createCherryPick`/`getCherryPick*`, `createRevert`/`getRevert*`, `createPullRequestStatus`, `getPullRequestConflicts`/`updatePullRequestConflict(s)`, `createLike`/`getLikes`/`deleteLike`, `getSuggestions`, `getForkSyncRequests`, `createAnnotatedTag`/`getAnnotatedTag`, `getRefs`/`updateRef(s)` (server-side), `getCommitsBatch`, `createMergeRequest`, `getPullRequestIterationChanges`/`getPullRequestIterationCommits`, all label methods (`getPullRequestLabels` etc.), all attachment methods (`createAttachment` etc.), `getPullRequestsByProject`, `getStatuses`/`createCommitStatus`, `updatePullRequestReviewers`, `getPullRequestProperties`. **PolicyApi is never imported anywhere** (grep `PolicyApi|getPolicy` in src/: zero hits).

**Key current behaviors:**

- Checks = custom PR statuses only: `getStatusChecks()` (pullRequestModel.ts:712-755) reads `getPullRequestStatuses`, dedupes to latest iteration+id, rolls up a state; rendered in webviews/components/merge.tsx `StatusChecks`. Branch policies (build validation, min reviewers, comment resolution) are invisible.
- Iterations are fetched solely to compute the max iteration id so all threads can be listed between iteration 1..max (pullRequestModel.ts:379-398). No iteration diffing; file diffs are always base..head or mergebase..head (getFileChangesInfo, :760-846).
- Complete/merge: `completePullRequest` (pullRequestModel.ts:247-266) sends only `deleteSourceBranch`, `mergeStrategy`, `transitionWorkItems` (interface.ts:232-236 `PullRequestCompletion`); webview form (webviews/components/merge.tsx:244-288) exposes exactly two checkboxes. No auto-complete, no bypassPolicy, no custom merge commit message. `mergeFailureMessage` surfaces only in an error toast after a failed complete (pullRequestOverview.ts:907).
- A second merge path is a dead stub: `folderRepositoryManager.mergePullRequest` (folderRepositoryManager.ts:1048-1054) is `// TODO LATER` returning undefined, yet it is wired to the `azdopr.merge` command (src/commands.ts:372-392) and to the activity-bar simple view (src/azdo/activityBarViewProvider.ts:66-67, 323-334 -> webviews merge.tsx `MergeSimple`:190-199).
- Draft handling is display-only and the publish button is broken: `isDraft` shown in tree label (src/view/treeNodes/pullRequestNode.ts:326) and header (webviews/components/header.tsx:43,181-185); the "Ready for review" button (merge.tsx:129-152) posts `azdopr.readyForReview` (webviews/common/context.tsx:56) but `pullRequestOverview.ts` `_onDidReceiveMessage` (:288-344) has no matching case and falls through to MESSAGE_UNHANDLED (src/common/webview.ts:37,64); package.json declares the command (line 234) but commands.ts never registers it (grep: zero hits). Silent no-op. No convert-to-draft either.
- Labels: `pullRequest.item.labels` is forwarded to the webview (pullRequestOverview.ts:230) and typed in webviews/common/cache.ts:40, but no component renders it and nothing ever fetches labels (list/get PR responses don't include them; `getPullRequestLabels` unused) - so it is always undefined. No add/remove.
- Conflicts: when `mergeStatus === Conflicts` the webview shows only the static string 'This branch has conflicts that must be resolved.' (merge.tsx:107-126); merge/complete UI is hidden entirely unless mergeable === Succeeded (merge.tsx:181).
- Branch deletion after the fact: overview deleteBranch flow handles local branch + local remote config only; the remote/upstream branch deletion action is commented out (pullRequestOverview.ts:629-641). Server-side source-branch delete happens only via completionOptions at merge time.
- PR list categories query per-workspace-repo with `getPullRequests({creatorId|reviewerId, status: Active})` (folderRepositoryManager.ts:765-796); no project-wide view.
- Comment likes: `Comment.usersLiked` never mapped or rendered (grep usersLiked in src/ + webviews/: zero hits outside node_modules).
- Share: only "Copy PR link" (pullRequestOverview.ts:856-859).
- Create PR: `reviewManager.createPullRequest` (src/view/reviewManager.ts:898-1030) drives a full quickpick flow but calls `folderRepoManager.createPullRequest` (:1018) which is a TODO stub returning undefined (folderRepositoryManager.ts:961-963), so it always ends at "Failed to create pull request"; the working `azdoRepository.createPullRequest` (azdoRepository.ts:159-170) has no callers.
- `getWorkItemRefs` (pullRequestModel.ts:268-276) + work-item associate/remove via WorkItemTrackingApi are implemented (pullRequestOverview.ts:499-582) - work-item linking is NOT a gap.

</details>

<details><summary><b>node-api 10.2.2 limitations for this area</b></summary>

v10.2.2 covers nearly everything needed; verified absences / quirks:

1. **`GitPullRequestSearchCriteria` lacks the `labels` filter** (GitInterfaces.d.ts:1844-1877 ends at targetRefName; modern criteria has `labels: string[]` per learn.microsoft.com GitPullRequestSearchCriteria). Raw REST: `GET https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repoId}/pullrequests?searchCriteria.labels={name}&api-version=7.1`. Same for later-added `searchCriteria.notCreatedBy` and `queryTimeRange`.
2. **No label enrichment on list/get PR responses** - `GitPullRequest.labels` is only populated via the dedicated labels endpoint (`getPullRequestLabels`, present in 10.2.2 at GitApi.d.ts:75) or, on very new api-versions, the Pull Request Query API's `Include=Labels` property (sprint 254 / api-version 7.2-preview - not in any node-api release yet; raw REST `POST .../git/repositories/{repoId}/pullrequestquery?api-version=7.2-preview.1` with `"$top"`-style include).
3. **PR timeline/activity feed has no public REST API at all** (ADO web UI composes it from internal contribution data providers) - any activity view must be client-composed from threads + iterations + statuses + reviewers.
4. Known 10.2.2 serialization bug: `getCommitDiffs` `diffCommonCommit` boolean mis-serializes (azure-devops-node-api#429); fork already works around it with a string cast (pullRequestModel.ts:649-653). The same caution applies when adding new boolean query params via this client.
5. PolicyApi in 10.2.2 has `getPolicyEvaluations`/`requeuePolicyEvaluation` (PolicyApi.d.ts:11-12) but they are marked preview server-side - REST equivalent `GET https://dev.azure.com/{org}/{project}/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/{projectId}/{prId}&api-version=7.1-preview.1` (artifactId must be URL-encoded).

</details>

#### REST-01 [high] [XS] "Ready for review" button is a silent no-op; no draft publish/convert-to-draft _(duplicate of DLA-01)_

- Current: webviews/components/merge.tsx:129-152 renders the button; webviews/common/context.tsx:56 posts 'azdopr.readyForReview'; pullRequestOverview.ts:288-344 has no case for it (falls to MESSAGE_UNHANDLED, src/common/webview.ts:64); package.json:234 declares the command but commands.ts never registers it. No convert-to-draft anywhere.
- Desired: Button actually publishes the draft (updatePullRequest({isDraft:false})), plus a 'Convert to draft' action on open PRs; tree/webview state refreshes. This is a daily flow for teams that open drafts by default.
- Key files: `src/azdo/pullRequestOverview.ts`, `src/azdo/pullRequestModel.ts`, `src/commands.ts`, `webviews/components/merge.tsx`
- API: GitApi.updatePullRequest (GitApi.d.ts:91); GitPullRequest.isDraft (GitInterfaces.d.ts:1510)
- Notes: Straight bug fix + one new command. Highest value-per-line in the whole audit.

#### REST-02 [high] [M] No auto-complete (ADO's flagship merge affordance) _(duplicate of AC-02)_

- Current: Zero references to autoComplete in src/ or webviews/ (grep). completePullRequest (pullRequestModel.ts:247-266) only does immediate completion with 3 options; ConfirmMerge form (merge.tsx:244-288) has 2 checkboxes; merge UI hidden unless mergeable===Succeeded (merge.tsx:181).
- Desired: 'Set auto-complete' button (updatePullRequest with autoCompleteSetBy = current user id + completionOptions), visible even while policies are pending; show/cancel existing auto-complete (autoCompleteSetBy already on fetched GitPullRequest, never displayed); expose mergeCommitMessage and bypassPolicy/bypassReason for authorized users.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `src/azdo/interface.ts`, `webviews/components/merge.tsx`, `webviews/common/context.tsx`
- API: GitApi.updatePullRequest (GitApi.d.ts:91); GitPullRequest.autoCompleteSetBy (GitInterfaces.d.ts:1466); GitPullRequestCompletionOptions (GitInterfaces.d.ts:1630-1663)
- Notes: On ADO teams with build-validation policies, 'complete now' is almost never available at review time - auto-complete is how PRs actually merge.

#### REST-03 [high] [M] Branch policy evaluations invisible - checks section shows only custom PR statuses _(duplicate of POL-01/POL-04)_

- Current: getStatusChecks (pullRequestModel.ts:712-755) reads only getPullRequestStatuses; PolicyApi never imported (grep 'PolicyApi|getPolicy' in src/: zero hits). Build validation, min-reviewer, comment-resolution, required-reviewer and work-item policies - the things that actually gate completion - never shown; PR list nodes carry no policy/CI signal either (pullRequestNode.ts:323-334).
- Desired: Checks section lists policy evaluations (display name, status, build link) alongside PR statuses, with 'Re-queue' for failed build validation; overall mergeability reflects policy state so a reviewer knows why a PR can't complete.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/credentials.ts (expose PolicyApi on Azdo hub)`, `src/azdo/interface.ts`, `webviews/components/merge.tsx`
- API: PolicyApi.getPolicyEvaluations (PolicyApi.d.ts:12); PolicyApi.requeuePolicyEvaluation (PolicyApi.d.ts:11); PolicyApi.getPolicyConfigurations (PolicyApi.d.ts:8); artifactId = vstfs:///CodeReview/CodeReviewId/{projectId}/{prId}
- Notes: getConnection().getPolicyApi() already available on the WebApi object the fork holds (src/azdo/credentials.ts).

#### REST-04 [high] [L] Iteration diffs unused - no changes-since-last-review / per-push diff _(duplicate of ITER-03/04/05)_

- Current: Iterations fetched only to find max id for thread listing (pullRequestModel.ts:385-388). getPullRequestIterationChanges and getPullRequestIterationCommits never called (grep). All file diffs computed base..head or mergebase..head via getCommitDiffs/getFileDiffs (pullRequestModel.ts:760-846).
- Desired: Iteration picker ('Update 3 -> 5') in the changes tree and a 'changes since my last review' default, using the native compareTo parameter - ADO's first-class equivalent of upstream 0.48's feature, no client-side commit math needed. Threads already accept iteration/baseIteration (getThreads signature) so comments can follow.
- Key files: `src/azdo/pullRequestModel.ts`, `src/view/prChangesTreeDataProvider.ts`, `src/view/treeNodes/filesCategoryNode.ts`, `src/common/uri.ts`
- API: GitApi.getPullRequestIterationChanges (GitApi.d.ts:64); GitApi.getPullRequestIterationCommits (GitApi.d.ts:58); GitApi.getPullRequestIterations (GitApi.d.ts:66); GitApi.getThreads iteration/baseIteration params (GitApi.d.ts:105)
- Notes: Refines the UPSTREAM-SCOPING 'changes-since-last-review (0.48)' line: ADO needs none of upstream's review-marker plumbing - iterations are server-side.

#### REST-05 [high] [S] Merge command + simple view call a TODO stub that always fails _(duplicate of AC-03)_

- Current: folderRepositoryManager.mergePullRequest (folderRepositoryManager.ts:1048-1054) is '// TODO LATER' returning undefined; wired to azdopr.merge (commands.ts:372-392), overview 'azdopr.merge' message (pullRequestOverview.ts:737-758), and activity-bar simple view (activityBarViewProvider.ts:66-67,323-334 -> MergeSimple, merge.tsx:190-199). Working path is only 'pr.complete' -> completePullRequest.
- Desired: Delete the stub and route all three call sites through PullRequestModel.completePullRequest so the palette command and the simple activity-bar view can actually merge.
- Key files: `src/azdo/folderRepositoryManager.ts`, `src/commands.ts`, `src/azdo/activityBarViewProvider.ts`, `src/azdo/pullRequestOverview.ts`
- API: GitApi.updatePullRequest (GitApi.d.ts:91)
- Notes: Latent-broken UI, same family as readyForReview. Fix alongside auto-complete work.

#### REST-06 [medium] [M] Conflicts API unused - conflicted PRs are a dead end

- Current: getPullRequestConflicts never called (grep). merge.tsx:107-126 shows only the static text 'This branch has conflicts that must be resolved'; PrActions hides all actions when mergeable !== Succeeded (merge.tsx:181); mergeFailureMessage only surfaces as an error toast after a failed complete (pullRequestOverview.ts:907).
- Desired: When mergeStatus === Conflicts, list the conflicting files (conflict type per file) in the overview and changes tree, with a jump-to-file/checkout hint. Optional phase 2: resolve simple content conflicts in-editor via updatePullRequestConflict (the web UI's resolver uses exactly these).
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`, `src/view/treeNodes/pullRequestNode.ts`
- API: GitApi.getPullRequestConflicts (GitApi.d.ts:61); GitApi.updatePullRequestConflict(s) (GitApi.d.ts:62-63); GitConflict subtypes (GitInterfaces.d.ts:817-926)
- Notes: Listing is M; in-editor resolution is XL and probably not worth it (checkout + local merge is fine once files are listed). Refines the scoping doc's 'conflict resolution from description (0.80, 0.88)' line.

#### REST-07 [medium] [S] PR labels (tags) never fetched, never rendered, not editable _(duplicate of DLA-04/05)_

- Current: pullRequestOverview.ts:230 forwards pullRequest.item.labels to the webview but it is always undefined (list/get PR responses don't include labels; getPullRequestLabels unused - grep zero); no webview component renders labels (only the type at webviews/common/cache.ts:40); no add/remove commands.
- Desired: Fetch labels on overview open (getPullRequestLabels), render as chips in the header, add/remove via quickpick (create/deletePullRequestLabels), show in PR tree tooltip. Teams use tags for 'hotfix', 'needs-qa', release trains.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/header.tsx`, `webviews/common/cache.ts`
- API: GitApi.getPullRequestLabels (GitApi.d.ts:75); GitApi.createPullRequestLabel (GitApi.d.ts:72); GitApi.deletePullRequestLabels (GitApi.d.ts:73)
- Notes: Filtering the PR list by label needs raw REST (searchCriteria.labels missing from 10.2.2) - see node_api_limitations; defer that part.

#### REST-08 [medium] [S] Comment likes: usersLiked never displayed, no like/unlike action

- Current: Comment.usersLiked (GitInterfaces.d.ts:240) comes back on every thread fetch but is never mapped or rendered (grep usersLiked in src/+webviews/: zero); createLike/deleteLike/getLikes unused.
- Desired: Like count + liker names on each comment in webview and editor comment threads; toggle like from both surfaces. It's the only reaction ADO has and reviewers use it as lightweight ack.
- Key files: `webviews/components/comment.tsx`, `webviews/common/context.tsx`, `src/azdo/pullRequestOverview.ts`, `src/azdo/pullRequestModel.ts`, `src/azdo/prComment.ts`, `src/commands.ts (editor comment thread context action)`
- API: GitApi.createLike (GitApi.d.ts:55); GitApi.deleteLike (GitApi.d.ts:56); GitApi.getLikes (GitApi.d.ts:57)
- Notes: Data is already in every getThreads response - display half is nearly free.

#### REST-09 [medium] [M] PR attachments API unused - no image paste/upload in comments or description _(duplicate of DLA-06/07)_

- Current: createAttachment/getAttachments/deleteAttachment (GitApi.d.ts:50-54) never called; webview text areas are plain text (webviews/components/comment.tsx); pasted screenshots impossible.
- Desired: Paste/drop an image in the description or a comment -> createAttachment -> insert markdown ![](attachment URL); render existing attachment images using the authenticated-fetch pattern already built for avatars (src/azdo/avatarCache.ts).
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/comment.tsx`, `src/azdo/avatarCache.ts (reuse auth-media pattern)`
- API: GitApi.createAttachment (GitApi.d.ts:50); GitApi.getAttachmentContent (GitApi.d.ts:52); Attachment (GitInterfaces.d.ts:40)
- Notes: ADO-native counterpart of upstream 0.144 image paste - API is fully present in 10.2.2.

#### REST-10 [medium] [M] No cherry-pick / revert from a completed PR

- Current: createCherryPick (GitApi.d.ts:23) and createRevert (GitApi.d.ts:131) plus their status getters never called (grep). After completing a PR the fork offers nothing; users go to the web UI for hotfix backports and bad-merge reverts.
- Desired: 'Cherry-pick to branch…' and 'Revert' actions on completed PRs: pick target branch, poll the async operation (getCherryPick/getRevert), then offer to open a PR from the generated ref (createPullRequest already exists at azdoRepository.ts:159).
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `src/commands.ts`, `webviews/components/merge.tsx`
- API: GitApi.createCherryPick (GitApi.d.ts:23); GitApi.getCherryPick (GitApi.d.ts:24); GitApi.createRevert (GitApi.d.ts:131); GitApi.getRevert (GitApi.d.ts:132); GitAsyncRefOperationParameters
- Notes: Mirrors the ADO web 'Cherry-pick'/'Revert' buttons exactly; server does the work.

#### REST-11 [high] [M] PR creation is a dead stub (blocks suggestions banner too) _(overlaps DLA-03; adds getSuggestions)_

- Current: reviewManager.createPullRequest (src/view/reviewManager.ts:898-1030) runs the whole prompt flow then calls folderRepoManager.createPullRequest (:1018) which returns undefined ('// TODO later', folderRepositoryManager.ts:961-963) -> always 'Failed to create pull request'. Working azdoRepository.createPullRequest (azdoRepository.ts:159-170) has zero callers. getSuggestions (GitApi.d.ts:136) unused.
- Desired: Wire folderRepositoryManager.createPullRequest to azdoRepository.createPullRequest (map title/description/source/target refs, isDraft), then add the ADO-native 'you recently pushed <branch> - create a PR?' toast from getSuggestions on startup/push.
- Key files: `src/azdo/folderRepositoryManager.ts`, `src/azdo/azdoRepository.ts`, `src/view/reviewManager.ts`
- API: GitApi.createPullRequest (GitApi.d.ts:88); GitApi.getSuggestions (GitApi.d.ts:136); GitSuggestion (GitInterfaces.d.ts:2403)
- Notes: Coordinate with the upstream-portable 'create-PR view evolution' item from HALF 1 - this is the minimum ADO plumbing either version needs.

#### REST-12 [medium] [S] No 'find PRs for a commit' (getPullRequestQuery)

- Current: getPullRequestQuery (GitApi.d.ts:78) unused (grep). Given a commit hash (blame, git log, copyCommitHash command at src/commands.ts:191) there is no way to jump to the PR that introduced it.
- Desired: Command 'AzDO PR: Find pull request for commit' (input or current-line blame) -> batch query by commit/lastMergeCommit -> open overview. Daily archaeology tool for reviewers tracing regressions.
- Key files: `src/commands.ts`, `src/azdo/azdoRepository.ts`, `src/azdo/pullRequestOverview.ts`
- API: GitApi.getPullRequestQuery (GitApi.d.ts:78); GitPullRequestQuery/GitPullRequestQueryInput (GitInterfaces.d.ts:1784-1808)

#### REST-13 [low] [S] Share PR by email unused

- Current: sharePullRequest (GitApi.d.ts:92) never called; only 'Copy PR link' exists (pullRequestOverview.ts:856-859).
- Desired: 'Share…' action on the overview: pick identities via the existing userManager.searchIdentities quickpick (pullRequestOverview.ts:347-395 pattern) + optional note -> ADO sends the standard share email.
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `src/azdo/userManager.ts`
- API: GitApi.sharePullRequest (GitApi.d.ts:92); ShareNotificationContext (GitInterfaces.d.ts:2903)

#### REST-14 [medium] [S] Delete remote source branch after abandon/merge (updateRefs) missing

- Current: Overview deleteBranch flow deletes local branch and removes the git remote config only; the upstream-branch deletion action is commented out (pullRequestOverview.ts:629-641, 685-707). Server-side delete happens only via completionOptions.deleteSourceBranch at merge time; abandoned PRs leave branches forever.
- Desired: Restore the 'Delete remote branch' option using updateRefs (newObjectId = 40 zeros), offered after abandon and for already-completed PRs whose branch survived.
- Key files: `src/azdo/pullRequestOverview.ts`, `src/azdo/pullRequestModel.ts`, `src/azdo/azdoRepository.ts`
- API: GitApi.updateRefs (GitApi.d.ts:116); GitRefUpdate (GitInterfaces.d.ts:2052)

#### REST-15 [medium] [M] No project-wide PR list (getPullRequestsByProject)

- Current: Categories 'Assigned To Me'/'Created By Me'/'All Active' iterate only repos open in the workspace, one getPullRequests call each (folderRepositoryManager.ts:765-796, azdoRepository.ts:172-210).
- Desired: Optional 'All my PRs in project' tree section using one getPullRequestsByProject({reviewerId|creatorId}) call per project (project names already known from multi-project support), so a reviewer sees review requests in repos not currently checked out.
- Key files: `src/azdo/folderRepositoryManager.ts`, `src/view/treeNodes/categoryNode.ts`, `src/view/prsTreeDataProvider.ts`
- API: GitApi.getPullRequestsByProject (GitApi.d.ts:87); GitPullRequestSearchCriteria (GitInterfaces.d.ts:1844)
- Notes: Opening such a PR needs a no-local-checkout overview path; overview webview already works without checkout.

#### REST-16 [low] [S] Per-commit CI status not shown in Commits tree

- Current: CommitNode shows message/author only (src/view/treeNodes/commitNode.ts); getStatuses (GitApi.d.ts:135) and getCommitsBatch includeStatuses (GitApi.d.ts:30) unused.
- Desired: Status icon per commit in the PR Commits section (one getCommitsBatch call with includeStatuses for the PR's commits), matching upstream 0.124 'commit status per commit'.
- Key files: `src/view/treeNodes/commitNode.ts`, `src/view/treeNodes/commitsCategoryNode.ts`, `src/azdo/pullRequestModel.ts`
- API: GitApi.getCommitsBatch (GitApi.d.ts:30); GitApi.getStatuses (GitApi.d.ts:135)

#### REST-17 [low] [S] Reviewer management can't set required flag on existing reviewers or reset/re-request votes _(duplicate of VOTE-06/VOTE-10)_

- Current: addReviewer adds one identity with vote 0 (pullRequestModel.ts:491-503); removeReviewer deletes (:505-512); no edit of isRequired on an existing reviewer, no batch add, no 'reset vote / re-request review' on others; updatePullRequestReviewers (GitApi.d.ts:85) and createPullRequestReviewers (:80) unused.
- Desired: Context actions on a reviewer row: toggle required/optional (updatePullRequestReviewer), batch-add a team, and 'reset votes' (votes-reset equivalent of GitHub re-request review, upstream 0.60).
- Key files: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/reviewer.tsx`
- API: GitApi.updatePullRequestReviewer (GitApi.d.ts:84); GitApi.updatePullRequestReviewers (GitApi.d.ts:85); GitApi.createPullRequestReviewers (GitApi.d.ts:80)

### Critique addenda (areas both halves missed; added after the critic pass)

#### ADD-01 [L] ADO fork-repository support

- ADO supports org-internal repo forks, and the bundled client covers the whole surface: `getForks`/`createForkSyncRequest` (GitApi.d.ts:33-36), `GitPullRequest.forkSource` (GitInterfaces.d.ts:1506), `parentRepository` on create (GitInterfaces.d.ts:2188). The fork (this extension) has zero fork-awareness: a PR whose source lives in a fork will mis-resolve branch association and file content against the target repo only.
- Desired, staged: (1) render fork-PR provenance (`forkSource` repo name) and make diffs/comments work on fork PRs; (2) fork-aware branch association in `pullRequestGitHelper.ts`; (3) offer fork-and-push when the user lacks push permission (upstream 0.19 analog).
- Key files: `src/azdo/azdoRepository.ts`, `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestGitHelper.ts`, `src/azdo/remoteUrlParser.ts`.
- Reality check: ADO fork usage is rare compared to GitHub; scheduled as exploration in v1.9.

#### ADD-02 [M] Identity Picker for reviewer/user search

- The add-reviewer quickpick today searches org members via `entitlementApi.ts` (member enumeration). ADO's proper people search is the Identity Picker service: `POST https://dev.azure.com/{org}/_apis/IdentityPicker/Identities?api-version=7.1-preview.1` (query, identityTypes user+group, operationScopes ims+source). Not present in `azure-devops-node-api@10.2.2` (raw REST required).
- Enables: fast fuzzy people search, AAD groups and ADO teams as reviewers (pairs with `votedFor` rollup display, VOTE-08), and the same picker reused for @mention completion (ADD-04) and share-by-email (REST-13).
- Key files: `src/azdo/userManager.ts`, `src/azdo/entitlementApi.ts` (pattern for raw authenticated REST), `src/azdo/pullRequestOverview.ts:347-395` (existing identity-search quickpick to upgrade).

#### ADD-03 [note] ADO throttling semantics for any polling work

- Any polling/back-off port (v1.9 item 1) must honor ADO rate limiting: responses carry `Retry-After` and `X-RateLimit-Remaining`/`X-RateLimit-Limit`/`X-RateLimit-Reset` headers when the org is throttled (TSTU-based global consumption model). Respect `Retry-After` absolutely; treat `X-RateLimit-Remaining` as a budget signal to stretch poll intervals. The upstream 0.64 client-side request-budget pattern (chunk H) is the right shape; GitHub quota math is not.

#### ADD-04 [M] Authoring @mentions (write side)

- Rendering GUID mentions is tracked in triage #48; _authoring_ is separate: ADO only creates a real mention + notification when the comment/description body contains `@<VSID>` markup (the identity GUID in angle brackets). Plain `@name` text does nothing. No node-api involvement, it is body markup.
- Desired: `@` completion in webview editors (backed by ADD-02 picker), inserting display text in the editor but `@<guid>` markup in the posted body; render inbound `@<guid>` back to display names (the read side of #48).
- Key files: `webviews/components/comment.tsx`, `src/azdo/pullRequestOverview.ts`, `src/azdo/userManager.ts`.

#### ADD-05 [note] Create-PR surface, consolidated ADO facts

Four gap areas independently hit "creation is a dead stub" (`folderRepositoryManager.ts:961-963`). When building v1.8 item 1 and the later create webview:

- The working data call already exists: `AzdoRepository.createPullRequest` (`src/azdo/azdoRepository.ts:159-170`) takes a full `GitPullRequest` and supports `isDraft`, `workItemRefs`, `reviewers`, `labels` at create time.
- ADO caps PR descriptions at 4000 characters (server truncates/rejects); the create flow should count and warn.
- Template conventions differ from GitHub: ADO web reads `.azuredevops/pull_request_template.md` (also `.vsts`, docs folder variants) with per-branch templates under `pull_request_template/branches/`. Upstream's template discovery (0.126, chunk B) needs its path set swapped.
- Reviewer defaults come from required-reviewer policies; do not duplicate them client-side, let the server add them (they appear on the created PR's first fetch).

#### ADD-06 [M] Path-scoped required reviewers (the real CODEOWNERS analog)

- The critic flagged that "CODEOWNERS completions: not-portable" (Section 3) obscures a real feature: ADO required-reviewer policies carry path filters. Given a PR's changed files, the extension can compute which path-scoped reviewer policies will fire and show "these files will require sign-off from X" before the server does it.
- Data: `PolicyApi.getPolicyConfigurations` filtered to the required-reviewer policy type; `settings.filenamePatterns` + `scope[].refName` matching (settings are untyped `any` in 10.2.2, define local interfaces).
- Lands naturally as a POL-01 follow-up row type; scheduled with the v1.5 stretch items.

## 3. Upstream inventory (Half 1): complete portable/partial catalog

Every entry from `ms/main` CHANGELOG.md 0.16.0-0.158.0 classified. Portable/partial items below, ordered newest release first; not-portable / already-in-fork / superseded lists follow. `[SCOPED]`-era notes: "Vs scoping doc" says what this adds beyond UPSTREAM-SCOPING.md. Multi-release features are grouped; the same theme can recur across release eras, milestones name the union.

Totals after reclassification: 201 portable, 79 partial, 65 not-portable, 33 already-in-fork, 10 superseded. Housekeeping entries (version bumps, deps, telemetry, CI) were counted per release and excluded: 97 entries.

### 3.A Releases 0.158-0.140

**U-A001 [M] [partial] Merge-readiness reflects required-review / branch-protection state** (rel 0.156.0-0.158.0 #8835, #8827)

- Upstream fixed the merge button showing green even when branch protection (pending required reviews, unknown checks) was unmet. Concept ports as making the fork's merge UI policy-aware instead of conflict-only.
- ADO mapping: ADO branch Policy Evaluations (minimum-reviewers, required-reviewers, build validation) - PolicyApi.getPolicyEvaluations exists in azure-devops-node-api 10.2.2; fork currently surfaces only pullRequest.mergeStatus (conflict check), zero PolicyApi usage (verified by grep).
- Upstream key files: `src/github/githubRepository.ts`, `src/github/graphql.ts`, `src/github/queriesShared.gql`
- Fork target: `src/azdo/pullRequestModel.ts`, `src/azdo/azdoRepository.ts`, `webviews/components/merge.tsx`
- Notes: Upstream fix commits are GraphQL-specific; the port is really 'add policy-evaluation awareness to merge.tsx', a net-new ADO data-layer feature. Reviewer votes (+10/-10) also need to feed the readiness computation.

**U-A002 [XS] [partial] Adopt updated VS Code chat context API** (rel 0.158.0)

- Migrates the extension's chat/LM tool integration to the updated VS Code chat context API. Provider-neutral API adoption, but only meaningful once the LM/chat tools feature (0.110-0.136, other slice) is ported.
- Fork target: `src/commands.ts`
- Notes: Fork has no LM tools today; treat as a rider on any #activePullRequest chat-tools port, not standalone work.

**U-A003 [M] [portable] Auto-refresh polling with back-off when no changes found** (rel 0.154.0 #8811)

- Backs off the PR-update polling interval when successive refreshes find no changes, cutting API load. Upstream change is small and lives in reviewManager.
- Upstream key files: `src/view/reviewManager.ts`, `src/test/view/reviewManager.test.ts`
- Fork target: `src/view/reviewManager.ts`, `src/view/prsTreeDataProvider.ts`
- Vs scoping doc: Scoping lists 'polling back-off (0.154)'. ADDED: grep shows the fork has NO periodic polling loop at all (only one setTimeout in reviewManager.ts) - so this is 'introduce auto-refresh with back-off', an M, not an XS tweak to existing polling.
- Notes: Design the back-off in from day one rather than porting naive polling first; ADO REST has stricter throttling than GitHub for org-wide accounts.

**U-A004 [L] [portable] Image/file upload to PR descriptions and comments (button + paste)** (rel 0.144.0-0.152.0 #8723, #8724, #8740, #8793)

- Upload images/files into PR comment and description editors via a toolbar button or paste, with follow-up fixes for the upload button overlaying textarea content (0.146, 0.152).
- ADO mapping: ADO PR Attachments API - verified present in bundled azure-devops-node-api 10.2.2: GitApi.createAttachment/getAttachments/getAttachmentContent (GitApi.d.ts:50-54).
- Upstream key files: `src/github/fileUpload.ts`, `src/github/githubRepository.ts`, `src/github/issueOverview.ts`, `webviews/components/comment.tsx`, `webviews/common/context.tsx`
- Fork target: `src/azdo/pullRequestModel.ts`, `src/azdo/azdoRepository.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/comment.tsx`, `webviews/common/context.tsx`, `src/commands.ts`
- Vs scoping doc: Scoping lists 'image paste/upload (0.144)'. ADDED: confirmed attachments API is in the old 10.2.2 node-api (no upgrade needed); grouped the 0.146/0.152 overlay bugfixes into the same work item; flagged that rendering uploaded attachments requires authenticated fetch - reuse the avatarCache.ts authenticated-media pattern.
- Notes: L because it spans data layer (streams into createAttachment), two webview editors, markdown re-render of attachment URLs, and paste handling.

**U-A005 [M] [portable] Checkout PR in a git worktree (context menu + description view)** (rel 0.140.0-0.150.0 #8513, #8711, #8764)

- Adds 'Checkout Pull Request in Worktree' to the PR tree context menu and description view (0.140), groups worktrees under <repo>.worktrees/ with descriptive folder names (0.144), and fixes PR matching when the workspace is a manually-created worktree with duplicate git configs (0.150).
- Upstream key files: `src/github/worktree.ts`, `src/commands.ts`, `src/github/pullRequestGitHelper.ts`, `webviews/common/context.tsx`, `package.json`
- Fork target: `src/commands.ts`, `src/azdo/pullRequestGitHelper.ts`, `src/view/prsTreeDataProvider.ts`, `webviews/common/context.tsx`
- Vs scoping doc: Scoping lists 'worktree checkout (0.140)' and 'worktree cleanup (0.136)'. ADDED: the feature is one new mostly provider-neutral file (src/github/worktree.ts) - cheap to lift; grouped the 0.144 folder-naming and 0.150 duplicate-git-config PR-matching fixes (lands in fork's existing pullRequestGitHelper.ts) into the same port.
- Notes: Mostly git plumbing, little ADO API surface; Zach's team already lives in worktrees (globalshop workflow), so high personal value.

**U-A006 [XS] [partial] hasBranch called with pr.base.name instead of pr.base.ref** (rel 0.140.0 #8698)

- Upstream bugfix (#8698) passing the wrong field to hasBranch in reviewManager.ts.
- Notes: If the worktree feature is ported, port it post-fix so the bug never lands. RECLASSIFIED per critic: provider-agnostic branch-association fix; apply during worktree port (v1.9).

**U-A007 [S] [portable] Branch↔PR association robustness (stale closed PRs, upstream-ref hang)** (rel 0.144.0-0.146.0 #8727)

- Stops associating local branches with stale closed PRs when they track a shared upstream (#8676), and fixes a hang when a branch's upstream ref isn't a recognized repo (#8729).
- Upstream key files: `src/view/reviewManager.ts`
- Fork target: `src/view/reviewManager.ts`, `src/azdo/pullRequestGitHelper.ts`
- Notes: Fork uses the same git-config-metadata association pattern (pullRequestGitHelper.ts), so the stale-closed-PR symptom likely reproduces. The #8729 hang message is GitHub-specific but the detection-loop guard is the portable part.

**U-A008 [XS] [partial] Assignable/mentionable users cache bypass fix** (rel 0.144.0 #8715)

- getAssignableUsers/getMentionableUsers ignored the persisted globalState cache whenever a fetch promise was already in flight (#8669), causing redundant fetch waits.
- Upstream key files: `src/github/folderRepositoryManager.ts`
- Fork target: `src/azdo/folderRepositoryManager.ts`
- Notes: Fork's folderRepositoryManager.ts has the same-named methods but forked before upstream's cache rework, so port the pattern (serve cached data while a refresh is in flight) rather than the diff.

**U-A009 [XS] [portable] Directory checkbox re-parent fix for viewed-state refresh** (rel 0.144.0 #8679)

- Re-parents pulled-up directory children in the changes tree so folder viewed-checkboxes refresh correctly (#8679).
- Upstream key files: `src/view/treeNodes/commitNode.ts`, `src/view/treeNodes/filesCategoryNode.ts`, `src/view/treeNodes/pullRequestNode.ts`
- Fork target: `src/view/treeNodes/directoryTreeNode.ts`, `src/view/treeNodes/filesCategoryNode.ts`, `src/view/treeNodes/commitNode.ts`, `src/view/treeNodes/pullRequestNode.ts`
- Notes: Fork has viewed-state keyed by path but folder-level checkboxes (scoping: 0.38-0.52) aren't ported yet - bundle this fix into that port so the known refresh bug never ships.

**U-A010 [S] [partial] Create-PR flow polish: default title behavior, Co-authored-by trim, description survives failed push** (rel 0.146.0-0.150.0 #8678, #8771)

- Three small create-flow fixes: trim Co-authored-by lines from the default description (0.146), don't reset the entered description when the branch push fails (#8678, 0.148), and make the default title match the web behavior (#8771, 0.150).
- ADO mapping: Default-title behavior should match ADO web's PR-create defaults (last commit subject / branch name), not github.com's.
- Fork target: `src/view/reviewManager.ts`, `src/azdo/folderRepositoryManager.ts`
- Notes: These target upstream's create-PR webview, which the fork predates (still the 2020 quickpick flow in reviewManager.ts) - land them as acceptance criteria of the create-PR view port (0.23->0.134, other slice) rather than standalone fixes.

**U-A011 [XS] [portable] Markdown rendering fixes: img alt text and checked checkboxes** (rel 0.142.0-0.148.0)

- Comments panel preserved <img> alt attributes instead of rendering 'Image: image' (#8760), and checked task-list checkboxes (- [x]) became visually distinct from unchecked (#8671).
- Fork target: `webviews/components/comment.tsx`, `webviews/common/common.css`
- Notes: Provider-neutral webview markdown rendering; audit whether the fork's older renderer exhibits the same symptoms before porting.

**U-A012 [XS] [portable] Merge button shows separator with no extra options** (rel 0.148.0)

- Fixes the merge split-button rendering a dropdown separator even when there are no extra merge options (#8759).
- Fork target: `webviews/components/merge.tsx`
- Notes: Fork's merge.tsx has the same split-button pattern; relevant since ADO merge strategies (squash/rebase/noFastForward) populate the same dropdown.

**U-A013 [XS] [portable] Comment shows twice in diff editor** (rel 0.146.0)

- Fixes duplicate rendering of a comment thread in the diff editor (#8736).
- Fork target: `src/view/reviewCommentController.ts`, `src/view/commentThreadCache.ts`
- Notes: Fork's comment-thread cache is the analogous dedup point; docs/fork/ISSUE-TRIAGE.md already fixed comment offsets, so verify this specific dup symptom before porting.

**U-A014 [S] [partial] API-usage cleanup: reduce unnecessary calls and errors** (rel 0.142.0)

- Batch of upstream commits deduplicating GraphQL/REST calls and reducing refresh churn to lower GitHub load.
- Fork target: `src/azdo/azdoRepository.ts`, `src/azdo/folderRepositoryManager.ts`
- Vs scoping doc: Scoping lists 'API-usage reduction (0.120, 0.142)'. ADDED: the 0.142 commits are octokit/GraphQL-shaped and don't diff-port; the portable part is the principle (dedupe in-flight requests, cache per-refresh, avoid redundant tree refreshes) applied to the fork's ADO REST layer - best done alongside the 0.154 polling item.
- Notes: Fold into the auto-refresh/polling work item rather than tracking separately.

### 3.B Releases 0.138-0.126

**U-B015 [L] [portable] Language-model tools: create PR, resolve review comments, user-oriented tool descriptions** (rel 0.130.0-0.136.0 #8623, #8514)

- Adds vscode.lm chat tools to create a pull request and to resolve review comment threads, plus rewrites tool descriptions to be user-oriented (#8510). Tools are provider-agnostic vscode.lm registrations that would call the ADO data layer.
- Upstream key files: `src/lm/tools/tools.ts`, `src/lm/tools/resolveReviewThreadTool.ts`, `src/lm/tools/activePullRequestTool.ts`, `package.json`
- Fork target: `package.json`, `src/azdo/pullRequestModel.ts`, `src/azdo/folderRepositoryManager.ts`
- Vs scoping doc: Doc lists LM/chat tools 0.110-0.136 generically. ADDED: the two concrete 0.136 tools + upstream src/lm/tools/ layout; fork has zero src/lm infra so this is an L including tool scaffolding; resolve-tool backend already exists in fork (pullRequestModel.updateThreadStatus).
- Notes: The resolve tool maps cleanly to ADO first-class thread statuses the fork already calls. Create-PR tool depends on the fork's create-PR path being revived (see create-PR view item).

**U-B016 [M] [portable] Worktree lifecycle: delete from cleanup command, removal on branch delete, stale-entry and post-merge-mix fixes** (rel 0.132.0-0.136.0 #8653, #8559, #8560)

- Cleanup command offers to delete PR worktrees (#8653), branch deletion offers worktree removal (#8559), fixes stale worktree repo entries in the sidebar (#8525/#8560) and main-branch/worktree mixing after merge-then-delete (#8519).
- Upstream key files: `src/github/folderRepositoryManager.ts`, `src/@types/git.d.ts`, `src/gitProviders/vslsguest.ts`
- Fork target: `src/azdo/folderRepositoryManager.ts`, `src/commands.ts`
- Vs scoping doc: Doc lists 'worktree cleanup (0.136)'. ADDED: the 0.132.x worktree fixes belong to the same cluster, upstream commits (de9675ec, d39d22b4, 66a2314b), and the dependency: fork has zero worktree code today (grep confirms), so all of this rides on first porting worktree checkout (0.140).
- Notes: Pure git-layer feature, no GitHub API coupling. Only worth porting together with 0.140 worktree checkout.

**U-B017 [M] [partial] AI apply-suggestion refinements** (rel 0.128.0-0.136.0)

- "Apply Suggestion with Copilot" becomes available from the Comments view (opens Chat view), line numbers are added to the AI context, and a redundant disclaimer suffix is fixed (#8605).
- Fork target: `src/view/reviewCommentController.ts`, `src/commands.ts`, `package.json`
- Vs scoping doc: Doc lists 'AI apply suggestion (0.128-0.136)'. ADDED: enumerated the three sub-changes and that they sit on vscode.lm/Chat APIs (provider-agnostic), so 'partial' only because they require an LM entitlement and the fork's plain apply-suggestion (already fixed per ISSUE-TRIAGE) as substrate.
- Notes: Fork already has non-AI apply-suggestion working; the AI variant is additive UX on top.

**U-B018 [M] [partial] AI-generated description for existing PRs (sparkle in edit mode)** (rel 0.126.0)

- When editing an existing PR description in the overview webview, a sparkle icon generates a description via the LM. Extends the create-time AI title/description to already-open PRs.
- Fork target: `src/azdo/pullRequestOverview.ts`, `webviews/editorWebview/app.tsx`
- Vs scoping doc: Doc lists 'AI PR title/description (0.76, 0.106, 0.126)'. ADDED: the 0.126 piece is specifically regeneration for EXISTING PRs from the description webview edit flow - a distinct surface (pullRequestOverview + editorWebview) from the create view.
- Notes: vscode.lm-based, provider-neutral; partial only because it needs LM access and diff-context plumbing.

**U-B019 [L] [portable] Create-PR view improvements: branchName pre-fill + title-ize, template chooser, branch-name caching, createOnPublishBranch, target-branch and file-list fixes** (rel 0.126.0-0.136.0 #8269, #8597)

- pullRequestDescription:'branchName' pre-fills title from branch (title-ized in 0.132); multi-template selection (#8269); branch names cached for fast target picker (#8597); createOnPublishBranch:'always'; fixes for broken target-branch selection (#8627), wrong file list (#8457), and description fill mismatch (#8630).
- Upstream key files: `src/github/createPRViewProvider.ts`, `src/github/quickPicks.ts`, `src/github/folderRepositoryManager.ts`, `webviews/common/createContextNew.ts`
- Fork target: `src/azdo/folderRepositoryManager.ts`, `src/azdo/azdoRepository.ts`, `src/view/quickpick.ts`
- Vs scoping doc: Doc lists create-PR view evolution (0.23->0.70->0.134) incl. templates (0.126) and branch-name caching (0.134). ADDED: verified the fork's create-PR path is vestigial - folderRepositoryManager.createPullRequest ignores its params and downstream blocks are commented out (folderRepositoryManager.ts:961-1019) - so every item here is gated on first porting createPRViewProvider; ADO PR templates are repo files (.azuredevops/pull_request_template.md), same read-from-repo mechanism as GitHub.
- Notes: azdoRepository.createPullRequest (GitApi.createPullRequest) already works, so the API side is done; the whole cost is the view.

**U-B020 [S] [portable] Convert PR to draft / publish from description webview** (rel 0.126.0 #8258)

- Open PRs can be converted to draft (and back) from the PR description webview reviewers section.
- ADO mapping: ADO draft PRs are first-class: PATCH pullrequest with isDraft true/false via GitApi.updatePullRequest (present in azure-devops-node-api 10.2.2).
- Upstream key files: `src/github/pullRequestModel.ts`, `src/github/pullRequestOverview.ts`, `webviews/components/sidebar.tsx`, `src/github/pullRequestReviewCommon.ts`
- Fork target: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/sidebar.tsx`
- Vs scoping doc: Doc lists convert-to-draft (0.126). ADDED: verified fork only READS isDraft for display (pullRequestModel.ts:81,162; pullRequestOverview.ts:250) with no mutate path, and confirmed the 10.2.2 API supports the write - so this is a small S, not M.

**U-B021 [M] [portable] Change PR target (base) branch from description webview** (rel 0.126.0 #8232)

- Adds base-branch editing to the PR overview: pick a new base branch, PR is retargeted, timeline shows the change.
- ADO mapping: GitApi.updatePullRequest with a new targetRefName - ADO supports retargeting active PRs natively (10.2.2 API sufficient). Retarget may trigger vote reset per branch policy.
- Upstream key files: `src/github/pullRequestOverview.ts`, `src/github/pullRequestModel.ts`, `src/github/quickPicks.ts`, `src/common/timelineEvent.ts`
- Fork target: `src/azdo/pullRequestOverview.ts`, `src/azdo/pullRequestModel.ts`, `src/view/quickpick.ts`, `src/common/timelineEvent.ts`
- Vs scoping doc: Doc lists 'change target branch (0.126)'. ADDED: upstream commit 5068accd key files and confirmation the ADO route is a one-field PATCH; main cost is webview UI + timeline event rendering.

**U-B022 [S] [partial] Auto-delete branch after merge + switched-branch notification** (rel 0.126.0-0.128.0 #8215, #8437)

- Setting deleteBranchAfterMerge auto-deletes the PR branch when merged from the extension (0.126, #8215); 0.128 adds a notification that the branch was deleted and you were switched. The 0.128 merge-queue interaction fix (#8435) is GitHub-only.
- ADO mapping: Remote-side deletion is native: completionOptions.deleteSourceBranch on complete/auto-complete - the fork ALREADY passes it (pullRequestModel.ts:257-258). Remaining port is local-branch cleanup, the setting, and the switch notification.
- Upstream key files: `src/github/pullRequestGitHelper.ts`, `src/github/activityBarViewProvider.ts`, `src/github/pullRequestOverview.ts`, `src/common/settingKeys.ts`
- Fork target: `src/azdo/pullRequestModel.ts`, `src/azdo/activityBarViewProvider.ts`, `src/azdo/pullRequestGitHelper.ts`
- Vs scoping doc: Doc lists 'auto-delete branch after merge (0.126)'. ADDED: fork verification showing the remote half is already done via ADO completion options plus a manual pr.deleteBranch flow (activityBarViewProvider.ts:221), shrinking this to S.

**U-B023 [XS] [portable] postDone: check out PR base branch instead of default branch** (rel 0.126.0 #8250)

- Setting postDone:'checkoutPullRequestBaseBranch' checks out the PR's base branch (instead of default) when you finish with a PR.
- Fork target: `src/view/reviewManager.ts`, `package.json`

**U-B024 [M] [portable] Local PR branch discovery on folder open + link PRs created outside the UI to their branch** (rel 0.126.0, 0.138.0 #8674)

- On first open, existing PR branches are discovered and populated into the Local Pull Request Branches view (0.126); 0.138 fixes PRs created outside the extension not being associated with the current branch by polling for a PR after push (#8643 -> commit c9a03e55).
- Upstream key files: `src/view/reviewManager.ts`
- Fork target: `src/azdo/pullRequestGitHelper.ts`, `src/view/reviewManager.ts`, `src/azdo/folderRepositoryManager.ts`
- Vs scoping doc: Doc lists 'local PR branch discovery (0.126)'. ADDED: grouped the 0.138 branch-association fix (same metadata mechanism, pullRequestGitHelper branch-config keys) and located it in reviewManager.ts.
- Notes: Discovery = query ADO PRs by sourceRefName for local branches (GitApi.getPullRequests searchCriteria.sourceRefName, in 10.2.2).

**U-B025 [M] [portable] Multiple PR descriptions open at once** (rel 0.130.0)

- More than one PR/issue description webview can be open simultaneously instead of one panel being reused.
- Upstream key files: `src/github/pullRequestOverview.ts`
- Fork target: `src/azdo/pullRequestOverview.ts`
- Vs scoping doc: Doc lists 'multiple PR descriptions (0.130)'. ADDED: fork's pullRequestOverview uses the singleton current-panel pattern; the port is replacing it with a per-PR panel map plus dispose bookkeeping - no ADO API work at all.
- Notes: Issue-webview half is N/A (fork has no issues view).

**U-B026 [M] [portable] Open PR multi-diff by URI (open-pull-request-changes) + multi-diff button regression fix** (rel 0.126.0, 0.128.0)

- A vscode:// URI opens the multi-diff editor for a PR by its web URL (0.126); 0.128 fixes the multi-diff button disappearing for the current PR (#8387).
- Upstream key files: `src/uriHandler.ts`, `src/common/uri.ts`
- Fork target: `src/extension.ts`, `src/azdo/remoteUrlParser.ts`, `src/common/uri.ts`
- Vs scoping doc: Doc lists 'open-PR-changes-by-URI (0.126)' and multi-diff (0.80). ADDED: upstream handler lives in src/uriHandler.ts (verified in ms/main); fork can parse dev.azure.com PR URLs by extending its existing remoteUrlParser.ts. Depends on the multi-diff editor port (0.80).
- Notes: URI grammar for ADO: dev.azure.com/{org}/{project}/\_git/{repo}/pullrequest/{id}.

**U-B027 [S] [portable] autoRepositoryDetection setting (include repos outside the workspace)** (rel 0.130.0 #8501)

- New setting controls repository detection scope; true includes git repos opened outside the workspace folders.
- Upstream key files: `src/common/settingKeys.ts`, `src/extension.ts`, `package.json`
- Fork target: `src/azdo/repositoriesManager.ts`, `src/extension.ts`, `package.json`
- Notes: Extra-relevant to the fork's multi-project workspace feature - same repositoriesManager surface.

**U-B028 [S] [portable] Show which repository a PR belongs to in views** (rel 0.126.0, 0.130.0)

- Adds a visible repository indicator on PR items so multi-repo users can tell where each PR lives (#8174, #6674).
- Fork target: `src/view/treeNodes/pullRequestNode.ts`, `src/view/treeNodes/categoryNode.ts`, `src/view/treeNodes/workspaceFolderNode.ts`
- Notes: High value for this fork specifically: multi-project workspaces make repo ambiguity worse than upstream. Description would show project/repo, data already on the fork's PR model.

**U-B029 [S] [portable] PR status icons in sidebar (pullRequestAvatarDisplay)** (rel 0.132.0)

- Sidebar PR items can show a status icon (open/closed/merged/draft) instead of or alongside the author avatar, via a setting.
- Fork target: `src/view/treeNodes/pullRequestNode.ts`, `package.json`
- Notes: ADO status enum maps: active/completed/abandoned + isDraft (no separate merged-vs-closed; completed = merged, abandoned = closed). Fork's avatarCache covers the avatar branch of the setting.

**U-B030 [XS] [portable] Status bar PR item follows selected repo (scm.repositories.selectionMode single)** (rel 0.128.0)

- The 'Pull Request' status bar item reflects the currently selected SCM repository when single-selection mode is on.
- Fork target: `src/view/reviewManager.ts`, `src/view/reviewsManager.ts`

**U-B031 [S] [portable] Viewed-state correctness: per-commit viewed keying + parent-folder checkbox auto-check** (rel 0.128.0, 0.136.0)

- Fixes marking a file viewed on an older commit marking it viewed for all versions (#8313 - key viewed state by commit, not just path) and parent folder checkboxes not auto-checking when all children are viewed (#8584).
- Fork target: `src/azdo/fileReviewedStatusService.ts`, `src/view/fileViewedDecorationProvider.ts`, `src/view/treeNodes/directoryTreeNode.ts`
- Vs scoping doc: Doc lists viewed checkboxes incl. folders (0.38-0.52). ADDED: these two later fixes directly patch the fork's EXISTING implementation - verified fileReviewedStatusService.ts has no commit-level keying today, so #8313 is a real live bug in the fork too.

**U-B032 [S] [portable] Checkout and branch-switch fix batch** (rel 0.126.0-0.136.0 #8467)

- Fixes: can't checkout PR when already on the same branch (#8624); checkout-by-number quick-input UX clarified (#8455/96adb0b6); 'branch does not exist locally' during rebase (#8487); switch-branch quickpick missing branches (#8351); 'we couldn't find commit' error (#8401).
- Fork target: `src/commands.ts`, `src/view/reviewManager.ts`, `src/azdo/folderRepositoryManager.ts`
- Notes: Fork already ships its own checkout-by-ID; #8455's quick-input labeling polish applies directly to it. All git-layer, no GitHub coupling.

**U-B033 [M] [portable] Description webview and tree polish batch** (rel 0.126.0-0.136.0 #8255)

- Small provider-neutral items: ctrl/cmd+R refreshes description webview; Reveal in Explorer from changes/PR views; commit SHAs linkified in comments; commentExpandState:'collapsePreexisting'; unwrap wrapped commit lines (#8255, #8345); refresh-comments command fix (#8445); PR title cropping (#8453); open PR to the right (#8537); duplicate tree-id registration (#8073); button corner CSS (#8609); comment button hidden by Inline Chat (#8504); escape file names in links; null timelineItem guard (#8447).
- Fork target: `src/azdo/pullRequestOverview.ts`, `webviews/editorWebview/app.tsx`, `webviews/components/timeline.tsx`, `src/view/prsTreeDataProvider.ts`, `src/commands.ts`
- Notes: 13 XS fixes bundled; cherry-pick opportunistically when touching each surface rather than as one project. SHA linkify should target ADO commit URLs.

**U-B034 [XS] [portable] File-scoped comment on deleted file fix** (rel 0.138.0)

- Fixes file-level comments failing with 'Error: File has been deleted' (#8641).
- Fork target: `src/view/reviewCommentController.ts`
- Notes: Only relevant after porting file-level comments (scoping doc 0.64). ADO threads support file-level anchoring (threadContext with no line range).

**U-B035 [S] [partial] Permalink handling: open local file for web permalinks, filename as link text** (rel 0.130.0, 0.134.0 #8583)

- GitHub permalinks in PR webviews open the corresponding local workspace file when present (0.134, PR #8583); share-permalink-as-markdown uses the filename as link text (#4663).
- ADO mapping: Parse dev.azure.com file URLs (?path=/…&version=GB{branch}|GC{sha}&line=N) instead of github.com blob URLs; extend the fork's remoteUrlParser. The share-permalink command itself is listed not-portable in scoping - only the open-local-file direction ports.
- Fork target: `src/azdo/remoteUrlParser.ts`, `src/azdo/utils.ts`, `webviews/editorWebview/app.tsx`
- Vs scoping doc: Doc marks vscode.dev permalinks not-portable. ADDED: the 0.134 half is the inbound direction (URL -> local file) and IS portable with an ADO URL grammar.

**U-B036 [M] [partial] Update PR branch from target (update-with-merge-commit)** (rel 0.128.0, 0.132.0)

- Upstream switched to GraphQL updatePullRequestBranch for conflict-free updates (#8231) and fixed the merge-commit update path (#8553) - the 'update your branch with base' button.
- ADO mapping: ADO has NO server-side update-branch API (not in 10.2.2 nor current REST). Implement client-side: local git fetch + merge target into source + push, checked-out PRs only. The GraphQL-specific fixes don't transfer.
- Fork target: `src/view/reviewManager.ts`, `src/azdo/pullRequestModel.ts`
- Notes: Feature is portable in spirit, mechanism must be rebuilt on local git.

**U-B037 [?] [partial] Changes-since-last-review: ignore pending reviews as 'last review'** (rel 0.126.0)

- Fixes Show Changes Since Last Review treating a pending (unsubmitted) GitHub review as the last-review marker (#6226).
- ADO mapping: ADO has no pending-review concept; changes-since-last-review should be built on PR ITERATIONS (iteration diffs are first-class), where this bug class cannot exist.
- Notes: Reinforces scoping doc's 0.48 item: implement via iterations, not review markers. RECLASSIFIED per critic: rider on ITER-05.

### 3.C Releases 0.124-0.116

**U-C038 [L] [partial] Copilot Chat / LM tool integrations (#openPullRequest, implicit/explicit context, @githubpr sticky)** (rel 0.116.0-0.124.0 #6956)

- PR/issue webview title as implicit chat context, Add Context menu entries, #openPullRequest tool recognizing open PR diffs, chat-participant fixes (#7637, #7601, #7349), enable-all-LLM-tools (PR #6956), sticky @githubpr, Edit-Query-with-Copilot.
- ADO mapping: VS Code LM tool API is provider-neutral; tools would be re-backed by ADO PR data (pullRequestModel/folderRepositoryManager). Chat participant + Copilot-specific entry points stay out of scope.
- Fork target: `src/azdo/pullRequestModel.ts`, `src/azdo/folderRepositoryManager.ts`, `src/extension.ts`
- Vs scoping doc: Scoping lists 'LM/chat tools #activePullRequest etc. (0.110-0.136)'; added: concrete increments in this slice (implicit/explicit chat context 0.124, #openPullRequest 0.118->0.120, sticky participant 0.116) and the partial split - LM tools portable, Copilot Chat participant/Edit-Query-with-Copilot not.

**U-C039 [M] [portable] Commit status icon per commit in PR description timeline** (rel 0.124.0 #8142)

- For commits where checks ran, show the commit status icon next to each commit in the description webview timeline (contributed PR #8142).
- ADO mapping: ADO Git commit statuses: GitApi.getStatuses(commitId, repositoryId) - present in azure-devops-node-api 10.2.2; also policy evaluations per iteration.
- Upstream key files: `src/common/timelineEvent.ts`, `src/github/utils.ts`, `webviews/components/timeline.tsx`, `src/github/graphql.ts`
- Fork target: `src/common/timelineEvent.ts`, `webviews/components/timeline.tsx`, `src/azdo/utils.ts`, `src/azdo/pullRequestModel.ts`
- Vs scoping doc: Scoping lists 'commit status per commit (0.124)'; added: upstream commit 1eee6988 file list, and that GitApi.getStatuses exists in the vendored 10.2.2 API so no raw REST needed.

**U-C040 [S] [portable] Copy-link action for individual comments in description webview** (rel 0.124.0 #8150)

- Adds a 'Copy link' button on each comment in the PR description webview (contributed PR #8150).
- ADO mapping: ADO comment permalink: https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}?discussionId={threadId}.
- Upstream key files: `webviews/components/comment.tsx`
- Fork target: `webviews/components/comment.tsx`, `src/azdo/pullRequestOverview.ts`

**U-C041 [S] [partial] Draft-comment icon for un-submitted review comments (gutter + Comments view)** (rel 0.124.0)

- Comments belonging to a not-yet-submitted review show a 'comment draft' icon in the editor gutter and Comments view.
- ADO mapping: ADO has no server-side draft review; fork already emulates pending-review state client-side (hasPendingReview / onDidChangePendingReviewState), so the icon is a UI overlay on that emulation.
- Fork target: `src/common/commonCommentHandler.ts`, `src/view/reviewCommentController.ts`, `src/view/pullRequestCommentController.ts`

**U-C042 [S] [partial] Comments missing when PR is on non-default/secondary repo (#8050)** (rel 0.124.0)

- Fix for comments not showing when the PR belongs to a repo other than the primary workspace repo.
- ADO mapping: Fork's multi-project workspace support (v1.1.0) restructured repo resolution, so the upstream patch won't apply directly; the symptom class is worth a regression check in commentHandlerResolver for non-primary repos.
- Fork target: `src/commentHandlerResolver.ts`, `src/azdo/repositoriesManager.ts`

**U-C043 [S] [portable] ignoreSubmodules setting + consistent honoring** (rel 0.118.0-0.124.0)

- New githubPullRequests.ignoreSubmodules setting (0.118) plus fix making PRs and Issues views honor it consistently (#7741, 0.124).
- Fork target: `package.json`, `src/azdo/repositoriesManager.ts`, `src/azdo/folderRepositoryManager.ts`
- Notes: Pure git-side repository filtering, provider-neutral.

**U-C044 [XS] [portable] Comment message wrapping in narrow editor panes (PR #8121)** (rel 0.124.0 #8121)

- CSS fix so comment text wraps correctly in narrow editor panes.
- Fork target: `webviews/common/common.css`

**U-C045 [S] [portable] Reviewer/icon rendering fixes in PR webview and views** (rel 0.116.0-0.122.1)

- Only-one-reviewer-visible fix (#8131), dead dropdown (#8149), reviewer icon misalignment (#8013/#7998/#8159), warning icon alignment (#7219).
- Fork target: `webviews/components/reviewer.tsx`, `webviews/components/dropdown.tsx`, `webviews/components/icon.tsx`
- Notes: All in shared webview components the fork retains; apply as a batch when touching the description webview.

**U-C046 [S] [partial] Auto-generated PR description respects repository PR template** (rel 0.122.0)

- AI-generated descriptions (pullRequestDescription setting) fill into the repo's PR template when one exists.
- ADO mapping: ADO PR templates live at .azuredevops/pull_request_template.md (plus branch-specific templates) - read via GitApi.getItemContent.
- Fork target: `src/azdo/folderRepositoryManager.ts`
- Vs scoping doc: Scoping lists AI PR title/description (0.76, 0.106, 0.126); added: this 0.122 increment is template-respect only and depends on that base feature landing first; ADO template path convention named.

**U-C047 [S] [portable] PR view rendering: codicons + italic drafts** (rel 0.122.0)

- Pull Requests tree renders codicons instead of Unicode glyphs and draft PRs in italics instead of a [DRAFT] prefix.
- ADO mapping: ADO draft PRs are first-class (PullRequest.isDraft), already available in the fork's data layer.
- Fork target: `src/view/treeNodes/pullRequestNode.ts`, `src/view/treeNodes/categoryNode.ts`

**U-C048 [M] [portable] Emoji completions in review comments** (rel 0.122.0 #8009)

- :smile:-style emoji completions in comment editors via a CompletionItemProvider over comment input schemes.
- Upstream key files: `src/common/emoji.ts`, `src/view/emojiCompletionProvider.ts`, `src/extension.ts`
- Fork target: `src/extension.ts`, `src/view/reviewCommentController.ts`
- Vs scoping doc: Scoping lists 'emoji completions' with no release; added: it's 0.122 commit 2fbf269a, and the fork lacks src/common/emoji.ts entirely so the emoji data module must be ported too (hence M not S).

**U-C049 [S] [partial] Markdown alert syntax rendered in review comments** (rel 0.122.0 #8068)

- GitHub-style > [!NOTE] alert blocks render in comment bodies.
- ADO mapping: Relies on proposed VS Code API (vscode.proposed.markdownAlertSyntax.d.ts) - a marketplace fork extension cannot ship enabledApiProposals, so this waits on API finalization; ADO comment markdown supports the same alert syntax.
- Upstream key files: `src/@types/vscode.proposed.markdownAlertSyntax.d.ts`, `src/github/prComment.ts`
- Fork target: `src/azdo/prComment.ts`, `package.json`
- Vs scoping doc: Scoping lists 'markdown alerts'; added: the proposed-API blocker that makes it partial for a non-Microsoft marketplace extension.

**U-C050 [XS] [portable] Empty commit opens informational editor instead of notification** (rel 0.122.0)

- Opening an empty commit from the PR webview shows an editor with a message rather than a toast.
- Fork target: `src/view/treeNodes/commitNode.ts`

**U-C051 [S] [partial] Open/checkout PR from URL (vscode:// URI handler + command accepts URL)** (rel 0.116.0-0.122.0)

- Checkout-Pull-Request-by-Number command accepts a PR URL (0.116) and PRs open via vscode://…/checkout-pull-request?uri= deep links (0.122).
- ADO mapping: Fork already has checkout-by-ID and remoteUrlParser.ts; remaining work is parsing dev.azure.com pullrequest URLs and registering a window.registerUriHandler.
- Fork target: `src/azdo/remoteUrlParser.ts`, `src/commands.ts`, `src/extension.ts`
- Vs scoping doc: Scoping lists 'checkout by number/URL (0.34, 0.116)'; added: the 0.122 vscode:// URI-handler variant and that fork's existing checkout-by-ID + remoteUrlParser cover most of the plumbing.

**U-C052 [S] [partial] Cancel Review button in PR webview** (rel 0.122.0 #7317)

- A Cancel Review button discards an in-progress (pending) review from the description webview.
- ADO mapping: Fork's pending review is client-emulated (no ADO server draft review), so cancel = discard local draft threads/state rather than a DELETE review API call.
- Upstream key files: `src/github/pullRequestOverview.ts`, `webviews/common/context.tsx`, `webviews/components/timeline.tsx`
- Fork target: `src/azdo/pullRequestOverview.ts`, `webviews/common/context.tsx`, `src/common/commonCommentHandler.ts`
- Vs scoping doc: Scoping lists 'cancel review (0.122)'; added: commit 0739370f file list and the client-emulation caveat that changes the implementation shape.

**U-C053 [S] [partial] Comment reactions rendering fixes** (rel 0.122.0)

- Reactions to code comments not showing on Web (#2195) and always rendering reactions as emojis.
- ADO mapping: ADO equivalent is comment likes (usersLiked); fork has reaction scaffolding but the usersLiked wiring is commented out (src/azdo/prComment.ts:203), so this is 'finish likes support' rather than a patch port.
- Fork target: `src/azdo/prComment.ts`, `src/azdo/utils.ts`

**U-C054 [S] [portable] Branch-name collision checkout fixes** (rel 0.120.0-0.122.0)

- PR tab won't open when branch names are reused (#8007); wrong commit checked out when a local branch shares the PR branch name (#7702); spurious error on checkout with untracked files (#7294).
- Fork target: `src/azdo/pullRequestGitHelper.ts`
- Notes: All in the git-helper layer the fork shares structurally; fork's pullRequestGitHelper has the same fetch/checkout logic lineage.

**U-C055 [M] [portable] Git/repo discovery robustness** (rel 0.118.0-0.122.0)

- 'Git is not installed' false negative (#5454), repo not found when VS Code opened above the git root (#7964), extension breaking when non-matching remotes (codeberg) are present (#6945), ignore worktrees outside workspace folders (#7896).
- Fork target: `src/extension.ts`, `src/azdo/repositoriesManager.ts`, `src/azdo/folderRepositoryManager.ts`
- Notes: Fork's ISSUE-TRIAGE fixed SSH-URL and casing issues but not these discovery paths; #6945-class tolerance matters for mixed GitHub+ADO workspaces.

**U-C056 [XS] [portable] Configurable branch list timeout** (rel 0.122.0 #7927)

- Makes the branch-list fetch timeout a setting instead of hardcoded (contributed PR #7927, fixing #2840).
- Fork target: `package.json`, `src/azdo/folderRepositoryManager.ts`

**U-C057 [M] [portable] PR/issue webview restore after reload** (rel 0.118.0-0.120.2 #7597)

- Description webviews re-open after window reload via a webview panel serializer (upstream #7597, adds overviewRestorer.ts); includes 0.120.2 fix for webview failing to open (#8028).
- Upstream key files: `src/github/overviewRestorer.ts`, `src/github/pullRequestOverview.ts`, `src/github/issueOverview.ts`, `src/extension.ts`
- Fork target: `src/azdo/pullRequestOverview.ts`, `src/extension.ts`
- Vs scoping doc: Scoping lists 'webview restore (0.118)'; added: commit 949c66f0 introduces a dedicated overviewRestorer.ts to port, plus the follow-up 0.120.2/0.122 restore bugfixes (#8028, later e8e71aeb) that should ride along.

**U-C058 [S] [portable] Collapsible sidebar in narrow description webview** (rel 0.118.0)

- Reviewers/labels sidebar collapses into a compact readonly strip when the webview is narrow, expandable to edit.
- Fork target: `webviews/components/sidebar.tsx`, `webviews/common/common.css`

**U-C059 [XS] [portable] Distinct icons for extension views** (rel 0.118.0)

- Pull Requests / Active PR tree / Active PR webview views get distinct icons so they're distinguishable when dragged to their own containers.
- Fork target: `package.json`

**U-C060 [L] [portable] PR list view performance** (rel 0.116.0 #7287)

- Tree perf overhaul (#7141, commit 6a9d5ccc) introducing a prsTreeModel and reworking category/commit/file tree nodes to avoid redundant fetching.
- Upstream key files: `src/view/prsTreeModel.ts`, `src/view/prsTreeDataProvider.ts`, `src/view/treeNodes/categoryNode.ts`, `src/github/folderRepositoryManager.ts`
- Fork target: `src/view/prsTreeDataProvider.ts`, `src/view/treeNodes/categoryNode.ts`, `src/view/treeNodes/pullRequestNode.ts`
- Notes: Fork has no prsTreeModel abstraction, so this is an architectural port, not a patch.

**U-C061 [M] [portable] Refresh-storm / API-usage reduction** (rel 0.116.1-0.120.0)

- Fixes flurries of API calls on PR close/description open (#7537/#7542, commits 585f9686/b9ea7dfc), the rapid refresh loop causing rate limiting (#7816), and checking for new PRs before re-running view queries (0.120).
- ADO mapping: ADO has no search-API rate limit as harsh as GitHub's, but the fork polls GitApi per project - the check-before-query pattern maps to comparing latest PR creation/update timestamps per repo.
- Fork target: `src/view/prsTreeDataProvider.ts`, `src/azdo/folderRepositoryManager.ts`, `src/azdo/repositoriesManager.ts`
- Vs scoping doc: Scoping lists 'API-usage reduction (0.120, 0.142)'; added: the 0.116.1 storm fixes (585f9686, b9ea7dfc) and refresh-loop fix #7816 belong to the same workstream and should be ported together.

**U-C062 [S] [portable] Description webview header polish (simplified buttons, copy actions in context menu)** (rel 0.116.0-0.120.0)

- Simplified button bar (0.116), copy actions moved to the link context menu then 'Copy link' restored near the title (0.120), redundant URL content removed from headers (#7509).
- Fork target: `webviews/components/header.tsx`

**U-C063 [S] [portable] postDone: checkoutDefaultBranchAndPull setting** (rel 0.120.0)

- Setting so that finishing with a PR checks out the default branch and pulls.
- Fork target: `package.json`, `src/view/reviewManager.ts`

**U-C064 [S] [partial] Checkout responsiveness with very large PRs (#6952)** (rel 0.120.0)

- Fix VS Code becoming unresponsive during checkout of PRs with huge file counts.
- ADO mapping: Fork already fixed the >1000-changed-files listing path (ISSUE-TRIAGE); the checkout-time review-mode entry path in reviewManager is a separate hotspot worth the same treatment.
- Fork target: `src/view/reviewManager.ts`, `src/view/prChangesTreeDataProvider.ts`

**U-C065 [XS] [partial] A11y label for Title/Description fields in create-PR view (#7595)** (rel 0.120.0)

- Adds visual/accessible labels to the create-PR title and description inputs.
- Fork target: `src/view/quickpick.ts`
- Notes: Fork has no create-PR webview yet (create flow is quickpick-based); this rides along only if the create-PR view (0.23-0.134, other chunk) is ported.

**U-C066 [M] [portable] Commit links open in multi-diff editor instead of browser** (rel 0.116.0 #7217)

- Commit links in the PR description open VS Code's multi-diff editor rather than the web (upstream #7217).
- Upstream key files: `src/common/uri.ts`, `src/github/pullRequestModel.ts`, `src/github/pullRequestOverview.ts`, `webviews/components/timeline.tsx`, `src/view/treeNodes/commitNode.ts`
- Fork target: `src/common/uri.ts`, `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/timeline.tsx`, `src/view/treeNodes/commitNode.ts`
- Vs scoping doc: Scoping lists multi-diff editor (0.80) as the base; added: this 0.116 commit-link entry point (commit 00553541) is a discrete follow-on that plugs into the fork's existing getCommitDiffs pagination.

**U-C067 [S] [portable] Pre-fetch PR changes when description opens** (rel 0.116.0)

- Kick off the changed-files fetch as soon as the PR description webview opens so the diff view is warm.
- Fork target: `src/azdo/pullRequestOverview.ts`, `src/azdo/pullRequestModel.ts`
- Vs scoping doc: Scoping lists 'diff pre-fetch (0.54, 0.116)'; added: fork's paginated getCommitDiffs (pullRequestModel.ts:632) is the exact hook point, making this cheap.

**U-C068 [XS] [portable] Create PR error when a previous PR existed on the branch (#7018)** (rel 0.116.0)

- Fix create-PR flow erroring if the branch previously had a (closed/merged) PR.
- Fork target: `src/azdo/folderRepositoryManager.ts`, `src/view/quickpick.ts`

**U-C069 [M] [portable] Description webview robustness fixes (timeline/comments state)** (rel 0.116.0-0.122.0)

- Comment-edit freeze (#274455), empty-comment weird state (#7476), unassign-removes-comments (#7218), assignee-change hides timeline (#7012), timeline timestamps updating periodically (#7006), pr.openDescription error (#253900).
- Fork target: `webviews/common/context.tsx`, `webviews/components/timeline.tsx`, `webviews/components/timestamp.tsx`
- Notes: All in shared webview state/render code the fork retains; port as a batch alongside any timeline.tsx work.

### 3.D Releases 0.114-0.104

**U-D070 [XS] [portable] Duplicate tree-view id registration fixes** (rel 0.110.0-0.114.1 #7264, #6615)

- Fixes 'Element with id Local Pull Request Branches / All Open is already registered' crashes when query category nodes register twice (#6615, #7264).
- Fork target: `src/view/prsTreeDataProvider.ts`, `src/view/treeNodes/categoryNode.ts`

**U-D071 [S] [partial] Open description instead of empty diff when PR has no changes** (rel 0.114.0)

- When a checked-out PR has no diff from the parent branch, open the description instead of an empty multi-diff/first-diff view.
- ADO mapping: Depends on the focusedMode/multiDiff feature - fork has no focusedMode setting (verified package.json), so this is an edge case of the multi-diff port.
- Fork target: `src/view/reviewManager.ts`, `package.json`
- Vs scoping doc: Rides on multi-diff editor (0.80) item; ADDED: this empty-diff edge case and the fork's missing focusedMode prerequisite.

**U-D072 [XS] [portable] Comment webview polish fixes** (rel 0.114.0 #7200, #7185, #7007)

- Empty pending-comment box after submit (#7200), stop using comment icon for quote (#7185), timestamp display consistency (#7007). All in shared webview components.
- Fork target: `webviews/components/comment.tsx`, `webviews/components/timestamp.tsx`

**U-D073 [XS] [portable] PR view lazy expansion - stop always fetching All Open** (rel 0.114.0 #7150)

- The PR tree no longer force-expands and fetches the All Open category on every activation (#7150).
- Fork target: `src/view/prsTreeDataProvider.ts`, `src/view/treeNodes/categoryNode.ts`

**U-D074 [S] [portable] Fix checking out a local pull request branch** (rel 0.114.0 #6994)

- Checkout of a PR whose branch already exists locally failed (#6994); fix is in branch-metadata/checkout plumbing shared with the fork.
- Fork target: `src/azdo/pullRequestGitHelper.ts`, `src/commands.ts`

**U-D075 [S] [portable] Authenticated images in private-repo file comments** (rel 0.112.0)

- Render images embedded in PR file comments by fetching them with credentials instead of showing broken links.
- ADO mapping: ADO PR attachments + authenticated media; fork already has the authenticated-fetch pattern in avatarCache.ts to generalize.
- Fork target: `src/azdo/avatarCache.ts`, `src/azdo/prComment.ts`, `webviews/components/comment.tsx`

**U-D076 [S] [partial] PR links in timeline and description open inside VS Code** (rel 0.112.0)

- Issue and PR links in the timeline and body open the extension's webview instead of the browser.
- ADO mapping: PR-link half is portable (open PR description by ID); issue-link half maps to work items.
- Fork target: `webviews/components/timeline.tsx`, `src/azdo/utils.ts`, `src/commands.ts`

**U-D077 [M] [partial] PR queries overhaul: global queries, today variable, removable built-in queries** (rel 0.104.0-0.112.0)

- Queries gained org/repo global scope and a ${today-Nd} variable (0.104); built-in Local Branches/All Open queries became removable via the queries setting and Assigned to Me was dropped (0.112).
- ADO mapping: GitHub search syntax doesn't map. ADO = GitPullRequestSearchCriteria (creatorId/reviewerId/status/refs) in node-api 10.2.2; date filtering needs raw REST searchCriteria.minTime/maxTime/queryTimeRangeType (GET .../git/pullrequests?api-version=7.1). Fork currently has NO queries setting at all (verified package.json).
- Fork target: `package.json`, `src/view/prsTreeDataProvider.ts`, `src/azdo/azdoRepository.ts`

**U-D078 [XS] [portable] Stop associating closed PRs with new same-name branches** (rel 0.112.0 #6711)

- Branch metadata no longer re-links a recreated branch to a previously closed PR of the same name (#6711).
- Fork target: `src/azdo/pullRequestGitHelper.ts`

**U-D079 [XS] [portable] Fix stale PR diff content** (rel 0.112.0 #6889 (fix #6931))

- PR diff no longer shows outdated content after new pushes (#6889).
- Upstream key files: `src/view/gitHubContentProvider.ts`
- Fork target: `src/view/gitContentProvider.ts`

**U-D080 [L] [portable] #activePullRequest LM chat tool** (rel 0.110.0 #6859, #7080)

- Registers a language-model tool giving Copilot chat the active PR's metadata, comments, and later changed files. Coding-agent context additions (0.114) excluded as not-portable.
- ADO mapping: vscode.lm.registerTool with ADO PR data; engine ^1.97 satisfies the LM API requirement.
- Upstream key files: `src/lm/tools/activePullRequestTool.ts`
- Fork target: `package.json`, `src/azdo/pullRequestModel.ts`, `src/azdo/folderRepositoryManager.ts`
- Vs scoping doc: Doc lists LM/chat tools 0.110-0.136; ADDED: base tool lands at 0.110, upstream lives in src/lm/tools/activePullRequestTool.ts (dir the fork lacks entirely).

**U-D081 [S] [portable] Warn before creating a PR when branch already has one** (rel 0.110.0)

- Create-PR flow warns if an open PR already exists for the source branch.
- ADO mapping: GitApi.getPullRequests with searchCriteria.sourceRefName - available in node-api 10.2.2.
- Fork target: `src/view/reviewManager.ts`, `src/azdo/azdoRepository.ts`

**U-D082 [XS] [portable] Auto-refresh PR webview every 60s when active tab** (rel 0.110.0)

- Description webview polls for updates every 60 seconds while it is the active tab.
- Fork target: `src/azdo/pullRequestOverview.ts`

**U-D083 [S] [partial] Comment reactions shown read-only in PR webview** (rel 0.110.0)

- Reactions on comments are displayed (read-only) in the description webview.
- ADO mapping: ADO analog = comment likes (usersLiked on thread comments; POST .../threads/{t}/comments/{c}/likes api-version=7.1 to write).
- Fork target: `webviews/components/comment.tsx`, `src/azdo/prComment.ts`

**U-D084 [XS] [portable] Fix delete-branch-after-squash broken since VS Code 1.98** (rel 0.110.0 #6699)

- Post-merge local branch deletion failed after a VS Code git extension change (#6699); directly relevant since the fork targets engine ^1.97.
- Fork target: `src/commands.ts`, `src/azdo/folderRepositoryManager.ts`

**U-D085 [XS] [portable] Fix comments sometimes not resolvable** (rel 0.110.0 #6702)

- Thread resolution intermittently unavailable on some comment threads (#6702).
- Fork target: `src/view/pullRequestCommentController.ts`

**U-D086 [S] [portable] Custom instructions for AI PR title/description generation** (rel 0.106.0)

- Setting (inline text or workspace file) that feeds custom instructions into AI-generated PR titles/descriptions.
- Fork target: `package.json`, `src/view/reviewManager.ts`
- Vs scoping doc: Doc lists AI PR title/description 0.76/0.106/0.126; ADDED: the 0.106 piece is specifically the instructions setting, S once the base generation (0.76) is ported.

**U-D087 [S] [portable] Emoji shortcode rendering (:name:) in comments** (rel 0.104.0 #6536)

- Renders :emoji-name: shortcodes in comment bodies via a bundled emoji table.
- Upstream key files: `resources/emojis.json`, `src/common/emoji.ts`, `src/github/prComment.ts`
- Fork target: `src/azdo/prComment.ts`, `webviews/components/comment.tsx`
- Vs scoping doc: Doc lists 'emoji completions'; ADDED: 0.104 is shortcode RENDERING (commit f52c69da) - completions came later; key files pinned.

**U-D088 [XS] [portable] ctrl+F find widget in description webview** (rel 0.104.0)

- Enables the webview find widget in the PR description panel.
- Upstream key files: `src/github/issueOverview.ts`
- Fork target: `src/azdo/pullRequestOverview.ts`
- Vs scoping doc: Doc lists it; ADDED: it's just the enableFindWidget webview option (verified upstream) - downgrade to XS, fork's pullRequestOverview.ts lacks the flag.

**U-D089 [S] [portable] Multi-select viewed-checkbox toggle in Changes view** (rel 0.104.0)

- Multi-select files in Changes in Pull Request and toggle all their viewed checkboxes with one click.
- Fork target: `src/view/prChangesTreeDataProvider.ts`, `src/view/treeNodes/fileChangeNode.ts`, `src/azdo/fileReviewedStatusService.ts`
- Vs scoping doc: Doc lists viewed checkboxes 0.38-0.52; ADDED: the 0.104 multi-select batch-toggle increment.

**U-D090 [M] [portable] Comments view shows PR comments without checkout** (rel 0.104.0 #6571 (fix #6573))

- All non-outdated PR comments appear in the Comments view when the description is open, even without checkout, and hide when related files close. Includes the #6571 close/reopen regression fix.
- Upstream key files: `src/view/pullRequestCommentController.ts`
- Fork target: `src/view/pullRequestCommentController.ts`, `src/view/commentThreadCache.ts`

**U-D091 [S] [portable] Changes-view and description-tab UX polish** (rel 0.104.0)

- Context-menu cleanup, PR icon on the description editor tab, eye-icon shortcut to toggle editor commenting, respect git.showInlineOpenFileAction, and a new Copy Pull Request Link command (absent from fork - verified command list).
- Fork target: `package.json`, `src/commands.ts`, `src/view/prChangesTreeDataProvider.ts`, `src/azdo/pullRequestOverview.ts`

**U-D092 [S] [partial] Create-PR view data fixes (non-base-branch diff, cleared form data)** (rel 0.104.0 #5545 (fixes #6559/#5546), #6114 (fix #6545))

- Files-changed now reflects a non-base target branch (#5545) and the Create Pull Request command no longer clears entered data (#6114).
- ADO mapping: Both fixes land in createPullRequestDataModel/Helper, which the fork doesn't have - they only apply after the create-PR view port (scoping 0.23->0.70->0.134).
- Upstream key files: `src/view/createPullRequestDataModel.ts`, `src/view/createPullRequestHelper.ts`

**U-D093 [S] [portable] Webview a11y fixes (focus visibility, keyboard access, focus order, NVDA announcements)** (rel 0.104.0 #6449 (fix #6583), #6450, #6451, #6453)

- Accessibility fixes #6449-#6453 in shared webview CSS/components: visible focus on cancel, keyboard access to Reviewers/Labels/Milestone controls, focus order, show/hide announcements.
- Upstream key files: `webviews/common/common.css`
- Fork target: `webviews/common/common.css`, `webviews/components/sidebar.tsx`
- Vs scoping doc: Doc lists a11y pass 0.74/0.88; ADDED: 0.104 shipped a further batch, mostly pure CSS in webviews/common.

**U-D094 [S] [partial] Suggestion fixes: clarity, local-change offset, first-line silent failure** (rel 0.104.0 #6040, #6495, #6603)

- Clearer 'Make a Suggestion' affordance (#6040), suggestions offset by one line when local changes exist (#6495), and suggestions on line 1 silently failing (#6603).
- ADO mapping: Fork already anchors comments to real selection offsets (commit 6c5ae8ff per docs/fork/ISSUE-TRIAGE.md) but the local-change shift and first-line cases in suggestDiff are unverified.
- Fork target: `src/commands.ts`, `src/common/commentingRanges.ts`
- Vs scoping doc: Doc lists suggest-a-change (0.58); ADDED: these three 0.104 bugfixes on top of it.

**U-D095 [XS] [portable] Fix infinite fetch loop when proxy unavailable** (rel 0.104.0 #6063 (fix #6568))

- PR category fetch retried in an infinite loop on network/proxy failure (#6063).
- Upstream key files: `src/view/treeNodes/categoryNode.ts`
- Fork target: `src/view/treeNodes/categoryNode.ts`

**U-D096 [XS] [partial] Fix Go to Next Diff in Pull Request error** (rel 0.104.0)

- Next Diff command failed with an error (#6237).
- ADO mapping: Rides on the Next Diff command port (scoping 0.56) - no fork surface yet.
- Vs scoping doc: Doc lists Next Diff (0.56); ADDED: fold this 0.104 fix into that port.

**U-D097 [XS] [partial] Fix file-level comment on renamed file** (rel 0.104.0)

- Error when adding a file comment to a renamed file with no other changes (#6516).
- ADO mapping: Rides on the file-level comments port (scoping 0.64).
- Vs scoping doc: Doc lists file-level comments (0.64); ADDED: this rename edge-case fix belongs to that port.

**U-D098 [S] [portable] Fix commenting on hunks in large diffs** (rel 0.104.0 #6524 (fix #6574))

- Comments could not be left on hunks in large diffs (#6524); fix is in shared diff-hunk parsing the fork still carries.
- Upstream key files: `src/common/diffHunk.ts`, `src/common/file.ts`, `src/view/fileChangeModel.ts`
- Fork target: `src/common/diffHunk.ts`, `src/common/file.ts`, `src/view/treeNodes/fileChangeNode.ts`

**U-D099 [XS] [portable] Ignore non-provider submodule remotes during auth** (rel 0.104.0 #6140)

- Non-GitHub submodule remotes caused authentication failure (#6140); fork analog is skipping non-ADO remotes in submodule repos.
- Fork target: `src/azdo/folderRepositoryManager.ts`, `src/azdo/remoteUrlParser.ts`

### 3.E Releases 0.102-0.92

**U-E100 [S] [portable] Close All Pull Request Editors command** (rel 0.102.0 #6459)

- One command closes every PR-related diff editor and original-file editor by matching open tab URIs against extension schemes. Provider-neutral tab bookkeeping.
- Upstream key files: `src/commands.ts`, `package.json`, `package.nls.json`
- Fork target: `src/commands.ts`, `package.json`
- Notes: Upstream commit 71050cfe touches only commands.ts + manifest; fork schemes (pr/review/filechange) map 1:1.

**U-E101 [M] [portable] Suggestion comments: create from working-tree changes (SCM + editor context) + follow-up fix train** (rel 0.96.0-0.102.0 #6153, #6155, #6180, #6185, #6186, #6187, #6201, #6202, #6205, #6195, #6494)

- Convert local changes on a checked-out PR into suggestion comments from the SCM view or diff-editor context menu. Nine follow-up fixes span 0.96-0.102 (discoverability #6180, expand-by-default #6185, wording #6186/#6201, apply improvements #6187/#6205, duplicate-suggestion guard #6195, unsubmittable pending state #6494).
- Upstream key files: `src/commands.ts`, `src/view/reviewCommentController.ts`, `src/view/reviewManager.ts`
- Fork target: `src/commands.ts`, `src/view/reviewCommentController.ts`, `src/view/reviewManager.ts`
- Vs scoping doc: Doc lists local-changes-to-suggestion (0.96). ADDED: key commits cb343dce/328512e4, the full 0.96-0.102 fix train to port together, and that the fork already renders ```diff comment bodies with an Apply Patch button (webviews/components/comment.tsx:279) so the suggestion wire format can reuse it; depends on porting suggest-a-change (0.58) first.
- Notes: Port as one unit with the fixes; porting 0.96 without the fix train re-introduces known bugs. Size M assumes 0.58 suggest-a-change lands first.

**U-E102 [S] [portable] Comments not possible to save within a submodule** (rel 0.102.0 #6424)

- Fixes comment handler resolution so commenting works when the workspace file lives in a git submodule of the PR repo.
- Upstream key files: `src/commentHandlerResolver.ts`, `src/view/pullRequestCommentController.ts`, `src/view/reviewCommentController.ts`
- Fork target: `src/commentHandlerResolver.ts`, `src/view/pullRequestCommentController.ts`, `src/view/reviewCommentController.ts`
- Notes: Commit 84d958ff touches exactly three files and all three exist at identical paths in the fork - one of the cheapest correctness ports in this slice.

**U-E103 [XS] [portable] PR creation flow smoothness regression fix** (rel 0.102.0 #6386)

- Restores the fast path in the create-PR flow that a prior refactor broke (#6386).
- Fork target: `src/view/reviewManager.ts`
- Vs scoping doc: Rides along with the create-PR view evolution item (0.23->0.70->0.134) already in the doc; only relevant if that port happens.
- Notes: Fork's create-PR entry point is reviewManager-driven, older than upstream's createPRViewProvider.

**U-E104 [XS] [portable] PR description view buttons overflow in narrow viewports** (rel 0.102.0)

- CSS fix so action buttons wrap instead of overflowing in narrow webview panes (#6335).
- Fork target: `webviews/editorWebview/index.css`, `webviews/components`
- Notes: Pure webview CSS; fork shares the same layout lineage.

**U-E105 [S] [partial] Show PRs from a fork targeting main branch** (rel 0.100.0 #6313)

- Fixes reviewManager so a checked-out PR whose head is in a fork is associated and displayed correctly (#6267).
- ADO mapping: ADO fork PRs carry forkSource on GitPullRequest; the fork extension does not model ADO repo forks at all today, so the fix only lands as part of adding fork-PR support.
- Upstream key files: `src/view/reviewManager.ts`
- Fork target: `src/view/reviewManager.ts`
- Notes: Partial: single-file fix upstream, but prerequisite fork-awareness in azdoRepository/folderRepositoryManager is the real cost.

**U-E106 [XS] [portable] Refreshing a PR also refreshes its comments** (rel 0.100.0 #6257)

- Refresh command now re-fetches comment threads, not just PR metadata (#6252).
- Upstream key files: `src/commands.ts`, `src/github/activityBarViewProvider.ts`
- Fork target: `src/commands.ts`, `src/azdo/activityBarViewProvider.ts`
- Notes: Fork has the same two files; ADO thread re-fetch already exists on pullRequestModel.

**U-E107 [XS] [portable] Review submission UI state fixes (disable buttons while submitting; tree node updates on new review)** (rel 0.100.0)

- Disables summary review buttons during submission (#6261) and refreshes the PR tree node when a review is added (#6251).
- ADO mapping: GitHub review submit -> ADO vote submit; same UI states apply.
- Fork target: `webviews/components/sidebar.tsx`, `src/view/prsTreeDataProvider.ts`
- Notes: Both are small state-plumbing fixes in code the fork shares.

**U-E108 [XS] [portable] Viewed-checkbox correctness fixes (parent-node update, checkbox 'Simon Says' flicker)** (rel 0.100.0)

- markFileAsViewed now updates folder parent nodes (#6248) and checkbox state no longer flip-flops (#3972).
- Fork target: `src/azdo/fileReviewedStatusService.ts`, `src/view/fileViewedDecorationProvider.ts`, `src/commands.ts`
- Vs scoping doc: Doc lists viewed-file checkboxes incl. folders (0.38-0.52). ADDED: these two 0.100 regressions must ship with that port; fork already has path-keyed viewed state and its own collision fixes (ISSUE-TRIAGE #95/#103, commit 8f3e4b16) so only the folder-checkbox layer is missing.
- Notes: Fork's viewed state exists but has no tree checkboxes yet - these fixes apply to the checkbox layer when ported.

**U-E109 [XS] [portable] Allow approve/reject while extension is in draft-review mode** (rel 0.98.0)

- Voting actions are no longer blocked when the user has a pending draft review (#6174).
- ADO mapping: ADO votes are independent of comment submission and ADO allows voting on draft PRs, so the gating logic simplifies.
- Fork target: `src/azdo/pullRequestOverview.ts`, `webviews/components/sidebar.tsx`
- Notes: Relevant once the cancel-review/pending-review UX (0.122, scoped separately) exists in the fork.

**U-E110 [XS] [portable] Untracked files missing green text decoration in changes view** (rel 0.98.0)

- Untracked files in the PR changes tree get the standard green 'untracked' color decoration.
- Fork target: `src/view/fileTypeDecorationProvider.ts`, `src/view/treeDecorationProvider.ts`
- Notes: Fork already ported git-status colors (0.34 per scoping doc); this is a gap-fix in the same provider.

**U-E111 [XS] [portable] Outdated-comment and Diff-with-HEAD fixes** (rel 0.98.0)

- Suppresses the spurious 'We couldn't find commit' error on outdated comments (#1691) and stops the Diff with HEAD button disappearing in the Comments view (#6157).
- Fork target: `src/view/reviewCommentController.ts`, `src/view/commentThreadCache.ts`
- Vs scoping doc: Doc lists outdated-comment badges + Diff with HEAD (0.86). ADDED: these two 0.98 bugfixes should be folded into that port as a unit.
- Notes: ADO threads natively track iteration context, which makes 'outdated' detection cheaper than upstream's commit lookup.

**U-E112 [XS] [portable] Webview 'Element with id already registered' error** (rel 0.98.0)

- Guards duplicate element registration in the PR description webview (#6218).
- Fork target: `webviews/editorWebview`, `webviews/components`
- Notes: Shared webview code lineage.

**U-E113 [XS] [partial] Quote reply fix** (rel 0.98.0)

- Community fix to the quote-reply action (#6230).
- Fork target: `webviews/components/comment.tsx`
- Notes: Grep finds no quote-reply command in the fork at all - the feature was apparently dropped in the ADO rewrite, so this fix only applies if quote reply is (re)added.

**U-E114 [XS] [portable] Use editor font for diffs and code blocks in webviews** (rel 0.96.0)

- Diff hunks and code blocks in the description webview use --vscode-editor-font-family (#6146, PRs #6148/#6149).
- Fork target: `webviews/editorWebview/index.css`
- Notes: CSS-only.

**U-E115 [XS] [portable] Sort shorter paths to the top of the changes tree** (rel 0.96.0)

- Directory/file ordering fix so shallower paths sort first (#6143).
- Fork target: `src/view/prChangesTreeDataProvider.ts`, `src/view/treeNodes/directoryTreeNode.ts`
- Notes: Pure comparator change in shared tree code.

**U-E116 [XS] [portable] git config branch.<name>.pr-owner-number error fix** (rel 0.96.0)

- Handles the error path when reading/writing the per-branch PR metadata git config key (#6134).
- Fork target: `src/azdo/pullRequestGitHelper.ts`
- Notes: Fork uses the same branch-metadata-in-git-config pattern with azdo-prefixed keys.

**U-E117 [XS] [portable] Respect accessibility.underlineLinks in webviews** (rel 0.96.0)

- Webview links honor the underlineLinks accessibility setting (#6122).
- Fork target: `webviews/editorWebview/index.css`
- Vs scoping doc: Doc lists a11y pass (0.74, 0.88). ADDED: this specific 0.96 setting fix as a concrete line item within that pass.
- Notes: CSS/setting plumbing only.

**U-E118 [S] [partial] Create revert PRs from the PR description** (rel 0.94.0 #6097, #6103, #6107, #6113, #6118)

- Revert button on merged PRs opens a create-revert-PR flow without needing the branch checked out. Upstream built a dedicated revertPRViewProvider on top of the create-PR webview.
- ADO mapping: ADO has a first-class Reverts API - GitApi.createRevert/getRevert are present in the bundled azure-devops-node-api 10.2.2 (GitApi.d.ts lines ~127-135) - which creates the revert branch server-side, so the fork skips upstream's client-side revert plumbing and just calls createRevert then createPullRequest.
- Upstream key files: `src/github/revertPRViewProvider.ts`, `src/github/createPRViewProvider.ts`, `src/github/pullRequestOverview.ts`, `src/github/folderRepositoryManager.ts`
- Fork target: `src/azdo/pullRequestOverview.ts`, `src/azdo/folderRepositoryManager.ts`, `src/view/reviewManager.ts`
- Notes: ADO-native revert makes this substantially simpler than upstream's implementation; main cost is the button + polling the async revert operation. RECLASSIFIED per critic: build on ADO native createRevert (REST-10) instead of porting the client-side flow; S not M.

**U-E119 [S] [portable] Show PRs whose source branch was deleted** (rel 0.94.0 #6101)

- PRs with a deleted head branch appear in the Pull Requests view instead of being filtered out (#6101).
- Upstream key files: `src/github/folderRepositoryManager.ts`, `src/view/treeNodes/pullRequestNode.ts`, `src/view/treeNodes/descriptionNode.ts`, `src/view/reviewManager.ts`
- Fork target: `src/azdo/folderRepositoryManager.ts`, `src/view/treeNodes/pullRequestNode.ts`, `src/view/treeNodes/descriptionNode.ts`
- Notes: ADO already returns such PRs from the list API; the work is removing fork-side assumptions that sourceRefName resolves to a live ref.

**U-E120 [XS] [portable] Open PR on web action shows with multiple checked-out repos** (rel 0.94.0)

- The 'Open Pull Request on GitHub.com' action on the description node works when PRs from multiple repos are checked out (#6020).
- ADO mapping: Opens the dev.azure.com PR URL instead.
- Fork target: `src/view/treeNodes/descriptionNode.ts`, `src/commands.ts`
- Notes: Fork is multi-project already, so multi-repo correctness here matters more than upstream.

**U-E121 [S] [partial] Images in comments and descriptions (img tags render; renamed-picture load error)** (rel 0.92.0-0.94.0)

- 0.94 made img tags in code comments render for public repos; 0.92 fixed an image load error on renamed pictures (#6008).
- ADO mapping: ADO comment/description images are attachments behind auth - the 'public repo' shortcut never applies; every image needs the authenticated-fetch-to-data-URI pattern the fork already built for avatars (avatarCache.ts).
- Fork target: `src/azdo/avatarCache.ts`, `webviews/components/comment.tsx`
- Notes: Partial because upstream's fix relies on unauthenticated public URLs; the fork needs the authenticated variant for all images.

**U-E122 [XS] [portable] Branch/remote deletion robustness (git failure fix + progress notification)** (rel 0.94.0)

- Fixes 'Failed to execute git' when deleting branches and remotes (#6051) and shows notification progress during deletion (#6050).
- Fork target: `src/azdo/folderRepositoryManager.ts`
- Notes: Distinct from the scoped auto-delete-branch (0.126) and worktree-cleanup (0.136) items; this hardens the deletion path they all share.

**U-E123 [S] [portable] File can't be opened, redirects to browser** (rel 0.94.0 #6086)

- Fixes PR file URIs failing to resolve in-editor (falling back to opening the browser) by correcting content-provider and diff-hunk path handling (#5827).
- Upstream key files: `src/common/diffHunk.ts`, `src/view/inMemPRContentProvider.ts`, `src/view/gitHubContentProvider.ts`, `src/github/pullRequestModel.ts`, `src/view/fileChangeModel.ts`
- Fork target: `src/common/diffHunk.ts`, `src/view/inMemPRContentProvider.ts`, `src/view/gitContentProvider.ts`, `src/azdo/pullRequestModel.ts`
- Notes: Fork has no fileChangeModel.ts (that refactor postdates the fork point) - equivalent logic lives in fileChangeNode, so the port needs light adaptation.

**U-E124 [XS] [portable] Dates shown in the Commits subtree** (rel 0.92.0)

- Commit nodes for checked-out PRs display the commit date.
- Fork target: `src/view/treeNodes/commitNode.ts`
- Notes: ADO GitCommitRef already carries author.date; description-field change only.

**U-E125 [XS] [portable] Don't request commenting ranges for files deleted in the PR** (rel 0.92.0)

- Stops the commenting-range provider from being invoked on files the PR deleted (#6046).
- Fork target: `src/view/pullRequestCommentingRangeProvider.ts`, `src/common/commentingRanges.ts`
- Notes: Both files exist in the fork at the same paths.

**U-E126 [XS] [portable] AI-generated PR title surrounded by quotes** (rel 0.92.0)

- Strips wrapping quotes from LLM-generated PR titles (#6002).
- Fork target: `src/view/reviewManager.ts`
- Vs scoping doc: Doc lists AI PR title/description (0.76, 0.106, 0.126). ADDED: this output-sanitization fix must ship with that port - it is a one-line post-processing guard.
- Notes: Contingent on the AI title feature existing in the fork.

**U-E127 [XS] [portable] Unresolve comment moves focus to the thread** (rel 0.92.0)

- After unresolving a comment thread, focus lands on the reopened thread (#5973).
- ADO mapping: Resolve/unresolve maps to ADO thread status active/fixed - already first-class in the fork's thread model.
- Fork target: `webviews/components/comment.tsx`, `src/azdo/pullRequestOverview.ts`

**U-E128 [XS] [portable] Gift icon replaced (confusing iconography)** (rel 0.100.0)

- Swaps a confusing gift codicon for a clearer one; commit 1f2feb77 changes package.json only (#6289).
- Fork target: `package.json`
- Notes: Only applies if the fork adopts the command that carries the icon; near-zero cost either way.

### 3.F Releases 0.90-0.80

**U-F129 [XL] [partial] Update branch + merge-conflict resolution suite (merge base into PR, resolve conflicts from description, non-checked-out experimental mode)** (rel 0.80.0-0.90.0 #5618, #5858, #5702)

- 0.80: merge base into a checked-out PR branch from the description, resolve conflicts via the VS Code merge editor, and pullPullRequestBranchBeforeCheckout options to auto-fetch/merge base at checkout; 0.88 adds experimental conflict resolution for non-checked-out PRs (hidden setting); fixes: update-button stays after merge (0.82 #5661), actionable conflicts hint (0.90 #5942).
- ADO mapping: ADO has a native PR Conflicts API - azure-devops-node-api 10.2.2 already exposes getPullRequestConflicts / updatePullRequestConflict(s) on GitApi - so the non-checked-out path can submit resolutions server-side instead of upstream's client-side coordinator; 'update branch' has no ADO server API, must be local git merge+push.
- Upstream key files: `src/github/conflictGuide.ts`, `src/github/conflictResolutionCoordinator.ts`, `src/github/conflictResolutionModel.ts`, `src/view/conflictResolution/conflictResolutionTreeView.ts`, `src/github/pullRequestOverview.ts`, `webviews/components/merge.tsx`, `src/@types/vscode.proposed.tabInputTextMerge.d.ts`
- Fork target: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `src/azdo/folderRepositoryManager.ts`, `src/azdo/interface.ts`, `webviews/components/merge.tsx`, `src/view/treeNodes/fileChangeNode.ts`
- Vs scoping doc: Scoping doc lists 'conflict resolution from description (0.80, 0.88)'. Added: exact upstream key files, the 0.82/0.90 follow-up fixes, the pullPullRequestBranchBeforeCheckout auto-merge options, and the finding that ADO's conflicts API (already in the vendored node-api 10.2.2) can replace the client-side resolution coordinator for the non-checked-out case.
- Notes: Checked-out path (merge editor) is provider-neutral and portable as-is; the GraphQL updateBranch mutation has no ADO equivalent. Split candidate: ship checked-out resolution (L) before ADO-native server-side resolution.

**U-F130 [M] [portable] Multi-diff focused mode (focusedMode: multiDiff opens all PR files in multi-diff editor on checkout)** (rel 0.80.0 #5465)

- New 'multiDiff' value for githubPullRequests.focusedMode opens the multi-diff editor with every file in the PR at checkout time.
- Upstream key files: `package.json`, `src/commands.ts`, `src/github/pullRequestModel.ts`, `src/view/reviewManager.ts`
- Fork target: `src/view/reviewManager.ts`, `src/azdo/pullRequestModel.ts`, `src/commands.ts`, `package.json`
- Vs scoping doc: Scoping doc lists 'multi-diff editor (0.80)'. Added: the concrete setting name/value, the four upstream files (small change - mostly building resource lists for vscode.changes command), and that fork's getCommitDiffs pagination already supplies the file list.
- Notes: vscode ^1.97 engine already supports the stable multi-diff API. Pairs naturally with the fork's existing Open All Diffs backlog item.

**U-F131 [M] [portable] Comments view UX: outdated-comment badges, inline + context-menu actions, Diff Comment with HEAD, auto-cleanup of closed-file comments** (rel 0.80.0-0.86.0 #5818)

- Outdated comments get a badge in the built-in Comments view; threads gain inline actions and a context menu including 'Diff Comment with HEAD' for outdated comments; comments for non-checked-out PRs are removed from the view when no PR files are open (#5619).
- ADO mapping: Outdatedness in ADO = thread iterationContext/trackingCriteria vs latest iteration - first-class, no commit-walking heuristics needed.
- Upstream key files: `src/commands.ts`, `src/github/utils.ts`, `package.json`, `package.nls.json`
- Fork target: `src/commands.ts`, `src/azdo/utils.ts`, `src/view/commentThreadCache.ts`, `package.json`
- Vs scoping doc: Scoping doc lists 'outdated-comment badges + Diff with HEAD (0.86)'. Added: upstream implementation is thin (command/menu contributions + utils, PR #5818 touches only 4 files), the 0.80 #5619 cleanup fix belongs to the same surface, and the ADO iteration-context mapping that makes outdated detection cheaper than upstream's.

**U-F132 [M] [partial] Create-PR flow: default base branch settings (createDefaultBaseBranch incl. 'auto' for forks) + create-view fixes** (rel 0.80.0-0.86.1 #5860)

- Setting to pick the default base branch when creating a PR (branch-created-from, repositoryDefault, or 0.86 'auto' = upstream default for forks); default title/description skip merge commits; fixes: createDraft default option (#5584), viewlet clearing on base change (#5878), fork default-branch selection (#5470), SCM-title action in Remote windows (#3911).
- ADO mapping: ADO forks exist but are rarer; 'auto' maps to parent-repo defaultBranch via GitApi. Draft default maps to ADO draft PRs (native).
- Upstream key files: `src/github/createPRViewProviderNew.ts`, `src/common/settingKeys.ts`
- Fork target: `src/view/reviewManager.ts`, `src/view/quickpick.ts`, `src/azdo/folderRepositoryManager.ts`, `package.json`
- Vs scoping doc: Scoping doc lists 'create-PR view evolution (0.23->0.70->0.134)'. Added: the base-branch defaulting settings and the six concrete 0.80-0.86.1 fixes that ride on it; partial because the fork is still on the pre-createPRViewProviderNew create UX - these land as part of that port, not standalone.
- Notes: Merge-commit-skipping for default title is independently portable at XS if the create-view port is deferred.

**U-F133 [S] [portable] Auto-populate labels on created PRs (labelCreated setting)** (rel 0.82.0 #5679)

- githubPullRequests.labelCreated configures labels automatically added to every PR created from the extension.
- ADO mapping: ADO PR labels (tags) - GitApi.createPullRequestLabel exists in vendored azure-devops-node-api 10.2.2.
- Upstream key files: `src/common/settingKeys.ts`, `src/github/createPRViewProviderNew.ts`, `package.json`
- Fork target: `src/azdo/pullRequestModel.ts`, `src/view/reviewManager.ts`, `package.json`
- Notes: Fork has no PR-label surface at all yet; this is a cheap first entry point for ADO tags.

**U-F134 [S] [partial] Reaction hover shows who reacted** (rel 0.80.0 #5567)

- Hovering a comment reaction lists the users who left it, via the commentReactor API.
- ADO mapping: ADO has only a single 'like' reaction, but GitApi.getLikes (in 10.2.2) returns the IdentityRef list - one reaction type instead of GitHub's emoji set.
- Upstream key files: `src/common/comment.ts`, `src/github/utils.ts`, `src/@types/vscode.proposed.commentReactor.d.ts`
- Fork target: `src/azdo/prComment.ts`, `src/view/pullRequestCommentController.ts`
- Notes: Only worth doing if/when the fork surfaces likes as a comment reaction at all - check whether reactions render today before scheduling.

**U-F135 [S] [partial] Open code permalinks from comments locally + copy-permalink reliability fixes** (rel 0.80.0 #5558)

- GitHub permalinks appearing in comments of a checked-out PR open the local file at the right line instead of the browser; also fixes first-copy-of-the-day permalink failures (#5185).
- ADO mapping: Parse dev.azure.com Git file URLs (?path=...&version=GB...&line=...) instead of github.com blob permalinks; fork's src/azdo/remoteUrlParser.ts is the natural home for the URL grammar.
- Upstream key files: `src/github/prComment.ts`
- Fork target: `src/azdo/prComment.ts`, `src/azdo/remoteUrlParser.ts`
- Notes: Scoping doc marks vscode.dev permalink _generation_ not-portable; this is the inverse (consuming web URLs), which is portable with an ADO URL parser.

**U-F136 [XS] [portable] Command: Focus Pull Request Description Review Input** (rel 0.90.0)

- New command scrolls the PR description webview to the final comment box and focuses it - keyboard/a11y affordance.
- Fork target: `package.json`, `src/azdo/pullRequestOverview.ts`, `webviews/editorWebview/app.tsx`

**U-F137 [S] [portable] Markdown/description rendering fixes: @-mentions after backquote, links containing @, task-list checkboxes, leading whitespace, video previews** (rel 0.80.0-0.90.0 #5987, #5984)

- Bundle of rendering correctness fixes in shared comment/description markdown handling: #5965 (@ after backquote wrongly converted), #5924 (URLs with @ mangled), #5310 (task-list checkboxes not rendered), #5780 (trim leading whitespace), plus 0.82's video previews in descriptions.
- Upstream key files: `src/common/user.ts`, `src/github/prComment.ts`
- Fork target: `webviews/components/comment.tsx`, `src/azdo/prComment.ts`, `src/azdo/utils.ts`
- Notes: The @-mention regexes are GitHub-login-shaped; ADO mentions use @<GUID> syntax so the port is an adaptation, not a copy. Video previews pair with the fork's authenticated avatarCache pattern for ADO attachment URLs.

**U-F138 [S] [portable] Comment widget polish: suggestion insert keybinding (ctrl+k m), suggestion visual distinction, edit flicker, un-resolve icon spacing** (rel 0.80.1-0.88.0)

- Keybinding to insert a suggestion block in the comment input (0.82), clearer styling for suggested changes (#5667), fix comment-edit flicker (#5762), and un-resolve icon spacing (#5868).
- ADO mapping: Un/resolve maps to ADO thread statuses (active/fixed); suggestion syntax is the fork's existing apply-suggestion mechanism.
- Fork target: `webviews/components/comment.tsx`, `src/view/pullRequestCommentController.ts`, `package.json`
- Vs scoping doc: Scoping doc lists suggest-a-change (0.58); added the 0.80.1-0.88 polish/keybinding layer on top, relevant because the fork already fixed apply-suggestion in triage.

**U-F139 [XS] [partial] Checks section visuals: pass/fail colors and max-height for the checks area** (rel 0.86.0-0.90.0)

- Colored check/X icons on the PR page (#5754) and a max height with scroll for the checks area (#5947).
- ADO mapping: Fork's equivalent surface is the branch-policy evaluations block already rendered in webviews/components/merge.tsx.
- Fork target: `webviews/components/merge.tsx`, `src/azdo/pullRequestOverview.ts`

**U-F140 [S] [portable] Description webview state fixes: scroll position preserved, Close PR button, loading indicator when switching descriptions** (rel 0.80.0-0.88.0 #5566)

- Scroll position maintained across webview refreshes (#1202 via upstream #5566), Close Pull Request button not working (#5598), and a loading indicator when switching between PR descriptions (#5954).
- Upstream key files: `src/github/issueOverview.ts`
- Fork target: `src/azdo/pullRequestOverview.ts`, `webviews/editorWebview/app.tsx`, `webviews/common/context.tsx`
- Notes: Scroll fix lands in the overview panel base class - fork's pullRequestOverview.ts descends from the same pre-fork lineage, so it should apply nearly verbatim. Close button maps to ADO abandon.

**U-F141 [S] [portable] Active Pull Request sidebar shows all review actions when space allows** (rel 0.88.0)

- The activity-bar Active PR view surfaces every review action button directly (instead of collapsing into a dropdown) when the view is wide enough.
- ADO mapping: Review actions = ADO votes (approve +10, approve w/ suggestions +5, wait for author -5, reject -10).
- Fork target: `src/azdo/activityBarViewProvider.ts`, `webviews/activityBarView/app.tsx`
- Notes: Upstream commit not located by grep (likely folded into a larger webview PR); responsive-layout change confined to the activity bar webview.

**U-F142 [M] [portable] Accessibility pass: help dialog, screen-reader alerts on review completion, semantic headings, narrator/expand state, high-contrast focus visibility** (rel 0.80.0-0.88.0 #5936)

- 0.88 adds an Accessibility Help dialog for the PR views (proposed contribAccessibilityHelpContent API); 0.80/0.82 fix alert announcements on review completion (#5526), semantic heading tags in webview comments (#5524), narrator expand/collapse announcements (#5483), high-contrast focus visibility (#5482, #5471), and redundant prefix info in the change view (#5705).
- Upstream key files: `package.json`, `package.nls.json`, `src/@types/vscode.proposed.contribAccessibilityHelpContent.d.ts`
- Fork target: `webviews/editorWebview/app.tsx`, `webviews/components/header.tsx`, `webviews/components/comment.tsx`, `package.json`
- Vs scoping doc: Scoping doc lists 'a11y pass (0.74, 0.88)'. Added: the 0.80/0.82 fix inventory (five concrete issues) and that the 0.88 help dialog rides a proposed API (contribAccessibilityHelpContent) the fork would need to adopt or skip.

**U-F143 [M] [portable] Tree robustness: multi-root ordering, collapse-on-refresh, checkbox latency, renamed files, added-files open as regular editor** (rel 0.80.0-0.88.0)

- PR tree order follows multi-root workspace order (#5789), open review trees no longer collapse on refresh (#5556), viewed-checkbox delayed reaction fixed (#5676), renamed files handled in change lists (#5767), and added files open in a plain editor instead of an empty-left diff (0.80).
- Fork target: `src/view/prsTreeDataProvider.ts`, `src/view/prChangesTreeDataProvider.ts`, `src/view/treeNodes/fileChangeNode.ts`, `src/view/fileViewedDecorationProvider.ts`
- Notes: Directly relevant: fork already shipped multi-project workspaces (ordering fix applies) and viewed-state checkboxes (latency fix applies). Rename handling maps to ADO VersionControlChangeType.Rename which the fork partially handles in pullRequestModel.ts.

**U-F144 [XS] [portable] Cache PR-template file searches ('Many ripgrep' fix)** (rel 0.88.0 #5937)

- Stops repeated workspace file searches (each spawning ripgrep) for PR template discovery by caching results in the repository manager (#5923).
- Upstream key files: `src/github/folderRepositoryManager.ts`, `src/github/githubRepository.ts`
- Fork target: `src/azdo/folderRepositoryManager.ts`, `src/azdo/azdoRepository.ts`
- Notes: Only relevant once the fork ports PR-template discovery (scoping doc: templates 0.126); fold into that work.

**U-F145 [S] [partial] Multi-root query-storm / rate-limit fixes** (rel 0.80.0)

- Fixes rate-limit error floods when opening multi-root workspaces or running non-default queries (#5496, #4351) by eliminating redundant per-folder API queries.
- ADO mapping: ADO throttles via 429/Retry-After rather than a rate-limit budget API; the redundant-query elimination is what ports, not the rate-limit plumbing.
- Fork target: `src/azdo/folderRepositoryManager.ts`, `src/view/prsTreeDataProvider.ts`
- Vs scoping doc: Scoping doc lists API-usage reduction (0.120, 0.142); this is an earlier 0.80 instance specific to multi-root - high value for the fork since multi-project workspaces are its headline feature.

### 3.G Releases 0.78-0.68

**U-G146 [XL] [partial] New Create-PR webview (guess base, reviewers/labels from view, remembered options, pre-publish diffs & commits, perf)** (rel 0.70.0-0.78.1 #4921, #4936, #5072, #5399, #5489, #5546)

- Upstream replaced the QuickPick create flow with a dedicated webview: best-guess base branch, add reviewers/assignees/labels/milestones inline, remember last create option (draft/auto-merge), view diffs and commits before publishing, faster field population (#5399), plus follow-up fixes (high-contrast arrow 0.78, multi-root PR template #5489, files-changed vs non-base branch #5546). Partial because assignees/milestones/projects are GitHub-only; ADO maps labels->tags, milestones->linked work items, create options->auto-complete options.
- Upstream key files: `src/github/createPRViewProviderNew.ts`, `webviews/createPullRequestViewNew/app.tsx`, `webviews/common/createContextNew.ts`, `src/view/createPullRequestDataModel.ts`
- Fork target: `src/view/reviewManager.ts`, `src/azdo/folderRepositoryManager.ts`, `webviews/common/cache.ts`
- Vs scoping doc: Scoping lists create-PR view evolution 0.23->0.70->0.134. Added: fork today is entirely QuickPick-based inside src/view/reviewManager.ts (no create webview exists); concrete upstream files are createPRViewProviderNew.ts + webviews/createPullRequestViewNew/ + createPullRequestDataModel.ts (also where the 0.78.1 non-base-branch diff fix #5546 lands, so carry it with the port); 'remember last create option' maps to ADO auto-complete completionOptions.
- Notes: Biggest single item in this slice; most 0.72-0.78 create-view bullets are increments of this one feature.

**U-G147 [XS] [portable] Setting to disable automatic git fetch (allowFetch: false)** (rel 0.78.0)

- New boolean setting that prevents the extension from ever running git fetch. Provider-neutral; useful for slow/metered ADO remotes.
- Fork target: `package.json`, `src/azdo/folderRepositoryManager.ts`, `src/view/reviewManager.ts`

**U-G148 [XS] [portable] Clicking comment filename in description opens file at correct line** (rel 0.78.0)

- File-name links on comments in the PR description webview now open the diff at the commented line instead of the top of file.
- Fork target: `webviews/components/comment.tsx`, `src/azdo/pullRequestOverview.ts`

**U-G149 [XS] [portable] Repository name shown in Changes-in-PR view for multi-repo workspaces** (rel 0.78.0)

- When PRs from multiple repositories appear in the Changes in Pull Request view, each root shows its repo name. Directly relevant to the fork's multi-project workspace support.
- Fork target: `src/view/treeNodes/repositoryChangesNode.ts`, `src/view/prChangesTreeDataProvider.ts`

**U-G150 [S] [partial] Submodule handling fixes (repo selection, missing commit, permalink)** (rel 0.78.0 #5498, #5499)

- Fixes repository selection and 'we couldn't find commit' errors when git submodules are present (#3950, #1499), plus a permalink-repo fix (#5181). The repo-detection parts are portable git-layer logic; the permalink part doesn't apply - the fork has no permalink code (grep verified).
- Upstream key files: `src/extension.ts`
- Fork target: `src/extension.ts`, `src/azdo/repositoriesManager.ts`, `src/azdo/folderRepositoryManager.ts`

**U-G151 [XS] [partial] Refresh review-pending tree category after submitting a review** (rel 0.78.0)

- Removes a PR from the 'Waiting For My Review' list immediately after the user reviews it.
- ADO mapping: GitHub review-requested query -> ADO 'assigned as reviewer with vote 0' filter; casting a vote should trigger a category refresh.
- Fork target: `src/view/treeNodes/categoryNode.ts`, `src/view/prsTreeDataProvider.ts`

**U-G152 [XS] [portable] Setting to never offer ignoring the default-branch PR prompt** (rel 0.78.0 #5435)

- Community PR #5435: opt-out setting so the extension stops offering to create a PR from the default branch.
- Fork target: `package.json`, `src/view/reviewManager.ts`

**U-G153 [S] [portable] Diff-navigation ordering fixes (forward per-PR order, correct backwards iteration)** (rel 0.70.0-0.78.0 #5437, #5036)

- Two community fixes to Next/Previous Diff traversal: iterate diffs of each active PR in order (#5437) and correctly iterate backwards across files (#5036). Both land in shared command code.
- Upstream key files: `src/commands.ts`
- Fork target: `src/commands.ts`
- Vs scoping doc: Scoping lists 'Next Diff in PR (0.56)'. Added: these two ordering bugfixes live entirely in src/commands.ts and should ship with that port, not separately.

**U-G154 [M] [partial] AI-generated PR title/description ('copilot' value for pullRequestDescription)** (rel 0.76.0-0.76.1 #5420)

- Integrates Copilot Chat to generate the PR title and description in the create view (0.76.1 added acceptance telemetry - skipped). For the fork this becomes a vscode.lm (Language Model API) call, and it depends on the new create webview.
- Upstream key files: `src/github/createPRViewProviderNew.ts`, `webviews/createPullRequestViewNew/app.tsx`, `common/views.ts`, `src/github/folderRepositoryManager.ts`
- Fork target: `src/view/reviewManager.ts`, `package.json`
- Vs scoping doc: Scoping lists AI PR title/description (0.76, 0.106, 0.126). Added: the 0.76 shape is just a new 'copilot' enum value on the pullRequestDescription setting wired through createPRViewProviderNew.ts; portable only after the create-view overhaul, and via vscode.lm rather than the Copilot extension dependency.

**U-G155 [XS] [partial] Recognize PRs checked out via GitHub CLI (gh pr checkout)** (rel 0.76.0)

- Detects branch metadata written by the gh CLI so those branches associate with their PR.
- ADO mapping: az repos writes no analogous local metadata; fork already has checkout-PR-by-ID plus its own branch-config association in pullRequestGitHelper.ts.
- Notes: RECLASSIFIED per critic: az repos pr checkout is the ADO analog.

**U-G156 [XS] [portable] "none" option for default PR description** (rel 0.76.0)

- New 'none' value for the pullRequestDescription setting leaves title/description empty by default when creating a PR.
- Fork target: `package.json`, `src/view/reviewManager.ts`

**U-G157 [XS] [portable] Commits view shows wrong author (fix)** (rel 0.76.0)

- Fixes commit author attribution in the Commits tree node. ADO GitCommitRef.author/committer distinction applies equally.
- Fork target: `src/view/treeNodes/commitNode.ts`, `src/azdo/pullRequestModel.ts`

**U-G158 [XS] [portable] Reviewer dropdown never hits cache (fix)** (rel 0.76.0)

- Caching fix so the add-reviewer picker reuses previously fetched user lists instead of refetching every open. Fork fetches mentionable/assignable users in folderRepositoryManager.
- Fork target: `src/azdo/folderRepositoryManager.ts`

**U-G159 [XS] [partial] Pull Branch setting not honored (fix)** (rel 0.76.0)

- Fixes the pullBranch/auto-pull preference being ignored on remote changes. Portable only to the extent the fork adopts the same pull-prompt setting; verify the fork's setting surface first.
- Fork target: `src/view/reviewManager.ts`, `package.json`

**U-G160 [XS] [portable] Comment location error messages after deleting PR branch (fix)** (rel 0.76.0)

- Stops error spam from comment controllers trying to resolve comment positions after the local PR branch is gone.
- Fork target: `src/view/reviewCommentController.ts`, `src/view/commentThreadCache.ts`

**U-G161 [XS] [partial] Cannot add comments on fork PRs (fix)** (rel 0.74.1)

- Fixes commenting on PRs raised from GitHub forks.
- ADO mapping: ADO fork PRs use forkSource on the same GitApi thread routes; the fork's ADO comment path is unaffected by this bug.
- Notes: RECLASSIFIED per critic: fork PRs map to ADO org-internal forks; see ADD-01.

**U-G162 [M] [portable] Accessibility pass for PR review (aria, screen reader, suggest-edit a11y)** (rel 0.70.0-0.74.0 #5225, #4946)

- Broad a11y improvements across webviews and review flows (#5225 umbrella in 0.74.0, plus suggest-edits a11y #4946 in 0.70.0). Nearly all in provider-neutral webview/tree code.
- Fork target: `webviews/components/comment.tsx`, `webviews/editorWebview/app.tsx`, `webviews/common/common.css`
- Vs scoping doc: Scoping lists a11y pass (0.74, 0.88). Added: 0.70.0's suggest-edits accessibility item belongs to the same workstream; changes are spread across many small commits (no single key file), so port by auditing the fork's webviews against current upstream aria patterns rather than cherry-picking.

**U-G163 [XS] [portable] Commits node loads more than 30 commits** (rel 0.74.0)

- Raises the commit list cap in the Changes in Pull Request tree. In ADO this is just the top/skip paging parameters on getCommits (azure-devops-node-api 10.2.2 GitApi.getPullRequestCommits supports pagination).
- Fork target: `src/view/treeNodes/commitsCategoryNode.ts`, `src/azdo/pullRequestModel.ts`

**U-G164 [S] [partial] +/- added/deleted line counts on files in PR description** (rel 0.74.0 #5244)

- Shows per-file addition/deletion counts in the description file list. GitHub's API returns these directly; ADO does not expose per-file line counts, so the fork must derive them from its existing getCommitDiffs pagination.
- Upstream key files: `webviews/editorWebview/index.css`
- Fork target: `webviews/editorWebview/app.tsx`, `src/azdo/pullRequestOverview.ts`, `src/azdo/pullRequestModel.ts`
- Notes: Upstream change was mostly CSS because the counts already came from the API; the fork's cost is the ADO data-layer computation.

**U-G165 [XS] [portable] Duplicate @mention suggestions dedupe (fix)** (rel 0.74.0)

- Dedupes users in the mention completion list. Fork builds its mentionable list in folderRepositoryManager (line ~358) from entitlements + timeline events, which can double up the same identity.
- Fork target: `src/azdo/folderRepositoryManager.ts`

**U-G166 [XS] [partial] Don't require commit message for rebase-style merges** (rel 0.74.0)

- Merge form no longer demands a commit message when the strategy doesn't produce a merge commit. ADO analog: mergeCommitMessage in completionOptions is irrelevant for rebase/rebaseMerge strategies, so the fork's merge UI should hide/skip it there.
- Fork target: `webviews/components/merge.tsx`, `src/azdo/pullRequestModel.ts`

**U-G167 [XS] [portable] Focus in changes list resets when opening file (fix)** (rel 0.74.0)

- Keeps tree selection/focus stable in the Changes in Pull Request view when a file is opened.
- Fork target: `src/view/prChangesTreeDataProvider.ts`, `src/view/treeNodes/fileChangeNode.ts`

**U-G168 [XS] [portable] Refresh buttons for comments (Comments view + comment-thread header)** (rel 0.72.0-0.74.0 #5229)

- Adds an immediate-refresh button in the Comments view (0.72.0) and in each comment thread header (community PR #5229, 0.74.0). Menu contributions plus a re-fetch of threads.
- Fork target: `package.json`, `src/commands.ts`, `src/view/pullRequestCommentController.ts`

**U-G169 [XS] [portable] Comment max-width with horizontal code scroll (fix)** (rel 0.72.0)

- Caps comment width in the PR description webview and gives embedded code blocks their own horizontal scrollbar.
- Fork target: `webviews/common/common.css`, `webviews/components/comment.tsx`

**U-G170 [XS] [partial] Suggestion rendering follow-ups (differentiate code suggestions; redirect old Suggest Edit)** (rel 0.68.0-0.72.0)

- Visual differentiation of code suggestions in comments (#5141) and redirecting the legacy SCM 'Suggest Edit' command to the 0.58 Suggest-a-Change flow. Both are dependent follow-ups to a feature the fork doesn't have yet.
- Fork target: `webviews/components/comment.tsx`, `src/commands.ts`
- Vs scoping doc: Scoping lists suggest-a-change (0.58) + local-changes-to-suggestion (0.96). Added: these two later bullets are cheap riders that should be bundled into that port, not scheduled independently.

**U-G171 [XS] [portable] Progress feedback on PR description actions** (rel 0.72.0)

- Shows busy/progress state on description-webview buttons (merge, update branch, etc.) while the request is in flight.
- Fork target: `webviews/editorWebview/app.tsx`, `webviews/components/merge.tsx`, `src/azdo/pullRequestOverview.ts`

**U-G172 [XS] [partial] upstreamRemote: 'never' setting for fork workflows** (rel 0.70.0)

- Prevents the extension from auto-adding an 'upstream' remote when working on a fork. ADO has fork PRs too, but the fork's remote-inference logic differs; port only if/when ADO fork support is added.
- Fork target: `package.json`, `src/azdo/repositoriesManager.ts`, `src/azdo/pullRequestGitHelper.ts`

**U-G173 [XS] [portable] Quote reply missing for some comments (fix)** (rel 0.70.0)

- Restores the Quote Reply action on comment types where it was missing.
- Fork target: `webviews/components/comment.tsx`, `src/commands.ts`

**U-G174 [XS] [portable] 'Buffer is not defined' webview polyfill fix** (rel 0.68.1)

- Fixes a Node Buffer reference crashing the browser-context webview bundle (surfaced via the labels flow). Generic webpack/webview bundling hygiene the fork's older build shares.
- Fork target: `webviews/editorWebview/app.tsx`, `package.json`

**U-G175 [XS] [portable] Circular avatars in tree views and comments** (rel 0.68.0)

- Renders avatars as circles instead of squares. Pure styling on the fork's existing authenticated-avatar pipeline (avatarCache.ts already ported).
- Fork target: `webviews/components/user.tsx`, `webviews/common/common.css`

**U-G176 [S] [portable] Checkout PR from read-only message on un-checked-out diffs** (rel 0.68.0)

- Registers PR file content through a FileSystemProvider with a readonlyMessage so opening a not-checked-out PR file shows an inline 'check out this PR' affordance. The API is stable in the fork's engine target (vscode ^1.97).
- Fork target: `src/view/gitContentProvider.ts`, `src/view/inMemPRContentProvider.ts`, `src/view/reviewManager.ts`
- Notes: Requires converting the fork's TextDocumentContentProviders to FileSystemProviders; could not isolate a single upstream commit cheaply - port by pattern from upstream's current content-provider layer.

**U-G177 [XS] [portable] User hover shows 'null' when typing @username (fix)** (rel 0.68.0 #4892)

- Community fix (#4892) guarding against users with no display name in hover/mention rendering. ADO identities also frequently lack display fields.
- Fork target: `webviews/components/user.tsx`, `src/azdo/utils.ts`

**U-G178 [XS] [portable] Reverted/closed PR remains in Local Pull Request Branches (fix)** (rel 0.68.0)

- Removes PRs from the local-branches category once they're no longer open. Fork tracks branch↔PR association in pullRequestGitHelper.
- Fork target: `src/view/treeNodes/categoryNode.ts`, `src/azdo/pullRequestGitHelper.ts`

**U-G179 [XS] [portable] Multi-root workspace folder ordering (fix)** (rel 0.68.0)

- Makes tree workspace-folder order match the workspace's folder order. Directly relevant to the fork's multi-project workspaces.
- Fork target: `src/view/treeNodes/workspaceFolderNode.ts`, `src/view/prsTreeDataProvider.ts`

**U-G180 [S] [partial] Reviewer reassignment/re-request desync fixes** (rel 0.68.0 #4924, #4867)

- Fixes re-requesting review from one reviewer wiping others (#4830) and reassigning the same reviewers desyncing state (#4836). ADO sets reviewers with per-reviewer PUTs (no bulk-replace call), so the desync class differs; the portable part is the state-refresh discipline after reviewer mutations.
- ADO mapping: Re-request review ≈ resetting a reviewer's vote / re-adding via createPullRequestReviewer (per-reviewer, so no bulk-wipe risk).
- Upstream key files: `src/github/folderRepositoryManager.ts`, `src/github/githubRepository.ts`, `src/github/activityBarViewProvider.ts`, `src/common/timelineEvent.ts`
- Fork target: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `src/azdo/activityBarViewProvider.ts`
- Vs scoping doc: Scoping lists re-request review (0.60). Added: these two 0.68 desync fixes should be folded into that port; ADO's per-reviewer API removes the bulk-replace failure mode entirely.

**U-G181 [S] [portable] Don't reload entire webview DOM on data refresh** (rel 0.68.0 #4944)

- Description webview updates state incrementally instead of re-rendering the whole DOM on every poll, preserving scroll/focus and reducing flicker. The fork shares the same app.tsx render-on-message pattern.
- Upstream key files: `src/github/pullRequestOverview.ts`, `webviews/editorWebview/app.tsx`
- Fork target: `src/azdo/pullRequestOverview.ts`, `webviews/editorWebview/app.tsx`

### 3.H Releases 0.66-0.58

**U-H182 [M] [portable] File-level comments on PR files** (rel 0.64.0 #4716)

- Lets reviewers attach a comment to a whole file (not a line) from the PR changes tree and diff editors, using VS Code's fileComments API. ADO supports this natively: a thread with threadContext.filePath and no line positions is a file-level thread.
- ADO mapping: GitHub file-level review comment -> ADO thread with threadContext.filePath only (no rightFileStart/End); createThread in GitApi 10.2.2 already accepts this shape
- Upstream key files: `src/@types/vscode.proposed.fileComments.d.ts`, `src/view/pullRequestCommentController.ts`, `src/view/reviewCommentController.ts`, `src/view/pullRequestCommentControllerRegistry.ts`, `src/github/pullRequestModel.ts`, `src/github/prComment.ts`, `src/commands.ts`
- Fork target: `src/view/pullRequestCommentController.ts`, `src/view/reviewCommentController.ts`, `src/view/pullRequestCommentControllerRegistry.ts`, `src/azdo/prComment.ts`, `src/azdo/pullRequestModel.ts`, `src/commands.ts`
- Vs scoping doc: Scoping doc lists file-level comments (0.64). ADDED: verified upstream key files (commit f3fb4e97, incl. the fileComments proposed API the fork must adopt - now stable in vscode 1.97) and confirmed the ADO thread shape works with the bundled node-api 10.2.2.
- Notes: Upstream later added collapsed-by-default file comments (#5540, outside this slice).

**U-H183 [M] [partial] Suggest-a-change from editor comments (create side)** (rel 0.58.0-0.60.0 #4248, #4356, #4352, #4470)

- 'Make a suggestion' button inserts a ```suggestion block into a review comment; peers can accept it into their checkout. Includes 0.60 fix 'Make a suggestion sometimes only works once' (#4470) and multiline regex fix (#4352).
- ADO mapping: ADO has no native suggestion primitive - suggestion fences are a client-side convention inside normal thread comments; both sides of the convention live entirely in the extension
- Upstream key files: `src/commands.ts`, `src/github/prComment.ts`, `src/view/reviewCommentController.ts`, `package.json`
- Fork target: `src/commands.ts`, `src/view/reviewCommentController.ts`, `src/azdo/prComment.ts`, `package.json`
- Vs scoping doc: Scoping doc lists suggest-a-change (0.58). ADDED: the APPLY side already exists in the fork (azdopr.applySuggestionWithCopilot in src/commands.ts:782 and triage item #88 'apply-suggestion'), so remaining work is only the creation UX (Make a suggestion button + suggestion rendering), hence partial not portable.
- Notes: Port the 0.60 only-works-once and multiline regex fixes together with the feature, not after.

**U-H184 [S] [portable] Quick diff gutter for checked-out PR** (rel 0.58.0-0.64.0 #4409, #4465, #4557, #4531, #4726, #4750)

- SCM quick-diff provider showing gutter decorations for lines changed by the checked-out PR; introduced experimental (0.58), made a real setting githubPullRequests.quickDiff (0.60), plus 0.64 fix for the setting being ignored (#4726) and provider label change handling (#4531).
- Upstream key files: `src/view/reviewManager.ts`, `src/@types/vscode.proposed.quickdiffProvider.d.ts`, `package.json`
- Fork target: `src/view/reviewManager.ts`, `package.json`
- Vs scoping doc: Scoping doc lists quick diff gutter (0.58-0.60). ADDED: exact upstream commit trail (be28f315 -> 77cbf850 -> 7c4cae46) showing the whole feature lives in reviewManager.ts + package.json, the API is stable by engine 1.97, and the 0.64 setting-ignored fix belongs in the same port.
- Notes: Small surface: one provider registration keyed off the checked-out PR's merge-base content the fork already fetches.

**U-H185 [S] [partial] Re-request review button in description/sidebar** (rel 0.60.0 #4539, #4540, #4561)

- Button next to a reviewer to re-request their review after changes; includes handling in activityBarViewProvider (#4540) and button style unification (#4539).
- ADO mapping: ADO has no re-request API; equivalent is resetting the reviewer's vote to 0 via createPullRequestReviewer (IdentityRefWithVote vote=0) in GitApi 10.2.2, optionally flagging them required - semantics differ from GitHub's request state
- Upstream key files: `src/github/pullRequestOverview.ts`, `src/github/activityBarViewProvider.ts`
- Fork target: `src/azdo/pullRequestOverview.ts`, `src/azdo/activityBarViewProvider.ts`, `webviews/components/reviewer.tsx`
- Vs scoping doc: Scoping doc lists re-request review (0.60). ADDED: concrete ADO mapping (vote reset to 0, no native request-state) and the fork files including the reviewer webview component.

**U-H186 [M] [portable] Team reviewers on PR overview (on-demand fetch + cache)** (rel 0.64.0 #4512, #4742)

- Add teams as reviewers from the PR description; team list fetched on demand and cached because enumeration is slow. ADO teams/groups are first-class identities that can be PR reviewers natively.
- ADO mapping: GitHub team reviewers -> ADO team/group identities added via createPullRequestReviewer with the group's identity id; enumerate teams via CoreApi.getTeams (in 10.2.2) or Graph REST GET https://vssps.dev.azure.com/{org}/_apis/graph/groups?api-version=7.1-preview.1
- Upstream key files: `src/github/pullRequestOverview.ts`, `src/github/folderRepositoryManager.ts`, `src/github/githubRepository.ts`, `src/github/interface.ts`, `src/github/credentials.ts`, `src/github/utils.ts`
- Fork target: `src/azdo/pullRequestOverview.ts`, `src/azdo/folderRepositoryManager.ts`, `src/azdo/interface.ts`, `src/azdo/azdoRepository.ts`, `webviews/components/reviewer.tsx`
- Notes: Triage item #49 (group/team-assigned PRs in queries) is adjacent - same identity plumbing could serve both.

**U-H187 [S] [portable] Compare Base↔PR Head and PR Head↔Local diff commands** (rel 0.66.0 #4853)

- Two context-menu actions on checked-out PRs: readonly compare of base with PR head, and compare of PR head with local working state.
- Upstream key files: `src/commands.ts`, `package.json`, `package.nls.json`
- Fork target: `src/commands.ts`, `package.json`, `src/view/prChangesTreeDataProvider.ts`
- Notes: Fork already has paginated getCommitDiffs and inMemPRContentProvider to back the readonly side.

**U-H188 [XS] [portable] Git-subfolder welcome view** (rel 0.66.0 #4832)

- Shows the same welcome view as the git extension when a subfolder of a git repository is opened, instead of a blank PR view.
- Upstream key files: `package.json`, `package.nls.json`
- Fork target: `package.json`
- Notes: Pure viewsWelcome contribution keyed on git state context keys.

**U-H189 [M] [portable] Activation performance for multi-repo workspaces** (rel 0.66.0 #4864, #4760)

- Reduced extension activation cost, especially with many repos: severe git-repo data loading impact (#4864) and only searching actual git repos for PRs (#4760).
- Upstream key files: `src/github/folderRepositoryManager.ts`, `src/github/repositoriesManager.ts`
- Fork target: `src/azdo/repositoriesManager.ts`, `src/azdo/folderRepositoryManager.ts`, `src/extension.ts`
- Vs scoping doc: Scoping doc lists activation perf (0.66). ADDED: the two concrete upstream commits (b0839056, c426ade9) and that #4760 also fixes the 0.66 'PR from vscode-cpptools shows in my workspace' bug - port them together; directly relevant to the fork's multi-project workspaces work.
- Notes: Perf claims must be re-measured in the fork; the ADO data layer has different hot paths.

**U-H190 [S] [portable] Checkout pull/fetch behavior settings** (rel 0.64.0-0.66.0 #4759)

- pullPullRequestBranchBeforeCheckout setting to skip pulling on re-checkout (0.66); respect git.pullBeforeCheckout for checkout-default-branch (0.64); use git fetch-before-checkout setting when checking out existing PR branches (#4759).
- Upstream key files: `src/github/folderRepositoryManager.ts`
- Fork target: `src/azdo/folderRepositoryManager.ts`, `src/view/reviewManager.ts`, `package.json`
- Notes: Provider-neutral git behavior; only the setting namespace changes (azdoPullRequests.\*).

**U-H191 [S] [partial] Auto-cleanup of fork branches/remotes on checkout of default branch** (rel 0.58.0)

- Branches and remotes created by checking out PRs that came from a fork are deleted automatically when returning to the default branch via the Checkout default branch button.
- ADO mapping: ADO forks exist (PR source can be a fork repo); the fork extension's checkout path would need fork-remote tracking metadata like upstream's branch config keys
- Fork target: `src/azdo/pullRequestGitHelper.ts`, `src/azdo/folderRepositoryManager.ts`
- Notes: Partial because the fork's ADO fork-PR checkout support itself is thin; cleanup only pays off after fork checkout works end-to-end.

**U-H192 [M] [portable] PR labels -> ADO PR labels (tags): create-time labels + label management fixes** (rel 0.58.0-0.66.0 #4395, #4492, #4634, #4637, #4648, #4649)

- Labels added to PRs at creation (0.58), label quickpick 'zero selected' fix (#4395), replace-label doesn't stick (0.58.1 #4492), cannot remove last label (0.62 #4634/#4637/#4648), x button to remove label in create view (#4649).
- ADO mapping: GitHub labels -> ADO PR labels; GitApi 10.2.2 already has createPullRequestLabel/getPullRequestLabels (GitApi.d.ts:72,75) and GitPullRequest.labels is accepted at creation (GitInterfaces.d.ts:1514)
- Upstream key files: `src/github/pullRequestModel.ts`, `src/github/pullRequestOverview.ts`
- Fork target: `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `src/view/quickpick.ts`, `webviews/editorWebview/app.tsx`
- Notes: One coherent feature: fork currently has no PR label surface at all, so land create+edit+remove together.

**U-H193 [M] [portable] Create-PR flow polish: createDraft, postCreate, progress, push/target fixes** (rel 0.58.0-0.66.0 #4681, #4692, #4848)

- createDraft setting for draft-by-default (0.58), postCreate: checkoutDefaultBranch (0.58), progress notification during creation (0.58), publishing-branch-resets-target fix (0.64 #4681), Commit & Create auto-push fix (0.64 #4692), and error handling on failed PR creation (0.66 #4848).
- ADO mapping: Draft-by-default maps directly to GitPullRequest.isDraft in 10.2.2; postCreate/progress are provider-neutral
- Upstream key files: `src/github/folderRepositoryManager.ts`
- Fork target: `src/azdo/folderRepositoryManager.ts`, `src/view/reviewManager.ts`, `package.json`
- Vs scoping doc: Scoping doc lists create-PR view evolution (0.23->0.70->0.134). ADDED: the specific 0.58-0.66 settings and bugfixes in this slice, with the note that ADO draft PRs make createDraft a one-field port.
- Notes: The rate-limit half of #4848 is GitHub-specific; only the retry/error-surface pattern ports.

**U-H194 [S] [partial] @-mention linkification and hover correctness** (rel 0.58.0-0.66.0 #4344, #4611, #4810)

- Handles in comments linkified (0.58); fixes for JSDoc @return showing a username hover (#4344), @type inside code blocks rendering as a user link (0.62 #4611), and improper @mentions in comments (0.66 #4810).
- ADO mapping: ADO mentions are identity-based markup (@<GUID>) resolved via the Identities API, not plain @handle text - linkification must resolve GUIDs to display names (fork's userManager.ts/avatarCache.ts pattern applies)
- Fork target: `webviews/components/comment.tsx`, `src/azdo/utils.ts`
- Notes: The don't-linkify-inside-code-blocks fixes port as-is; the linkify target is ADO-specific.

**U-H195 [M] [portable] Webview UI and accessibility polish batch** (rel 0.58.0-0.60.0 #4287, #4237, #4402, #4285, #4286, #4368, #4369, #4370, #4541, #4542)

- High-contrast visibility (#4287) and other a11y fixes (#4237), enter saves PR title rename (#4402), clickable section headings in overview (0.58), comment layout + bin delete icon (#4285), colorized status badge (#4286), PR view UI fixes (#4368), correct 'assign yourself' permission (#4369), draft status-check entry UI (#4370), timestamp overflow (#4541), status checks rendering (#4542).
- Fork target: `webviews/components/comment.tsx`, `webviews/components/header.tsx`, `webviews/components/timestamp.tsx`, `webviews/components/reviewer.tsx`, `webviews/editorWebview/app.tsx`
- Vs scoping doc: Scoping doc lists the a11y pass at 0.74/0.88. ADDED: this earlier 0.58-0.60 batch is separate and lands almost entirely in webviews/ React code the fork still shares structurally with upstream - cheap to cherry-conceptually per component.
- Notes: #4542/#4286 status-badge bits need re-expression against ADO policy evaluations rather than GitHub checks.

**U-H196 [XS] [portable] Keybindable pr.openModifiedFile / pr.openDiffView on active file** (rel 0.58.0)

- The open-modified-file and open-diff-view commands work on the active editor so they can be bound to keyboard shortcuts.
- Fork target: `src/commands.ts`, `package.json`

**U-H197 [XS] [portable] Adopt Developer: Set Log Level (drop custom log-level setting)** (rel 0.60.0)

- Extension logging controlled by VS Code's standard Set Log Level command via LogOutputChannel; old logLevel setting deprecated.
- Fork target: `src/common/logger.ts`, `package.json`
- Notes: Fork engine ^1.97 fully supports LogOutputChannel.

**U-H198 [S] [partial] Internal client-side rate limiting / request budgeting** (rel 0.64.0 #4658, #4673, #4677, #4763)

- Upstream added an internal rate limiter to stay under GitHub's API quota. The GitHub quota math doesn't apply, but the request-budget/back-off pattern does for ADO throttling.
- ADO mapping: ADO throttles via TSTUs returning 429/503 with Retry-After (and X-RateLimit-\* headers when near limits) - honor Retry-After and back off, rather than precomputing a points budget
- Fork target: `src/azdo/azdoRepository.ts`, `src/azdo/credentials.ts`
- Vs scoping doc: Scoping doc lists API-usage reduction (0.120, 0.142) and polling back-off (0.154) - this 0.64 limiter is the earlier ancestor; ADDED: fold it into those items rather than porting the GitHub points logic.

**U-H199 [XS] [portable] Tree view element-id collision fix ('already registered')** (rel 0.66.0)

- Fixes 'Element with id Local Pull Request Branches… is already registered' (#4642) - duplicate tree item ids across categories/repos crash the PR tree.
- Fork target: `src/view/prsTreeDataProvider.ts`, `src/view/treeNodes/categoryNode.ts`
- Notes: Fork shares the 2020 category-node tree structure, so the same id-uniqueness bug class exists; upstream re-fixed variants later (#6232, #7271).

**U-H200 [S] [portable] Editor/webview state restore fixes (old PR editors, empty diff after reload)** (rel 0.58.0-0.64.0 #4293, #4661)

- Empty diff view after window reload (0.58 #4293) and old PR description editors showing errors when revisited (0.64 #4661).
- Fork target: `src/common/webview.ts`, `src/view/inMemPRContentProvider.ts`, `src/azdo/pullRequestOverview.ts`
- Vs scoping doc: Scoping doc lists webview restore (0.118) as the headline; ADDED: these two earlier fixes are prerequisites of the same serializer/content-provider work and should be one workstream.

**U-H201 [XS] [portable] Graceful handling of corrupt/malformed SSH config** (rel 0.64.0 #4644)

- Errors while parsing the user's SSH configuration file no longer break remote resolution (#4644).
- Fork target: `src/azdo/remoteUrlParser.ts`
- Notes: Fork already hardened SSH URL parsing (triage item); verify the config-file-parsing path specifically is guarded too.

**U-H202 [XS] [portable] Configurable PR number display in tree view** (rel 0.64.0 #4576)

- Setting to show/hide the PR number next to titles in the tree view (#4576).
- Fork target: `src/view/treeNodes/pullRequestNode.ts`, `package.json`

**U-H203 [S] [partial] defaultCommentType setting (single vs review comment)** (rel 0.58.0)

- Setting choosing whether new editor comments default to a standalone comment or a pending-review comment.
- ADO mapping: ADO has no GitHub-style batched pending review; nearest primitive is creating threads with CommentThreadStatus 'pending'/'active' - only meaningful if the fork emulates a batch-then-publish flow
- Fork target: `src/view/reviewCommentController.ts`, `package.json`
- Notes: Port only if/when the fork commits to a pending-review emulation; otherwise the setting has nothing to toggle.

**U-H204 [XS] [portable] auto-merge default checkbox setting (setAutoMerge)** (rel 0.62.0)

- Setting that pre-checks the auto-merge checkbox in the Create PR view.
- ADO mapping: GitHub auto-merge -> ADO auto-complete: set autoCompleteSetBy + completionOptions (mergeStrategy, deleteSourceBranch, transitionWorkItems) on updatePullRequest - richer than GitHub's checkbox
- Fork target: `src/azdo/folderRepositoryManager.ts`, `package.json`
- Vs scoping doc: Scoping doc lists the auto-merge checkbox at 0.44. ADDED: 0.62's default-on setting is a one-line follow-up once the checkbox exists; ADO completionOptions deserve their own UI beyond a boolean.

### 3.I Releases 0.56-0.46

**U-I205 [S] [portable] Go To Next Diff in Pull Request command** (rel 0.56.0 #4264 (follow-up fix for deletions), #6563 (later error fix))

- Command that jumps to the next diff hunk across all files in the PR, not just within the current file. Enables keyboard-driven full-PR review flow.
- Upstream key files: `src/commands.ts`
- Fork target: `src/commands.ts`, `src/view/prChangesTreeDataProvider.ts`, `src/view/treeNodes/fileChangeNode.ts`
- Vs scoping doc: Scoping doc lists 'Next Diff in PR (0.56)'. ADDED: implementation lives almost entirely in src/commands.ts upstream (verified via fix commits 46cacbbb/9f6b7153), and there are two upstream follow-up bugfixes (deletions, error case) that should be ported together with the original - fork's commands.ts confirmed to have no next-diff command today.
- Notes: Provider-neutral: iterates fork's existing file-change nodes; no new ADO API surface needed.

**U-I206 [M] [portable] Review status shown in PRs list view** (rel 0.56.0 #4187)

- Each PR tree item shows the viewer's review status (approved/changes-requested/pending) via a codicon decoration in the Pull Requests view.
- ADO mapping: GitHub review states map to ADO reviewer votes: +10/+5 approved, -5 waiting-for-author, -10 rejected, 0 no vote. Votes are already on GitPullRequest.reviewers in azure-devops-node-api 10.2.2 (no extra call needed).
- Upstream key files: `src/github/githubRepository.ts`, `src/github/pullRequestModel.ts`, `src/common/uri.ts`, `src/extension.ts`, `src/@types/vscode.proposed.codiconDecoration.d.ts`
- Fork target: `src/view/treeNodes/pullRequestNode.ts`, `src/azdo/pullRequestModel.ts`, `src/azdo/interface.ts`
- Notes: Fork's pullRequestNode.ts today renders only '#num by login' (verified line 328) - no vote surfaced. Upstream used a then-proposed codicon-decoration API that is now stable, so the port is simpler than the original. Follow-up upstream commit 1599a186 (#4329) added status colors.

**U-I207 [XS] [portable] Most recent PR selected when branch has multiple PRs** (rel 0.56.0)

- When a checked-out branch has more than one open PR, the extension associates the branch with the most recently created PR instead of an arbitrary one.
- Fork target: `src/azdo/pullRequestGitHelper.ts`, `src/azdo/folderRepositoryManager.ts`
- Notes: Small sort/pick fix in branch-to-PR association logic; fork has the same association pattern in pullRequestGitHelper.ts.

**U-I208 [XS] [portable] Fix: auto-fetch still runs when setting is off** (rel 0.56.0 #4202 (issue))

- Honors the remote auto-fetch opt-out setting; previously the extension fetched the PR branch even with the setting disabled.
- Fork target: `src/view/reviewManager.ts`, `src/azdo/folderRepositoryManager.ts`
- Notes: Fork inherited the same fetch-on-refresh pattern from the 2020 fork point; worth checking whether the fork's setting gate has the identical bug.

**U-I209 [XS] [portable] Fix: create-PR prompt missing after pushing feature branch** (rel 0.54.1 #4171 (issue))

- Restores the 'Create PR?' notification after pushing a branch with no open PR (regression fix in the push-detection logic).
- Fork target: `src/view/reviewManager.ts`
- Notes: Only relevant if/when the fork ports the push-triggered create-PR prompt; bundle with the create-PR-view evolution work already in scoping.

**U-I210 [XS] [portable] Ctrl/Cmd+Enter submits PR from Create view** (rel 0.54.0)

- Keyboard submit while the cursor is in the description input of the Create PR view.
- Fork target: `webviews/activityBarView`, `src/azdo/activityBarViewProvider.ts`
- Vs scoping doc: Fold into the create-PR view evolution item (0.23->0.70->0.134) already in scoping; this is a one-liner keydown handler in the webview.
- Notes: Pure webview change, no ADO API surface.

**U-I211 [S] [portable] Mark File as Viewed keybinding + close-on-viewed** (rel 0.54.0 #4081)

- pr.markFileAsViewed becomes keybindable, and invoking it from command/editor-toolbar also closes the diff editor - pairs with Open All Diffs for fast review.
- Upstream key files: `src/commands.ts`
- Fork target: `src/commands.ts`, `src/azdo/fileReviewedStatusService.ts`, `package.json`
- Notes: Fork already has markFileAsViewed in commands.ts and persistence in fileReviewedStatusService.ts (verified); only the keybinding declaration and close-editor behavior are missing.

**U-I212 [M] [portable] Diff pre-fetch for checked-out PRs (<20 files) / prefetch next file** (rel 0.54.0 #4097)

- Pre-fetches diff content for all files of a checked-out PR under 20 files (and later, the next file during review) so diffs open instantly.
- Upstream key files: `src/view/fileChangeModel.ts`, `src/view/gitContentProvider.ts`, `src/view/reviewManager.ts`, `src/view/reviewsManager.ts`
- Fork target: `src/view/gitContentProvider.ts`, `src/view/reviewManager.ts`, `src/view/reviewsManager.ts`, `src/azdo/pullRequestModel.ts`
- Vs scoping doc: Scoping lists 'diff pre-fetch (0.54, 0.116)'. ADDED: verified upstream key files (#4097) - upstream introduced a fileChangeModel.ts abstraction the fork does not have, so the port either adds that model or hooks prefetch into the fork's existing gitContentProvider; fork's paginated getCommitDiffs (already done) gives the item list cheaply, content blobs are the expensive part.
- Notes: Perf win is larger on ADO because each file content fetch is a separate REST round-trip.

**U-I213 [M] [partial] Localization (vscode.l10n) for VS Code UI strings** (rel 0.54.0)

- Wraps extension-side UI strings for localization; webview strings remained unlocalized upstream too.
- Fork target: `src/commands.ts`, `src/view/reviewManager.ts`
- Notes: Mechanical but touches every user-facing string; low value for a single-org fork unless marketplace-published broadly. Partial because fork strings have diverged (ADO terminology).

**U-I214 [S] [portable] Review-mode polish fixes: view-position reset, block-comment rendering, commit-box completion, activation** (rel 0.54.0 #4031 (issue), #4013 (issue), #4026 (issue), #4046 (issue), #4101 (fix commit 18c7b595))

- Cluster of provider-neutral fixes: periodic refresh no longer resets scroll position of the file under review; block comments render correctly in webviews; manually-triggered user completion in the commit box fixed; unnecessary \* activation removed.
- Fork target: `src/view/reviewManager.ts`, `webviews/components/comment.tsx`, `src/commands.ts`
- Notes: All in code the fork shares from the 2020 fork point; each fix is XS individually. The activation fix predates the bigger activation-perf pass (0.66) in scoping.

**U-I215 [S] [portable] Viewed-file checkboxes on files and folders** (rel 0.52.0-0.54.0 #3916, #3976, #4019)

- Native TreeItemCheckboxState checkboxes to mark files as viewed, including whole folders at once; 0.54 fixed checkbox-state propagation bugs (#3959).
- Upstream key files: `src/view/treeNodes/fileChangeNode.ts`, `src/view/treeNodes/directoryTreeNode.ts`, `src/view/treeNodes/treeNode.ts`, `src/view/prsTreeDataProvider.ts`, `src/view/fileTypeDecorationProvider.ts`, `src/commands.ts`
- Fork target: `src/view/treeNodes/fileChangeNode.ts`, `src/view/treeNodes/directoryTreeNode.ts`, `src/view/treeNodes/treeNode.ts`, `src/view/prsTreeDataProvider.ts`, `src/azdo/fileReviewedStatusService.ts`
- Vs scoping doc: Scoping lists 'viewed-file checkboxes incl. folders (0.38-0.52)'. ADDED: verified the fork has NO TreeItemCheckboxState usage in src/ (only the vscode.d.ts type) - viewed state exists via commands + fileViewedDecorationProvider, so this is purely the tree-UI checkbox layer on top of the fork's existing persistence, hence S not M; port the two propagation-fix commits together with #3916.
- Notes: Fork's viewed-state-keyed-by-path and mark-as-viewed collision fixes (already done) are the hard part; this is the remaining UI affordance.

**U-I216 [XS] [portable] Checkout default branch closes PR overview and diffs** (rel 0.52.0)

- The 'Checkout default branch' button also closes the PR overview editor and all PR diff editors, cleaning up the review session.
- Fork target: `src/view/reviewManager.ts`, `src/commands.ts`
- Notes: Pairs with the 0.46 'Exit Review Mode' -> 'Checkout default branch' rename fix below.

**U-I217 [XS] [partial] Fix: multi-root workspace with two checked-out PR branches shows errors** (rel 0.52.0 #3490 (issue))

- Fixes error/misleading state when a multi-root workspace has two folders each checked out to branches with open PRs.
- Fork target: `src/azdo/repositoriesManager.ts`, `src/view/reviewsManager.ts`
- Notes: Fork's v1.1.0 multi-project workspace rewrite reworked this area, so the upstream patch won't apply cleanly - treat as a test scenario to verify against the fork's own multi-folder handling rather than a port.

**U-I218 [XS] [portable] Fix: draft-PR checkbox reverts while typing description** (rel 0.52.0 #3977 (issue))

- Create-view state bug where the draft checkbox reset to unchecked after typing in the description field.
- Fork target: `webviews/activityBarView`
- Notes: ADO has first-class draft PRs, so the fork's create view has (or will have) the same checkbox; classic webview state-merge bug worth checking for in the fork.

**U-I219 [S] [partial] Labels rendered with colors** (rel 0.50.0)

- PR labels render with their GitHub-defined colors in views and overview.
- ADO mapping: ADO PR labels (tags) are plain strings with no color property (WebApiTagDefinition in 10.2.2 has no color). Render as neutral chips; a fork-side color hash could substitute.
- Fork target: `src/azdo/pullRequestOverview.ts`, `webviews/editorWebview/overview.tsx`
- Notes: Partial: the display work ports, the color data does not exist in ADO. Depends on the fork surfacing PR tags at all first.

**U-I220 [S] [portable] Pull-branch prompt and pullBranch setting** (rel 0.48.0-0.50.0)

- 0.48 added githubPullRequests.pullBranch to control prompting when upstream PR changes are detected; 0.50 added an 'always' option and a pull prompt from the overview Refresh button when the local branch is out of date.
- Fork target: `src/view/reviewManager.ts`, `src/azdo/pullRequestOverview.ts`, `package.json`
- Notes: Compare-commits data is available via fork's existing getCommitDiffs/iteration data; mostly review-manager + setting plumbing. Verified none of these settings exist in fork package.json.

**U-I221 [XS] [portable] Renamed-file tooltip** (rel 0.50.0)

- Tree tooltip on renamed files showing old -> new path clearly.
- Fork target: `src/view/treeNodes/fileChangeNode.ts`
- Notes: ADO GitChange has sourceServerItem for renames, so the data is already on the fork's change objects.

**U-I222 [XS] [portable] Reset Viewed Files command** (rel 0.50.0)

- Command that resets all files in the PR back to unviewed.
- Fork target: `src/commands.ts`, `src/azdo/fileReviewedStatusService.ts`, `package.json`
- Vs scoping doc: Scoping lists 'Reset Viewed'. ADDED: in the fork this is a one-method bulk-clear on the existing fileReviewedStatusService.ts plus a command registration - genuinely XS, no data-layer work.

**U-I223 [XS] [portable] Fixes: completion-provider languages + comment linebreak rendering** (rel 0.50.0 #3874 (issue), #3776 (issue))

- User suggestions now trigger across languages, and comment markdown renders linebreaks correctly.
- Fork target: `webviews/components/comment.tsx`
- Notes: User-completion portion applies only where the fork offers @-completions; issue-suggestion portion is GitHub-only.

**U-I224 [M] [partial] Changes since last review** (rel 0.48.0 #3738)

- Button on the PR that restricts diffs to commits pushed since your last review.
- ADO mapping: ADO PR ITERATIONS are the native primitive: every push is an iteration; GitApi 10.2.2 has getPullRequestIterations/getPullRequestIterationChanges and iteration-scoped threads. Build 'changes since iteration N' (with N = iteration at your last vote) instead of porting GitHub's commit-set diffing.
- Upstream key files: `src/github/pullRequestModel.ts`, `src/github/pullRequestOverview.ts`, `src/view/prChangesTreeDataProvider.ts`, `src/view/reviewManager.ts`, `src/view/treeNodes/repositoryChangesNode.ts`, `webviews/common/context.tsx`, `webviews/components/timeline.tsx`
- Fork target: `src/azdo/pullRequestModel.ts`, `src/view/prChangesTreeDataProvider.ts`, `src/view/treeNodes/repositoryChangesNode.ts`, `webviews/common/context.tsx`
- Vs scoping doc: Scoping lists this under Portable (0.48). ADDED: reclassified - the UX ports but the mechanism should not; ADO iterations give an exact, server-computed diff base (upstream had to approximate via commit sets, cfa72cf3 touched 15 files partly because of that). Iteration-based build is smaller and more correct than a literal port.
- Notes: Highest-leverage item in this slice for reviewer workflow. RECLASSIFIED per critic: iterations are the primitive, not a supersession; no API exposes last-seen iteration. Tracked as ITER-05.

**U-I225 [S] [portable] PR flow settings: ignoredPullRequestBranches, overrideDefaultBranch, pushBranch, pullRequestDescription** (rel 0.46.0-0.48.0)

- Settings to ignore branches for PR association, locally override the default branch, skip the 'Publish branch?' dialog, and choose the PR description source (un-deprecated in 0.48).
- Fork target: `package.json`, `src/azdo/folderRepositoryManager.ts`, `src/view/reviewManager.ts`
- Notes: Four independent XS settings, grouped; verified none exist in fork package.json. overrideDefaultBranch maps to overriding the ADO repo defaultBranch locally.

**U-I226 [S] [portable] Commit & Create Pull Request action in SCM view** (rel 0.48.0 #4072 (follow-up fix))

- One-click git SCM action that commits staged changes and opens the Create PR view.
- Upstream key files: `package.json`, `src/commands.ts`, `src/extension.ts`
- Fork target: `package.json`, `src/commands.ts`, `src/azdo/activityBarViewProvider.ts`
- Vs scoping doc: Scoping lists 'Commit & Create (0.48)'. ADDED: verified via follow-up commit bf6cccdb that the surface is just an scm/title menu contribution + command that shells to git commit then opens the create view - S in the fork since the create view already exists; port the 0.48-era push-failure fix with it.

**U-I227 [S] [portable] Perf: expanding a PR in the Pull Requests view** (rel 0.48.0 #3684 (issue), #3728 (issue))

- Reduces latency when expanding a PR node to list its files, plus faster assignee quickpick population.
- Fork target: `src/view/treeNodes/pullRequestNode.ts`, `src/azdo/pullRequestModel.ts`, `src/azdo/entitlementApi.ts`
- Notes: Fork expansion already benefits from paginated getCommitDiffs; the remaining win is caching/deferring per-file metadata. Assignee-quickpick portion maps to the fork's entitlementApi user search (ADO reviewer quickpick).

**U-I228 [S] [portable] Fix: 'upgrade' PR diffs after checkout** (rel 0.48.0 #3631 (issue))

- Diffs opened from the Pull Requests view before checkout are upgraded in place to review-mode (local file) diffs after the PR is checked out.
- Fork target: `src/view/reviewManager.ts`, `src/view/inMemPRContentProvider.ts`
- Notes: Fork has the same two diff sources (inMemPRContentProvider vs checked-out files), so the same stale-diff seam exists.

**U-I229 [M] [partial] Auto-merge in the Overview editor** (rel 0.46.0)

- Auto-merge checkbox surfaced on the PR overview (extending the 0.44 create-view checkbox).
- ADO mapping: ADO AUTO-COMPLETE: set GitPullRequest.autoCompleteSetBy + completionOptions (mergeStrategy, deleteSourceBranch, transitionWorkItems, mergeCommitMessage, bypassPolicy) via GitApi.updatePullRequest - fully supported in azure-devops-node-api 10.2.2. Richer than GitHub auto-merge (strategy + branch cleanup + work-item transition in one).
- Fork target: `src/azdo/pullRequestOverview.ts`, `webviews/editorWebview/overview.tsx`, `src/azdo/pullRequestModel.ts`
- Vs scoping doc: Scoping lists 'auto-merge checkbox (0.44)' under create-PR view. ADDED: the 0.46 overview surface is the more valuable half for ADO (set/cancel auto-complete on an open PR, show 'auto-complete set by X' state), and 10.2.2 API coverage is confirmed so no raw REST needed.
- Notes: M because the completion-options form (merge strategy, delete branch, transition work items) deserves real UI, not one checkbox. RECLASSIFIED per critic: ADO auto-complete is a missing feature (AC-02), not free.

**U-I230 [XS] [portable] Fixes: 'Exit Review Mode' renamed to 'Checkout default branch'; comments.openView respected** (rel 0.46.0 #3637 (issue), #3652 (issue))

- Clearer command naming for leaving review mode, and the extension no longer force-opens the Comments panel when comments.openView is 'never'.
- Fork target: `src/view/reviewManager.ts`, `package.json`, `src/view/reviewCommentController.ts`
- Notes: Two tiny UX-respect fixes in shared code.

### 3.J Releases 0.44-0.31

**U-J231 [M] [partial] Auto-complete (GitHub auto-merge) in create flow + overview** (rel 0.44.0 #3651)

- Upstream added an auto-merge checkbox to the Create view so the PR merges when checks pass. ADO's native equivalent is auto-complete with completionOptions.
- ADO mapping: ADO auto-complete: GitApi.updatePullRequest with autoCompleteSetBy + completionOptions {mergeStrategy: noFastForward|squash|rebase|rebaseMerge, deleteSourceBranch, transitionWorkItems} - confirmed present in azure-devops-node-api 10.2.2 GitInterfaces
- Upstream key files: `src/github/createPRViewProvider.ts`, `src/github/pullRequestModel.ts`, `webviews/components/automergeSelect.tsx`, `webviews/components/merge.tsx`
- Fork target: `src/view/reviewManager.ts`, `src/azdo/pullRequestModel.ts`, `src/azdo/pullRequestOverview.ts`, `webviews/components/merge.tsx`
- Vs scoping doc: Scoping doc lists 'auto-merge checkbox (0.44)' under create-PR view evolution. ADDED: verified fork has ZERO auto-complete plumbing (no autoComplete refs anywhere in src/ or webviews/), fork has no Create webview (creation is a quickpick flow in reviewManager.ts) so the toggle lands there + in overview merge.tsx; API shape confirmed in bundled 10.2.2.
- Notes: M because it's a full ADO auto-complete implementation, not just a checkbox.

**U-J232 [S] [portable] Create-PR default title/description/base-branch fixes** (rel 0.38.0-0.44.0 #3350, #2988, #3303)

- Fixes: commit message not used for description when base branch has more commits (#3350), placeholder title not matching web behavior (#2988), branches off non-default base targeting wrong branch (#3303).
- Fork target: `src/view/reviewManager.ts`, `src/azdo/folderRepositoryManager.ts`
- Notes: Fork has azdoPullRequests.pullRequestTitle/pullRequestDescription settings with 'commit' option, so these defaulting bugs are directly applicable to the quickpick create flow.

**U-J233 [XS] [portable] Suppress 'PR updated' prompt after pushing to own PR branch** (rel 0.44.0 #3479)

- Stops prompting the author about updates to the PR immediately after they themselves pushed to the branch (#3479).
- Fork target: `src/view/reviewManager.ts`

**U-J234 [XS] [partial] GitHub fork-remote PR discovery/files fixes** (rel 0.36.1-0.44.0)

- Fixes for PRs created from GitHub forks: topic-branch PRs not discovered (#3511), empty Files tree after changing a fork PR (#3294).
- Notes: RECLASSIFIED per critic: see ADD-01.

**U-J235 [XS] [portable] Command: open repo PR list on dev.azure.com** (rel 0.42.0)

- Upstream added actions to jump to github.com/owner/repo/pulls and /issues. ADO analog: open https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequests in browser.
- ADO mapping: dev.azure.com \_git/{repo}/pullrequests URL (issues variant maps to Boards work items - skip or point at project board)
- Fork target: `src/commands.ts`, `package.json`

**U-J236 [S] [partial] fileListLayout (tree/list) applied to commit nodes** (rel 0.42.0)

- Upstream made commit-node children honor the fileListLayout tree/list setting. Fork has the setting for PR file lists but commitNode ignores it.
- Fork target: `src/view/treeNodes/commitNode.ts`, `src/view/treeNodes/directoryTreeNode.ts`, `package.json`
- Notes: Verified: package.json:147 has azdoPullRequests.fileListLayout and directoryTreeNode.ts exists, but commitNode.ts has no fileListLayout/DirectoryTreeNode reference - children are always flat.

**U-J237 [XS] [portable] Mark as Viewed/Unviewed in editor toolbar** (rel 0.42.0)

- Expose the existing markFileAsViewed/unmarkFileAsViewed commands as editor/title toolbar buttons when a PR diff is open.
- Fork target: `package.json`, `src/commands.ts`
- Vs scoping doc: Falls inside scoping doc's viewed-file range (0.38-0.52). ADDED: verified the precise gap - fork's editor/title menu only contributes azdoreview.openFile; viewed commands exist but are tree-inline only (package.json:659-669).

**U-J238 [S] [partial] Viewed-state UX polish (icons, checkbox-style UX)** (rel 0.38.0)

- New icons and general UX improvement for mark-as-viewed. Start of upstream's viewed-files evolution toward checkboxes.
- Fork target: `src/view/fileViewedDecorationProvider.ts`, `src/view/treeNodes/fileChangeNode.ts`, `package.json`
- Vs scoping doc: Scoping doc lists 'viewed-file checkboxes incl. folders (0.38-0.52)'. ADDED: fork already has viewed commands, inline tree buttons, and fileViewedDecorationProvider.ts (viewed-state keyed by path is done); the remaining 0.38-era gap is icon/UX polish, with checkbox UI + folder propagation coming from the later releases in the range.

**U-J239 [XS] [portable] Publish-branch create-PR prompt suppression controls** (rel 0.36.0-0.40.0)

- 'Don't show again' button on the 'create a pull request?' notification (0.36) and a createOnPublishBranch setting (0.40) to disable the prompt shown when publishing a branch.
- Fork target: `src/view/reviewManager.ts`, `package.json`
- Notes: Fork has reviewManager.publishBranch (line 599); no such notification setting exists in package.json.

**U-J240 [S] [portable] Comment/webview state-sync fixes** (rel 0.34.0-0.40.0 #3349, #3254, #3200, #3173, #3059, #2299)

- Duplicate comment in Comments panel (#3349), markdown escaped when editing comments (#3254), unsent comment lost on focus switch (#3200), comments disappearing after exiting review mode (#3173), quote-reply on nested replies (#3059), PR title edit not updating tree view (#2299).
- Fork target: `src/view/pullRequestCommentController.ts`, `src/view/reviewCommentController.ts`, `webviews/components/comment.tsx`, `src/azdo/activityBarViewProvider.ts`
- Notes: All in provider-neutral comment-controller/webview code the fork shares; each is XS individually, S as a batch. Fork's known comment-offset issues (ISSUE-TRIAGE) make this area worth auditing while porting.

**U-J241 [XS] [portable] Webview high-contrast / CSS a11y fix** (rel 0.42.0 #3342)

- Invisible button/input text in high-contrast themes (#3342). Same era shipped a batch of webview polish PRs (0.31/0.32 thank-you items: button sizes, focus border, margins, monospace commit hash) worth sweeping in one pass.
- Fork target: `webviews/common/common.css`, `webviews/components/comment.tsx`

**U-J242 [XS] [partial] Skip object-type detection for known file extensions** (rel 0.42.0 #3446)

- Avoid expensive getObjectDetails/detectObjectType calls when the file extension already tells you text vs binary (#3446).
- ADO mapping: Fork's analog is blob/item fetches in gitContentProvider; same skip-known-extensions principle applies, different API
- Fork target: `src/view/gitContentProvider.ts`

**U-J243 [M] [partial] PR loading performance: lazy diffs, delayed comments, editor thread cache** (rel 0.36.0 #3216)

- Changes tree shows faster, individual file diffs load only when opened, comments load with a delay, plus a 4-editor cache for PR comment threads (#3216).
- Upstream key files: `src/view/pullRequestCommentController.ts`
- Fork target: `src/view/treeNodes/fileChangeNode.ts`, `src/view/prChangesTreeDataProvider.ts`, `src/view/pullRequestCommentController.ts`, `src/view/commentThreadCache.ts`
- Notes: Fork already has paginated diffs (getCommitDiffs) and a CommentThreadCache class; the lazy per-file diff-on-open and delayed comment loading are the remaining pieces.

**U-J244 [S] [portable] useReviewMode setting + review-mode entry fixes** (rel 0.34.0-0.36.0 #3021, #3194)

- Setting to disable review mode for merged and/or closed PRs (#3021) plus fixes: checking out a PR branch replacing the active editor (#3194).
- Upstream key files: `src/github/issueModel.ts`, `src/view/reviewManager.ts`
- Fork target: `src/view/reviewManager.ts`, `src/azdo/pullRequestModel.ts`, `package.json`
- Notes: Verified no useReviewMode reference anywhere in fork. ADO PR statuses map cleanly: completed/abandoned = merged/closed.

**U-J245 [S] [portable] Open All Diffs command** (rel 0.36.0 #3238)

- Single command that opens diffs for every file in the checked-out PR (#3238).
- Upstream key files: `package.json`, `src/commands.ts`, `src/view/reviewManager.ts`, `src/view/treeNodes/fileChangeNode.ts`
- Fork target: `src/commands.ts`, `src/view/reviewManager.ts`, `src/view/treeNodes/fileChangeNode.ts`, `package.json`
- Vs scoping doc: Scoping doc lists 'Open All Diffs (0.36)'. ADDED: exact upstream commit 96705624 with its 4-file footprint; fork has 1:1 landing files; pure provider-neutral code, S including the >1000-files guard the fork already handles.

**U-J246 [XS] [portable] Comment timestamps via VS Code comment API** (rel 0.36.0)

- Editor comment threads show a timestamp using the vscode.Comment timestamp API.
- Fork target: `src/azdo/prComment.ts`
- Notes: Verified src/azdo/prComment.ts sets no timestamp; fork's webviews/components/timestamp.tsx covers the timeline webview only. ADO comments carry publishedDate/lastUpdatedDate.

**U-J247 [XS] [portable] High CPU load fix** (rel 0.34.3 #841)

- Fix for extension causing high CPU load (#841) - long-standing polling/watcher hot loop.
- Fork target: `src/view/prsTreeDataProvider.ts`
- Notes: Could not cheaply isolate the exact commit; verify against fork's polling code while porting. Related to scoping doc's later polling back-off (0.154).

**U-J248 [XS] [portable] Git file status colors for PR files** (rel 0.34.0)

- PR file tree entries use the standard gitDecoration.\* theme colors in addition to status letters.
- Fork target: `src/view/fileTypeDecorationProvider.ts`
- Vs scoping doc: Scoping doc lists 'git status colors (0.34)'. ADDED: exact gap - fork's FileTypeDecorationProvider returns letter badges only, no color property; one-file fix adding ThemeColor per GitChangeType.

**U-J249 [XS] [portable] Create-PR entry-point polish** (rel 0.34.0, 0.42.0 #3410)

- Create PR button hidden when a PR already exists for the branch (0.34); Create PR icon disappearing from the Source Control view (#3410).
- Fork target: `src/view/reviewManager.ts`, `package.json`

**U-J250 [XS] [portable] 'Couldn't find an open repository' fix** (rel 0.38.0 #3242)

- Fix for spurious 'We couldn't find an open repository for...' errors (#3242) in repository discovery.
- Fork target: `src/azdo/repositoriesManager.ts`, `src/azdo/folderRepositoryManager.ts`

**U-J251 [S] [partial] Configurable PR queries + navigate-to-query action** (rel 0.32.0)

- Action jumping from a PR category to its query definition in settings.json. Prerequisite missing in fork: there is no queries setting at all - tree categories are hardcoded.
- ADO mapping: ADO has no PR search-query language; closest is GitPullRequestSearchCriteria (creatorId, reviewerId, status, source/targetRefName) in 10.2.2 - customizable queries would be criteria presets, not free-form search
- Fork target: `src/view/treeNodes/categoryNode.ts`, `src/view/prsTreeDataProvider.ts`, `package.json`
- Notes: Verified package.json has no azdoPullRequests.queries and categoryNode.ts has no queries reference.

**U-J252 [S] [partial] Checks section: skipped-state icon + empty pending-checks fixes** (rel 0.31.0-0.32.0 #3005, #2949)

- Skipped status check no longer rendered as pending (#3005, adds skip icon) and empty Pending Checks section fix (#2949).
- ADO mapping: Fork's merge.tsx already renders ADO PR statuses (GitStatusState incl. NotApplicable ≈ skipped); the bigger gap is branch-policy evaluations (build validation, min reviewers) which the fork never surfaces - PolicyApi.getPolicyEvaluations exists in bundled 10.2.2
- Upstream key files: `webviews/components/icon.tsx`, `webviews/components/merge.tsx`, `resources/icons/skip.svg`
- Fork target: `webviews/components/merge.tsx`, `webviews/components/icon.tsx`, `src/azdo/pullRequestModel.ts`

### 3.K1 Releases 0.30-0.23 (fork-point era)

**U-K1253 [S] [portable] Comment expand/collapse controls (collapse-all UI, commands, commentExpandState setting)** (rel 0.30.0 #2941, #2961)

- Adds a collapse-all button on comment threads, Expand All / Collapse All Comments commands, and a commentExpandState setting controlling default expansion. Fork has no trace of commentExpandState or collapse commands.
- Upstream key files: `src/github/... (c768e0be, 09594fdf touch package.json + comment controllers)`
- Fork target: `src/view/pullRequestCommentController.ts`, `src/view/reviewCommentController.ts`, `src/commands.ts`, `package.json`
- Notes: Pure vscode Comment API (thread.collapsibleState), provider-neutral. Later upstream (#3914) replaced custom commands with built-in expand/collapse - port the final shape, not the 0.30 original.

**U-K1254 [XS] [portable] Activity-bar sidebar UX polish: merged-PR state + review-submission language** (rel 0.29.0-0.30.0)

- Improved sidebar webview rendering for merged PRs and clearer wording that you can submit a review from the view. Fork's activityBarView webview exists but predates both changes.
- Fork target: `webviews/activityBarView/overview.tsx`, `src/azdo/activityBarViewProvider.ts`
- Notes: For ADO, 'submit a review' wording should map to casting a vote (-10..+10). Assumption: fork's sidebar currently shows minimal merged-state UX - verify visually before porting.

**U-K1255 [M] [portable] Old image version shown in image diffs (temp storage for binary content)** (rel 0.30.0 #2925)

- Fixes image diffs on checked-out PRs by saving base-version images to temp storage so the diff editor can render old vs new. Fork's gitContentProvider/inMemPRContentProvider serve text; binary/image base content has no equivalent path.
- Upstream key files: `src/common/temporaryState.ts`, `src/common/uri.ts`, `src/extension.ts`
- Fork target: `src/common/uri.ts`, `src/extension.ts`, `src/view/gitContentProvider.ts`
- Notes: ADO side: fetch base blob via GitApi.getItemContent/getBlobContent (in 10.2.2) with download=true. Pairs with the fork's avatarCache authenticated-media pattern.

**U-K1256 [XS] [portable] Suppress create-PR prompts and error messages when remote is not the provider's** (rel 0.28.0-0.30.0 #2884)

- Two fixes (#2768, #2879/#2884) stop the extension from prompting to create a PR or surfacing errors when the repo's remote isn't a GitHub remote. Fork analog: don't prompt/error when remotes aren't dev.azure.com.
- Upstream key files: `src/extension.ts`
- Fork target: `src/extension.ts`, `src/azdo/remoteUrlParser.ts`
- Notes: docs/fork/ISSUE-TRIAGE.md already fixed sign-in errors; verify whether non-ADO-remote publish prompts are already suppressed before porting - may be partially done.

**U-K1257 [S] [portable] Mentionable-users fetch gating and caching** (rel 0.29.1-0.30.0 #2893, #2902)

- Stops preloading mentionable users when no PR is checked out and adds caching to avoid repeated identity requests (#2893, #2902). Fork preloads getMentionableUsers on repositoriesChanged (folderRepositoryManager.ts:481) - the exact pattern the fix targets.
- Upstream key files: `src/github/folderRepositoryManager.ts`
- Fork target: `src/azdo/folderRepositoryManager.ts`, `src/azdo/azdoRepository.ts`, `src/gitProviders/GitHubContactServiceProvider.ts`
- Notes: In ADO the analog call (team members / identities) is also rate-limit-sensitive on large orgs. Fits scoping doc's API-usage-reduction theme (0.120/0.142) but is a distinct earlier fix.

**U-K1258 [S] [portable] Comments visible in diffs opened from the commits file view** (rel 0.29.0 #2799, #2821)

- Makes review comments render when a diff is opened from the Commits tree rather than the Files tree. Fork has the identical pre-fix structure (commitNode/commitsCategoryNode/reviewCommentController), so the bug likely reproduces.
- Upstream key files: `src/view/reviewCommentController.ts`, `src/view/treeNodes/commitNode.ts`, `src/view/treeNodes/commitsCategoryNode.ts`, `src/view/treeNodes/fileChangeNode.ts`
- Fork target: `src/view/reviewCommentController.ts`, `src/view/treeNodes/commitNode.ts`, `src/view/treeNodes/commitsCategoryNode.ts`, `src/view/treeNodes/fileChangeNode.ts`
- Notes: ADO iteration-scoped threads could make per-commit comment mapping cleaner than upstream's approach. Verify repro in fork first.

**U-K1259 [XS] [portable] Fix: "Webview is disposed" error when switching branches** (rel 0.29.0 #2828)

- Guards webview postMessage/update calls against disposed webviews when switching branches. Fork shares src/common/webview.ts and the same provider pattern.
- Upstream key files: `src/common/webview.ts`, `src/github/activityBarViewProvider.ts`, `src/github/issueOverview.ts`
- Fork target: `src/common/webview.ts`, `src/azdo/activityBarViewProvider.ts`, `src/azdo/pullRequestOverview.ts`

**U-K1260 [XS] [portable] Named status bar entries via createStatusBarItem(id/name)** (rel 0.28.0)

- Uses the newer createStatusBarItem API so entries show a proper name in the status bar context menu. Fork still calls the anonymous overload (reviewManager.ts:167).
- Fork target: `src/view/reviewManager.ts`

**U-K1261 [XS] [portable] Timeout for listing branches (large-repo hang)** (rel 0.28.0 #2765)

- Adds a timeout when listing branches so repos with thousands of branches don't hang UI flows. Fork's azdoRepository.listBranches() calls GitApi.getBranches with no timeout and getBranches returns full refs (heavier than names).
- Upstream key files: `src/github/githubRepository.ts`
- Fork target: `src/azdo/azdoRepository.ts`, `src/azdo/folderRepositoryManager.ts`
- Notes: Better ADO fix: use refs API with filter/top paging (GET .../refs?filter=heads/&$top=N, api-version 7.1) instead of getBranches, plus the timeout.

**U-K1262 [S] [portable] "There are updates" notification: rate-limited + permanently dismissible** (rel 0.28.0 #2801)

- Shows the PR-updates toast less often and adds a persistent don't-show-again option backed by new extension state. Fork shows it once per session with only a Pull button (reviewManager.ts:202) and has no persistent dismissal.
- Upstream key files: `src/extension.ts`, `src/extensionState.ts`, `src/view/reviewManager.ts`
- Fork target: `src/view/reviewManager.ts`, `src/common/persistentState.ts`
- Notes: Fork lacks src/extensionState.ts; reuse existing src/common/persistentState.ts / localStorageService.ts instead of adding a new module.

**U-K1263 [XS] [portable] Speech-bubble decoration for commented files in trees** (rel 0.26.0 #2658 (ea30f614))

- Changes the commented-file tree decoration badge to a speech bubble for clarity. Fork still uses a diamond badge (treeDecorationProvider.ts:33).
- Fork target: `src/view/treeDecorationProvider.ts`

**U-K1264 [XS] [portable] "All" PR tree category expanded by default** (rel 0.26.0)

- Expands the All category of the PR tree by default. Fork's CategoryTreeNode hardcodes CollapsibleState.Collapsed (categoryNode.ts:123).
- Fork target: `src/view/treeNodes/categoryNode.ts`

**U-K1265 [M] [portable] Terminal-link create-PR flow + terminalLinksHandler setting** (rel 0.23.0-0.26.0 #2349, #2530)

- Registers a terminal link provider so the URL printed after 'git push' starts the create-PR flow in-editor, with a setting to choose link handling. Fork has no terminal link provider (only vscode.d.ts type hits).
- Upstream key files: `src/github/createPRLinkProvider.ts`, `src/view/reviewManager.ts`, `package.json`
- Fork target: `src/view/reviewManager.ts`, `src/extension.ts`, `package.json`
- Notes: ADO push output prints a 'Create a pull request for X' URL (dev.azure.com/.../pullrequestcreate?sourceRef=...) - match it with remoteUrlParser and route into the fork's create flow. Depends on the create-PR experience item for a good landing spot.

**U-K1266 [S] [partial] CVE-2021-28470 vulnerability fix** (rel 0.25.1)

- Security fix for CVE-2021-28470 (RCE-class vulnerability in the extension). The fixing commit is not identifiable in public history (no CVE-tagged commit; April 2021 window shows only feature work).
- Notes: Fork point (2020-12-17) predates the fix, so if the vulnerable code is in shared (non-GitHub-API) code the fork may still carry it. Action: pull the MSRC advisory, identify the vulnerable pattern, and audit fork; I could not verify the fix location from the partial clone.

**U-K1267 [M] [partial] Auto-add upstream remote for forked repositories** (rel 0.25.0 #2560)

- Automatically adds an 'upstream' git remote when the open repo is a fork. ADO has repo forks (parentRepository on GitRepository), but ADO fork workflows are far rarer than GitHub's.
- Upstream key files: `src/github/folderRepositoryManager.ts`, `src/github/githubRepository.ts`
- Fork target: `src/azdo/folderRepositoryManager.ts`, `src/azdo/azdoRepository.ts`
- Notes: azure-devops-node-api 10.2.2 GitInterfaces exposes parentRepository on GitRepository, so detection is possible; low priority unless CIC adopts ADO forks.

**U-K1268 [S] [portable] Focused Mode enabled by default (active-PR view for checked-out PR)** (rel 0.25.0)

- Enables the Focused Mode view by default when a PR is checked out. Fork's focused mode is explicitly DISABLED - the setContext/workspaceState wiring is commented out with a 'FOCUSED MODE IS DISABLED' marker (reviewManager.ts:1034-1038) and no focusedMode setting is declared in package.json.
- Fork target: `src/view/reviewManager.ts`, `package.json`, `src/azdo/activityBarViewProvider.ts`
- Notes: Investigate why ankitbko disabled it before re-enabling; the azdo:activePullRequest webview already exists and works, so this is mostly re-wiring + declaring the setting.

**U-K1269 [L] [portable] Create-PR webview experience (activity-bar create view, source+target pickers, SCM entry, description autofill)** (rel 0.23.0-0.30.0 #2673, #2846, #2848)

- The create-PR flow as dedicated activity-bar views: enter title/description, view diff vs base, pick both source and target branch (0.25), create from SCM view, auto-fill description from a single commit / PR template (0.30), capitalize branch-derived titles. Fork has NO create view at all.
- Upstream key files: `src/github/createPRViewProvider.ts`, `src/view/reviewManager.ts`, `package.json`
- Fork target: `src/view/reviewManager.ts`, `src/azdo/folderRepositoryManager.ts`, `webviews/`, `package.json`
- Vs scoping doc: Scoping doc lists create-PR view evolution (0.23->0.70->0.134). ADDED: verified fork's current state - creation is reviewManager.createPullRequest() (line 898) driven by quickpicks and the pullRequestTitle/pullRequestDescription settings, no webview; and itemized the early-slice sub-features (source+target selection 0.25, SCM view command, single-commit/template autofill 0.30, branch-title capitalization) so the port can target the modern createPRViewProvider shape directly instead of replaying 0.23.
- Notes: Port the current upstream createPRViewProvider architecture, not the 0.23 original. ADO-native adds available in the same view: draft flag, work-item linking, auto-complete options.

**U-K1270 [XS] [portable] Prune local branches when deleting remote branch after merge** (rel 0.25.0 #2569)

- After merging and deleting the remote branch from the focused-mode view, local tracking branches are pruned. Fork's activityBarViewProvider has merge + deleteBranch handlers (lines 66-69) without the prune behavior.
- Upstream key files: `src/github/activityBarViewProvider.ts`
- Fork target: `src/azdo/activityBarViewProvider.ts`
- Notes: Related to scoping doc's auto-delete-branch-after-merge (0.126) - this is the small early precursor; ADO auto-complete's deleteSourceBranch handles the server side natively.

**U-K1271 [S] [portable] Split views into two activity-bar containers (PR overview vs active PR)** (rel 0.24.0)

- Separates the PR/issue overview viewlet from a dedicated active-pull-request viewlet. Fork has a single 'azdo-pull-requests' container holding login, changes, PR tree, and the active-PR webview.
- Upstream key files: `package.json`
- Fork target: `package.json`
- Notes: Mostly package.json contributes surgery plus context-key gating; decide deliberately - a second viewlet is UX opinion, and upstream later iterated again. Bundle with the focused-mode re-enable item.

**U-K1272 [XS] [portable] Focused-mode view actions: refresh and open description** (rel 0.24.0)

- Adds view-title actions on the active-PR view to refresh it and open the description page. Fork's azdo:activePullRequest view has only an openPullRequestInAzdo action.
- Fork target: `package.json`, `src/azdo/activityBarViewProvider.ts`, `src/commands.ts`

**U-K1273 [XS] [partial] Resolved conversations rendered collapsed on the description page** (rel 0.24.0)

- Description-page webview collapses resolved comment threads by default. Fork's webview already shows and changes ADO thread statuses (comment.tsx ThreadStatus dropdown) but has no collapsed-by-default rendering for non-active threads.
- ADO mapping: Collapse when CommentThreadStatus is fixed/wontFix/closed/byDesign (richer than GitHub's single resolved state)
- Fork target: `webviews/components/comment.tsx`, `webviews/components/timeline.tsx`

**U-K1274 [XS] [portable] Fix: commit-list timestamps no longer text-wrap** (rel 0.23.0)

- CSS fix so timestamps in the description-page commit list don't wrap. Fork shares the webview components including timestamp.tsx.
- Fork target: `webviews/components/timestamp.tsx`, `webviews/editorWebview/index.css`
- Notes: Verify it isn't already in the fork ancestry - 0.23.0 shipped days before the fork point; a 10-second visual check settles it.

### 3.K2 Releases 0.22-0.16 (pre-fork ancestry)

**U-K2275 [M] [portable] Code permalinks: copy permalink with best-remote pick, open permalink links locally** (rel 0.17.0-0.21.0)

- Copy a permanent link to selected code (picking the best remote by upstream/ups/origin priority containing the current commit), and open GitHub code permalinks found in hovers/text as local files. Includes 0.17 fix removing the noisy notification on copy.
- ADO mapping: ADO web URLs: https://dev.azure.com/{org}/{project}/_git/{repo}?path=/x&version=GC{sha}&line=N&lineEnd=M
- Upstream key files: `src/issues/util.ts`
- Fork target: `src/commands.ts`, `src/azdo/utils.ts`, `src/azdo/remoteUrlParser.ts`
- Notes: Upstream implementation lived in the deleted src/issues/ code (createGithubPermalink in src/issues/util.ts) but the feature itself is issues-independent. Fork's remoteUrlParser.ts already parses ADO remote URLs both ways, which is half the work.

**U-K2276 [XS] [partial] Focused review mode** (rel 0.21.0)

- Experimental layout change on PR checkout, gated by a focusedMode setting.
- Fork target: `src/view/reviewManager.ts`
- Notes: reviewManager.ts:1034 reads the focusedMode config but the setting is NOT declared in package.json, so it's undiscoverable and unverified. Declare the setting and smoke-test the layout path.

**U-K2277 [M] [partial] CI checks rendered on description page (GitHub Actions statuses fix)** (rel 0.20.0)

- Upstream fix ensured Action-based status checks render in the description merge area. Fork renders ADO PR statuses but not branch-policy evaluations.
- ADO mapping: ADO PR statuses API (rendered today) + Policy Evaluations API for build validation / min reviewers / comment resolution (not rendered; PolicyApi is present in azure-devops-node-api 10.2.2)
- Upstream key files: `src/github/pullRequestModel.ts`
- Fork target: `src/azdo/pullRequestModel.ts`, `webviews/components/merge.tsx`
- Notes: merge.tsx renders status.statuses via GitStatusState, so custom/pipeline PR statuses show; policy evaluations (the actual ADO analog of required checks) are absent - no PolicyEvaluation references anywhere in fork src.

**U-K2278 [L] [partial] Fork-repository flows (offer fork on no-push-permission, fork-and-push)** (rel 0.19.0)

- When the user lacks push permission, offers to fork the repository, reconfigure remotes, and push to the fork instead.
- Notes: ADO does have repo forks, but this UX (triggered from issues flow and push failures) has near-zero value for the fork's enterprise dev.azure.com audience. RECLASSIFIED per critic: node-api 10.2.2 ships the fork surface (getForks GitApi.d.ts:33-36, forkSource GitInterfaces.d.ts:1506); see ADD-01.

**U-K2279 [XS] [partial] LiveShare suggested contacts from mentionable users** (rel 0.16.0)

- Surfaces repo mentionable users as suggested contacts in the Live Share extension.
- ADO mapping: Fork's ADO mentionable users (IAccount) already feed the adapted provider
- Upstream key files: `src/gitProviders/GitHubContactServiceProvider.ts`
- Fork target: `src/gitProviders/GitHubContactServiceProvider.ts`, `src/extension.ts`
- Notes: The provider was already adapted to ADO types in the fork, but its registration is commented out at extension.ts:118. Re-enabling is XS; value depends on Live Share usage.

**U-K2280 [M] [partial] Git: Clone repository picker + create/publish repository from workspace** (rel 0.16.0)

- Contributes a repository picker to the built-in Git: Clone command and a flow to create a remote repository from a local workspace.
- ADO mapping: Git extension RemoteSourceProvider backed by CoreApi.getProjects + GitApi.getRepositories; repo creation via GitApi.createRepository (all present in azure-devops-node-api 10.2.2)
- Upstream key files: `src/gitProviders/gitCommands.ts`
- Fork target: `src/gitProviders/api.ts`, `src/extension.ts`
- Notes: Upstream's gitCommands.ts was dropped in the ADO rewrite (fork's src/gitProviders/ has no equivalent). Clone picker is the useful half for a multi-project org; publish-to-ADO is lower priority.

### 3.X Not portable (GitHub-service-coupled), with reasons

- **Verified-commit badges / attestation commit rendering** (rel 0.156.0-0.158.0): GitHub commit-signature/attestation verification; ADO exposes no verified-badge concept on commits.
- **URI handler rejects owner names with underscores** (rel 0.148.0): GitHub URL grammar; fork has its own ADO remoteUrlParser.ts already hardened for org/project quirks (spaces, casing, SSH per ISSUE-TRIAGE.md).
- **YAML schema validation for .github/ISSUE_TEMPLATE** (rel 0.148.0): GitHub-only file format; ADO has no repo-file issue templates.
- **GitHub 'Bad credentials' re-auth fixes** (rel 0.144.0-0.146.0): GitHub session/token store specific; fork auths via ADO PAT in src/azdo/credentials.ts, and sign-in error handling was already reworked per ISSUE-TRIAGE.md.
- **Issue sorting differs for CLI-created issues** (rel 0.142.0): GitHub issues integration, which the fork intentionally omits (ADO equivalent is work-item queries).
- **${issueType} variable in githubIssues.issueBranchTitle** (rel 0.144.0): Setting belongs to the GitHub issues integration absent from the fork; nearest ADO analog would be branch-from-work-item, a different feature.
- **GitHub Issues integration items (open issue at cursor, template metadata, TODO auto-assign, issue webview polish)** (rel 0.126.0-0.132.1): GitHub Issues service integration; fork has no issues view
- **Copilot coding-agent items** (rel 0.126.0-0.130.0): Copilot coding agent is a GitHub service (copilotApi/copilotRemoteAgent)
- **GitHub Enterprise items** (rel 0.126.0-0.132.0): GHE-specific; fork targets dev.azure.com cloud only
- **Checkout on Codespace from description webview** (rel 0.126.0): Codespaces is GitHub-only; no ADO equivalent
- **Copilot coding agent surface (PR cards, badges, mark-ready, session views, delegate-to-agent)** (rel 0.116.0-0.124.1): GitHub Copilot coding agent service; no ADO equivalent
- **GitHub Issues view features and fixes** (rel 0.116.0-0.120.0): Issues integration out of scope; work-items equivalent tracked as WI-\* gaps. RECLASSIFIED per critic.
- **GitHub user-list / GHE fixes** (rel 0.116.0-0.120.0): GitHub GraphQL / GitHub Enterprise specific; fork uses ADO entitlement API for user lists
- **Copilot coding agent / Padawan integration and related fixes** (rel 0.104.1-0.114.2): GitHub Copilot coding-agent service coupling
- **GitHub service/environment-coupled fixes (GHE, fork-flow, merge email, permalinks, gh CLI, github.dev, CODEOWNERS, github-actions reviewer)** (rel 0.104.0-0.114.0): GitHub auth/Enterprise/fork/merge-email mechanics with no ADO analog in the fork's credential model
- **Notifications view (default-shown, mark-as-done, top-level action cleanup)** (rel 0.108.0-0.112.0): GitHub notifications API; ADO has no equivalent PR notification feed
- **Unassigned events in timeline** (rel 0.112.0): ADO PRs have no assignee concept (reviewers only)
- **Interactive rebase interference fix** (rel 0.112.0): Fix lives in src/issues/stateManager.ts; fork ships no src/issues (verified)
- **Default file-comment action starts a review** (rel 0.110.0): ADO has no batch/draft review; Pending is a per-thread status (see THR-06). RECLASSIFIED per critic.
- **GitHub Enterprise GraphQL schema fixes (Bot fragment, start-review error)** (rel 0.100.1-0.102.0): GitHub GraphQL/GHE-specific; fork talks to ADO via REST node-api
- **Copilot integration: @githubpr chat participant, Summarize/Fix with Copilot, Notifications view** (rel 0.100.0-0.102.0): GitHub notifications API + Copilot service coupling
- **GitHub multi-account / SAML auth fixes** (rel 0.94.0-0.100.0): GitHub session/SAML auth model; fork authenticates with an ADO PAT (src/azdo/credentials.ts)
- **Rate-limited when adding reviewer after PR create in many-repo setup** (rel 0.94.0): GitHub REST rate-limit semantics; ADO throttling uses 429/Retry-After and isn't hit by this pattern
- **Issue completion trigger '- [ ]' fix** (rel 0.92.0): GitHub issues completion provider; fork has no issues integration
- **Add Projects to PRs and issues from the Create view** (rel 0.82.0): GitHub Projects has no ADO PR-level equivalent (Boards attach to work items, not PRs). RECLASSIFIED per critic.
- **Choose email for merge/squash commits** (rel 0.82.0): GitHub-specific GraphQL (viewer commit emails on merge mutation); ADO merge commits are authored by the service identity with no email selection
- **Owner-level (org .github repo) PR templates** (rel 0.82.0): GitHub org-level .github-repo template mechanism; ADO PR templates are repo-scoped only (.azuredevops/pull_request_template)
- **Issues-view features: groupBy for issue queries, issue templates on create** (rel 0.80.0): issues integration is GitHub-service-coupled and already scoped out; ADO equivalent is work items
- **mergeQueueEntry GraphQL error fix** (rel 0.86.1): merge queues don't exist in ADO
- **EMU invalid-email GraphQL fix** (rel 0.88.1): GitHub Enterprise Managed Users auth quirk; no ADO analogue
- **Merge queue support (description + create view) and mergeQueueEntry GraphQL hotfix** (rel 0.78.0-0.78.1): ADO has no merge-queue primitive
- **GitHub Projects on PRs (cache + set from description webview)** (rel 0.76.0-0.78.0): no ADO PR-project primitive
- **Merge commit message from GitHub repo settings** (rel 0.78.0): GitHub repo-level merge-message setting has no ADO equivalent
- **"Create an Issue" second-invocation fix** (rel 0.74.0): issues integration is GitHub-only
- **Remove Milestone from PR** (rel 0.72.0): ADO pull requests have no milestone field
- **GitHub Enterprise comments fix** (rel 0.68.1): GHE support explicitly out of scope
- **supportHtml markdown hardening (CVE-2023-36867)** (rel 0.66.2): fix targets issue-label HTML span rendering in the GitHub issues integration the fork doesn't have
- **TypeError reading 'number' crash fix** (rel 0.66.1): null-guard in src/github/githubRepository.ts query code the fork's azdoRepository long diverged from
- **Improper GitHub state mapping: overview shows closed instead of merged** (rel 0.64.0): GitHub merged-vs-closed distinction; ADO uses a different status enum (active/completed/abandoned) with no equivalent ambiguity
- **Open PRs on vscode.dev + permalink improvements** (rel 0.58.0-0.64.0): vscode.dev/github.com permalink machinery is GitHub-service-coupled (already ruled out in scoping doc)
- **Issues-view items (collapse state, duplicated issues, org query crash)** (rel 0.58.0-0.66.0): fork has no GitHub issues view; concept space belongs to ADO work items
- **GitHub Enterprise request-flood fix** (rel 0.58.2): GHE-specific; GHE support is out of scope per scoping doc
- **vscode.dev PR links + notebook permalink support** (rel 0.56.0): vscode.dev/github.dev permalinks are GitHub-service-coupled (already on scoping NOT-portable list)
- **Fix: can't create issue without body** (rel 0.54.0): issues integration is GitHub-coupled; ADO equivalent is work items (out of extension scope)
- **GitHub Enterprise support improvements** (rel 0.50.0-0.52.0): GHE-specific; fork targets dev.azure.com cloud only (already on scoping NOT-portable list)
- **Unread-notification highlighting of PRs** (rel 0.50.0): built on the GitHub Notifications API; ADO has no equivalent PR-notification read/unread API (notifications view already scoped NOT-portable)
- **New-issue editor never loses data** (rel 0.50.0): issues integration is GitHub-coupled; ADO equivalent = work items, out of extension scope
- **Milestone creation from dropdown** (rel 0.48.0): ADO PRs have no milestone concept (nearest is iteration path on linked work items - different surface)
- **GitHub-service fixes: two-account notification, vscode.dev 30-file cap, github.dev new-file comments, permalink wrong hash/LHS** (rel 0.46.0-0.50.0): GitHub/vscode.dev service surfaces the fork does not target
- **vscode.dev / github.dev web fixes and permalinks** (rel 0.34.0-0.44.0): web extension host + vscode.dev permalinks; fork is desktop-only (scoping doc already excludes permalinks)
- **GitHub auth provider fixes** (rel 0.31.1-0.44.0): VS Code GitHub authentication provider; fork authenticates with a PAT via src/azdo/credentials.ts
- **GitHub Issues integration features and fixes** (rel 0.31.0-0.42.0): GitHub issues subsystem; ADO equivalent is work items (fork already has src/azdo/workItem.ts for PR work-item linking)
- **CODEOWNERS @user completions** (rel 0.40.0): ADO has no CODEOWNERS; equivalent is required-reviewer branch policies with path filters (server-side config)
- **Pending-review gating on comments** (rel 0.36.0, 0.42.0): ADO has no batch/draft review; Pending is a per-thread status (see THR-06). RECLASSIFIED per critic.
- **Fix: edits to PR comments not being applied** (rel 0.30.0): fix isolated to GitHub-specific API layer
- **Fix: issue queries have the wrong owner** (rel 0.30.0): GitHub issues feature; ADO equivalent is work items
- **GitHub permalink commands (line info fix, github.dev fix, sign-in-free copy, copy-as-markdown)** (rel 0.23.0-0.30.0): GitHub/vscode.dev URL machinery absent from fork
- **"Start working" on an issue outside the current repo** (rel 0.29.0): GitHub issues feature
- **Fix: deleting a comment from the overview page** (rel 0.29.0): fix isolated to GitHub-specific API layer
- **Fix: comments stuck "pending"** (rel 0.29.0): ADO has no batch/draft review; Pending is a per-thread status (see THR-06). RECLASSIFIED per critic.
- **Fix: placeholder avatar with GitHub Enterprise** (rel 0.28.0): GHE-specific; fork's avatarCache supersedes
- **GitHub Enterprise support** (rel 0.27.0): GitHub-host-specific; ADO Server/on-prem explicitly out of scope
- **"Go to Review" button replacing Delete/Finish Review in comment widget** (rel 0.26.0): ADO has no batch/draft review; votes replace review submission (see THR-06). RECLASSIFIED per critic.
- **Assignees and milestones on the PR description page (view + add/remove)** (rel 0.24.0-0.25.0): no assignee/milestone fields on ADO PRs
- **Fix: ${user} used twice in queries setting** (rel 0.25.0): fork dropped the configurable-queries feature; nothing to fix

### 3.Y Superseded by ADO-native behavior (nothing to build)

- **Issue-link fix in PR body/timeline** (rel 0.156.0): ADO work items are first-class PR links; fork already renders/associates/removes linked work items (pr.associate-workItem / pr.remove-workItem messages in pullRequestOverview.ts, sidebar.tsx).
- **Checks / auto-merge display fixes** (rel 0.126.0-0.138.0): ADO branch-policy evaluations (Policy API) + PR statuses API replace checks; auto-complete with completionOptions replaces auto-merge - fork already sends completionOptions (pullRequestModel.ts:257). A fork checks-equivalent view should be built directly on policy evaluations, making these GitHub-shaped bugs moot.
- **Issues integration changes (issue webview, closing, creation, completions, hovers)** (rel 0.104.0-0.114.0): ADO work items are first-class on PRs (fork src/azdo/workItem.ts); the ADO-shaped analog would be a work-item webview/view, not a port of GitHub issues.
- **Show workflow name (not just job name) for PR checks** (rel 0.104.0): ADO policy evaluations / build validation already carry the pipeline (build definition) name natively via PolicyApi + BuildApi in node-api 10.2.2.
- **Append PR number to merge commit message** (rel 0.82.0): ADO merge commits are always titled 'Merged PR {id}: ...' by the service, and auto-complete's completionOptions.mergeCommitMessage covers customization.
- **Load up to 1000 comment threads** (rel 0.68.0): GitApi.getThreads (fork already uses it, src/azdo/pullRequestModel.ts:435) returns all threads; nothing to port.
- **Issues referenced by # in PR titles linked** (rel 0.52.0): ADO work-item links are first-class on PRs (GitPullRequest.workItemRefs; AB# syntax; work-item-linking branch policy). Fork already has src/azdo/workItem.ts for work-item data.
- **Fix: could not resolve conversation on old PR** (rel 0.30.0): ADO thread statuses (active/fixed/wontFix/closed/byDesign/pending) - already wired in fork (src/azdo/pullRequestModel.ts, webviews/components/comment.tsx status dropdown)
- **GitHub Issues feature suite (issues view, completions, hovers, start-working-on-issue, new issue editor)** (rel 0.16.0-0.22.0): ADO work items (WIT API): #ID/AB# hovers and completions, work-items tree via WIQL queries, branch-from-work-item (ADO-native), PR work-item linking (already first-class on ADO PRs)
- **Fix: commenting on stale pull requests** (rel 0.20.0): ADO PR iterations: threads carry iteration context natively, so comments on older pushes are first-class rather than a staleness edge case

### 3.Z Already in fork (verified present)

- **Display linked issue(s) in the PR Overview** (rel 0.142.0): `src/azdo/pullRequestOverview.ts`, `src/azdo/workItem.ts`, `webviews/components/sidebar.tsx`
- **Comment-resolution server persistence + rapid-resolve race fix** (rel 0.136.0): `src/azdo/pullRequestModel.ts`
- **Avatar not showing in PR details page** (rel 0.128.0): `src/azdo/avatarCache.ts`
- **Avatar display fix in PR tree view (PR #7851)** (rel 0.122.0): `src/azdo/avatarCache.ts`
- **Resolve/Unresolve Conversation via keybindings** (rel 0.104.0): `package.json`
- **Actionable 'Bad credentials' sign-in errors** (rel 0.82.0): `docs/fork/ISSUE-TRIAGE.md`
- **Multi-root: PRs shown for only one repo** (rel 0.64.0): `src/azdo/repositoriesManager.ts`
- **Sign-in error: Try Again doesn't retry** (rel 0.58.0): `docs/fork/ISSUE-TRIAGE.md`, `src/azdo/credentials.ts`
- **Thread resolve/unresolve from Overview with always-visible controls** (rel 0.50.0-0.56.0): `webviews/common/context.tsx`, `webviews/components/comment.tsx`, `src/azdo/pullRequestModel.ts`
- **Fix: apply-patch (suggestion) bugs** (rel 0.48.0): `src/commands.ts`
- **Fix: cannot view more than ~100 files in a PR** (rel 0.46.0): `src/azdo/pullRequestModel.ts`
- **Multiline (range) comments** (rel 0.42.0): `src/azdo/pullRequestModel.ts`
- **Open PR by number** (rel 0.34.0): `src/commands.ts`
- **SSH-over-HTTPS remote URL support** (rel 0.34.0): `src/azdo/remoteUrlParser.ts`
- **Viewed-file checkmarks with inline mark-as-viewed actions** (rel 0.26.0): `src/view/fileViewedDecorationProvider.ts`, `src/azdo/fileReviewedStatusService.ts`
- **Resolve conversations in editor; resolved threads collapse by default** (rel 0.26.0): `src/view/pullRequestCommentController.ts`, `src/azdo/pullRequestModel.ts`, `webviews/components/comment.tsx`
- **Leave/Exit Review Mode command** (rel 0.22.0): `src/view/reviewManager.ts`
- **File changes expanded by default in PR view** (rel 0.22.0): `src/view/treeNodes/filesCategoryNode.ts`
- **Exact-time hover on description timestamps** (rel 0.22.0): `webviews/components/timestamp.tsx`
- **Inline checkout action on Description tree node** (rel 0.22.0): `src/view/treeNodes/descriptionNode.ts`
- **PR number first in tree label + prominent DRAFT indicator** (rel 0.22.0): `src/view/treeNodes/pullRequestNode.ts`
- **Toggle tree vs flat layout for changed files** (rel 0.22.0): `src/view/prChangesTreeDataProvider.ts`, `src/view/treeNodes/filesCategoryNode.ts`
- **Auto-reveal opened file in Changes in Pull Request view** (rel 0.22.0): `src/view/treeNodes/repositoryChangesNode.ts`, `src/view/prChangesTreeDataProvider.ts`
- **Fix: comment link on description page always opens the associated file** (rel 0.22.0): `webviews/components/comment.tsx`
- **Fix: suppress 'remote is not a repository' error for remotes outside the remotes setting** (rel 0.22.0): `src/azdo/repositoriesManager.ts`
- **Copy PR link action on description page** (rel 0.21.0): `src/azdo/pullRequestOverview.ts`, `webviews/components/header.tsx`
- **Sign-in welcome view (replaces per-view login buttons)** (rel 0.18.0-0.21.0): `src/view/prsTreeDataProvider.ts`
- **Shortened diff tab titles with '(Pull Request)' suffix** (rel 0.21.0): `src/azdo/pullRequestModel.ts`, `src/view/treeNodes/fileChangeNode.ts`
- **Multi-repo workspace model + multiroot fixes** (rel 0.17.0-0.20.0): `src/azdo/repositoriesManager.ts`, `src/azdo/folderRepositoryManager.ts`
- **pullRequestDescription source setting (template / commit / custom / ask)** (rel 0.20.0): `src/view/quickpick.ts`
- **Fix: fetch users only when needed (not on startup)** (rel 0.18.0): `src/azdo/userManager.ts`
- **VS Code Authentication Provider API adoption** (rel 0.16.0): `src/azdo/credentials.ts`
- **Fetch button / handling for partial content in diffs** (rel 0.16.0): `src/common/diffHunk.ts`, `src/view/inMemPRContentProvider.ts`

---

## 4. Cross-cutting engineering notes

**azure-devops-node-api 10.2.2 gaps (verified absences; raw REST fallbacks).** The bundled client covers ~95% of this roadmap. Known holes, all verified against the local d.ts and Microsoft Learn:

| Missing in 10.2.2                                                                          | REST fallback                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IdentityRefWithVote.hasDeclined` (decline review)                                         | `PATCH .../pullRequests/{prId}/reviewers/{reviewerId}?api-version=7.1` body `{"hasDeclined":true}`                                                                                                                                  |
| `completionOptions.autoCompleteIgnoreConfigIds` (auto-complete ignoring optional policies) | pass the extra property through a widened type on `updatePullRequest`; the client serializes the body as-is against the same route                                                                                                  |
| Branch-scoped policy configurations (`git/policy/configurations?refName=`)                 | `GET {org}/{project}/_apis/git/policy/configurations?repositoryId={id}&refName={ref}&api-version=7.1` (server-side branch matching incl. prefix); v10 fallback is `PolicyApi.getPolicyConfigurations` + client-side scope filtering |
| `GitPullRequestSearchCriteria.labels` (and `notCreatedBy`, `queryTimeRange`)               | `GET .../pullrequests?searchCriteria.labels={name}&api-version=7.1`                                                                                                                                                                 |
| Batch label enrichment on PR lists                                                         | `POST .../pullRequestQuery?api-version=7.2-preview.1` with `Include=Labels` (sprint 254); otherwise one `getPullRequestLabels` per PR                                                                                               |
| Work-item full-text search                                                                 | `POST https://almsearch.dev.azure.com/{org}/{project}/_apis/search/workitemsearchresults?api-version=7.1` (requires Search service); WIQL `CONTAINS WORDS` is the in-client fallback                                                |
| Identity Picker (people/group search)                                                      | `POST {org}/_apis/IdentityPicker/Identities?api-version=7.1-preview.1` (ADD-02)                                                                                                                                                     |
| Real-time vote/reset/thread events                                                         | SignalR only, no REST/node-api equivalent at any version; poll `getPullRequestReviewers` (cheap single route) and diff                                                                                                              |

**Preview APIs.** Policy evaluations, PR labels, and PR attachments are preview REST resources (`api-version=7.1-preview.1`); the 10.2.2 client negotiates preview versions itself. Fine for dev.azure.com cloud, which is this fork's stated target (on-prem Azure DevOps Server is out of scope, upstream issue #58).

**Untyped policy payloads.** `PolicyConfiguration.settings` and `PolicyEvaluationRecord.context` are `any` in all client versions (PolicyInterfaces.d.ts:37,79). Define local interfaces per policy type (minimumApproverCount, creatorVoteCounts, buildDefinitionId, filenamePatterns, allowSquash...) and resolve policy-type display names at runtime via `getPolicyTypes(project)` instead of hardcoding GUIDs (well-known GUIDs used in this doc: min reviewers `fa4e907d-c16b-4a4c-9dfa-4906e5d171dd`, work-item linking `40e92b44-2fe1-4dd6-b3d8-74a9c21d0c6e`; confirm per-org).

**artifactId formats (easy to confuse).** Policy evaluations use `vstfs:///CodeReview/CodeReviewId/{projectId}/{pullRequestId}`; work-item linking uses `vstfs:///Git/PullRequestId/{projectId}%2F{repositoryId}%2F{pullRequestId}` (the PR's own `artifactId` field, populated by `getPullRequestById`). URL-encode when passing as a query param.

**Authenticated media pattern.** Any ADO-hosted image (avatars, attachment images in markdown) 401s in a webview. The solved pattern is `src/azdo/avatarCache.ts` (`fetchAvatarAsDataUri`, `resolveAvatarsDeep`): authenticated fetch in the extension host, rewrite to `data:` URIs before posting to the webview (CSP already allows `data:`). Reuse for DLA-06/DLA-07; cache by URL.

**Known client bug.** `getCommitDiffs` mis-serializes boolean query params (azure-devops-node-api#429); the fork works around it with a cast (`pullRequestModel.ts:649-653`). Watch for the same when adding new boolean query params through this client version, or upgrade the dependency (current is 12.x+; an upgrade is its own S/M task with typing churn).

**Webview message discipline.** Unhandled webview messages die silently (`src/common/webview.ts:58-66` never replies), which is how the dead readyForReview/request-changes buttons shipped. When adding messages: add the case to BOTH hosts (`pullRequestOverview.ts` and `activityBarViewProvider.ts`) or explicitly reply-with-error on unknown messages (worth doing as part of v1.4).

**Issue-triage cross-map** (open items from [ISSUE-TRIAGE.md](ISSUE-TRIAGE.md) that this roadmap resolves):

| Triage item                                  | Roadmap home                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| #71 description images don't load            | DLA-06 (v1.7)                                                               |
| #48 @mention GUIDs unresolved                | ADD-04 read side (v1.7 stretch)                                             |
| #49 All Active should include group/team PRs | REST-15 + ADD-02 (v1.9)                                                     |
| #59 PR count badges on collapsed nodes       | POL-08/VOTE-04 tree decoration work (v1.5/v1.6)                             |
| #80 surface current-branch PR                | falls out of activity-bar repair (v1.4) + polling (v1.9)                    |
| #109 "can not find content" on file diff     | expected fix via ITER-03 iteration change source (v1.6); verify repro after |
| #34 create PR flow                           | DLA-03 MVP (v1.8), webview later                                            |
| #58 on-prem support                          | out of scope (unchanged)                                                    |

**Verification debt (flagged by agents, confirm before building on):**

- ITER-01's claim that `threadContext` holds the tracked position when threads are fetched with an iteration pair matches the d.ts contract, but should be confirmed against a live PR with a line-shifting second push before shipping the inversion.
- ITER-06's "untrackable thread" signal is not spelled out by the typings; needs one live-PR experiment.
- ADO vote-reset behavior on convert-to-draft (DLA-02 prompt copy) needs a live check.
- The 0.25.1 CVE-2021-28470 fix could not be located in public history (chunk K1); treat as unverifiable rather than unpatched.

---

## 5. Execution guide

The backlog above is research; this section is the operating manual for burning it down. Items are scoped so that most of v1.4 and much of v1.5/v1.7 can be implemented by a cheaper model or a delegated coding agent working from the item entry alone. Reserve the strongest model for the design-heavy items flagged below.

### 5.1 Per-item workflow

1. Branch from master: `fix/<id>-<slug>` or `feat/<id>-<slug>` (e.g. `fix/dla-01-ready-for-review`).
2. Read the item entry (Section 2 or 3) and every file in its "Key files" list before editing. The current-state refs are the spec of what exists; the Desired line is the acceptance criterion.
3. Implement. When adding a webview message, add the case to BOTH hosts (`src/azdo/pullRequestOverview.ts` and `src/azdo/activityBarViewProvider.ts`) or reply-with-error on unknown messages; silent message drops are how the v1.4 bugs shipped.
4. Verify, in order:
   - `npx tsc --noEmit -p tsconfig.json` (esbuild bundling skips type checks; tsc is the real gate)
   - `yarn run bundle`
   - Smoke in the Extension Development Host (F5) against a real ADO PR in a test repo. Items touching votes/policies/completion need a PR on a branch with at least one policy configured to see the ADO-native behavior.
   - For release candidates: `npx @vscode/vsce package --no-dependencies` and install the .vsix locally.
5. One item = one commit, message referencing the roadmap ID (`fix(votes): map Request Changes to -5 vote (VOTE-02)`); update `CHANGELOG.md` under the pending version heading.
6. Mark the milestone-table row done (strike-through) in this file in the same commit.

### 5.2 Dependency order (do not reorder past these edges)

- v1.4: VOTE-03 (reviewer shape fix) before VOTE-02 (sidebar vote actions). AC-03 (merge stub reroute) before deleting any stub code paths.
- v1.5: POL-01 (evaluations fetch + panel) before POL-04 (build click-through), POL-05 (sidebar summary), WI-03 and THR-03 (policy-specific rows). AC-02 (auto-complete) reuses POL-01's "pending blocking policies" signal for its show/hide logic; build POL-01 first.
- v1.6: ITER-08 (cache iterations) first; then ITER-03 (iteration change source); ITER-02/04/05/06/07 all consume ITER-03's changeTrackingId/iteration plumbing. Run the two live-PR experiments in Section 4 "Verification debt" BEFORE building ITER-01-adjacent work into ITER-02.
- v1.7: DLA-06 (render images) before DLA-07 (paste upload), or pasted images upload but never render.
- v1.8: DLA-03 (create MVP) before WI-04 and REST-11.

### 5.3 Routing: mechanical vs design-heavy

Mechanical (spec is complete in the item entry; suitable for a cheaper model or delegated agent, review the diff after):

- All of v1.4 except AC-03 (three call sites, needs judgment on the simple-view UX).
- v1.5: AC-05, POL-10, VOTE-07, POL-08, AC-07.
- v1.7: THR-01, THR-02, THR-05, WI-01, WI-05, WI-06, DLA-04, REST-08 display half.
- v1.8: REST-12, REST-13, REST-14, VOTE-06.
- Section 3 XS/S polish items generally.

Design-heavy (do the design pass with the strongest model or by hand; then implementation can be delegated):

- POL-01 (panel information architecture; local interfaces for untyped policy settings/context)
- AC-02 (auto-complete UX states: none / set-by-me / set-by-other / policy-satisfied race)
- ITER-02/03/04 (URI scheme changes, thread anchoring semantics, tree restructure)
- THR-06 (product decision: drop Pending or build batching)
- DLA-03 (create-flow UX, plus ADD-05 constraints)
- ADD-01/ADD-02 (exploratory, API behavior unverified against a live org)

Delegation note: each gap entry maps 1:1 onto a delegation spec (Task = title, Context = area preamble, Requirements = Desired, Files = Key files, Acceptance = Desired + tsc/bundle gates, DO NOT = files outside Key files). Paste-ready as-is.

### 5.4 Session hygiene for agent-driven implementation

- Work in this repo directly (`~/src/vscode-pull-request-azdo`), one milestone table as the session's task list; do not load the whole roadmap into context, load Section 5 plus the specific item entries being worked.
- The `ms` remote is a blob-less partial clone: `git show ms/main:<path>` fetches single blobs on demand; never run wholesale diffs/merges against ms/main (known result: 202 conflicts).
- After each landed item, re-run the v1.4 smoke set (vote from sidebar, complete a PR, publish a draft) since these surfaces share the webview message plumbing.
- Release cadence: version bump + CHANGELOG + `vsce package` once per completed milestone, not per item; tag `v1.x.0` on master.
