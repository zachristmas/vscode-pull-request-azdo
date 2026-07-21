/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { FolderRepositoryManager } from '../azdo/folderRepositoryManager';
import { IFileChangeNode } from '../azdo/interface';
import { PullRequestModel } from '../azdo/pullRequestModel';
import { GitChangeType } from '../common/file';
import Logger from '../common/logger';
import { fromPRUri, PRUriParams } from '../common/uri';

export class InMemPRContentProvider implements vscode.TextDocumentContentProvider {
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	get onDidChange(): vscode.Event<vscode.Uri> {
		return this._onDidChange.event;
	}

	fireDidChange(uri: vscode.Uri) {
		this._onDidChange.fire(uri);
	}

	private _prFileChangeContentProviders: { [key: number]: (uri: vscode.Uri) => Promise<string> } = {};

	constructor() {}

	async provideTextDocumentContent(uri: vscode.Uri, _token: vscode.CancellationToken): Promise<string> {
		const prUriParams = fromPRUri(uri);
		if (prUriParams && prUriParams.prNumber) {
			const provider = this._prFileChangeContentProviders[prUriParams.prNumber];

			if (provider) {
				return await provider(uri);
			}
		}

		return '';
	}

	registerTextDocumentContentProvider(prNumber: number, provider: (uri: vscode.Uri) => Promise<string>): vscode.Disposable {
		this._prFileChangeContentProviders[prNumber] = provider;

		return {
			dispose: () => {
				delete this._prFileChangeContentProviders[prNumber];
			},
		};
	}
}

const inMemPRContentProvider = new InMemPRContentProvider();

export function getInMemPRContentProvider(): InMemPRContentProvider {
	return inMemPRContentProvider;
}

// Fetches the requested side's content from AzDO by blob sha; on failure offers to open the
// file on AzDO instead and serves empty content.
async function fetchRemoteFileContent(
	params: PRUriParams,
	pullRequestModel: PullRequestModel,
	fileChange: IFileChangeNode,
): Promise<string> {
	try {
		const sha = params.isBase ? fileChange.previousFileSha : fileChange.sha;
		if (!sha) {
			throw new Error(`No file sha available for ${fileChange.fileName}`);
		}
		Logger.appendLine(`PR> Fetching file content from AzDO: ${sha}`);
		const content = await pullRequestModel.getFile(sha);
		Logger.debug(`PR> Fetched file content from AzDO: ${sha}, content: ${content}`, 'InMemPRContentProvider');
		return content;
	} catch (e) {
		Logger.appendLine(`PR> Fetching file content failed: ${e}`);
		vscode.window
			.showWarningMessage('Opening this file locally failed. Would you like to view it on AzDO?', 'Open in AzDO')
			.then(result => {
				if (result === 'Open in AzDO' && fileChange.blobUrl) {
					vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(fileChange.blobUrl));
				}
			});
		return '';
	}
}

// Picks the commit and file name to `git show` for the requested side of a local file change.
function resolveLocalCommitAndFileName(
	params: PRUriParams,
	fileChange: IFileChangeNode,
): { commit: string; originalFileName: string | undefined } {
	if (fileChange.status === GitChangeType.ADD) {
		return { commit: params.headCommit, originalFileName: fileChange.fileName };
	}
	if (fileChange.status === GitChangeType.RENAME) {
		if (params.isBase) {
			return { commit: params.baseCommit, originalFileName: fileChange.previousFileName };
		}
		return { commit: params.headCommit, originalFileName: fileChange.fileName };
	}
	return {
		commit: params.isBase ? params.baseCommit : params.headCommit,
		originalFileName: fileChange.status === GitChangeType.DELETE ? fileChange.previousFileName : fileChange.fileName,
	};
}

export async function provideDocumentContentForChangeModel(
	params: PRUriParams,
	pullRequestModel: PullRequestModel,
	folderReposManager: FolderRepositoryManager,
	fileChange: IFileChangeNode,
	isFileRemote: boolean,
): Promise<string> {
	if (
		(params.isBase && fileChange.status === GitChangeType.ADD) ||
		(!params.isBase && fileChange.status === GitChangeType.DELETE)
	) {
		return '';
	}

	if (isFileRemote) {
		return await fetchRemoteFileContent(params, pullRequestModel, fileChange);
	}

	const { commit, originalFileName } = resolveLocalCommitAndFileName(params, fileChange);
	const originalFilePath = vscode.Uri.joinPath(folderReposManager.repository.rootUri, originalFileName!);
	try {
		return await folderReposManager.repository.show(commit, originalFilePath.fsPath);
	} catch (e) {
		// The local-object probe upstream (parseSingleDiffAzdo) can say a commit/path is resolvable
		// from tree/commit metadata alone, while `git show` - which needs the actual blob content -
		// still fails (e.g. a shallow/partial clone that hasn't fetched that specific blob). Without
		// this, the failure was silent: the diff editor just rendered an empty document with no
		// indication anything went wrong. Fall back to the same reliable AzDO blob fetch the "remote"
		// path already uses (mirrors createPatch()'s local-diff-then-remote-fallback a bit further
		// down in pullRequestModel.ts).
		Logger.appendLine(
			`PR> Local git show failed for ${originalFileName} @ ${commit}, falling back to AzDO: ${e}`,
			'InMemPRContentProvider',
		);
		return await fetchRemoteFileContent(params, pullRequestModel, fileChange);
	}
}
