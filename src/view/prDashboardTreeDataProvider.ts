/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ReposManagerState } from '../azdo/folderRepositoryManager';
import { PRType } from '../azdo/interface';
import { RepositoriesManager } from '../azdo/repositoriesManager';
import { onDidUpdatePR } from '../commands';
import { ITelemetry } from '../common/telemetry';
import { PRCategoryActionNode, PRCategoryActionType } from './treeNodes/categoryNode';
import { DashboardCategoryTreeNode } from './treeNodes/dashboardCategoryNode';
import { BaseTreeNode, TreeNode } from './treeNodes/treeNode';

// Single cross-repo view: one category list (Waiting For My Review / Assigned To Me / Created By Me /
// All Active) merged across every FolderRepositoryManager in the workspace, instead of the main
// Pull Requests view's one-subtree-per-repo layout.
export class PullRequestDashboardTreeDataProvider
	implements vscode.TreeDataProvider<TreeNode>, BaseTreeNode, vscode.Disposable
{
	private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private _disposables: vscode.Disposable[];
	private _childrenDisposables: vscode.Disposable[];
	private _view: vscode.TreeView<TreeNode>;
	private _reposManager: RepositoriesManager | undefined;
	private _initialized = false;

	get view(): vscode.TreeView<TreeNode> {
		return this._view;
	}

	constructor(private _telemetry: ITelemetry) {
		this._disposables = [];
		this._disposables.push(
			vscode.commands.registerCommand('azdopr.refreshDashboard', () => {
				this._onDidChangeTreeData.fire();
			}),
		);

		this._disposables.push(
			vscode.commands.registerCommand('azdopr.dashboardLoadMore', (node: DashboardCategoryTreeNode) => {
				node.fetchNextPage = true;
				this._onDidChangeTreeData.fire(node);
			}),
		);

		this._view = vscode.window.createTreeView('azdoprDashboard:azdo', {
			treeDataProvider: this,
			showCollapseAll: true,
		});
		this._disposables.push(this._view);
		this._childrenDisposables = [];

		// Merging/closing/etc. a PR (from its overview panel, the main tree, or here) fires this same
		// event everywhere - without it, this view only ever updated on an explicit Refresh click, so
		// a just-merged PR stuck around in "All Active" until you remembered to hit refresh yourself.
		this._disposables.push(onDidUpdatePR(() => this._onDidChangeTreeData.fire()));
	}

	async reveal(element: TreeNode, options?: { select?: boolean; focus?: boolean; expand?: boolean }): Promise<void> {
		return this._view.reveal(element, options);
	}

	initialize(reposManager: RepositoriesManager) {
		if (this._initialized) {
			throw new Error('Dashboard tree has already been initialized!');
		}

		this._initialized = true;
		this._reposManager = reposManager;
		this._disposables.push(this._reposManager.onDidChangeState(() => this._onDidChangeTreeData.fire()));
		this._disposables.push(
			...this._reposManager.folderManagers.map(manager =>
				manager.onDidChangeRepositories(() => this._onDidChangeTreeData.fire()),
			),
		);

		this.refresh();
	}

	refresh(node?: TreeNode) {
		return node ? this._onDidChangeTreeData.fire(node) : this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TreeNode): vscode.TreeItem {
		return element.getTreeItem();
	}

	async getChildren(element?: TreeNode): Promise<TreeNode[]> {
		if (!this._reposManager) {
			return [];
		}

		if (this._reposManager.state === ReposManagerState.Initializing) {
			return [new PRCategoryActionNode(this, PRCategoryActionType.Initializing)];
		}

		if (this._reposManager.folderManagers.length === 0) {
			return [new PRCategoryActionNode(this, PRCategoryActionType.NoGitRepositories)];
		}

		if (!element) {
			if (this._childrenDisposables && this._childrenDisposables.length) {
				this._childrenDisposables.forEach(dispose => dispose.dispose());
			}

			const result: TreeNode[] = [
				new DashboardCategoryTreeNode(this, this._reposManager, this._telemetry, PRType.NeedsMyReview),
				new DashboardCategoryTreeNode(this, this._reposManager, this._telemetry, PRType.AssignedToMe),
				new DashboardCategoryTreeNode(this, this._reposManager, this._telemetry, PRType.CreatedByMe),
				new DashboardCategoryTreeNode(this, this._reposManager, this._telemetry, PRType.AllActive),
			];
			this._childrenDisposables = result;
			return result;
		}

		return element.getChildren();
	}

	async getParent(element: TreeNode): Promise<TreeNode | undefined> {
		return element.getParent();
	}

	dispose() {
		this._disposables.forEach(dispose => dispose.dispose());
	}
}
