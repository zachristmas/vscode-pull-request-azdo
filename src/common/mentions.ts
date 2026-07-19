/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Azure DevOps stores an @mention in a comment's markdown content as `@<{identityId}>` where
// identityId is the mentioned user's identity id (VSID). Verified live against dev.azure.com: posting
// `@<d9ec1864-b953-6705-8068-5be71c1605ff>` round-trips verbatim and, when the id is a real identity,
// ADO sends the mention notification. It is an id token, never the display name.
//
// This module is intentionally free of any `vscode` import so it can be shared by the webview bundle
// (which must not import vscode) and the extension host.

const GUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/** Matches an ADO mention token `@<guid>`; capture group 1 is the identity id. Global + case-insensitive. */
export const MENTION_TOKEN_REGEX = new RegExp(`@<(${GUID})>`, 'gi');

/** The exact token ADO recognizes as a mention of the given identity id. */
export function formatMentionToken(identityId: string): string {
	return `@<${identityId}>`;
}

/** All distinct identity ids mentioned in the text (lower-cased for stable map lookup). */
export function extractMentionIds(text: string | undefined): string[] {
	if (!text) {
		return [];
	}
	const ids = new Set<string>();
	for (const match of text.matchAll(MENTION_TOKEN_REGEX)) {
		ids.add(match[1].toLowerCase());
	}
	return [...ids];
}

export type MentionNameLookup = ReadonlyMap<string, string> | Readonly<Record<string, string>>;

function lookupName(names: MentionNameLookup | undefined, id: string): string | undefined {
	if (!names) {
		return undefined;
	}
	const lower = id.toLowerCase();
	if (names instanceof Map) {
		return names.get(id) ?? names.get(lower);
	}
	const record = names as Record<string, string>;
	return record[id] ?? record[lower];
}

/**
 * Replace every `@<guid>` token with a human-readable `**@Display Name**` so the raw id never leaks in
 * either surface (webview react-markdown or the native trusted MarkdownString). Bold renders identically
 * in both and keeps the mention visually distinct from surrounding prose. Ids with no known name fall
 * back to `@user` rather than exposing the guid.
 */
export function resolveMentions(text: string | undefined, names: MentionNameLookup | undefined): string {
	if (!text) {
		return text ?? '';
	}
	return text.replaceAll(MENTION_TOKEN_REGEX, (_full, id: string) => {
		const name = lookupName(names, id);
		return `**@${name ?? 'user'}**`;
	});
}
