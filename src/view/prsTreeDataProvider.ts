/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { REMOTES_SETTING, ReposManagerState } from '../azdo/folderRepositoryManager';
import { PullRequestModel } from '../azdo/pullRequestModel';
import { RepositoriesManager } from '../azdo/repositoriesManager';
import { ITelemetry } from '../common/telemetry';
import { SETTINGS_NAMESPACE } from '../constants';
import { FileViewedDecorationProvider } from './fileViewedDecorationProvider';
import { DecorationProvider } from './treeDecorationProvider';
import { CategoryTreeNode, PRCategoryActionNode, PRCategoryActionType } from './treeNodes/categoryNode';
import { PRNode } from './treeNodes/pullRequestNode';
import { BaseTreeNode, TreeNode } from './treeNodes/treeNode';
import { WorkspaceFolderNode } from './treeNodes/workspaceFolderNode';

export class PullRequestsTreeDataProvider implements vscode.TreeDataProvider<TreeNode>, BaseTreeNode, vscode.Disposable {
	private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	get onDidChange(): vscode.Event<vscode.Uri> {
		return this._onDidChange.event;
	}
	private _disposables: vscode.Disposable[];
	private _childrenDisposables: vscode.Disposable[];
	private _view: vscode.TreeView<TreeNode>;
	private _reposManager: RepositoriesManager | undefined;
	private _initialized: boolean = false;
	// Syncs the extension's folder managers against the live git repo list. Run on every root render so
	// a repo the git extension opened late (nested repos race window/reload) appears without a reload -
	// clicking Refresh is enough. Set by extension.ts.
	private _reconcileRepositories?: () => void;

	setRepositoryReconciler(reconcile: () => void): void {
		this._reconcileRepositories = reconcile;
	}

	get view(): vscode.TreeView<TreeNode> {
		return this._view;
	}

	constructor(private _telemetry: ITelemetry) {
		this._disposables = [];
		this._disposables.push(vscode.window.registerFileDecorationProvider(DecorationProvider));
		this._disposables.push(vscode.window.registerFileDecorationProvider(FileViewedDecorationProvider));
		this._disposables.push(
			vscode.commands.registerCommand('azdopr.refreshList', _ => {
				this._onDidChangeTreeData.fire();
			}),
		);

		this._disposables.push(
			vscode.commands.registerCommand('azdopr.loadMore', (node: CategoryTreeNode) => {
				node.fetchNextPage = true;
				this._onDidChangeTreeData.fire(node);
			}),
		);

		this._disposables.push(
			vscode.commands.registerCommand('azdopr.revealPullRequestInTree', (pr: PullRequestModel) =>
				this.revealPullRequestInTree(pr),
			),
		);

		this._view = vscode.window.createTreeView('azdopr:azdo', {
			treeDataProvider: this,
			showCollapseAll: true,
		});

		this._disposables.push(this._view);
		this._childrenDisposables = [];

		this._disposables.push(
			vscode.commands.registerCommand('azdopr.configurePRViewlet', async () => {
				const isLoggedIn = this._reposManager?.state === ReposManagerState.RepositoriesLoaded;
				const configuration = await vscode.window.showQuickPick([
					'Configure Project Name...',
					'Configure Organization URL...',
					...(isLoggedIn ? ['Sign out of Azure Devops...'] : []),
				]);

				const { name, publisher } = require('../../package.json') as { name: string; publisher: string };
				const extensionId = `${publisher}.${name}`;

				switch (configuration) {
					case 'Configure Project Name...':
						return vscode.commands.executeCommand(
							'workbench.action.openSettings',
							`@ext:${extensionId} projectName`,
						);
					case 'Configure Organization URL...':
						return vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${extensionId} orgUrl`);
					case 'Sign out of Azure Devops...':
						return vscode.commands.executeCommand('azdopr.signout');
					default:
						return;
				}
			}),
		);

		this._disposables.push(
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(`${SETTINGS_NAMESPACE}.fileListLayout`)) {
					this._onDidChangeTreeData.fire();
				}
			}),
		);
	}

	async reveal(element: TreeNode, options?: { select?: boolean; focus?: boolean; expand?: boolean }): Promise<void> {
		return this._view.reveal(element, options);
	}

	// Selects the pull request in the tree that matches the given model, so the node highlights when its
	// overview tab is focused (parity with the GitHub PR extension). Best-effort: a collapsed view
	// container, an unloaded tree, or a PR that is not in any listed category simply does nothing. Nodes
	// carry stable ids, so reveal resolves them even though getChildren rebuilds instances each call.
	async revealPullRequestInTree(pullRequestModel: PullRequestModel): Promise<void> {
		// Nothing to select into if the view container is collapsed/hidden; also avoids the category
		// list fetches below on every tab focus when the tree is not even on screen.
		if (!this._view.visible) {
			return;
		}
		try {
			const categories = await this.getCategoryNodes();
			for (const category of categories) {
				const children = await category.getChildren();
				const match = children.find(
					(node): node is PRNode => node instanceof PRNode && node.pullRequestModel.equals(pullRequestModel),
				);
				if (match) {
					await this._view.reveal(match, { select: true, focus: false, expand: true });
					return;
				}
			}
		} catch {
			// Reveal is a convenience; never let it throw into a panel focus/open handler.
		}
	}

	private async getCategoryNodes(): Promise<CategoryTreeNode[]> {
		const roots = await this.getChildren();
		const categories: CategoryTreeNode[] = [];
		for (const node of roots) {
			if (node instanceof CategoryTreeNode) {
				categories.push(node);
			} else if (node instanceof WorkspaceFolderNode) {
				const children = await node.getChildren();
				categories.push(...children.filter((child): child is CategoryTreeNode => child instanceof CategoryTreeNode));
			}
		}
		return categories;
	}

	initialize(reposManager: RepositoriesManager) {
		if (this._initialized) {
			throw new Error('Tree has already been initialized!');
		}

		this._initialized = true;
		this._reposManager = reposManager;
		this._disposables.push(
			this._reposManager.onDidChangeState(() => {
				this._onDidChangeTreeData.fire();
			}),
		);
		this._disposables.push(
			...this._reposManager.folderManagers.map(manager => {
				return manager.onDidChangeRepositories(() => {
					this._onDidChangeTreeData.fire();
				});
			}),
		);

		this.refresh();
	}

	refresh(node?: TreeNode) {
		return node ? this._onDidChangeTreeData.fire(node) : this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TreeNode): vscode.TreeItem {
		return element.getTreeItem();
	}

	private needsRemotes() {
		if (this._reposManager?.state === ReposManagerState.NeedsAuthentication) {
			return Promise.resolve([]);
		}

		const remotesSetting = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<string[]>(REMOTES_SETTING);
		if (remotesSetting) {
			return Promise.resolve([
				new PRCategoryActionNode(this, PRCategoryActionType.NoMatchingRemotes),
				new PRCategoryActionNode(this, PRCategoryActionType.ConfigureRemotes),
			]);
		}

		return Promise.resolve([new PRCategoryActionNode(this, PRCategoryActionType.NoRemotes)]);
	}

	async getChildren(element?: TreeNode): Promise<TreeNode[]> {
		// Reconcile against the live git repo list before building the root, so a late-opened repo shows
		// up on the next render / Refresh instead of waiting for another reload.
		if (!element) {
			this._reconcileRepositories?.();
		}

		if (!this._reposManager) {
			return !vscode.workspace.workspaceFolders
				? Promise.resolve([new PRCategoryActionNode(this, PRCategoryActionType.NoOpenFolder)])
				: Promise.resolve([new PRCategoryActionNode(this, PRCategoryActionType.NoGitRepositories)]);
		}

		if (this._reposManager.state === ReposManagerState.Initializing) {
			return [new PRCategoryActionNode(this, PRCategoryActionType.Initializing)];
		}

		if (this._reposManager.folderManagers.filter(manager => manager.getGitHubRemotes().length > 0).length === 0) {
			return this.needsRemotes();
		}

		if (!element) {
			if (this._childrenDisposables && this._childrenDisposables.length) {
				this._childrenDisposables.forEach(dispose => dispose.dispose());
			}

			let result: TreeNode[];
			if (this._reposManager.folderManagers.length === 1) {
				return WorkspaceFolderNode.getCategoryTreeNodes(this._reposManager.folderManagers[0], this._telemetry, this);
			} else {
				result = this._reposManager.folderManagers.map(
					folderManager =>
						new WorkspaceFolderNode(this, folderManager.repository.rootUri, folderManager, this._telemetry),
				);
			}

			this._childrenDisposables = result;
			return result;
		}

		if (this._reposManager.folderManagers.filter(manager => manager.repository.state.remotes.length > 0).length === 0) {
			return [new PRCategoryActionNode(this, PRCategoryActionType.Empty)];
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
