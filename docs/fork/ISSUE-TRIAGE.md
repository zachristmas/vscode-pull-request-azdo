# Upstream issue triage (ankitbko/vscode-pull-request-azdo)

Generated 2026-07-16. All 40 open upstream issues classified against this fork.
Policy: we do not comment on upstream issues; this doc is the internal record.

## Fixed in this fork

| Issue     | Title                                              | Fixed by                                    |
| --------- | -------------------------------------------------- | ------------------------------------------- |
| #111      | Multi-root workspace issues                        | 3c03764 (multi-project)                     |
| #61       | Project Name Required / repo casing                | 3c03764 + a86bfa04 (case-insensitive match) |
| #107      | Auto-detection fails for project with spaces       | 3c03764 + ce9ee7f2                          |
| #106      | Auto-detection fails for SSH url                   | ce9ee7f2 (remoteUrlParser)                  |
| #92 / #73 | Not all files loaded / first 1000 changes          | 78d9eba4 (paginated getCommitDiffs)         |
| #70 / #46 | Sign-in does nothing                               | e743bdff (actionable error)                 |
| #95       | Mark-as-viewed hits same-name files                | 8f3e4b16 (fileName keying)                  |
| #103      | Mark-as-viewed substring crash                     | 8f3e4b16 (guard)                            |
| #43 / #41 | Comments hide line contents / comment on selection | 6c5ae8ff (real offsets)                     |
| #33       | Checkout by PR ID                                  | (checkoutById command)                      |
| #88       | Copilot apply-suggestion                           | already upstream (revamp #105)              |
| #66 / #67 | Comment lands one line above                       | already upstream (80d409a)                  |
| #13       | Wrong files when diff target is HEAD               | already upstream (node-api #429 workaround) |

## Open MEDIUM candidates

- #109 "can not find content" opening a file diff -- URI carries empty fileName; likely delete/rename miss in change_map matching (pullRequestModel.ts ~800-812); needs repro
- #71 Description images don't load -- extend avatarCache authenticated-fetch mechanism to attachment URLs in webview markdown (CSP already allows data:)
- #48 @mention GUIDs not resolved -- identity lookup + bidirectional text rewrite
- #49 All Active should include group/team-assigned PRs -- change PR search criteria (categoryNode.ts ~134-210)
- #59 PR count badges on collapsed nodes -- eager count fetches + caching
- #80 Surface current-branch PR + open working-tree file -- discoverability polish

## LARGE

- #34 Create PR flow (see UPSTREAM-SCOPING.md port item 4)
- #58 Azure DevOps Server on-prem support -- pervasive (auth, URL shapes, API locations)

## Declined / out of scope

#113 (jj), #112 (auth question; MS auth already supported), #104 (WSL env), #97 (Cursor auth broker; PAT workaround), #96 (dev containers), #93 (VS Code platform bug), #90 (no repro; recheck after SSH fix), #89 (voice), #85 (Code-OSS; PAT setting exists), #82 (FYI), #77 (third-party), #64 (VS Code platform limitation), #60/#28 (stale keytar era), #21 (upstream platform issue)
