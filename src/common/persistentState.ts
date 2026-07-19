/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export type GlobalStateContext = { globalState: vscode.Memento };

// Module singleton kept in an object so init() mutates a property, not a top-level binding.
const state: { defaultStorage: vscode.Memento | undefined } = { defaultStorage: undefined };

export const MISSING = {} as const;

export function init(ctx: GlobalStateContext) {
	state.defaultStorage = ctx.globalState;
}

export const fetch = (scope: string, key: string): unknown => {
	if (!state.defaultStorage) {
		throw new Error('Persistent store not initialized.');
	}
	return state.defaultStorage.get(scope + ':' + key, MISSING);
};

export const store = (scope: string, key: string, value: any) => {
	if (!state.defaultStorage) {
		throw new Error('Persistent store not initialized.');
	}
	return state.defaultStorage.update(scope + ':' + key, value);
};
