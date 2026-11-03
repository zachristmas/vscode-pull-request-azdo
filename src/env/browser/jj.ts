/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Browser (web worker) stand-in for src/env/node/jj.ts: there is no process to spawn `jj` or `git`
// from, so the jj git provider is disabled. Everything here exists only so the shared code type-checks.

export const jjSupported = false;

function noop(): void {
	// nothing to undo in the browser
}

export interface ExecResult {
	stdout: string;
	stderr: string;
}

export interface ExecOptions {
	cwd?: string;
	binary?: boolean;
	stdin?: string;
	allowFailure?: boolean;
}

export class ExecError extends Error {
	constructor(
		public readonly command: string,
		public readonly args: string[],
		public readonly exitCode: number | null,
		public readonly stderr: string,
	) {
		super(`${command} is unavailable in the browser`);
	}
}

export function exec(command: string, args: string[], _options: ExecOptions = {}): Promise<ExecResult & { buffer: Uint8Array }> {
	return Promise.reject(new ExecError(command, args, null, 'unsupported in the browser'));
}

export function fileExists(_fsPath: string): boolean {
	return false;
}

export function isDirectory(_fsPath: string): boolean {
	return false;
}

export function readTextFile(_fsPath: string): string | undefined {
	return undefined;
}

export function resolvePath(...segments: string[]): string {
	return segments.join('/');
}

export function watchDirectory(_dir: string, _onChange: () => void, _debounceMs?: number): () => void {
	return noop;
}
