/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	GIT_COMMIT_FORMAT,
	JJ_BOOKMARK_LIST_TEMPLATE,
	JJ_COMMIT_TEMPLATE,
	JjBookmarkListEntry,
	JjCommitInfo,
	parseAheadBehind,
	parseGitCommit,
	parseGitConfigList,
	parseGitRemotes,
	parseJjBookmarkList,
	parseJjCommits,
	parseLsTree,
	parseNameStatus,
	parseRemoteRef,
	parseSummary,
	quoteRevsetSymbol,
	RECORD_SEPARATOR,
	sniffMimetype,
	stripHeadsPrefix,
	SummaryChange,
} from './jjParsing';
import type {
	Branch,
	BranchQuery,
	Change,
	Commit,
	CommitOptions,
	FetchOptions,
	InputBox,
	LogOptions,
	Ref,
	Remote,
	Repository,
	RepositoryState,
	RepositoryUIState,
	Submodule,
} from '../../api/api';
import { GitErrorCodes, RefType } from '../../api/api1';
import Logger from '../../common/logger';
import { exec, ExecError, isDirectory, readTextFile, resolvePath, watchDirectory } from '../../env/node/jj';

/**
 * Where a jj workspace keeps its data. A secondary workspace (`jj workspace add`) has no `.git` and
 * its `.jj/repo` is a file pointing at the main workspace's `.jj/repo`; the git object store shared by
 * all workspaces is wherever `.jj/repo/store/git_target` points (the main workspace's `.git` when it is
 * colocated, else `.jj/repo/store/git`).
 */
export interface JjWorkspaceLayout {
	/** Workspace root (the folder opened in VS Code). */
	root: string;
	/** The `.jj/repo` directory holding the operation log, shared by every workspace of the repo. */
	repoDir: string;
	/** The bare git directory backing the repo; answers every object/ref/config query. */
	gitDir: string;
}

export function resolveJjWorkspace(root: string): JjWorkspaceLayout | undefined {
	const jjDir = resolvePath(root, '.jj');
	if (!isDirectory(jjDir)) {
		return undefined;
	}
	let repoDir = resolvePath(jjDir, 'repo');
	if (!isDirectory(repoDir)) {
		const pointer = readTextFile(repoDir)?.trim();
		if (!pointer) {
			return undefined;
		}
		repoDir = resolvePath(jjDir, pointer);
		if (!isDirectory(repoDir)) {
			return undefined;
		}
	}
	const storeDir = resolvePath(repoDir, 'store');
	const gitTarget = readTextFile(resolvePath(storeDir, 'git_target'))?.trim();
	const gitDir = resolvePath(storeDir, gitTarget || 'git');
	if (!isDirectory(gitDir)) {
		return undefined;
	}
	return { root, repoDir, gitDir };
}

// Numeric values of the git extension's `Status` const enum (src/@types/git.d.ts): INDEX_ADDED,
// INDEX_RENAMED, MODIFIED, DELETED. Only the existence/count of changes is consumed by this
// extension, never the specific status.
const STATUS_BY_SUMMARY: Record<SummaryChange['status'], number> = {
	added: 1,
	renamed: 3,
	copied: 3,
	modified: 5,
	deleted: 6,
};

class JjRepositoryState implements RepositoryState {
	HEAD: Branch | undefined = undefined;
	refs: Ref[] = [];
	remotes: Remote[] = [];
	submodules: Submodule[] = [];
	rebaseCommit: Commit | undefined = undefined;
	mergeChanges: Change[] = [];
	indexChanges: Change[] = [];
	workingTreeChanges: Change[] = [];

	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

	fireDidChange(): void {
		this._onDidChange.fire();
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

function unsupported(operation: string): Promise<never> {
	return Promise.reject(new Error(`${operation} is not supported for Jujutsu (jj) workspaces`));
}

function withGitErrorCode(error: unknown, code: GitErrorCodes): unknown {
	if (error && typeof error === 'object') {
		(error as { gitErrorCode?: string }).gitErrorCode = code;
	}
	return error;
}

/**
 * A `Repository` backed by a Jujutsu workspace instead of VS Code's git extension.
 *
 * Reads of objects, refs and config go straight to the shared git store (`git --git-dir=…`); the
 * workspace's own state (working-copy parent, bookmarks, changes) comes from `jj` run with
 * `--ignore-working-copy`, which answers from the last snapshot instead of scanning the tree.
 * Mutations are jj-native: checking a branch out is `jj new <bookmark>`, so the working copy becomes
 * a fresh empty change on top of the pull request head - the idiomatic jj state for review.
 *
 * git concepts map onto jj as follows:
 *   HEAD            the working-copy parent `@-` (first parent for merges)
 *   current branch  a local bookmark on `@-`; else a remote bookmark on it; else the nearest
 *                   bookmark below `@-` (the working copy has commits the bookmark has not caught up
 *                   with, reported as `ahead`)
 *   upstream        the remote bookmark of the same name (`<name>@<remote>`)
 *   fetch / pull    `jj git fetch`, then rebase the working copy onto the moved bookmark
 *   create branch   `jj bookmark create`;  track upstream: `jj bookmark track`
 *   delete branch   untrack, then `jj bookmark delete` - never propagates a deletion to the remote
 */
export class JjRepository implements Repository, vscode.Disposable {
	static readonly ID = 'JjRepository';

	readonly rootUri: vscode.Uri;
	readonly inputBox: InputBox = { value: '' };
	readonly ui: RepositoryUIState;
	readonly state: JjRepositoryState;

	private readonly _onDidChangeUi = new vscode.EventEmitter<void>();
	private readonly _disposables: (() => void)[] = [];
	private _refreshTimer: NodeJS.Timeout | undefined;
	private _refreshing: Promise<void> | undefined;
	private _lastStateSignature = '';

	constructor(readonly layout: JjWorkspaceLayout) {
		this.rootUri = vscode.Uri.file(layout.root);
		this.state = new JjRepositoryState();
		this.ui = { selected: true, onDidChange: this._onDidChangeUi.event };
	}

	async initialize(): Promise<void> {
		await this.refreshState();
		// Every jj operation (in any workspace of the repo) appends to the shared op log; snapshots and
		// working-copy moves touch this workspace's working_copy dir.
		this._disposables.push(watchDirectory(resolvePath(this.layout.repoDir, 'op_heads', 'heads'), () => this.scheduleRefresh()));
		this._disposables.push(watchDirectory(resolvePath(this.layout.root, '.jj', 'working_copy'), () => this.scheduleRefresh()));
	}

	dispose(): void {
		if (this._refreshTimer) {
			clearTimeout(this._refreshTimer);
		}
		this._disposables.forEach(dispose => dispose());
		this._disposables.length = 0;
		this.state.dispose();
		this._onDidChangeUi.dispose();
	}

	// ---- process helpers -------------------------------------------------------------------

	private async git(args: string[], options: { binary?: boolean; stdin?: string; allowFailure?: boolean } = {}) {
		// With --git-dir and no --work-tree, git treats the cwd (the workspace root) as the work tree,
		// so paths resolve against this workspace even though the store belongs to the main one.
		return exec('git', ['--git-dir', this.layout.gitDir, '--no-pager', ...args], { cwd: this.layout.root, ...options });
	}

	/** `snapshot: true` lets jj scan the working copy first (needed to see uncommitted edits); reads default to the last snapshot. */
	private async jj(args: string[], options: { snapshot?: boolean; allowFailure?: boolean } = {}) {
		const globalArgs = ['--no-pager', '--color', 'never', '--quiet'];
		if (!options.snapshot) {
			globalArgs.push('--ignore-working-copy');
		}
		return exec('jj', [...globalArgs, ...args], { cwd: this.layout.root, allowFailure: options.allowFailure });
	}

	// ---- state -----------------------------------------------------------------------------

	private scheduleRefresh(): void {
		if (this._refreshTimer) {
			clearTimeout(this._refreshTimer);
		}
		this._refreshTimer = setTimeout(() => {
			this._refreshTimer = undefined;
			void this.refreshState();
		}, 300);
	}

	private refreshState(): Promise<void> {
		if (this._refreshing) {
			return this._refreshing;
		}
		this._refreshing = this.doRefreshState().finally(() => {
			this._refreshing = undefined;
		});
		return this._refreshing;
	}

	private async doRefreshState(): Promise<void> {
		try {
			const [commits, remotes, changes] = await Promise.all([
				this.logCommits('@ | @-'),
				this.git(['remote', '-v']).then(result => parseGitRemotes(result.stdout)),
				this.jj(['diff', '-r', '@', '--summary']).then(result => parseSummary(result.stdout)),
			]);
			const parent = commits.find(commit => !commit.isWorkingCopy);
			this.state.HEAD = parent ? await this.describeHead(parent) : undefined;
			this.state.remotes = remotes.map(remote => ({ ...remote, isReadOnly: false }));
			this.state.workingTreeChanges = changes.map(change => this.toChange(change, true));
		} catch (e) {
			Logger.appendLine(`Failed to read jj workspace state for ${this.layout.root}: ${e}`, JjRepository.ID);
			return;
		}

		const signature = JSON.stringify([this.state.HEAD, this.state.remotes, this.state.workingTreeChanges.map(c => c.uri.fsPath)]);
		if (signature !== this._lastStateSignature) {
			this._lastStateSignature = signature;
			this.state.fireDidChange();
		}
	}

	private async logCommits(revset: string): Promise<JjCommitInfo[]> {
		const result = await this.jj(['log', '--no-graph', '-r', revset, '-T', JJ_COMMIT_TEMPLATE]);
		return parseJjCommits(result.stdout);
	}

	/** Builds the `Branch` the extension treats as the checked-out branch (see class docs for the mapping). */
	private async describeHead(parent: JjCommitInfo): Promise<Branch> {
		const hasBookmarks = parent.localBookmarks.length > 0 || parent.remoteBookmarks.length > 0;
		const bookmarkCommit = hasBookmarks ? parent : (await this.findBranchBelow(parent)) ?? parent;

		let name = bookmarkCommit.localBookmarks[0];
		let upstream: Branch['upstream'];
		if (!name) {
			const remoteBookmark =
				bookmarkCommit.remoteBookmarks.find(b => b.tracked) ??
				bookmarkCommit.remoteBookmarks.find(b => b.remote === 'origin') ??
				bookmarkCommit.remoteBookmarks[0];
			if (remoteBookmark) {
				name = remoteBookmark.name;
				upstream = { remote: remoteBookmark.remote, name: remoteBookmark.name };
			}
		}

		let ahead: number | undefined;
		let behind: number | undefined;
		if (name) {
			const entries = await this.listBookmark(name);
			const remoteEntry = upstream
				? entries.find(entry => entry.remote === upstream!.remote)
				: pickRemoteEntry(entries);
			if (remoteEntry?.commitId) {
				upstream ??= { remote: remoteEntry.remote!, name };
				({ ahead, behind } = await this.aheadBehind(parent.commitId, remoteEntry.commitId));
			}
		}

		return { type: RefType.Head, name, commit: parent.commitId, upstream, ahead, behind };
	}

	/**
	 * jj does not advance a bookmark when you commit on top of it, so after `jj new <bookmark>` plus a
	 * few commits the working copy sits above its branch. Treat that bookmark as the current branch
	 * when it is unambiguous (one bookmark name on the nearest bookmarked ancestor) and the commits
	 * between it and `@-` are unpublished - otherwise `@-` is just some published commit (a merged
	 * main, say) and there is no branch to report.
	 */
	private async findBranchBelow(parent: JjCommitInfo): Promise<JjCommitInfo | undefined> {
		let below: JjCommitInfo[];
		try {
			below = await this.logCommits('heads(::@- & (bookmarks() | remote_bookmarks()))');
		} catch {
			return undefined;
		}
		if (below.length !== 1) {
			return undefined;
		}
		const candidate = below[0];
		const names = new Set([...candidate.localBookmarks, ...candidate.remoteBookmarks.map(bookmark => bookmark.name)]);
		if (names.size !== 1) {
			return undefined;
		}
		const unpublished = await this.jj(
			['log', '--no-graph', '-r', `(${candidate.commitId}..${parent.commitId}) ~ ::remote_bookmarks()`, '-T', '"."'],
			{ allowFailure: true },
		);
		return unpublished.stdout.length > 0 ? candidate : undefined;
	}

	private async listBookmark(name: string): Promise<JjBookmarkListEntry[]> {
		const result = await this.jj(['bookmark', 'list', '--all-remotes', '-T', JJ_BOOKMARK_LIST_TEMPLATE, name], {
			allowFailure: true,
		});
		return parseJjBookmarkList(result.stdout).filter(entry => entry.name === name);
	}

	private async aheadBehind(local: string, remote: string): Promise<{ ahead: number; behind: number }> {
		if (local === remote) {
			return { ahead: 0, behind: 0 };
		}
		const result = await this.git(['rev-list', '--left-right', '--count', `${local}...${remote}`], { allowFailure: true });
		return parseAheadBehind(result.stdout);
	}

	// ---- paths / conversions ---------------------------------------------------------------

	/** Repo-relative, forward-slash path from either an absolute workspace path or a `/`-prefixed relative one. */
	private relative(fsPath: string): string {
		const normalized = fsPath.replaceAll('\\', '/');
		const root = this.layout.root.replaceAll('\\', '/').replace(/\/$/, '');
		if (normalized === root) {
			return '';
		}
		if (normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
			return normalized.slice(root.length + 1);
		}
		return normalized.replace(/^\/+/, '');
	}

	/** jj parses CLI paths as filesets; the `root-file:` kind pins a literal repo-relative path. */
	private fileset(fsPath: string): string {
		return `root-file:${quoteRevsetSymbol(this.relative(fsPath))}`;
	}

	private toChange(change: SummaryChange, workingTree: boolean): Change {
		const uri = vscode.Uri.file(resolvePath(this.layout.root, change.path));
		const originalUri = vscode.Uri.file(resolvePath(this.layout.root, change.previousPath ?? change.path));
		return {
			uri,
			originalUri,
			renameUri: !workingTree && change.previousPath ? uri : undefined,
			status: STATUS_BY_SUMMARY[change.status] as unknown as Change['status'],
		};
	}

	/**
	 * Resolves a git-style ref the extension hands us to a jj revset: `refs/remotes/<r>/<n>` → `"n"@r`,
	 * a 40-hex commit → itself, a local bookmark → its quoted name, a remote-only bookmark → `"n"@remote`.
	 */
	private async toRevset(treeish: string): Promise<string> {
		const remoteRef = parseRemoteRef(treeish);
		if (remoteRef) {
			return `${quoteRevsetSymbol(remoteRef.name)}@${remoteRef.remote}`;
		}
		if (/^[0-9a-f]{40}$/i.test(treeish)) {
			return treeish;
		}
		const name = stripHeadsPrefix(treeish);
		const entries = await this.listBookmark(name);
		if (entries.some(entry => !entry.remote && entry.commitId)) {
			return quoteRevsetSymbol(name);
		}
		const remoteEntry = pickRemoteEntry(entries);
		if (remoteEntry?.commitId) {
			return `${quoteRevsetSymbol(name)}@${remoteEntry.remote}`;
		}
		throw new Error(`Bookmark '${name}' was not found in this jj repository.`);
	}

	// ---- config ----------------------------------------------------------------------------

	async getConfigs(): Promise<{ key: string; value: string }[]> {
		const result = await this.git(['config', '--list', '-z']);
		return parseGitConfigList(result.stdout);
	}

	async getConfig(key: string): Promise<string> {
		const result = await this.git(['config', '--get', key]);
		return result.stdout.trim();
	}

	async setConfig(key: string, value: string): Promise<string> {
		await this.git(['config', key, value]);
		return value;
	}

	async unsetConfig(key: string): Promise<string> {
		await this.git(['config', '--unset', key], { allowFailure: true });
		return '';
	}

	async getGlobalConfig(key: string): Promise<string> {
		const result = await this.git(['config', '--global', '--get', key]);
		return result.stdout.trim();
	}

	// ---- objects ---------------------------------------------------------------------------

	async getObjectDetails(treeish: string, path: string): Promise<{ mode: string; object: string; size: number }> {
		const relativePath = this.relative(path);
		const result = await this.git(['ls-tree', '-l', '-z', treeish, '--', relativePath]);
		const entry = parseLsTree(result.stdout);
		if (!entry) {
			throw new Error(`'${relativePath}' does not exist at ${treeish}`);
		}
		return { mode: entry.mode, object: entry.object, size: entry.size };
	}

	async detectObjectType(object: string): Promise<{ mimetype: string; encoding?: string }> {
		const result = await this.git(['cat-file', '-p', object], { binary: true });
		return { mimetype: sniffMimetype(result.buffer) };
	}

	async buffer(ref: string, path: string): Promise<Buffer> {
		const result = await this.git(['show', `${ref}:${this.relative(path)}`], { binary: true });
		return Buffer.from(result.buffer);
	}

	async show(ref: string, path: string): Promise<string> {
		const content = await this.buffer(ref, path);
		return content.toString('utf8');
	}

	async getCommit(ref: string): Promise<Commit> {
		let result = await this.git(['log', '-1', `--format=${GIT_COMMIT_FORMAT}`, ref, '--'], { allowFailure: true });
		let commit = parseGitCommit(result.stdout);
		if (!commit) {
			// Not a git ref: maybe a bookmark jj has not exported. Let jj resolve it to a commit id.
			const resolved = await this.jj(['log', '--no-graph', '-r', await this.toRevset(ref), '-T', 'commit_id'], { allowFailure: true });
			const commitId = resolved.stdout.trim().split('\n', 1)[0];
			if (/^[0-9a-f]{40}$/.test(commitId)) {
				result = await this.git(['log', '-1', `--format=${GIT_COMMIT_FORMAT}`, commitId, '--']);
				commit = parseGitCommit(result.stdout);
			}
		}
		if (!commit) {
			throw new Error(`Commit '${ref}' was not found.`);
		}
		return commit;
	}

	async hashObject(data: string): Promise<string> {
		const result = await this.git(['hash-object', '-w', '--stdin'], { stdin: data });
		return result.stdout.trim();
	}

	async getMergeBase(ref1: string, ref2: string): Promise<string> {
		const result = await this.git(['merge-base', ref1, ref2]);
		return result.stdout.trim();
	}

	async blame(path: string): Promise<string> {
		const head = this.state.HEAD?.commit;
		if (!head) {
			return '';
		}
		const result = await this.git(['blame', '--root', head, '--', this.relative(path)]);
		return result.stdout;
	}

	async log(options?: LogOptions): Promise<Commit[]> {
		const args = ['log', `--format=${GIT_COMMIT_FORMAT}`];
		if (options?.maxEntries) {
			args.push('-n', String(options.maxEntries));
		}
		const head = this.state.HEAD?.commit;
		if (head) {
			args.push(head);
		}
		args.push('--');
		if (options?.path) {
			args.push(this.relative(options.path));
		}
		const result = await this.git(args);
		return result.stdout
			.split(RECORD_SEPARATOR)
			.map(record => parseGitCommit(`${record}${RECORD_SEPARATOR}`))
			.filter((commit): commit is Commit => !!commit);
	}

	// ---- diffs -----------------------------------------------------------------------------

	async diff(_cached?: boolean): Promise<string> {
		// jj has no index: every edit in the working copy is "staged".
		const result = await this.jj(['diff', '-r', '@', '--git'], { snapshot: true });
		return result.stdout;
	}

	diffWithHEAD(): Promise<Change[]>;
	diffWithHEAD(path: string): Promise<string>;
	async diffWithHEAD(path?: string): Promise<Change[] | string> {
		if (path === undefined) {
			const result = await this.jj(['diff', '-r', '@', '--summary'], { snapshot: true });
			return parseSummary(result.stdout).map(change => this.toChange(change, true));
		}
		const result = await this.jj(['diff', '-r', '@', '--git', this.fileset(path)], { snapshot: true });
		return result.stdout;
	}

	diffWith(ref: string): Promise<Change[]>;
	diffWith(ref: string, path: string): Promise<string>;
	async diffWith(ref: string, path?: string): Promise<Change[] | string> {
		const from = await this.toRevset(ref);
		if (path === undefined) {
			const result = await this.jj(['diff', '--from', from, '--to', '@', '--summary'], { snapshot: true });
			return parseSummary(result.stdout).map(change => this.toChange(change, false));
		}
		const result = await this.jj(['diff', '--from', from, '--to', '@', '--git', this.fileset(path)], { snapshot: true });
		return result.stdout;
	}

	diffIndexWithHEAD(): Promise<Change[]>;
	diffIndexWithHEAD(path: string): Promise<string>;
	diffIndexWithHEAD(path?: string): Promise<Change[] | string> {
		return path === undefined ? this.diffWithHEAD() : this.diffWithHEAD(path);
	}

	diffIndexWith(ref: string): Promise<Change[]>;
	diffIndexWith(ref: string, path: string): Promise<string>;
	diffIndexWith(ref: string, path?: string): Promise<Change[] | string> {
		return path === undefined ? this.diffWith(ref) : this.diffWith(ref, path);
	}

	async diffBlobs(object1: string, object2: string): Promise<string> {
		const result = await this.git(['diff', '--no-color', object1, object2], { allowFailure: true });
		return result.stdout;
	}

	diffBetween(ref1: string, ref2: string): Promise<Change[]>;
	diffBetween(ref1: string, ref2: string, path: string): Promise<string>;
	async diffBetween(ref1: string, ref2: string, path?: string): Promise<Change[] | string> {
		if (path === undefined) {
			const result = await this.git(['diff', '--name-status', '-z', ref1, ref2]);
			return parseNameStatus(result.stdout).map(change => this.toChange(change, false));
		}
		const result = await this.git(['diff', '--no-color', ref1, ref2, '--', this.relative(path)]);
		return result.stdout;
	}

	async apply(patch: string, reverse?: boolean): Promise<void> {
		const args = ['apply', '--whitespace=nowarn'];
		if (reverse) {
			args.push('-R');
		}
		args.push(patch);
		try {
			await this.git(args);
		} catch (e) {
			throw withGitErrorCode(e, GitErrorCodes.PatchDoesNotApply);
		}
		await this.status();
	}

	async clean(paths: string[]): Promise<void> {
		await this.jj(['restore', ...paths.map(path => this.fileset(path))], { snapshot: true });
		await this.refreshState();
	}

	// ---- branches --------------------------------------------------------------------------

	async getBranch(name: string): Promise<Branch> {
		const remoteRef = parseRemoteRef(name);
		if (remoteRef) {
			const remoteEntries = await this.listBookmark(remoteRef.name);
			const entry = remoteEntries.find(e => e.remote === remoteRef.remote && e.commitId);
			if (!entry) {
				throw new Error(`Remote bookmark '${remoteRef.name}@${remoteRef.remote}' was not found.`);
			}
			return { type: RefType.RemoteHead, name: `${remoteRef.remote}/${remoteRef.name}`, commit: entry.commitId, remote: remoteRef.remote };
		}

		const bookmark = stripHeadsPrefix(name);
		const entries = await this.listBookmark(bookmark);
		const local = entries.find(entry => !entry.remote && entry.commitId);
		const remote = pickRemoteEntry(entries);
		if (local?.commitId) {
			const counts = remote?.commitId ? await this.aheadBehind(local.commitId, remote.commitId) : {};
			return {
				type: RefType.Head,
				name: bookmark,
				commit: local.commitId,
				upstream: remote?.commitId ? { remote: remote.remote!, name: bookmark } : undefined,
				...counts,
			};
		}
		if (remote?.commitId) {
			// Remote-only bookmark: usable as a checkout target (`jj new <name>@<remote>`), so report it
			// as a branch that is exactly at its upstream.
			return {
				type: RefType.Head,
				name: bookmark,
				commit: remote.commitId,
				upstream: { remote: remote.remote!, name: bookmark },
				ahead: 0,
				behind: 0,
			};
		}
		throw new Error(`Bookmark '${bookmark}' was not found in this jj repository.`);
	}

	async getBranches(query: BranchQuery): Promise<Ref[]> {
		const patterns = query.remote ? ['refs/remotes/'] : ['refs/heads/'];
		const result = await this.git(['for-each-ref', '--format=%(refname)%00%(objectname)', ...patterns]);
		const refs: Ref[] = [];
		for (const line of result.stdout.split('\n')) {
			const [refname, commit] = line.split('\0', 2);
			if (!refname) {
				continue;
			}
			const remoteRef = parseRemoteRef(refname);
			const ref: Ref = remoteRef
				? { type: RefType.RemoteHead, name: `${remoteRef.remote}/${remoteRef.name}`, commit, remote: remoteRef.remote }
				: { type: RefType.Head, name: stripHeadsPrefix(refname), commit };
			if (query.pattern && !(ref.name ?? '').includes(query.pattern.replaceAll('*', ''))) {
				continue;
			}
			refs.push(ref);
		}
		return query.count ? refs.slice(0, query.count) : refs;
	}

	getBranchBase(_name: string): Promise<Branch | undefined> {
		return Promise.resolve(undefined);
	}

	async createBranch(name: string, checkout: boolean, ref?: string): Promise<void> {
		const target = ref ? await this.toRevset(ref) : '@-';
		try {
			await this.jj(['bookmark', 'create', name, '-r', target]);
		} catch (e) {
			throw withGitErrorCode(e, GitErrorCodes.BranchAlreadyExists);
		}
		if (checkout) {
			await this.checkout(name);
		} else {
			await this.refreshState();
		}
	}

	async deleteBranch(name: string, _force?: boolean): Promise<void> {
		// `jj bookmark delete` on a tracked bookmark schedules the remote bookmark for deletion on the
		// next push; untracking first keeps this a purely local cleanup, like `git branch -D`.
		const entries = await this.listBookmark(name);
		for (const entry of entries) {
			if (entry.remote && entry.tracked) {
				await this.jj(['bookmark', 'untrack', `${name}@${entry.remote}`], { allowFailure: true });
			}
		}
		await this.jj(['bookmark', 'delete', name]);
		await this.refreshState();
	}

	async setBranchUpstream(name: string, upstream: string): Promise<void> {
		const remoteRef = parseRemoteRef(upstream);
		if (!remoteRef) {
			throw new Error(`Cannot track '${upstream}': expected refs/remotes/<remote>/<bookmark>.`);
		}
		if (remoteRef.name !== name) {
			// jj tracks a remote bookmark only under the same name; the extension only ever asks for
			// same-name tracking, so just note it if that changes.
			Logger.appendLine(`jj cannot track ${upstream} as bookmark '${name}' (names differ); skipping.`, JjRepository.ID);
			return;
		}
		await this.jj(['bookmark', 'track', `${name}@${remoteRef.remote}`], { allowFailure: true });
		await this.refreshState();
	}

	async checkout(treeish: string): Promise<void> {
		const revset = await this.toRevset(treeish);
		Logger.appendLine(`jj new ${revset} in ${this.layout.root}`, JjRepository.ID);
		await this.jj(['new', revset], { snapshot: true });
		await this.refreshState();
	}

	// ---- remotes ---------------------------------------------------------------------------

	async addRemote(name: string, url: string): Promise<void> {
		await this.jj(['git', 'remote', 'add', name, url]);
		await this.refreshState();
	}

	async removeRemote(name: string): Promise<void> {
		await this.jj(['git', 'remote', 'remove', name]);
		await this.refreshState();
	}

	async renameRemote(name: string, newName: string): Promise<void> {
		await this.jj(['git', 'remote', 'rename', name, newName]);
		await this.refreshState();
	}

	fetch(options?: FetchOptions): Promise<void>;
	fetch(remote?: string, ref?: string, depth?: number): Promise<void>;
	async fetch(remoteOrOptions?: string | FetchOptions, ref?: string): Promise<void> {
		const options: FetchOptions =
			typeof remoteOrOptions === 'string' || remoteOrOptions === undefined ? { remote: remoteOrOptions, ref } : remoteOrOptions;
		const args = ['git', 'fetch'];
		if (options.remote) {
			args.push('--remote', options.remote);
		}
		if (options.ref) {
			// `<remote-ref>:<local>` (fork checkouts) and refs/heads/… both boil down to the bookmark name.
			const remoteRef = parseRemoteRef(options.ref);
			const bookmark = remoteRef ? remoteRef.name : stripHeadsPrefix(options.ref.split(':', 1)[0]);
			if (bookmark) {
				args.push('--branch', bookmark);
			}
		}
		try {
			await this.jj(args);
		} catch (e) {
			throw withGitErrorCode(e, GitErrorCodes.RemoteConnectionError);
		}
		await this.refreshState();
	}

	/** `git pull` for the current branch: fetch, then move the working copy onto the updated bookmark. */
	async pull(_unshallow?: boolean): Promise<void> {
		const head = this.state.HEAD;
		await this.fetch(head?.upstream?.remote);
		if (!head?.name) {
			return;
		}
		let target: string;
		try {
			target = await this.toRevset(head.name);
		} catch {
			return; // the bookmark vanished on fetch; nothing to move onto
		}
		const commits = await this.logCommits('@');
		const workingCopy = commits.find(commit => commit.isWorkingCopy);
		if (workingCopy?.empty && !workingCopy.description) {
			await this.jj(['new', target], { snapshot: true });
		} else {
			await this.jj(['rebase', '-r', '@', '-d', target], { snapshot: true });
		}
		await this.refreshState();
	}

	async push(remoteName?: string, branchName?: string, _setUpstream?: boolean): Promise<void> {
		let localName = branchName ?? this.state.HEAD?.name;
		if (!localName) {
			throw new Error('No bookmark to push: the working copy is not on a bookmark.');
		}
		let remoteBookmark = localName;
		const colon = localName.indexOf(':');
		if (colon !== -1) {
			remoteBookmark = localName.slice(colon + 1);
			localName = localName.slice(0, colon);
			if (remoteBookmark !== localName) {
				// jj pushes bookmarks under their own name; create the remote-named bookmark on the same commit.
				await this.jj(['bookmark', 'set', remoteBookmark, '-r', quoteRevsetSymbol(localName)]);
			}
		}
		const args = ['git', 'push', '--bookmark', remoteBookmark];
		if (remoteName) {
			args.push('--remote', remoteName);
		}
		try {
			await this.jj(args);
		} catch (e) {
			const message = e instanceof ExecError ? e.stderr : String(e);
			if (/--allow-new/.test(message)) {
				// jj < 0.30 refuses to create a remote bookmark unless told to; newer versions dropped the flag.
				await this.jj([...args, '--allow-new']);
			} else {
				throw withGitErrorCode(
					e,
					/rejected|non-fast-forward|behind|diverged/i.test(message) ? GitErrorCodes.PushRejected : GitErrorCodes.RemoteConnectionError,
				);
			}
		}
		await this.refreshState();
	}

	// ---- misc ------------------------------------------------------------------------------

	/** Snapshots the working copy (the one place we let jj scan the tree) and re-reads state. */
	async status(): Promise<void> {
		await this.jj(['status'], { snapshot: true, allowFailure: true });
		await this.refreshState();
	}

	commit(message: string, _opts?: CommitOptions): Promise<void> {
		return unsupported(`commit(${message})`);
	}

	add(paths: string[]): Promise<void> {
		return unsupported(`add(${paths.join(', ')})`);
	}

	merge(ref: string): Promise<void> {
		return unsupported(`merge(${ref})`);
	}

	mergeAbort(): Promise<void> {
		return unsupported('mergeAbort()');
	}
}

/** The remote bookmark that stands for a bookmark's upstream: tracked first, then origin, then any. */
function pickRemoteEntry(entries: JjBookmarkListEntry[]): JjBookmarkListEntry | undefined {
	const remotes = entries.filter(entry => entry.remote && entry.commitId);
	return remotes.find(entry => entry.tracked) ?? remotes.find(entry => entry.remote === 'origin') ?? remotes[0];
}
