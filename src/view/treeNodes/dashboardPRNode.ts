/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { PRNode } from './pullRequestNode';
import { TreeNodeParent } from './treeNode';
import { FolderRepositoryManager } from '../../azdo/folderRepositoryManager';
import { PullRequestModel } from '../../azdo/pullRequestModel';

// Same node as the per-repo PRNode (same expand-to-description/files behavior), but labeled with its
// source repo so PRs from different repos are distinguishable in the flat cross-repo dashboard list.
export class DashboardPRNode extends PRNode {
	constructor(
		parent: TreeNodeParent,
		folderReposManager: FolderRepositoryManager,
		pullRequestModel: PullRequestModel,
		private _repoLabel: string,
	) {
		super(parent, folderReposManager, pullRequestModel, false);
	}

	getTreeItem(): vscode.TreeItem {
		const item = super.getTreeItem();
		// PRNode.getTreeItem always sets a plain string label.
		item.label = `[${this._repoLabel}] ${item.label as string}`;
		item.id = `dashboard#${this._repoLabel}#${item.id}`;
		return item;
	}
}
