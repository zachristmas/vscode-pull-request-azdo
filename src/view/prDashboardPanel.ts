/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { PullRequestAsyncStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';
import * as vscode from 'vscode';
import {
	ClosedPullRequestsCursor,
	createClosedPullRequestsCursors,
	DASHBOARD_CATEGORIES,
	fetchClosedPullRequestsPage,
	fetchDashboardCategory,
	getActivityDate,
} from './dashboardData';
import { FolderRepositoryManager } from '../azdo/folderRepositoryManager';
import { PRType } from '../azdo/interface';
import { PullRequestModel } from '../azdo/pullRequestModel';
import { PullRequestOverviewPanel } from '../azdo/pullRequestOverview';
import { RepositoriesManager } from '../azdo/repositoriesManager';
import { AzdoUserManager } from '../azdo/userManager';
import { AzdoWorkItem } from '../azdo/workItem';
import { buildShareableLink, deepLinkParamsFromPullRequest } from '../common/deepLink';
import { ITelemetry } from '../common/telemetry';
import { getNonce, IRequestMessage, WebviewBase } from '../common/webview';
import { SETTINGS_NAMESPACE } from '../constants';

interface DashboardEntryPayload {
	key: string;
	repoLabel: string;
	number: number;
	title: string;
	url: string;
	createdAt: string | undefined;
	activityAt: string | undefined;
	sourceBranch: string | undefined;
	targetBranch: string | undefined;
	author: { name: string | undefined; url: string | undefined; avatarUrl: string | undefined };
	isDraft: boolean;
	state: number | undefined;
	blocker?: 'conflicts' | 'blocked by policy';
	autoComplete: boolean;
	reviewers: { name: string | undefined; url: string | undefined; avatarUrl: string | undefined; vote: number }[];
}

interface DashboardCategoryPayload {
	type: PRType;
	label: string;
	entries: DashboardEntryPayload[];
	hasMore: boolean;
}

function entryKey(folderManager: FolderRepositoryManager, pr: PullRequestModel): string {
	return `${folderManager.repository.rootUri.toString()}#${pr.getPullRequestId()}`;
}

function getBlocker(mergeStatus: PullRequestAsyncStatus | undefined): 'conflicts' | 'blocked by policy' | undefined {
	if (mergeStatus === PullRequestAsyncStatus.Conflicts) {
		return 'conflicts';
	}
	if (mergeStatus === PullRequestAsyncStatus.RejectedByPolicy) {
		return 'blocked by policy';
	}
	return undefined;
}

function toPayload(folderManager: FolderRepositoryManager, pr: PullRequestModel): DashboardEntryPayload {
	return {
		key: entryKey(folderManager, pr),
		repoLabel: path.basename(folderManager.repository.rootUri.fsPath),
		number: pr.getPullRequestId(),
		title: pr.item.title ?? '',
		url: pr.url,
		createdAt: pr.item.creationDate as unknown as string | undefined,
		activityAt: getActivityDate(pr)?.toISOString(),
		// Already resolved with zero extra requests: FolderRepositoryManager.getPullRequests() resolves
		// head/base for every PR it fetches (convertAzdoPullRequestToRawPullRequest), so this is free
		// to show here. Line-level +/- counts deliberately aren't: they need a separate per-PR diff
		// fetch (getMergeBase + getCommitDiffs), which would multiply the request count by the
		// category size - not worth it for a list view like this.
		sourceBranch: pr.head?.ref,
		targetBranch: pr.base?.ref,
		author: {
			name: pr.item.createdBy?.displayName,
			url: pr.item.createdBy?.url,
			avatarUrl: pr.item.createdBy?.['_links']?.['avatar']?.['href'] ?? pr.item.createdBy?.imageUrl,
		},
		isDraft: !!pr.isDraft,
		state: pr.item.status,
		blocker: getBlocker(pr.item.mergeStatus),
		autoComplete: !!pr.item.autoCompleteSetBy,
		reviewers: (pr.item.reviewers ?? []).map(r => ({
			name: r.displayName,
			url: r.url,
			avatarUrl: r['_links']?.['avatar']?.['href'] ?? r.imageUrl,
			vote: r.vote ?? 0,
		})),
	};
}

// A dashboard-page counterpart to the tree-view Dashboard (dashboardCategoryNode.ts / prDashboardTreeDataProvider.ts):
// same aggregation (fetchDashboardCategory) and the same repo-by-repo "load more", but rendered as a
// full webview page (like the PR overview panel) instead of a collapsed tree, so more detail per PR
// (author, reviewers, blockers) fits on screen at once.
export class PullRequestDashboardPanel extends WebviewBase {
	public static readonly ID: string = 'PullRequestDashboardPanel';
	protected static readonly _viewType: string = 'PullRequestDashboard';
	private static _panel: PullRequestDashboardPanel | undefined;

	protected readonly _panel: vscode.WebviewPanel;
	private readonly _extensionPath: string;
	private readonly _reposManager: RepositoriesManager;
	private readonly _telemetry: ITelemetry;
	private readonly _workItem: AzdoWorkItem;
	private readonly _userManager: AzdoUserManager;

	// Per-category accumulated state, so "load more" can append onto what's already on screen instead
	// of re-fetching everything (same shape as DashboardCategoryTreeNode, one level up since a single
	// page shows every category at once instead of one tree node per category).
	private _categoryEntries: Map<PRType, { folderManager: FolderRepositoryManager; pr: PullRequestModel }[]> =
		new Map();
	private _categoryUnsearched: Map<PRType, FolderRepositoryManager[]> = new Map();
	// Closed tab: real skip/top pagination (not the repo-by-repo "load more" above), so opening the
	// tab doesn't force-fetch a repo's entire merged/abandoned history up front.
	private _closedCursors: ClosedPullRequestsCursor[] = [];
	private _closedEntries: { folderManager: FolderRepositoryManager; pr: PullRequestModel }[] = [];
	private _closedHasMore: boolean = false;
	// Union of every PR handed to the webview across both tabs, so a click on any row (from either
	// tab, before or after a "load more") can resolve back to a live folderManager + PullRequestModel.
	private _prLookup: Map<string, { folderManager: FolderRepositoryManager; pr: PullRequestModel }> = new Map();

	public static createOrShow(
		extensionPath: string,
		reposManager: RepositoriesManager,
		telemetry: ITelemetry,
		workItem: AzdoWorkItem,
		userManager: AzdoUserManager,
	): void {
		if (this._panel) {
			this._panel._panel.reveal();
			void this._panel.refreshAll();
			return;
		}
		this._panel = new PullRequestDashboardPanel(extensionPath, reposManager, telemetry, workItem, userManager);
	}

	private constructor(
		extensionPath: string,
		reposManager: RepositoriesManager,
		telemetry: ITelemetry,
		workItem: AzdoWorkItem,
		userManager: AzdoUserManager,
	) {
		super();
		this._extensionPath = extensionPath;
		this._reposManager = reposManager;
		this._telemetry = telemetry;
		this._workItem = workItem;
		this._userManager = userManager;

		this._panel = vscode.window.createWebviewPanel(
			PullRequestDashboardPanel._viewType,
			'Pull Request Dashboard',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'dist'))],
			},
		);

		this._webview = this._panel.webview;
		super.initialize();
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		this._panel.webview.html = this.getHtmlForWebview();

		/* __GDPR__
			"pr.dashboard.openPage" : {}
		*/
		this._telemetry.sendTelemetryEvent('pr.dashboard.openPage');

		// eslint-disable-next-line sonarjs/no-async-constructor -- fire-and-forget initial fetch; _postMessage awaits the webview's 'ready' handshake itself
		void this.refreshAll();
	}

	protected async _onDidReceiveMessage(message: IRequestMessage<any>): Promise<any> {
		const result = await super._onDidReceiveMessage(message);
		if (result !== this.MESSAGE_UNHANDLED) {
			return;
		}
		switch (message.command) {
			case 'dashboard.refresh':
				await this.refreshAll();
				return this._replyMessage(message, {});
			case 'dashboard.loadMore':
				await this.loadMore(message.args.type as PRType);
				return this._replyMessage(message, {});
			case 'dashboard.loadMoreClosed':
				await this.loadMoreClosed();
				return this._replyMessage(message, {});
			case 'dashboard.openPullRequest':
				return this.openPullRequest(message);
			case 'dashboard.copyLink':
				return this.copyLink(message);
			default:
				return this.MESSAGE_UNHANDLED;
		}
	}

	private async openPullRequest(message: IRequestMessage<{ key: string }>): Promise<void> {
		const found = this._prLookup.get(message.args.key);
		if (!found) {
			return;
		}
		await PullRequestOverviewPanel.createOrShow(
			this._extensionPath,
			found.folderManager,
			found.pr,
			this._workItem,
			this._userManager,
		);
		return this._replyMessage(message, {});
	}

	// Mirrors PullRequestOverviewPanel.copyLink: prefers the shareable https link (opens in VS Code,
	// falls back to the ADO web page) when a redirect base is configured, otherwise the plain PR URL.
	private async copyLink(message: IRequestMessage<{ key: string }>): Promise<void> {
		const found = this._prLookup.get(message.args.key);
		if (!found) {
			return this._replyMessage(message, {});
		}
		const baseUrl = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<string>('shareLinkBaseUrl')?.trim();
		const params = baseUrl ? deepLinkParamsFromPullRequest(found.pr) : undefined;
		if (baseUrl && params) {
			await vscode.env.clipboard.writeText(buildShareableLink(baseUrl, params));
		} else {
			await vscode.env.clipboard.writeText(found.pr.url ?? '');
		}
		vscode.window.showInformationMessage(`Copied link to PR ${found.pr.item.title}.`);
		return this._replyMessage(message, {});
	}

	private async refreshAll(): Promise<void> {
		this._prLookup.clear();
		// Reset only - do not fetch. The Closed tab is lazy: it's fetched on demand when the webview
		// requests it (dashboard.loadMoreClosed), which happens when the user actually opens that tab
		// (see the tab-switch effect in dashboard.tsx), not on every dashboard open/refresh.
		this._closedCursors = createClosedPullRequestsCursors(this._reposManager.folderManagers);
		this._closedEntries = [];
		this._closedHasMore = false;
		await Promise.all(
			DASHBOARD_CATEGORIES.map(async ({ type }) => {
				const result = await fetchDashboardCategory(this._reposManager.folderManagers, type, false);
				this._categoryEntries.set(type, result.entries);
				this._categoryUnsearched.set(type, result.unsearchedFolderManagers);
			}),
		);
		await this.postDashboardUpdate();
	}

	private async loadMore(type: PRType): Promise<void> {
		const pending = this._categoryUnsearched.get(type) ?? [];
		if (pending.length === 0) {
			return;
		}
		const result = await fetchDashboardCategory(pending, type, true);
		const existing = this._categoryEntries.get(type) ?? [];
		this._categoryEntries.set(type, [...existing, ...result.entries]);
		this._categoryUnsearched.set(type, result.unsearchedFolderManagers);
		await this.postDashboardUpdate();
	}

	private async loadMoreClosed(): Promise<void> {
		const page = await fetchClosedPullRequestsPage(this._closedCursors);
		this._closedEntries = [...this._closedEntries, ...page.entries];
		this._closedHasMore = page.hasMore;
		await this.postClosedUpdate();
	}

	private async postDashboardUpdate(): Promise<void> {
		const categories: DashboardCategoryPayload[] = DASHBOARD_CATEGORIES.map(({ type, label }) => {
			// Default order only: the webview re-sorts client-side per the user's chosen sort
			// field/direction (see dashboard.tsx), so this just keeps the raw payload sane before that
			// runs (e.g. while it's loading).
			const entries = (this._categoryEntries.get(type) ?? []).toSorted((a, b) => {
				const aDate = getActivityDate(a.pr)?.getTime() ?? 0;
				const bDate = getActivityDate(b.pr)?.getTime() ?? 0;
				return bDate - aDate;
			});
			entries.forEach(({ folderManager, pr }) => this._prLookup.set(entryKey(folderManager, pr), { folderManager, pr }));
			return {
				type,
				label,
				entries: entries.map(({ folderManager, pr }) => toPayload(folderManager, pr)),
				hasMore: (this._categoryUnsearched.get(type) ?? []).length > 0,
			};
		});
		await this._postMessage({ command: 'dashboard.update', categories });
	}

	private async postClosedUpdate(): Promise<void> {
		this._closedEntries.forEach(({ folderManager, pr }) => this._prLookup.set(entryKey(folderManager, pr), { folderManager, pr }));
		await this._postMessage({
			command: 'dashboard.closedUpdate',
			entries: this._closedEntries.map(({ folderManager, pr }) => toPayload(folderManager, pr)),
			hasMore: this._closedHasMore,
		});
	}

	private getHtmlForWebview(): string {
		const nonce = getNonce();
		const uri = vscode.Uri.file(path.join(this._extensionPath, 'dist', 'webview-pr-dashboard.js'));

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https: data:; script-src 'nonce-${nonce}'; style-src vscode-resource: 'unsafe-inline' http: https: data:;">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Pull Request Dashboard</title>
			</head>
			<body class="${process.platform}">
				<div id=app></div>
				<script nonce="${nonce}" src="${this._webview!.asWebviewUri(uri).toString()}"></script>
			</body>
			</html>`;
	}

	dispose(): void {
		PullRequestDashboardPanel._panel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}
}
