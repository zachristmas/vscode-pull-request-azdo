/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import * as vscode from 'vscode';
import { PRCategoryActionNode, PRCategoryActionType } from './categoryNode';
import { DashboardPRNode } from './dashboardPRNode';
import { TreeNode, TreeNodeParent } from './treeNode';
import { FolderRepositoryManager } from '../../azdo/folderRepositoryManager';
import { PRType } from '../../azdo/interface';
import { RepositoriesManager } from '../../azdo/repositoriesManager';
import { ITelemetry } from '../../common/telemetry';
import { DashboardEntry, fetchDashboardCategory, getActivityDate } from '../dashboardData';

// Cross-repo counterpart to CategoryTreeNode: fetches the same category from every repo in the
// workspace and merges the results into one flat list instead of one subtree per repo.
//
// A single FolderRepositoryManager can itself have more than one AzDO remote, and
// getPullRequests() only searches remotes one at a time - the first remote that returns results
// stops the search there and reports hasUnsearchedRepositories, same as the per-repo category
// list's "Continue fetching from other remotes" action. This node reproduces that: the initial
// fetch queries every repo once, and "Load more" re-queries only the repos that still have
// unsearched remotes, accumulating onto the existing list rather than replacing it.
export class DashboardCategoryTreeNode extends TreeNode implements vscode.TreeItem {
	public collapsibleState: vscode.TreeItemCollapsibleState;
	public id: string;
	public fetchNextPage: boolean = false;
	private _entries: DashboardEntry[] = [];
	private _unsearchedFolderManagers: Set<FolderRepositoryManager> = new Set();

	constructor(
		public parent: TreeNodeParent,
		private _reposManager: RepositoriesManager,
		private _telemetry: ITelemetry,
		private _type: PRType,
	) {
		super();
		this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
		switch (_type) {
			case PRType.NeedsMyReview:
				this.label = 'Waiting For My Review';
				break;
			case PRType.AssignedToMe:
				this.label = 'Assigned To Me';
				break;
			case PRType.CreatedByMe:
				this.label = 'Created By Me';
				break;
			case PRType.AllActive:
				this.label = 'All Active';
				break;
			default:
				break;
		}
		this.id = `dashboard#category#${this._type}`;
	}

	private sendExpandTelemetry(): void {
		switch (this._type) {
			case PRType.AllActive:
				/* __GDPR__
					"pr.dashboard.expand.all" : {}
				*/
				this._telemetry.sendTelemetryEvent('pr.dashboard.expand.all');
				break;
			case PRType.CreatedByMe:
				/* __GDPR__
					"pr.dashboard.expand.createdByMe" : {}
				*/
				this._telemetry.sendTelemetryEvent('pr.dashboard.expand.createdByMe');
				break;
			case PRType.AssignedToMe:
				/* __GDPR__
					"pr.dashboard.expand.assignedToMe" : {}
				*/
				this._telemetry.sendTelemetryEvent('pr.dashboard.expand.assignedToMe');
				break;
			case PRType.NeedsMyReview:
				/* __GDPR__
					"pr.dashboard.expand.needsMyReview" : {}
				*/
				this._telemetry.sendTelemetryEvent('pr.dashboard.expand.needsMyReview');
				break;
		}
	}

	async getChildren(): Promise<TreeNode[]> {
		if (this.childrenDisposables && this.childrenDisposables.length) {
			this.childrenDisposables.forEach(dp => dp.dispose());
		}

		let needLogin: boolean;
		if (!this.fetchNextPage) {
			// Initial load (or a plain refresh): start over from every repo.
			const result = await fetchDashboardCategory(this._reposManager.folderManagers, this._type, false);
			this._entries = result.entries;
			this._unsearchedFolderManagers = new Set(result.unsearchedFolderManagers);
			needLogin = result.needLogin;
			this.sendExpandTelemetry();
		} else {
			// Load more: only the repos that reported unsearched remotes last time.
			const pending = [...this._unsearchedFolderManagers];
			const result = await fetchDashboardCategory(pending, this._type, true);
			this._entries.push(...result.entries);
			this._unsearchedFolderManagers = new Set(result.unsearchedFolderManagers);
			needLogin = result.needLogin;
			this.fetchNextPage = false;
		}

		const sorted = this._entries.toSorted((a, b) => {
			const aDate = getActivityDate(a.pr)?.getTime() ?? 0;
			const bDate = getActivityDate(b.pr)?.getTime() ?? 0;
			return bDate - aDate;
		});

		if (sorted.length) {
			const nodes: TreeNode[] = sorted.map(
				({ folderManager, pr }) =>
					new DashboardPRNode(this, folderManager, pr, path.basename(folderManager.repository.rootUri.fsPath)),
			);
			if (this._unsearchedFolderManagers.size > 0) {
				nodes.push(new PRCategoryActionNode(this, PRCategoryActionType.TryOtherRemotes, this, 'azdopr.dashboardLoadMore'));
			}
			this.childrenDisposables = nodes;
			return nodes;
		}

		const category = needLogin ? PRCategoryActionType.Login : PRCategoryActionType.Empty;
		const result = [new PRCategoryActionNode(this, category)];
		this.childrenDisposables = result;
		return result;
	}

	getTreeItem(): vscode.TreeItem {
		return this;
	}
}
