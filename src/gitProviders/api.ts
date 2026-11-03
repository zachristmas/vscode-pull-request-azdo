/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BuiltinGitProvider } from './builtinGit';
import { JjGitProvider } from './jj/jjGitProvider';
import { LiveShareManager } from './vsls';
import { API } from '../api/api';

export function registerLiveShareGitProvider(apiImpl: API): LiveShareManager {
	const liveShareManager = new LiveShareManager(apiImpl);
	return liveShareManager;
}

export async function registerBuiltinGitProvider(
	apiImpl: API,
): Promise<vscode.Disposable | undefined> {
	const builtInGitProvider = await BuiltinGitProvider.createProvider();
	if (builtInGitProvider) {
		apiImpl.registerGitProvider(builtInGitProvider);
		return builtInGitProvider;
	}
}

/** Serves jj workspaces without a `.git` (see JjGitProvider); resolves to undefined where jj is unavailable. */
export async function registerJjGitProvider(apiImpl: API): Promise<vscode.Disposable | undefined> {
	const jjGitProvider = await JjGitProvider.createProvider();
	if (jjGitProvider) {
		apiImpl.registerGitProvider(jjGitProvider);
		return jjGitProvider;
	}
}
