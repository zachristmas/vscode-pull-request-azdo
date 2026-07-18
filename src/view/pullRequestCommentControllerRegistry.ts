/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { PullRequestCommentController } from './pullRequestCommentController';
import { FolderRepositoryManager } from '../azdo/folderRepositoryManager';
import { IFileChangeNodeWithUri } from '../azdo/interface';
import { GHPRComment } from '../azdo/prComment';
import { PullRequestModel } from '../azdo/pullRequestModel';
import { CommentReactionHandler } from '../azdo/utils';
import { fromPRUri } from '../common/uri';

interface PullRequestCommentHandlerInfo {
	handler: PullRequestCommentController & CommentReactionHandler;
	refCount: number;
	dispose: () => void;
}

export class PRCommentControllerRegistry implements vscode.CommentingRangeProvider, CommentReactionHandler, vscode.Disposable {
	private _prCommentHandlers: { [key: number]: PullRequestCommentHandlerInfo } = {};
	private _prCommentingRangeProviders: { [key: number]: vscode.CommentingRangeProvider } = {};

	constructor(public commentsController: vscode.CommentController) {
		this.commentsController.commentingRangeProvider = this;
		// Azure DevOps has no comment-reactions concept (this fork's toggleReaction implementations
		// are entirely commented-out GitHub GraphQL logic) - reactionHandler is optional on
		// CommentController, so leaving it unset removes the non-functional emoji-picker button
		// entirely instead of shipping a broken one.
	}

	async provideCommentingRanges(
		document: vscode.TextDocument,
		token: vscode.CancellationToken,
	): Promise<vscode.Range[] | vscode.CommentingRanges | null | undefined> {
		const uri = document.uri;
		const params = fromPRUri(uri);

		if (!params || !this._prCommentingRangeProviders[params.prNumber]) {
			return;
		}

		const provideCommentingRanges = this._prCommentingRangeProviders[params.prNumber].provideCommentingRanges.bind(
			this._prCommentingRangeProviders[params.prNumber],
		);

		return provideCommentingRanges(document, token);
	}

	async toggleReaction(comment: GHPRComment, reaction: vscode.CommentReaction): Promise<void> {
		const uri = comment.parent!.uri;
		const params = fromPRUri(uri);

		if (
			!params ||
			!this._prCommentHandlers[params.prNumber] ||
			!this._prCommentHandlers[params.prNumber].handler.toggleReaction
		) {
			return;
		}

		const toggleReaction = this._prCommentHandlers[params.prNumber].handler.toggleReaction!.bind(
			this._prCommentHandlers[params.prNumber].handler,
		);

		return toggleReaction(comment, reaction);
	}

	public registerCommentController(
		prNumber: number,
		pullRequestModel: PullRequestModel,
		folderRepositoryManager: FolderRepositoryManager,
		getFileChanges: () => Promise<IFileChangeNodeWithUri[]>,
	): vscode.Disposable {
		if (this._prCommentHandlers[prNumber]) {
			this._prCommentHandlers[prNumber].refCount += 1;
			return this._prCommentHandlers[prNumber];
		}

		const handler = new PullRequestCommentController(
			pullRequestModel,
			folderRepositoryManager,
			this.commentsController,
			getFileChanges,
		);
		this._prCommentHandlers[prNumber] = {
			handler,
			refCount: 1,
			dispose: () => {
				if (!this._prCommentHandlers[prNumber]) {
					return;
				}

				this._prCommentHandlers[prNumber].refCount -= 1;
				if (this._prCommentHandlers[prNumber].refCount === 0) {
					this._prCommentHandlers[prNumber].handler.dispose();
					delete this._prCommentHandlers[prNumber];
				}
			},
		};

		return this._prCommentHandlers[prNumber];
	}

	public registerCommentingRangeProvider(prNumber: number, provider: vscode.CommentingRangeProvider): vscode.Disposable {
		this._prCommentingRangeProviders[prNumber] = provider;

		return {
			dispose: () => {
				delete this._prCommentingRangeProviders[prNumber];
			},
		};
	}

	dispose() {
		Object.values(this._prCommentHandlers).forEach(handlerInfo => {
			handlerInfo.handler.dispose();
		});

		this._prCommentingRangeProviders = {};
		this._prCommentHandlers = {};
	}
}
