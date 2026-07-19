/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PullRequest } from './cache';
import { formatMentionToken } from '../../src/common/mentions';

// Webview-side mention state. A composer inserts the readable `@Display Name` into the textarea (a raw
// `@<guid>` would be unreadable while typing) and records the pick here. On submit the outgoing text is
// rewritten to the `@<guid>` token ADO needs (applyMentionTokens), and the picks feed the render-time
// name map so freshly mentioned users resolve before they ever appear as a comment author.
const pickedById = new Map<string, string>(); // idLower -> display
const pickedByDisplay = new Map<string, string>(); // display -> id

export function recordMentionPick(id: string, display: string): void {
	if (!id || !display) {
		return;
	}
	pickedById.set(id.toLowerCase(), display);
	pickedByDisplay.set(display, id);
}

function escapeRegExp(value: string): string {
	return value.replaceAll(/[.*+?^${}()|[\]\\]/g, char => `\\${char}`);
}

/**
 * Rewrite each picked `@Display Name` occurrence to the `@<guid>` token ADO recognizes. Longest display
 * names first so a name that is a prefix of another is not half-replaced. A miss (the user edited the
 * inserted text) simply leaves plain `@Display Name` prose - no notification, but no broken token either.
 */
export function applyMentionTokens(text: string): string {
	if (!text || pickedByDisplay.size === 0) {
		return text;
	}
	let out = text;
	const displays = [...pickedByDisplay.keys()].toSorted((a, b) => b.length - a.length);
	for (const display of displays) {
		const id = pickedByDisplay.get(display)!;
		const token = formatMentionToken(id);
		// Match `@Display` only when not immediately followed by another word char (so `@Zach` does not
		// match inside `@Zachary`).
		const re = new RegExp(String.raw`${escapeRegExp('@' + display)}(?!\w)`, 'g');
		out = out.replace(re, () => token);
	}
	return out;
}

/** id (lower-cased) -> display name, assembled from everyone the webview already knows plus picks. */
export function buildMentionNameMap(pr: PullRequest | undefined): Record<string, string> {
	const map: Record<string, string> = {};
	const add = (id: string | undefined, name: string | undefined) => {
		if (id && name) {
			map[id.toLowerCase()] = name;
		}
	};
	add(pr?.author?.id, pr?.author?.name);
	const reviewers = pr?.reviewers ?? [];
	for (const r of reviewers) {
		add(r.reviewer?.id, r.reviewer?.name);
	}
	const threads = pr?.threads ?? [];
	for (const thread of threads) {
		const comments = thread.comments ?? [];
		for (const c of comments) {
			add(c.author?.id, c.author?.displayName);
		}
	}
	for (const [id, display] of pickedById) {
		add(id, display);
	}
	return map;
}
