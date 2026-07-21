/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzdoRepository } from '../azdo/azdoRepository';
import { FolderRepositoryManager } from '../azdo/folderRepositoryManager';
import { PRType } from '../azdo/interface';
import { PullRequestModel } from '../azdo/pullRequestModel';
import { AuthenticationError } from '../common/authentication';
import Logger from '../common/logger';
import { formatError } from '../common/utils';

// A closed-PR page is small on purpose (merged/abandoned history can run into the thousands per
// repo) - the dashboard page paginates through it on scroll instead of fetching it all at once.
export const CLOSED_PAGE_SIZE = 25;

// The categories the dashboard (both the tree view and the webview page) aggregates across every
// repo in the workspace.
export const DASHBOARD_CATEGORIES: { type: PRType; label: string }[] = [
	{ type: PRType.NeedsMyReview, label: 'Waiting For My Review' },
	{ type: PRType.AssignedToMe, label: 'Assigned To Me' },
	{ type: PRType.CreatedByMe, label: 'Created By Me' },
	{ type: PRType.AllActive, label: 'All Active' },
];

export interface DashboardEntry {
	folderManager: FolderRepositoryManager;
	pr: PullRequestModel;
}

export interface DashboardFetchResult {
	entries: DashboardEntry[];
	unsearchedFolderManagers: FolderRepositoryManager[];
	needLogin: boolean;
}

// Fetches `type` from each of `folderManagers` in parallel, fault-isolated per repo (an
// unreachable/unauthenticated repo doesn't blank the rest). A FolderRepositoryManager can have more
// than one AzDO remote; getPullRequests() only searches remotes until the first one returns
// results, reporting hasUnsearchedRepositories - the caller re-invokes with fetchNextPage: true for
// just those repos to search further (mirrors the per-repo tree's "load more" behavior). Shared by
// the tree-view dashboard (dashboardCategoryNode.ts) and the dashboard webview page
// (prDashboardPanel.ts) so the two surfaces can't drift on how "load more" is interpreted.
export async function fetchDashboardCategory(
	folderManagers: FolderRepositoryManager[],
	type: PRType,
	fetchNextPage: boolean,
): Promise<DashboardFetchResult> {
	let needLogin = false;
	const entries: DashboardEntry[] = [];
	const unsearchedFolderManagers: FolderRepositoryManager[] = [];
	await Promise.all(
		folderManagers.map(async folderManager => {
			try {
				const response = await folderManager.getPullRequests(type, { fetchNextPage });
				entries.push(...response.items.map(pr => ({ folderManager, pr })));
				if (response.hasUnsearchedRepositories) {
					unsearchedFolderManagers.push(folderManager);
				}
			} catch (e) {
				if (e instanceof AuthenticationError) {
					needLogin = true;
				} else {
					Logger.appendLine(
						`Dashboard: fetching ${PRType[type]} from ${folderManager.repository.rootUri.toString()} failed: ${formatError(e)}`,
					);
				}
			}
		}),
	);
	return { entries, unsearchedFolderManagers, needLogin };
}

// "Recent activity" proxy: GitPullRequest has no generic lastUpdated field, so use the latest of
// what the list payload already carries (no extra API calls) - when it closed, when its source
// branch was last pushed to, or when it was created, whichever is most recent.
export function getActivityDate(pr: PullRequestModel): Date | undefined {
	const candidates = [pr.item.closedDate, pr.item.lastMergeSourceCommit?.committer?.date, pr.item.creationDate].filter(
		(d): d is Date => !!d,
	);
	let latest: Date | undefined;
	for (const candidate of candidates) {
		if (!latest || candidate > latest) {
			latest = candidate;
		}
	}
	return latest;
}

// "Closed" has no single PullRequestStatus value of its own - Completed and Abandoned are distinct
// statuses, and the search criteria only accepts one status per query (no bitmask). Querying each
// separately, rather than status: All filtered client-side, means every page fetched is entirely
// closed PRs - no slots wasted on Active items sitting between them in the same list.
const CLOSED_STATUSES = [PullRequestStatus.Completed, PullRequestStatus.Abandoned];

// Per-(folder, remote, status) cursor for the Closed tab's real skip/top pagination - distinct from
// fetchDashboardCategory's repo-by-repo "load more" (which pages through remotes, not through a
// single remote's own results). Tracked one level below FolderRepositoryManager because a folder can
// have more than one AzDO remote, each with its own independent history to page through, and one
// cursor per status because they're independently paginated queries.
export interface ClosedPullRequestsCursor {
	folderManager: FolderRepositoryManager;
	azdoRepository: AzdoRepository;
	status: PullRequestStatus;
	skip: number;
	exhausted: boolean;
}

export function createClosedPullRequestsCursors(folderManagers: FolderRepositoryManager[]): ClosedPullRequestsCursor[] {
	return folderManagers.flatMap(folderManager =>
		folderManager.azdoRepositories.flatMap(azdoRepository =>
			CLOSED_STATUSES.map(status => ({ folderManager, azdoRepository, status, skip: 0, exhausted: false })),
		),
	);
}

// Advances every not-yet-exhausted cursor by one page, in parallel, fault-isolated per
// (remote, status) pair (a failing one is marked exhausted rather than retried forever).
export async function fetchClosedPullRequestsPage(
	cursors: ClosedPullRequestsCursor[],
): Promise<{ entries: DashboardEntry[]; hasMore: boolean }> {
	const entries: DashboardEntry[] = [];
	await Promise.all(
		cursors
			.filter(cursor => !cursor.exhausted)
			.map(async cursor => {
				try {
					const page = await cursor.azdoRepository.getPullRequests({ status: cursor.status }, cursor.skip, CLOSED_PAGE_SIZE);
					entries.push(...page.map(pr => ({ folderManager: cursor.folderManager, pr })));
					cursor.skip += page.length;
					if (page.length < CLOSED_PAGE_SIZE) {
						cursor.exhausted = true;
					}
				} catch (e) {
					cursor.exhausted = true;
					Logger.appendLine(
						`Dashboard: fetching ${PullRequestStatus[cursor.status]} PRs from ${cursor.folderManager.repository.rootUri.toString()} failed: ${formatError(e)}`,
					);
				}
			}),
	);
	return { entries, hasMore: cursors.some(cursor => !cursor.exhausted) };
}
