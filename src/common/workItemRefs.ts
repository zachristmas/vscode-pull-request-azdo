/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Pure work-item-id helpers for the create-PR flow. Kept free of any `vscode` import so they can be
// unit-tested without an extension host.

function addUnique(ids: number[], raw: string): void {
	const id = Number(raw);
	if (Number.isSafeInteger(id) && id > 0 && !ids.includes(id)) {
		ids.push(id);
	}
}

/**
 * Infer work-item ids encoded in a source branch name. Recognizes explicit `#123` / `AB#123` markers
 * and a leading numeric segment (`123-title`, `123_title`, `feature/123/...`). This is a best-effort
 * hint only: a leading number can be a year (`release/2024-x`), so the create flow defaults to asking
 * for confirmation before linking rather than linking silently. De-duplicated, order preserved.
 */
export function inferWorkItemIdsFromBranch(branchName: string | undefined): number[] {
	if (!branchName) {
		return [];
	}
	const ids: number[] = [];
	for (const m of branchName.matchAll(/(?:AB)?#(\d+)\b/gi)) {
		addUnique(ids, m[1]);
	}
	for (const m of branchName.matchAll(/(?:^|[/_-])(\d+)(?=[/_-]|$)/g)) {
		addUnique(ids, m[1]);
	}
	return ids;
}

/** Parse a comma/space separated list of work-item ids typed by the user; ignores non-numeric tokens. */
export function parseWorkItemIds(input: string | undefined): number[] {
	if (!input) {
		return [];
	}
	const ids: number[] = [];
	for (const token of input.split(/[\s,]+/)) {
		addUnique(ids, token);
	}
	return ids;
}
