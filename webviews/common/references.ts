/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';

// Match `#123` or `AB#123`. Group 1 is the digits. The boundary before the token is checked in code
// (not with a lookbehind) so the webview bundle target stays unconstrained. `\b` after the digits keeps
// `#123abc` and hex-ish `#12ab` from matching.
const WORK_ITEM_REF = /(?:AB)?#(\d+)\b/gi;

/**
 * Turn `#<id>` / `AB#<id>` references to work items linked on this PR into markdown links that open the
 * work item, with a `type · state · title` tooltip (the webview's stand-in for a hover). Only ids we
 * have details for are linked - unknown ids stay plain text, mirroring resolveMentions' fallback - so an
 * arbitrary `#5` in prose is never turned into a wrong link.
 */
export function linkifyWorkItems(text: string, workItems: WorkItem[] | undefined): string {
	if (!text || !workItems?.length) {
		return text;
	}
	const byId = new Map<number, WorkItem>();
	for (const w of workItems) {
		if (w.id !== undefined) {
			byId.set(w.id, w);
		}
	}
	return text.replaceAll(WORK_ITEM_REF, (full: string, digits: string, offset: number, whole: string) => {
		// Trigger only at a word boundary (start / whitespace / `(`); leaves `abc#12` and the like alone.
		const prev = offset > 0 ? whole[offset - 1] : '';
		if (prev && prev !== '(' && !/\s/.test(prev)) {
			return full;
		}
		const wi = byId.get(Number(digits));
		const href = wi?._links?.['html']?.['href'];
		if (!wi || !href) {
			return full;
		}
		const type = wi.fields?.['System.WorkItemType'];
		const state = wi.fields?.['System.State'];
		const title = wi.fields?.['System.Title'];
		const tip = [type, state, title].filter(Boolean).join(' · ').replaceAll('"', "'");
		return `[#${digits}](${href} "${tip}")`;
	});
}

// Match a `!123` pull-request reference. Group 1 is the digits. `\b` keeps `!12ab` from matching.
const PR_REF = /!(\d+)\b/g;

/**
 * Turn `!<id>` pull-request references (Azure DevOps markdown syntax) into links that open that PR, with
 * the PR title as a tooltip when we know it (PRs sharing a work item with this one). The URL is built
 * from `repoWebUrl` so any id resolves - ADO itself renders `!123` this way. `!` is common in prose, so
 * we only trigger at a word boundary.
 */
export function linkifyPullRequests(
	text: string,
	relatedPRs: { id: number; title?: string }[] | undefined,
	repoWebUrl: string | undefined,
): string {
	if (!text || !repoWebUrl) {
		return text;
	}
	const titleById = new Map<number, string | undefined>((relatedPRs ?? []).map(p => [p.id, p.title]));
	return text.replaceAll(PR_REF, (full: string, digits: string, offset: number, whole: string) => {
		const prev = offset > 0 ? whole[offset - 1] : '';
		if (prev && prev !== '(' && !/\s/.test(prev)) {
			return full;
		}
		const id = Number(digits);
		const href = `${repoWebUrl}/pullrequest/${id}`;
		const title = titleById.get(id);
		return title ? `[!${digits}](${href} "${title.replaceAll('"', "'")}")` : `[!${digits}](${href})`;
	});
}
