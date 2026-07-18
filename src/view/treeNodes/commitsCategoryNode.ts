/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';
import * as vscode from 'vscode';
import { CommitNode } from './commitNode';
import { TreeNode, TreeNodeParent } from './treeNode';
import { FolderRepositoryManager } from '../../azdo/folderRepositoryManager';
import { PullRequestModel } from '../../azdo/pullRequestModel';
import Logger from '../../common/logger';
import { formatError } from '../../common/utils';

export class CommitsNode extends TreeNode implements vscode.TreeItem {
	public label: string = 'Commits';
	public collapsibleState: vscode.TreeItemCollapsibleState;
	private _folderRepoManager: FolderRepositoryManager;
	private _pr: PullRequestModel;
	private _comments: GitPullRequestCommentThread[];

	constructor(
		parent: TreeNodeParent,
		reposManager: FolderRepositoryManager,
		pr: PullRequestModel,
		comments: GitPullRequestCommentThread[],
	) {
		super();
		this.parent = parent;
		this._pr = pr;
		this._folderRepoManager = reposManager;
		this._comments = comments;
		this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
	}

	getTreeItem(): vscode.TreeItem {
		return this;
	}

	async getChildren(): Promise<TreeNode[]> {
		try {
			const commits = await this._pr.getCommits();
			const commitNodes = commits.map(
				commit => new CommitNode(this, this._folderRepoManager, this._pr, commit, this._comments),
			);
			return commitNodes;
		} catch (e) {
			// Surface the failure instead of silently rendering an empty Commits node.
			Logger.appendLine(`Fetching commits failed: ${formatError(e)}`, 'CommitsCategoryNode');
			return [];
		}
	}
}
