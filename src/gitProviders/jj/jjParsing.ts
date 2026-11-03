/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Pure parsing helpers for the Jujutsu (jj) git provider. No vscode or process dependencies so the
// output formats of `jj` and `git` that the provider relies on can be unit-tested in plain Node.

/** A commit as reported by the jj log template in {@link JJ_COMMIT_TEMPLATE}. */
export interface JjCommitInfo {
	commitId: string;
	/** Local bookmarks pointing at the commit. */
	localBookmarks: string[];
	/** Remote bookmarks pointing at the commit (the special `git` remote of colocated repos is omitted). */
	remoteBookmarks: JjRemoteBookmark[];
	empty?: boolean;
	/** True for the working-copy commit (`@`) of the workspace the log ran in. */
	isWorkingCopy?: boolean;
	description?: string;
}

export interface JjRemoteBookmark {
	name: string;
	remote: string;
	tracked: boolean;
}

export interface JjBookmarkListEntry {
	name: string;
	/** Undefined for the local bookmark. */
	remote?: string;
	/** Undefined when the bookmark is deleted/absent or conflicted. */
	commitId?: string;
	tracked: boolean;
}

export interface SummaryChange {
	status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
	path: string;
	previousPath?: string;
}

export interface GitCommitInfo {
	hash: string;
	parents: string[];
	authorName?: string;
	authorEmail?: string;
	authorDate?: Date;
	commitDate?: Date;
	message: string;
}

export interface GitRemoteInfo {
	name: string;
	fetchUrl?: string;
	pushUrl?: string;
}

/**
 * One line per fact, tab-separated. Tabs and newlines cannot appear in bookmark or remote names
 * (git ref-name rules), so the format is unambiguous.
 */
export const JJ_COMMIT_TEMPLATE =
	String.raw`"commit\t" ++ commit_id ++ "\t" ++ empty ++ "\t" ++ current_working_copy ++ "\t" ++ description.first_line() ++ "\n"` +
	String.raw` ++ local_bookmarks.map(|b| "local\t" ++ b.name() ++ "\n").join("")` +
	String.raw` ++ remote_bookmarks.map(|b| "remote\t" ++ b.name() ++ "\t" ++ b.remote() ++ "\t" ++ b.tracked() ++ "\n").join("")`;

/** Template for `jj bookmark list --all-remotes -T ...`. */
export const JJ_BOOKMARK_LIST_TEMPLATE =
	String.raw`name ++ "\t" ++ if(remote, remote, "") ++ "\t" ++ if(normal_target, normal_target.commit_id(), "") ++ "\t" ++ tracked ++ "\n"`;

/** The colocated-repo pseudo remote mirroring the git repo's own branches; never a real upstream. */
export const JJ_GIT_PSEUDO_REMOTE = 'git';

/** Parses the output of `jj log -T JJ_COMMIT_TEMPLATE`; several commits (e.g. `@-` of a merge) yield several entries. */
export function parseJjCommits(output: string): JjCommitInfo[] {
	const commits: JjCommitInfo[] = [];
	let current: JjCommitInfo | undefined;
	for (const line of output.split('\n')) {
		if (!line) {
			continue;
		}
		const fields = line.split('\t');
		if (fields[0] === 'commit') {
			current = {
				commitId: fields[1] ?? '',
				empty: fields[2] === 'true',
				isWorkingCopy: fields[3] === 'true',
				description: fields.slice(4).join('\t'),
				localBookmarks: [],
				remoteBookmarks: [],
			};
			commits.push(current);
		} else if (current) {
			addBookmarkLine(current, fields);
		}
	}
	return commits;
}

function addBookmarkLine(commit: JjCommitInfo, fields: string[]): void {
	const [kind, name, remote, tracked] = fields;
	if (!name) {
		return;
	}
	if (kind === 'local') {
		commit.localBookmarks.push(name);
	} else if (kind === 'remote' && remote && remote !== JJ_GIT_PSEUDO_REMOTE) {
		commit.remoteBookmarks.push({ name, remote, tracked: tracked === 'true' });
	}
}

export function parseJjBookmarkList(output: string): JjBookmarkListEntry[] {
	const entries: JjBookmarkListEntry[] = [];
	for (const line of output.split('\n')) {
		if (!line) {
			continue;
		}
		const [name, remote, commitId, tracked] = line.split('\t', 4);
		if (!name || remote === JJ_GIT_PSEUDO_REMOTE) {
			continue;
		}
		entries.push({
			name,
			remote: remote || undefined,
			commitId: /^[0-9a-f]{40}$/.test(commitId ?? '') ? commitId : undefined,
			tracked: tracked === 'true',
		});
	}
	return entries;
}

/**
 * Parses `jj diff --summary` (also `git diff --name-status`-like single letters). jj renders renames
 * as `R old => new` or with brace syntax `R dir/{old => new}.ts`; both are expanded.
 */
export function parseSummary(output: string): SummaryChange[] {
	const changes: SummaryChange[] = [];
	for (const rawLine of output.split('\n')) {
		const line = rawLine.trimEnd();
		if (!line) {
			continue;
		}
		const match = /^([AMDRC]) (.*)$/.exec(line);
		if (!match) {
			continue;
		}
		const [, code, rest] = match;
		const status = statusFromLetter(code);
		if (status === 'renamed' || status === 'copied') {
			const { previousPath, path } = expandRename(rest);
			changes.push({ status, path, previousPath });
		} else {
			changes.push({ status, path: rest });
		}
	}
	return changes;
}

const RENAME_ARROW = ' => ';

function statusFromLetter(letter: string): SummaryChange['status'] {
	switch (letter) {
		case 'A':
			return 'added';
		case 'D':
			return 'deleted';
		case 'R':
			return 'renamed';
		case 'C':
			return 'copied';
		default:
			return 'modified';
	}
}

/** `dir/{old => new}.ts` → old: dir/old.ts, new: dir/new.ts; `old => new` → old, new. */
export function expandRename(text: string): { previousPath: string; path: string } {
	const open = text.indexOf('{');
	const close = text.lastIndexOf('}');
	if (open !== -1 && close > open) {
		const inner = text.slice(open + 1, close);
		const arrowAt = inner.indexOf(RENAME_ARROW);
		if (arrowAt !== -1) {
			const prefix = text.slice(0, open);
			const suffix = text.slice(close + 1);
			return {
				previousPath: `${prefix}${inner.slice(0, arrowAt)}${suffix}`,
				path: `${prefix}${inner.slice(arrowAt + RENAME_ARROW.length)}${suffix}`,
			};
		}
	}
	const arrowAt = text.indexOf(RENAME_ARROW);
	if (arrowAt !== -1) {
		return { previousPath: text.slice(0, arrowAt), path: text.slice(arrowAt + RENAME_ARROW.length) };
	}
	return { previousPath: text, path: text };
}

/** Format string for `git log --format=…` matching {@link parseGitCommit}: fields split by US (0x1F), records by RS (0x1E). */
export const GIT_COMMIT_FORMAT = '%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%ct%x1f%B%x1e';
export const FIELD_SEPARATOR = '\u{1F}';
export const RECORD_SEPARATOR = '\u{1E}';

export function parseGitCommit(output: string): GitCommitInfo | undefined {
	const record = output.split(RECORD_SEPARATOR, 1)[0];
	if (!record || !record.trim()) {
		return undefined;
	}
	const [hash, parents, authorName, authorEmail, authorDate, commitDate, ...message] = record.split(FIELD_SEPARATOR);
	if (!/^[0-9a-f]{40}$/.test(hash.trim())) {
		return undefined;
	}
	return {
		hash: hash.trim(),
		parents: parents ? parents.trim().split(' ').filter(Boolean) : [],
		authorName: authorName || undefined,
		authorEmail: authorEmail || undefined,
		authorDate: authorDate ? new Date(Number(authorDate) * 1000) : undefined,
		commitDate: commitDate ? new Date(Number(commitDate) * 1000) : undefined,
		message: message.join(FIELD_SEPARATOR).replace(/\n$/, ''),
	};
}

/** Parses `git remote -v`. */
export function parseGitRemotes(output: string): GitRemoteInfo[] {
	const byName = new Map<string, GitRemoteInfo>();
	for (const line of output.split('\n')) {
		const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim());
		if (!match) {
			continue;
		}
		const [, name, url, kind] = match;
		const remote = byName.get(name) ?? { name };
		if (kind === 'fetch') {
			remote.fetchUrl = url;
		} else {
			remote.pushUrl = url;
		}
		byName.set(name, remote);
	}
	return [...byName.values()];
}

/** Parses `git config --list -z` (NUL-separated `key\nvalue` records; a record without `\n` is a valueless key). */
export function parseGitConfigList(output: string): { key: string; value: string }[] {
	return output
		.split('\0')
		.filter(record => record.length > 0)
		.map(record => {
			const newline = record.indexOf('\n');
			return newline === -1 ? { key: record, value: '' } : { key: record.slice(0, newline), value: record.slice(newline + 1) };
		});
}

/** Parses one `git ls-tree -l` line: `<mode> <type> <object> <size>\t<path>`. */
export function parseLsTree(output: string): { mode: string; type: string; object: string; size: number; path: string } | undefined {
	const match = /^(\d+) (\w+) ([0-9a-f]{40})\s+(-|\d+)\t(.*)$/m.exec(output.replaceAll('\0', '\n'));
	if (!match) {
		return undefined;
	}
	const [, mode, type, object, size, path] = match;
	return { mode, type, object, size: size === '-' ? 0 : Number(size), path };
}

/** Parses `git rev-list --left-right --count A...B` → commits only in A (ahead) and only in B (behind). */
export function parseAheadBehind(output: string): { ahead: number; behind: number } {
	const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(output);
	return match ? { ahead: Number(match[1]), behind: Number(match[2]) } : { ahead: 0, behind: 0 };
}

/** Parses `git diff --name-status -z` into summary changes (`<status>\0<path>\0`, renames/copies carry two paths). */
export function parseNameStatus(output: string): SummaryChange[] {
	const fields = output.split('\0').filter((field, index, all) => field.length > 0 || index < all.length - 1);
	const changes: SummaryChange[] = [];
	let i = 0;
	while (i < fields.length) {
		const status = statusFromLetter(fields[i].charAt(0));
		const pathCount = status === 'renamed' || status === 'copied' ? 2 : 1;
		if (i + pathCount >= fields.length) {
			break;
		}
		const paths = fields.slice(i + 1, i + 1 + pathCount);
		changes.push(pathCount === 2 ? { status, previousPath: paths[0], path: paths[1] } : { status, path: paths[0] });
		i += 1 + pathCount;
	}
	return changes;
}

/**
 * Quotes a bookmark name for use as a revset symbol; `"bug/123-x"` resolves the bookmark even
 * when the bare name would be parsed as a revset expression.
 */
export function quoteRevsetSymbol(name: string): string {
	const escaped = name.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`);
	return `"${escaped}"`;
}

/** `refs/remotes/<remote>/<name>` → { remote, name }; anything else → undefined. */
export function parseRemoteRef(ref: string): { remote: string; name: string } | undefined {
	const match = /^refs\/remotes\/([^/]+)\/(.+)$/.exec(ref);
	return match ? { remote: match[1], name: match[2] } : undefined;
}

/** Strips a `refs/heads/` prefix; leaves other refs alone. */
export function stripHeadsPrefix(ref: string): string {
	return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

/** Minimal magic-byte sniffing for the image types the review UI can render inline. */
export function sniffMimetype(bytes: Uint8Array): string {
	const startsWith = (...prefix: number[]) => prefix.every((byte, i) => bytes[i] === byte);
	if (startsWith(0x89, 0x50, 0x4e, 0x47)) {
		return 'image/png';
	}
	if (startsWith(0xff, 0xd8, 0xff)) {
		return 'image/jpeg';
	}
	if (startsWith(0x47, 0x49, 0x46, 0x38)) {
		return 'image/gif';
	}
	if (startsWith(0x42, 0x4d)) {
		return 'image/bmp';
	}
	if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
		return 'image/webp';
	}
	const head = Buffer.from(bytes.subarray(0, 512)).toString('utf8').trimStart();
	if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) {
		return 'image/svg+xml';
	}
	return 'text/plain';
}
