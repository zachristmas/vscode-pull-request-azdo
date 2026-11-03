/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import * as fs from 'fs';
import path from 'path';

// Node-side primitives for the Jujutsu (jj) git provider. The browser build swaps this module for
// src/env/browser/jj.ts (see the webpack alias), where jj support is simply unavailable.

export const jjSupported = true;

function noop(): void {
	// nothing to dispose
}

export interface ExecResult {
	stdout: string;
	stderr: string;
}

export interface ExecOptions {
	cwd?: string;
	/** Return stdout as a Buffer instead of a string (binary blobs). */
	binary?: boolean;
	stdin?: string;
	/** Stop treating a non-zero exit as an error. */
	allowFailure?: boolean;
}

export class ExecError extends Error {
	constructor(
		public readonly command: string,
		public readonly args: string[],
		public readonly exitCode: number | null,
		public readonly stderr: string,
	) {
		super(`${command} ${args.join(' ')} failed (${exitCode ?? 'signal'}): ${stderr.trim()}`);
	}
}

export function exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult & { buffer: Buffer }> {
	return new Promise((resolve, reject) => {
		const child = execFile(
			command,
			args,
			{ cwd: options.cwd, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, JJ_CONFIG_NO_WATCHMAN: '1' } },
			(error, stdout, stderr) => {
				const out = stdout as unknown as Buffer;
				const err = (stderr as unknown as Buffer).toString('utf8');
				if (error && !options.allowFailure) {
					const code = (error as NodeJS.ErrnoException & { code?: number | string }).code;
					reject(new ExecError(command, args, typeof code === 'number' ? code : null, err || error.message));
					return;
				}
				resolve({ stdout: options.binary ? '' : out.toString('utf8'), stderr: err, buffer: out });
			},
		);
		if (options.stdin !== undefined && child.stdin) {
			child.stdin.end(options.stdin);
		}
	});
}

export function fileExists(fsPath: string): boolean {
	try {
		fs.accessSync(fsPath);
		return true;
	} catch {
		return false;
	}
}

export function isDirectory(fsPath: string): boolean {
	try {
		return fs.statSync(fsPath).isDirectory();
	} catch {
		return false;
	}
}

export function readTextFile(fsPath: string): string | undefined {
	try {
		return fs.readFileSync(fsPath, 'utf8');
	} catch {
		return undefined;
	}
}

export function resolvePath(...segments: string[]): string {
	return path.resolve(...segments);
}

/**
 * Watch a directory (non-recursively) and call `onChange` (debounced) when anything in it changes.
 * Returns a disposer. Silently does nothing if the directory cannot be watched.
 */
export function watchDirectory(dir: string, onChange: () => void, debounceMs = 400): () => void {
	let timer: NodeJS.Timeout | undefined;
	let watcher: fs.FSWatcher | undefined;
	try {
		watcher = fs.watch(dir, { persistent: false }, () => {
			if (timer) {
				clearTimeout(timer);
			}
			timer = setTimeout(onChange, debounceMs);
		});
		watcher.on('error', () => {
			/* the directory went away; the provider re-scans on its own schedule */
		});
	} catch {
		return noop;
	}
	return () => {
		if (timer) {
			clearTimeout(timer);
		}
		watcher?.close();
	};
}
