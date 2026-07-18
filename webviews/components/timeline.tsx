/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { Identity } from 'azure-devops-node-api/interfaces/IdentitiesInterfaces';
import * as React from 'react';
 
import { useContext, useRef, useState } from 'react';

import { CommentView, ReplyToThread } from './comment';
import { chevronIcon, commitIcon, mergeIcon } from './icon';
import { nbsp, Spaced } from './space';
// eslint-disable-next-line import-x/no-named-as-default
import Timestamp from './timestamp';
import { AuthorLink, Avatar } from './user';
import {
	CommitEvent,
	hasVisibleComments,
	HeadRefDeleteEvent,
	isSystemThread,
	isUserCommentThread,
	MergedEvent,
	ReviewEvent,
} from '../../src/common/timelineEvent';
import { groupBy } from '../../src/common/utils';
import PullRequestContext from '../common/context';
// import { isUserThread } from '../../src/azdo/utils';

export const Timeline = ({ threads, currentUser }: { threads: GitPullRequestCommentThread[]; currentUser: Identity }) => (
	<>
		{/* UX-03: newest-first is deliberate (matches ADO web) and pairs with the composer sitting ABOVE
		    the timeline (overview.tsx) - a new comment appears directly under the box. Do not "fix" the
		    ordering to oldest-first without also moving the composer to the bottom. */}
		{threads
			// valueOf() tolerates both real Date instances and the serialized strings the host sends
			.sort(
				(a, b) =>
					new Date(b.publishedDate?.valueOf() ?? NaN).getTime() -
					new Date(a.publishedDate?.valueOf() ?? NaN).getTime(),
			)
			.map(
				thread =>
					// TODO: Maybe make TimelineEvent a tagged union type?
					isSystemThread(thread) ? (
						<SystemThreadView key={thread.id} thread={thread} />
					) : isUserCommentThread(thread) || hasVisibleComments(thread) ? (
						// hasVisibleComments: threads created via raw REST/integrations can miss the
						// id-1/commentType shape isUserCommentThread expects; render them as a
						// (possibly position-less) comment card rather than dropping them - the header
						// already counts them and the diff editor already shows them.
						<CommentEventView key={thread.id} thread={thread} currentUser={currentUser} />
					) : null,
				// isCommitEvent(event)
				// 	? <CommitEventView key={event.id} {...event} />
				// 	:
				// isReviewEvent(event)
				// 	? <ReviewEventView key={event.id} {...event} />
				// 	:
				// isCommentEvent(event)
				// 	? <CommentEventView key={event.id} {...event} />
				// 	:
				// isMergedEvent(event)
				// 	? <MergedEventView key={event.id} {...event} />
				// 	:
				// isAssignEvent(event)
				// 	? <AssignEventView key={event.id} {...event} />
				// 	:
				// isHeadDeleteEvent(event)
				// 	? <HeadDeleteEventView key={event.id} {...event} />
				// 	: null
			)}
	</>
);

export default Timeline;

export const SystemThreadView = ({ thread }: { thread: GitPullRequestCommentThread }) => {
	const identities = (thread.identities && Object.values(thread.identities)) || [];

	return (
		<div className="comment-container commit">
			<div className="commit-message">
				{commitIcon}
				{nbsp}
				{identities.length > 0 ? (
					<>
						<div className="avatar-container">
							<Avatar url={identities[0].profileUrl!} avatarUrl={identities[0]['_links']?.['avatar']?.['href']} />
						</div>
						<AuthorLink url={identities[0].profileUrl!} text={identities[0].displayName!} />
					</>
				) : null}

				<div className="message">{thread.comments?.[0].content}</div>
			</div>
			{nbsp}
			<div className="system-timestamp">
				<Timestamp date={thread.publishedDate!} />
			</div>
		</div>
	);
};

export const CommitEventView = (event: CommitEvent) => (
	<div className="comment-container commit">
		<div className="commit-message">
			{commitIcon}
			{nbsp}
			<div className="avatar-container">
				<Avatar url={event.author.url!} avatarUrl={event.author.avatarUrl!} />
			</div>
			<AuthorLink url={event.author.url!} text={event.author.name!} />
			<a className="message" href={event.htmlUrl}>
				{event.message}
			</a>
		</div>
		<a className="sha" href={event.htmlUrl}>
			{event.sha.slice(0, 7)}
		</a>
		{nbsp}
		<Timestamp date={event.authoredDate} />
	</div>
);

const association = ({ authorAssociation }: ReviewEvent, format = (assoc: string) => `(${assoc.toLowerCase()})`) =>
	authorAssociation.toLowerCase() === 'user'
		? format('you')
		: authorAssociation && authorAssociation !== 'NONE'
		? format(authorAssociation)
		: null;

const positionKey = (comment: GitPullRequestCommentThread) =>
	// comment.position !== null
	// 		? `pos:${comment.position}`
	// 		: `ori:${comment.originalPosition}`;
	comment.threadContext?.rightFileStart?.line ?? comment.threadContext?.leftFileStart?.line;

const groupCommentsByPath = (comments: GitPullRequestCommentThread[]) =>
	groupBy(comments, comment => `${comment.threadContext?.filePath}:${positionKey(comment)}`);

const DESCRIPTORS: { [state: string]: string } = {
	PENDING: 'will review',
	COMMENTED: 'reviewed',
	CHANGES_REQUESTED: 'requested changes',
	APPROVED: 'approved',
};

const reviewDescriptor = (state: string) => DESCRIPTORS[state] || 'reviewed';

export const ReviewEventView = (event: ReviewEvent) => {
	const comments = groupCommentsByPath(event.comments);
	const reviewIsPending = event.state.toLocaleUpperCase() === 'PENDING';
	return (
		<div className="comment-container comment">
			<div className="review-comment-container">
				<div className="review-comment-header">
					<Spaced>
						<Avatar url={event.user.url!} avatarUrl={event.user.avatarUrl!} />
						<AuthorLink url={event.user.url!} text={event.user.name!} />
						{association(event)}
						{reviewIsPending ? (
							<em>review pending</em>
						) : (
							<>
								{reviewDescriptor(event.state)}
								{nbsp}
								<Timestamp href={event.htmlUrl} date={event.submittedAt} />
							</>
						)}
					</Spaced>
				</div>
				{/* {event.state !== 'PENDING' && event.body ? <CommentBody body={event.body} bodyHTML={event.bodyHTML} /> : null} */}
				<div className="comment-body review-comment-body">
					{Object.entries(comments).map(() => (
						<div className="diff-container">
							{/* <Diff key={key}
									comment={thread[0]}
									hunks={thread[0].diffHunks}
									outdated={thread[0].position === null}
									path={thread[0].path} /> */}
							{/* {thread.map(c => <CommentView {...c} pullRequestReviewId={event.id} />)} */}
						</div>
					))}
				</div>
				{reviewIsPending ? <AddReviewSummaryComment /> : null}
			</div>
		</div>
	);
};

function AddReviewSummaryComment() {
	const { requestChanges, submit } = useContext(PullRequestContext);
	const comment = useRef<HTMLTextAreaElement>(null);
	return (
		<div className="comment-form">
			<textarea ref={comment} placeholder="Leave a review summary comment"></textarea>
			<div className="form-actions">
				<button id="request-changes" onClick={() => requestChanges(comment.current!.value)}>
					Request Changes
				</button>
				{/* <button id='approve'
				onClick={() => votePullRequest(comment.current.value)}>Approve</button> */}
				<button id="submit" onClick={() => submit(comment.current!.value)}>
					Comment
				</button>
			</div>
		</div>
	);
}

// UX-03: thread status now lives on the thread, not on a guessed "first comment". These maps moved
// here from comment.tsx with the control.
export const ThreadStatus: { [status: string]: string } = {
	'0': 'Unknown',
	'1': 'Active',
	'2': 'Fixed',
	'3': 'WontFix',
	'4': 'Closed',
	// '5': 'ByDesign',
	'6': 'Pending',
};

const ThreadStatusOrder = ['1', '6', '2', '3', '4'];

// Status tone -> --azdo-* semantic color (see .thread-status-pill.status-* in index.css).
const THREAD_STATUS_TONE: { [status: number]: string } = {
	1: 'info', // Active
	6: 'warning', // Pending
	2: 'success', // Fixed
	4: 'success', // Closed
	3: 'muted', // WontFix
};

const RESOLVED_STATUSES = [2, 3, 4]; // Fixed, WontFix, Closed

// A native <select> dressed as a status pill: colored dot + label + the select's own chevron. Native
// keeps the accessibility and z-index simplicity while reading as a modern chip.
const ThreadStatusPill = ({ status, onChange }: { status: number; onChange: (status: string) => void }) => {
	const tone = THREAD_STATUS_TONE[status] ?? 'muted';
	return (
		<span className={`thread-status-pill status-${tone}`}>
			<span className="status-dot" />
			<select value={status.toString()} onChange={e => onChange(e.target.value)}>
				{ThreadStatusOrder.map(s => (
					<option key={s} value={s}>
						{ThreadStatus[s]}
					</option>
				))}
			</select>
		</span>
	);
};

const CommentEventView = ({ thread, currentUser }: { thread: GitPullRequestCommentThread; currentUser: Identity }) => {
	const { replyThread, openDiff, changeThreadStatus } = useContext(PullRequestContext);
	const [inEditMode, setEditMode] = useState(false);

	const status = thread.status ?? 0;
	const hasStatus = ThreadStatusOrder.includes(status.toString());
	const isResolved = RESOLVED_STATUSES.includes(status);
	// Per-render collapse state (no persistence); resolved threads start collapsed so long PRs aren't
	// buried in settled conversations, but they stay one click away. Only ever hides content while the
	// thread is still resolved - reopening via the (always-visible) header pill can't strand a
	// collapsed thread with its comments hidden and no toggle to reveal them.
	const [collapsed, setCollapsed] = useState(isResolved);
	const contentHidden = isResolved && collapsed;

	const onCancel = () => {
		setEditMode(false);
	};

	const onSave = async (text: string) => {
		try {
			await replyThread(text, thread);
		} finally {
			setEditMode(false);
		}
	};

	const onThreadStatusChange = async (newStatus: string) => {
		await changeThreadStatus(parseInt(newStatus), thread);
	};

	const hasFile = !!thread.threadContext && !!thread.threadContext.filePath;
	// Same threadContext-derived position as positionKey above; position-less threads (file-level
	// comments) keep the bare path chip.
	const threadLine = thread.threadContext?.rightFileStart?.line ?? thread.threadContext?.leftFileStart?.line;
	const commentCount = thread.comments?.length ?? 0;

	return (
		<div className={`thread-container${isResolved ? ' resolved' : ''}`}>
			{hasFile || hasStatus ? (
				<div className="thread-header">
					{hasFile ? (
						// item 2: real button so the diff opens via keyboard too (was a click-only <a>).
						<button type="button" className="thread-file-chip" onClick={() => openDiff(thread)}>
							{thread.threadContext!.filePath}
							{threadLine !== undefined ? `:${threadLine}` : ''}
						</button>
					) : null}
					{hasStatus ? <ThreadStatusPill status={status} onChange={onThreadStatusChange} /> : null}
				</div>
			) : null}
			{isResolved ? (
				<button className="thread-collapse-toggle" aria-expanded={!contentHidden} onClick={() => setCollapsed(c => !c)}>
					<span className={`thread-chevron${contentHidden ? '' : ' expanded'}`}>{chevronIcon}</span>
					{commentCount} comment{commentCount === 1 ? '' : 's'} · resolved
				</button>
			) : null}
			{!contentHidden ? (
				<>
					{thread.comments?.map(c => (
						<CommentView
							key={c.id}
							headerInEditMode
							{...c}
							canEdit={c.author?.id === currentUser.id}
							threadId={thread.id!}
						/>
					))}
					{!inEditMode ? (
						// Full-width ghost field (not a lone right-aligned button) so it's obvious which
						// thread you're replying to - the ambiguity flagged in review.
						<button className="reply-ghost" onClick={() => setEditMode(true)}>
							Reply…
						</button>
					) : (
						<ReplyToThread onSave={onSave} onCancel={onCancel} />
					)}
				</>
			) : null}
		</div>
	);
};

export const MergedEventView = (event: MergedEvent) => (
	<div className="comment-container commit">
		<div className="commit-message">
			{mergeIcon}
			{nbsp}
			<div className="avatar-container">
				<Avatar url={event.user.url!} avatarUrl={event.user.avatarUrl!} />
			</div>
			<AuthorLink url={event.user.url!} text={event.user.name!} />
			<div className="message">
				merged commit{nbsp}
				<a className="sha" href={event.commitUrl}>
					{event.sha.substr(0, 7)}
				</a>
				{nbsp}
				into {event.mergeRef}
				{nbsp}
			</div>
			<Timestamp href={event.url} date={event.createdAt} />
		</div>
	</div>
);

export const HeadDeleteEventView = (event: HeadRefDeleteEvent) => (
	<div className="comment-container commit">
		<div className="commit-message">
			<div className="avatar-container">
				<Avatar url={event.actor.url!} avatarUrl={event.actor.avatarUrl!} />
			</div>
			<AuthorLink url={event.actor.url!} text={event.actor.name!} />
			<div className="message">
				deleted the {event.headRef} branch{nbsp}
			</div>
			<Timestamp date={event.createdAt} />
		</div>
	</div>
);

// TODO: We should show these, but the pre-React overview page didn't. Add
// support in a separate PR.
// export const AssignEventView = (event: AssignEvent) => null;
