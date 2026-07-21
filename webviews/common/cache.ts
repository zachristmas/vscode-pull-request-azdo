/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitCommitRef, GitPullRequestCommentThread, PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { Identity } from 'azure-devops-node-api/interfaces/IdentitiesInterfaces';
import { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { vscode } from './message';
import {
	IAccount,
	ILabel,
	MergeMethod,
	MergeMethodsAvailability,
	PullRequestChecks,
	PullRequestCompletionSummary,
	PullRequestMergeability,
	PullRequestPolicyEvaluation,
	ReviewState,
} from '../../src/azdo/interface';
import type { DiffHunk } from '../../src/common/diffHunk';
import { TimelineEvent } from '../../src/common/timelineEvent';

export enum ReviewType {
	Comment = 'comment',
	Approve = 'approve',
	RequestChanges = 'requestChanges',
}

// A pull request related to this one because they share a linked work item. Derived and read-only;
// Azure DevOps has no native "related PR" link.
export interface RelatedPullRequest {
	id: number;
	title: string;
	status: PullRequestStatus;
	url: string;
}

export type FileChangeStatus = 'A' | 'M' | 'D' | 'R' | '?';

export interface FileChangeSummary {
	fileName: string;
	previousFileName?: string;
	status: FileChangeStatus;
	additions: number;
	deletions: number;
}

export interface PullRequest {
	number: number;
	title: string;
	url: string;
	createdAt: string;
	body: string;
	bodyHTML?: string;
	author: IAccount;
	state: PullRequestStatus;
	events: TimelineEvent[];
	isCurrentlyCheckedOut: boolean;
	// Whether there's a local branch (or remote created for this PR) left to delete - the button
	// still shows on a completed PR even when the remote branch is already gone (local cleanup is
	// still useful), but when this is false there's truly nothing left, so the button shouldn't
	// render at all rather than popping a "nothing to delete" warning on click.
	hasBranchToDelete: boolean;
	base: string;
	head: string;
	labels: ILabel[];
	commitsCount: number;
	repositoryDefaultBranch: any;
	/**
	 * User can edit PR title and description (author or user with push access)
	 */
	canEdit: boolean;
	/**
	 * Users with push access to repo have rights to merge/close PRs,
	 * edit title/description, assign reviewers/labels etc.
	 */
	hasWritePermission: boolean;
	pendingCommentText?: string;
	pendingCommentDrafts?: { [key: string]: string };
	pendingReviewType?: ReviewType;
	status: PullRequestChecks;
	mergeable: PullRequestMergeability;
	mergeFailureMessage?: string;
	mergeFailureType?: number;
	defaultMergeMethod: MergeMethod;
	mergeMethodsAvailability: MergeMethodsAvailability;
	reviewers: ReviewState[];
	// Changed files for the "Files changed" section (name, +/- counts, and an optional inline preview).
	// Mirrors the host-built summary in pullRequestOverview.ts; delivered on pr.initialize.
	fileChanges?: FileChangeSummary[];
	isDraft?: boolean;
	isIssue: boolean;

	isAuthor?: boolean;
	threads?: GitPullRequestCommentThread[];
	/**
	 * Per-thread diff-hunk excerpt (a few lines ending at the thread's anchor line), keyed by
	 * thread id. Absent for file-level threads and when the file-diff fetch failed - thread
	 * cards degrade to no inline diff context.
	 */
	threadHunks?: { [threadId: number]: DiffHunk };
	commits: GitCommitRef[];
	currentUser: Identity;
	workItems: WorkItem[];
	// PRs sharing a linked work item with this one (derived from work-item artifact links, read-only).
	relatedPRs: RelatedPullRequest[];

	// POL-01: undefined = not fetched (simple view pre-POL-05, fetch error); [] = "No branch policies apply".
	policies?: PullRequestPolicyEvaluation[];
	// AC-02: undefined = auto-complete not set.
	autoCompleteSetBy?: IAccount;
	autoCompleteOptions?: PullRequestCompletionSummary;
}

export function getState(): PullRequest {
	return vscode.getState();
}

export function setState(pullRequest: PullRequest): void {
	const oldPullRequest = getState();

	if (oldPullRequest && oldPullRequest.number && oldPullRequest.number === pullRequest.number) {
		pullRequest.pendingCommentText = oldPullRequest.pendingCommentText;
	}

	if (pullRequest) {
		vscode.setState(pullRequest);
	}
}

export function updateState(data: Partial<PullRequest>): void {
	const pullRequest = vscode.getState();
	vscode.setState(Object.assign(pullRequest, data));
}
