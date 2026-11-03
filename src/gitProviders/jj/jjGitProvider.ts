/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { JjRepository, resolveJjWorkspace } from './jjRepository';
import { APIState, PublishEvent } from '../../@types/git';
import { IGit, Repository } from '../../api/api';
import Logger from '../../common/logger';
import { exec, fileExists, jjSupported, resolvePath } from '../../env/node/jj';

/**
 * Git provider for Jujutsu (jj) workspaces that VS Code's git extension cannot see.
 *
 * A colocated jj repo has a `.git` directory and is already served by the built-in git provider, so
 * this provider only claims workspace folders that have `.jj/` but no `.git` - typically secondary
 * workspaces created with `jj workspace add`, which share the main workspace's git store.
 */
export class JjGitProvider implements IGit, vscode.Disposable {
	static readonly ID = 'JjGitProvider';

	private readonly _repositories = new Map<string, JjRepository>();
	private _state: APIState = 'uninitialized';
	private readonly _disposables: vscode.Disposable[] = [];

	private readonly _onDidOpenRepository = new vscode.EventEmitter<Repository>();
	readonly onDidOpenRepository: vscode.Event<Repository> = this._onDidOpenRepository.event;
	private readonly _onDidCloseRepository = new vscode.EventEmitter<Repository>();
	readonly onDidCloseRepository: vscode.Event<Repository> = this._onDidCloseRepository.event;
	private readonly _onDidChangeState = new vscode.EventEmitter<APIState>();
	readonly onDidChangeState: vscode.Event<APIState> = this._onDidChangeState.event;
	private readonly _onDidPublish = new vscode.EventEmitter<PublishEvent>();
	readonly onDidPublish: vscode.Event<PublishEvent> = this._onDidPublish.event;

	get repositories(): Repository[] {
		return [...this._repositories.values()];
	}

	get state(): APIState {
		return this._state;
	}

	/** Undefined when jj is unusable here (browser build, or no `jj` on PATH). */
	static async createProvider(): Promise<JjGitProvider | undefined> {
		if (!jjSupported) {
			return undefined;
		}
		try {
			const version = await exec('jj', ['--version']);
			Logger.appendLine(`Found ${version.stdout.trim()}`, this.ID);
		} catch {
			Logger.appendLine('jj is not on PATH; jj workspaces will not be detected.', this.ID);
			return undefined;
		}
		const provider = new JjGitProvider();
		await provider.scanWorkspaceFolders();
		provider._state = 'initialized';
		provider._onDidChangeState.fire(provider._state);
		return provider;
	}

	private constructor() {
		this._disposables.push(
			vscode.workspace.onDidChangeWorkspaceFolders(async event => {
				for (const removed of event.removed) {
					this.closeRepository(removed.uri);
				}
				for (const added of event.added) {
					await this.openIfJjWorkspace(added.uri);
				}
			}),
		);
	}

	private async scanWorkspaceFolders(): Promise<void> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		for (const folder of folders) {
			await this.openIfJjWorkspace(folder.uri);
		}
	}

	private async openIfJjWorkspace(folderUri: vscode.Uri): Promise<void> {
		if (folderUri.scheme !== 'file' || this._repositories.has(folderUri.toString())) {
			return;
		}
		const root = folderUri.fsPath;
		if (fileExists(resolvePath(root, '.git'))) {
			return; // colocated: the built-in git provider serves it
		}
		const layout = resolveJjWorkspace(root);
		if (!layout) {
			return;
		}
		Logger.appendLine(`jj workspace at ${root} (store ${layout.gitDir})`, JjGitProvider.ID);
		const repository = new JjRepository(layout);
		try {
			await repository.initialize();
		} catch (e) {
			Logger.appendLine(`Failed to initialize jj workspace ${root}: ${e}`, JjGitProvider.ID);
			repository.dispose();
			return;
		}
		this._repositories.set(folderUri.toString(), repository);
		this._onDidOpenRepository.fire(repository);
	}

	private closeRepository(folderUri: vscode.Uri): void {
		const repository = this._repositories.get(folderUri.toString());
		if (!repository) {
			return;
		}
		this._repositories.delete(folderUri.toString());
		this._onDidCloseRepository.fire(repository);
		repository.dispose();
	}

	dispose(): void {
		for (const repository of this._repositories.values()) {
			repository.dispose();
		}
		this._repositories.clear();
		this._disposables.forEach(disposable => disposable.dispose());
		this._onDidOpenRepository.dispose();
		this._onDidCloseRepository.dispose();
		this._onDidChangeState.dispose();
		this._onDidPublish.dispose();
	}
}
