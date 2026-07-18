import { IdentityRef } from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import {
	CommentThreadStatus,
	CommentType,
	FileDiff,
	GitBranchStats,
	GitCommitRef,
	GitPullRequest,
	GitPullRequestCommentThread,
	GitPullRequestCompletionOptions,
	GitPullRequestMergeStrategy,
	IdentityRefWithVote,
	LineDiffBlockChangeType,
	PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { Identity } from 'azure-devops-node-api/interfaces/IdentitiesInterfaces';
import {
	PolicyConfiguration,
	PolicyEvaluationRecord,
	PolicyEvaluationStatus,
} from 'azure-devops-node-api/interfaces/PolicyInterfaces';
import * as vscode from 'vscode';
import { Repository } from '../api/api';
import { GitApiImpl } from '../api/api1';
import { DiffSide, Reaction } from '../common/comment';
import { DiffChangeType, DiffHunk, DiffLine, getGitChangeTypeFromVersionControlChangeType } from '../common/diffHunk';
import { Resource } from '../common/resources';
import { ThreadData } from '../view/treeNodes/pullRequestNode';
import { AzdoRepository } from './azdoRepository';
import {
	IAccount,
	IFileChangeNode,
	IGitHubRef,
	IRawFileChange,
	MergeMethod,
	MergeMethodsAvailability,
	PullRequest,
	PullRequestCompletionSummary,
	PullRequestPolicyEvaluation,
	ReviewState,
} from './interface';
import {
	isBuildValidationSettings,
	isMergeStrategySettings,
	isMinimumReviewersSettings,
	isRequiredReviewersSettings,
	MergeStrategyPolicySettings,
	MinimumReviewersPolicySettings,
	PolicyScopeEntry,
	RequiredReviewersPolicySettings,
	WellKnownPolicyTypeIds,
} from './policyTypes';
import { GHPRComment, GHPRCommentThread } from './prComment';

export interface CommentReactionHandler {
	toggleReaction(comment: vscode.Comment, reaction: vscode.CommentReaction): Promise<void>;
}

export async function convertAzdoPullRequestToRawPullRequest(
	pullRequest: GitPullRequest,
	azdoRepo: AzdoRepository,
): Promise<PullRequest> {
	const { status, sourceRefName, targetRefName } = pullRequest;

	const item: PullRequest = {
		merged: status === PullRequestStatus.Completed,
		head: await azdoRepo.getBranchRef(convertBranchRefToBranchName(sourceRefName || '')),
		base: await azdoRepo.getBranchRef(convertBranchRefToBranchName(targetRefName || '')),
		...pullRequest,
	};

	return item;
}

export function convertRESTUserToAccount(user: IdentityRef): IAccount {
	return {
		name: user.displayName,
		email: user.uniqueName,
		url: user.url,
		id: user.id,
		avatarUrl: user.imageUrl,
	};
}

export function convertIdentityRefWithVoteToReviewer(r: IdentityRefWithVote): ReviewState {
	return {
		reviewer: {
			email: r.uniqueName,
			name: r.displayName,
			// Verified live against dev.azure.com: IdentityRefWithVote carries no `_links` object at
			// all (unlike some other identity payloads) - avatarUrl comes through as a flat `imageUrl`,
			// same as every other identity conversion in this file (convertRESTUserToAccount et al).
			// The old `_links.avatar.href` lookup always resolved to undefined, so reviewer avatars
			// never rendered.
			avatarUrl: r.imageUrl,
			url: r.reviewerUrl,
			id: r.id,
		},
		state: r.vote ?? 0,
		isRequired: r.isRequired ?? false,
	};
}

/**
 * POL-01: convert a raw PolicyEvaluationRecord (untyped settings/context, PolicyInterfaces.d.ts:37,79)
 * into the webview DTO. Kind detection is shape-first with a GUID tiebreaker only for the two
 * settings-shapeless types (ROADMAP Section 4); unmatched types fall back to 'other' so custom/unknown
 * policies stay visible instead of being dropped. Returns undefined for NotApplicable/disabled records.
 */
export function convertPolicyEvaluation(
	record: PolicyEvaluationRecord,
	typeMap: Map<string, string>,
): PullRequestPolicyEvaluation | undefined {
	const configuration = record.configuration;
	if (!configuration || configuration.isEnabled === false) {
		return undefined;
	}

	const settings: any = configuration.settings ?? {};
	const typeId = configuration.type?.id;
	const displayName = (typeId && typeMap.get(typeId)) || configuration.type?.displayName || 'Branch policy';

	let kind: PullRequestPolicyEvaluation['kind'] = 'other';
	let detail: string | undefined;

	if (isMinimumReviewersSettings(settings)) {
		kind = 'minimumReviewers';
		detail = buildMinimumReviewersDetail(settings);
	} else if (isBuildValidationSettings(settings)) {
		kind = 'build';
		detail = settings.displayName ? `Build: ${settings.displayName}` : 'Build validation';
	} else if (isRequiredReviewersSettings(settings)) {
		kind = 'requiredReviewers';
		detail = buildRequiredReviewersDetail(settings);
	} else if (isMergeStrategySettings(settings)) {
		kind = 'mergeStrategy';
		detail = buildMergeStrategyDetail(settings);
	} else if (typeId === WellKnownPolicyTypeIds.workItemLinking) {
		kind = 'workItemLinking';
		detail = 'Work item linking';
	} else if (typeId === WellKnownPolicyTypeIds.commentRequirements) {
		kind = 'commentRequirements';
		detail = 'Comment resolution';
	}

	return {
		evaluationId: record.evaluationId ?? '',
		kind,
		displayName,
		detail,
		isBlocking: configuration.isBlocking ?? false,
		status: record.status ?? PolicyEvaluationStatus.Queued,
	};
}

function buildMinimumReviewersDetail(settings: MinimumReviewersPolicySettings): string {
	const n = settings.minimumApproverCount ?? 0;
	const suffix = settings.creatorVoteCounts ? ', creator vote counts' : '';
	return `${n} reviewer${n === 1 ? '' : 's'} required${suffix}`;
}

function buildRequiredReviewersDetail(settings: RequiredReviewersPolicySettings): string {
	const n = settings.requiredReviewerIds?.length ?? 0;
	return `${n} required reviewer${n === 1 ? '' : 's'}`;
}

function buildMergeStrategyDetail(settings: MergeStrategyPolicySettings): string {
	const allowed: string[] = [];
	if (settings.useSquashMerge) {
		return 'Allowed: Squash';
	}
	if (settings.allowNoFastForward) {
		allowed.push('Merge commit');
	}
	if (settings.allowSquash) {
		allowed.push('Squash');
	}
	if (settings.allowRebase) {
		allowed.push('Rebase');
	}
	if (settings.allowRebaseMerge) {
		allowed.push('Semi-linear merge');
	}
	return allowed.length ? `Allowed: ${allowed.join(', ')}` : 'No merge strategies allowed';
}

/**
 * AC-02: convert the PR's completionOptions (populated whenever autoCompleteSetBy is set) into the
 * webview's compact options-summary line, e.g. "Squash, delete branch, complete work items".
 */
export function buildCompletionSummary(
	options: GitPullRequestCompletionOptions | undefined,
): PullRequestCompletionSummary | undefined {
	if (!options) {
		return undefined;
	}

	return {
		mergeStrategy:
			options.mergeStrategy !== undefined
				? (GitPullRequestMergeStrategy[options.mergeStrategy] as PullRequestCompletionSummary['mergeStrategy'])
				: undefined,
		deleteSourceBranch: options.deleteSourceBranch,
		transitionWorkItems: options.transitionWorkItems,
		mergeCommitMessage: options.mergeCommitMessage,
	};
}

const ALL_MERGE_METHODS_ENABLED: MergeMethodsAvailability = {
	NoFastForward: true,
	Squash: true,
	Rebase: true,
	RebaseMerge: true,
};

/**
 * AC-04: fold zero-or-more "Limit merge types" policy configurations into a single availability map.
 * No matching policy -> all four enabled (current behavior preserved). One or more matching, enabled,
 * blocking policies -> AND-composition of each policy's allow* flags (conservative - a strategy is
 * offered only if every applicable policy allows it), mirroring server enforcement. Legacy
 * `useSquashMerge: true` settings map to Squash-only. An all-false composition is pathological but
 * possible with overlapping policies - keep all four enabled and let the server reject with a real
 * error rather than rendering a form with zero options.
 */
export function computeMergeMethodsAvailability(configurations: PolicyConfiguration[]): MergeMethodsAvailability {
	const relevant = configurations.filter(c => c.isEnabled && c.isBlocking && isMergeStrategySettings(c.settings ?? {}));

	if (relevant.length === 0) {
		return { ...ALL_MERGE_METHODS_ENABLED };
	}

	const availability: MergeMethodsAvailability = { ...ALL_MERGE_METHODS_ENABLED };
	relevant.forEach(config => {
		const settings = config.settings as MergeStrategyPolicySettings;
		const allowed: MergeMethodsAvailability = settings.useSquashMerge
			? { NoFastForward: false, Squash: true, Rebase: false, RebaseMerge: false }
			: {
					NoFastForward: !!settings.allowNoFastForward,
					Squash: !!settings.allowSquash,
					Rebase: !!settings.allowRebase,
					RebaseMerge: !!settings.allowRebaseMerge,
			  };
		(Object.keys(availability) as MergeMethod[]).forEach(method => {
			availability[method] = availability[method] && allowed[method];
		});
	});

	if (!Object.values(availability).some(Boolean)) {
		return { ...ALL_MERGE_METHODS_ENABLED };
	}

	return availability;
}

/**
 * AC-04 fallback path: PolicyApi.getPolicyConfigurations(project) returns every policy in the project
 * with no server-side ref filtering, so match settings.scope[] client-side the same way the server's
 * branch-scoped route would (repositoryId null = all repos; Exact/Prefix/DefaultBranch ref matching).
 */
export function matchesRefScope(
	config: PolicyConfiguration,
	repositoryId: string,
	targetRefName: string,
	defaultBranchRefName: string,
): boolean {
	const scope: PolicyScopeEntry[] = (config.settings ?? {}).scope ?? [];
	return scope.some(entry => {
		if (entry.repositoryId && entry.repositoryId !== repositoryId) {
			return false;
		}
		switch (entry.matchKind) {
			case 'Prefix':
				return !!entry.refName && targetRefName.startsWith(entry.refName);
			case 'DefaultBranch':
				return targetRefName === defaultBranchRefName;
			case 'Exact':
			default:
				return !!entry.refName && entry.refName.toLowerCase() === targetRefName.toLowerCase();
		}
	});
}

export function convertRESTIdentityToAccount(user: Identity): IAccount {
	return {
		name: user.providerDisplayName,
		email: user.properties['Account']['$value'],
		url: '',
		id: user.id,
		avatarUrl: '',
	};
}

export function convertAzdoBranchRefToIGitHubRef(branch: GitBranchStats, repocloneUrl: string): IGitHubRef {
	return {
		ref: branch.name || '',
		sha: branch.commit?.commitId || '',
		repo: { cloneUrl: repocloneUrl },
		exists: true,
	};
}

export function convertBranchRefToBranchName(branchRef: string): string {
	const splitref = branchRef.split('/');
	if (splitref.length < 2) {
		return branchRef;
	}
	if (splitref[1] === 'heads' || splitref[1] === 'tags' || splitref[1] === 'remotes') {
		return splitref.slice(2, splitref.length).join('/');
	}
	return splitref.slice(1, splitref.length).join('/');
}

export async function readableToString(readable?: NodeJS.ReadableStream): Promise<string | undefined> {
	if (!readable) {
		return undefined;
	}
	let result = '';
	for await (const chunk of readable) {
		result += chunk;
	}
	return result;
}

/**
 * Used for case insensitive sort by login
 */
export function loginComparator(a: IAccount, b: IAccount) {
	// sensitivity: 'accent' allows case insensitive comparison
	return a.id?.localeCompare(b.id || '', 'en', { sensitivity: 'accent' }) || -1;
}

// 3 lines before and after the hunk
const OVERFLOW = 3;

export function getDiffHunkFromFileDiff(fileDiff: FileDiff): DiffHunk[] {
	const diff: DiffHunk[] = [];
	let positionInHunk = 0;

	const validBlocks = fileDiff.lineDiffBlocks?.filter(d => d.changeType !== LineDiffBlockChangeType.None) ?? [];

	for (const block of validBlocks) {
		const oldLineNumber = block.originalLineNumberStart!;
		const newLineNumber = block.modifiedLineNumberStart!;

		// All this to have OVERFLOW amount of buffer before and after hunk for comments
		const overflowStartLineNumber = Math.max(newLineNumber - OVERFLOW, 1);
		const overflowLineCount = block.modifiedLinesCount! + OVERFLOW + (oldLineNumber - overflowStartLineNumber);
		const overflowEndLineNumber = newLineNumber + block.modifiedLinesCount! + OVERFLOW;

		const hunk = new DiffHunk(
			block.originalLineNumberStart!,
			block.originalLinesCount!,
			overflowStartLineNumber!,
			overflowLineCount!,
			positionInHunk,
		);
		// for (let i = 0; i < Math.max(block.originalLinesCount!, block.modifiedLinesCount!); i++) {
		// 	let type = DiffChangeType.Context;
		// 	let o = oldLineNumber + i;
		// 	let m = newLineNumber + i;
		// 	if (i >= block.originalLinesCount! || block.changeType === LineDiffBlockChangeType.Add) {
		// 		type = DiffChangeType.Add;
		// 		o = -1;
		// 	} else if (i >= block.modifiedLinesCount! || block.changeType === LineDiffBlockChangeType.Delete) {
		// 		type = DiffChangeType.Delete;
		// 		m = -1;
		// 	}
		// 	hunk.diffLines.push(new DiffLine(type, o, m, positionInHunk));
		// 	positionInHunk++;
		// }

		if (block.changeType === LineDiffBlockChangeType.Add) {
			for (let i = 0; i < block.modifiedLinesCount!; i++) {
				hunk.diffLines.push(new DiffLine(DiffChangeType.Add, -1, newLineNumber + i, positionInHunk));
				positionInHunk++;
			}
		} else if (block.changeType === LineDiffBlockChangeType.Delete) {
			for (let i = 0; i < block.originalLinesCount!; i++) {
				hunk.diffLines.push(new DiffLine(DiffChangeType.Delete, oldLineNumber + i, -1, positionInHunk));
				positionInHunk++;
			}
		} else if (block.changeType === LineDiffBlockChangeType.Edit) {
			// Add no change lines for overflow BEFORE the actual change
			for (let i = overflowStartLineNumber; i < newLineNumber; i++) {
				hunk.diffLines.push(new DiffLine(DiffChangeType.Context, i, i, positionInHunk));
				positionInHunk++;
			}

			const overlap = Math.min(block.originalLinesCount!, block.modifiedLinesCount!);
			for (let i = 0; i < overlap; i++) {
				hunk.diffLines.push(new DiffLine(DiffChangeType.Delete, oldLineNumber + i, -1, positionInHunk));
				positionInHunk++;
			}

			for (let i = 0; i < overlap; i++) {
				hunk.diffLines.push(new DiffLine(DiffChangeType.Add, -1, newLineNumber + i, positionInHunk));
				positionInHunk++;
			}

			for (let i = 0; i < Math.abs(block.originalLinesCount! - block.modifiedLinesCount!); i++) {
				let type = DiffChangeType.Context;
				let o = oldLineNumber + overlap + i;
				let m = newLineNumber + overlap + i;
				if (i + overlap >= block.originalLinesCount!) {
					type = DiffChangeType.Add;
					o = -1;
				}
				if (i + overlap >= block.modifiedLinesCount!) {
					type = DiffChangeType.Delete;
					m = -1;
				}
				hunk.diffLines.push(new DiffLine(type, o, m, positionInHunk));
				positionInHunk++;
			}

			// Add no change lines for overflow AFTER the actual change
			for (let i = newLineNumber + block.modifiedLinesCount!; i < overflowEndLineNumber; i++) {
				hunk.diffLines.push(new DiffLine(DiffChangeType.Context, i, i, positionInHunk));
				positionInHunk++;
			}
		}

		diff.push(hunk);
	}

	return diff;
}

export function isUserThread(thread: GitPullRequestCommentThread): boolean {
	return thread.comments?.find(c => c.id === 1)?.commentType === CommentType.Text ?? true;
}

export function isSystemThread(thread: GitPullRequestCommentThread): boolean {
	return thread.comments?.find(c => c.id === 1)?.commentType !== CommentType.Text ?? false;
}

export function getRelatedUsersFromPullrequest(
	pr: PullRequest,
	threads?: GitPullRequestCommentThread[],
	commits?: GitCommitRef[],
): { login: string; name?: string; email?: string }[] {
	if (!commits || commits.length === 0) {
		commits = pr.commits;
	}

	const related_users: { login: string; name?: string; email?: string }[] = [];

	related_users.push({
		login: pr.createdBy?.uniqueName ?? pr.createdBy?.id ?? '',
		email: pr.createdBy?.uniqueName,
		name: pr.createdBy?.displayName,
	});

	related_users.push(
		...(pr.reviewers ?? []).map(r => {
			return { name: r.displayName, login: r.uniqueName ?? r.id ?? '', email: r.uniqueName };
		}),
		...([] as IdentityRef[]).concat(...(threads?.map(t => t.comments?.map(c => c.author!) || []) || [])).map(r => {
			return { name: r.displayName, login: r.uniqueName ?? r.id ?? '', email: r.uniqueName };
		}),
		...(commits
			?.map(c => c.author ?? c.committer)
			.filter(c => !!c)
			.map(r => {
				return { name: r?.name, login: r?.email || '', email: r?.email };
			}) || []),
	);

	return related_users;
}

export function getReactionGroup(): { title: string; label: string; icon?: vscode.Uri }[] {
	const ret = [
		{
			title: 'THUMBS_UP',
			label: '👍',
			icon: Resource.icons.reactions.THUMBS_UP,
		},
		{
			title: 'THUMBS_DOWN',
			label: '👎',
			icon: Resource.icons.reactions.THUMBS_DOWN,
		},
		{
			title: 'LAUGH',
			label: '😄',
			icon: Resource.icons.reactions.LAUGH,
		},
		{
			title: 'HOORAY',
			label: '🎉',
			icon: Resource.icons.reactions.HOORAY,
		},
		{
			title: 'CONFUSED',
			label: '😕',
			icon: Resource.icons.reactions.CONFUSED,
		},
		{
			title: 'HEART',
			label: '❤️',
			icon: Resource.icons.reactions.HEART,
		},
		{
			title: 'ROCKET',
			label: '🚀',
			icon: Resource.icons.reactions.ROCKET,
		},
		{
			title: 'EYES',
			label: '👀',
			icon: Resource.icons.reactions.EYES,
		},
	];

	return ret;
}

export function generateCommentReactions(reactions: Reaction[] | undefined) {
	return getReactionGroup().map(reaction => {
		if (!reactions) {
			return { label: reaction.label, authorHasReacted: false, count: 0, iconPath: reaction.icon || '' };
		}

		const matchedReaction = reactions.find(re => re.label === reaction.label);

		if (matchedReaction) {
			return {
				label: matchedReaction.label,
				authorHasReacted: matchedReaction.viewerHasReacted,
				count: matchedReaction.count,
				iconPath: reaction.icon || '',
			};
		} else {
			return { label: reaction.label, authorHasReacted: false, count: 0, iconPath: reaction.icon || '' };
		}
	});
}
export function updateCommentReactions(comment: vscode.Comment, reactions: Reaction[] | undefined) {
	comment.reactions = generateCommentReactions(reactions);
}

export function getRepositoryForFile(gitAPI: GitApiImpl, file: vscode.Uri): Repository | undefined {
	for (const repository of gitAPI.repositories) {
		if (
			file.path.toLowerCase() === repository.rootUri.path.toLowerCase() ||
			(file.path.toLowerCase().startsWith(repository.rootUri.path.toLowerCase()) &&
				file.path.substring(repository.rootUri.path.length).startsWith('/'))
		) {
			return repository;
		}
	}
	return undefined;
}

// ITER-01: threadContext holds the server-tracked (current) position of a thread; trackingCriteria.orig*
// is the creation-time location. The presence of trackingCriteria means the thread HAS been tracked from
// its original spot, so threadContext is the current position. Prefer threadContext so comments stay glued
// to the code across pushes; fall back to orig* only when there is no threadContext.
export function getPositionFromThread(comment: GitPullRequestCommentThread) {
	// General/system comment threads (verified live: e.g. vote-change system comments) come back with
	// threadContext: null, not undefined - the `!== undefined` check let null through to an unguarded
	// property access below.
	if (comment.threadContext !== undefined && comment.threadContext !== null) {
		return comment.threadContext.rightFileStart === undefined
			? comment.threadContext.leftFileStart?.line
			: comment.threadContext.rightFileStart.line;
	}
	const trackingCriteria = comment.pullRequestThreadContext?.trackingCriteria;
	return trackingCriteria?.origRightFileStart === undefined
		? trackingCriteria?.origLeftFileStart?.line
		: trackingCriteria?.origRightFileStart.line;
}

export function getDiffSide(thread: GitPullRequestCommentThread): DiffSide | undefined {
	// Prefer the tracked threadContext side; fall back to the creation-time trackingCriteria side.
	if (thread.threadContext?.rightFileStart !== undefined) {
		return DiffSide.RIGHT;
	} else if (thread.threadContext?.leftFileStart !== undefined) {
		return DiffSide.LEFT;
	} else if (thread.pullRequestThreadContext?.trackingCriteria?.origRightFileStart !== undefined) {
		return DiffSide.RIGHT;
	} else if (thread.pullRequestThreadContext?.trackingCriteria?.origLeftFileStart !== undefined) {
		return DiffSide.LEFT;
	}
	return undefined;
}

export function updateCommentReviewState(thread: GHPRCommentThread, newDraftMode: boolean) {
	if (newDraftMode) {
		return;
	}

	thread.comments = thread.comments.map(comment => {
		comment.label = undefined;

		return comment;
	});
}

export function updateCommentThreadLabel(thread: GHPRCommentThread) {
	if (thread.comments.length) {
		thread.label = `Status: ${CommentThreadStatus[thread.rawThread?.status ?? 0].toString()}`;
	} else {
		thread.label = 'Start discussion';
	}
}

export function createVSCodeCommentThread(thread: ThreadData, commentController: vscode.CommentController): GHPRCommentThread {
	const vscodeThread = commentController.createCommentThread(thread.uri, thread.range!, []) as GHPRCommentThread;

	vscodeThread.threadId = thread.threadId;
	vscodeThread.rawThread = thread.rawThread;

	vscodeThread.comments = thread.comments
		.filter(c => !c.comment.isDeleted)
		.map(comment => new GHPRComment(comment.comment, comment.commentPermissions, vscodeThread as GHPRCommentThread));

	updateCommentThreadLabel(vscodeThread);
	vscodeThread.collapsibleState = thread.collapsibleState;
	return vscodeThread;
}

export function updateThread(vscodeThread: GHPRCommentThread, comments: GHPRComment[]) {
	vscodeThread.comments = comments;
	updateCommentThreadLabel(vscodeThread);
}

export function removeLeadingSlash(path: string) {
	return path.replace(/^\//g, '');
}

export function getCommentThreadStatusKeys(): string[] {
	return Object.values(CommentThreadStatus)
		.filter(value => typeof value === 'string')
		.filter(f => f !== CommentThreadStatus[CommentThreadStatus.Unknown])
		.filter(f => f !== CommentThreadStatus[CommentThreadStatus.ByDesign]) // ByDesign is not shown in the Azdo UI
		.map(f => f.toString());
}

export class UserCompletion extends vscode.CompletionItem {
	// Instances are only built as object literals, never via `new`, so these are always present
	login!: string;
	email?: string;
	uri!: vscode.Uri;
}

export function isCommentResolved(status: CommentThreadStatus | undefined): boolean {
	return (
		status === CommentThreadStatus.ByDesign ||
		status === CommentThreadStatus.Closed ||
		status === CommentThreadStatus.Fixed ||
		status === CommentThreadStatus.WontFix
	);
}

export function convertRawFileChangeToFileChangeNode(fileChange: IRawFileChange): IFileChangeNode {
	return {
		blobUrl: fileChange.blob_url,
		status: getGitChangeTypeFromVersionControlChangeType(fileChange.status),
		fileName: fileChange.filename,
		previousFileName: fileChange.previous_filename,
		sha: fileChange.file_sha,
		diffHunks: fileChange.diffHunks,
		previousFileSha: fileChange.previous_file_sha,
	};
}
