/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import * as React from 'react';
// eslint-disable-next-line no-duplicate-imports
import { useContext, useEffect, useRef, useState } from 'react';
import { PullRequest } from '../common/cache';
import PullRequestContext from '../common/context';
import { getClosedCommentDescription } from './header';
import { checkIcon, deleteIcon, plusIcon } from './icon';
import { REVIEW_STATE_ICON, Reviewer, VOTE_STATE_TEXT } from './reviewer';
import { nbsp } from './space';

export default function Sidebar({ reviewers, workItems, hasWritePermission, isActive }: PullRequest & { isActive: boolean }) {
	const { addRequiredReviewers, addOptionalReviewers, associateWorkItem, updatePR, pr } = useContext(PullRequestContext);

	// UX-02: on a finished PR keep the reviewer/work-item rows (they are the review record) but drop
	// every mutation affordance - the vote panel, the add (+) buttons, and the hover-remove.
	const canManage = hasWritePermission && isActive;

	return (
		<div id="sidebar">
			{/* UX-01/UX-02: the vote panel and the outcome card occupy the same slot - you cast a vote
			    while the PR is active, and once it's finished that space becomes the read-only outcome. */}
			{isActive ? (
				<VotePanel vote={pr.reviewers.find(r => r.reviewer.id === pr.currentUser.id)?.state ?? 0} />
			) : (
				<OutcomeSummary />
			)}
			<ReviewerPanel
				labelText="Required Reviewers"
				reviewers={reviewers.filter(r => r.isRequired)}
				addReviewers={addRequiredReviewers}
				hasWritePermission={canManage}
				updatePR={newReviewers => updatePR({ reviewers: pr.reviewers.concat(newReviewers.added) })}
			/>
			<ReviewerPanel
				labelText="Optional Reviewers"
				reviewers={reviewers.filter(r => !r.isRequired)}
				addReviewers={addOptionalReviewers}
				hasWritePermission={canManage}
				updatePR={newReviewers => updatePR({ reviewers: pr.reviewers.concat(newReviewers.added) })}
			/>
			<div id="work-item" className="section">
				<div className="section-header">
					<div className="section-title">Work Items</div>
					{canManage ? (
						<button
							title="Add Work Items"
							onClick={async () => {
								await associateWorkItem();
							}}
						>
							{plusIcon}
						</button>
					) : null}
				</div>
				<div className="work-item-body-container">
					{workItems && workItems.length > 0 ? (
						workItems.map(workItem => <WorkItem key={workItem.id} {...workItem} canDelete={canManage} />)
					) : (
						<div className="section-item none-label text-muted">None</div>
					)}
				</div>
			</div>
		</div>
	);
}

function WorkItem(workItem: WorkItem & { canDelete: boolean }) {
	const canDelete = workItem.canDelete;
	const { removeWorkItemFromPR } = useContext(PullRequestContext);
	return (
		<div className="section-item work-item">
			<WorkItemDetails {...workItem} />
			{/* item 2: keyboard-reachable remove - a real button always in the DOM, revealed on row
			    hover/focus-within by CSS instead of the old mouse-only showDelete state. */}
			{canDelete ? (
				<>
					{nbsp}
					<button
						type="button"
						className="push-right remove-item"
						title="Remove work item"
						aria-label={`Remove work item ${workItem.id}`}
						onClick={() => removeWorkItemFromPR(workItem.id!)}
					>
						{deleteIcon}
					</button>
					{nbsp}
				</>
			) : null}
		</div>
	);
}

const WorkItemDetails = (workItem: WorkItem) => (
	<div className="work-item-container">
		<a href={workItem._links['html']['href']}>
			<div className="work-item-type">{workItem.fields['System.WorkItemType']}</div>
			<div className="work-item-title">
				{workItem.id}: {workItem.fields['System.Title']}
				{}
			</div>
		</a>
	</div>
);

const ReviewerPanel = ({ reviewers, labelText, hasWritePermission, addReviewers, updatePR }) => (
	<div id="reviewers" className="section">
		<div className="section-header">
			<div className="section-title">{labelText}</div>
			{hasWritePermission ? (
				<button
					title={`Add ${labelText}`}
					onClick={async () => {
						const newReviewers = await addReviewers();
						updatePR(newReviewers.added);
					}}
				>
					{plusIcon}
				</button>
			) : null}
		</div>
		{/* UX-01: empty categories render "None" (muted) instead of collapsing to zero height, so the
		    section rhythm and grouping stay legible even with no reviewers. */}
		{reviewers && reviewers.length > 0 ? (
			reviewers.map(state => <Reviewer key={state.reviewer.id} {...state} canDelete={hasWritePermission} />)
		) : (
			<div className="section-item none-label text-muted">None</div>
		)}
	</div>
);

export const VoteText = {
	'10': 'Approve',
	'5': 'Approve with Suggestion',
	'-5': 'Wait for author',
	'-10': 'Rejected',
	'0': 'Reset Vote',
};

// Real votes only; '0' (Reset Vote) is no longer an option in the select - it moved to the reset link.
const VoteOrder = ['10', '5', '-5', '-10'];

type CastState = 'idle' | 'busy' | 'success' | 'error';

// UX-01: "Your review" card. Three parts, top to bottom: an always-visible current-vote row (icon +
// text, re-derived from the live pr.reviewers-sourced `vote` prop so it can't disagree with the
// reviewer row), a controlled select + Cast button, and a Reset link shown only when you have a
// standing vote. Casting has three visible phases - busy / success / failure - so a vote never lands
// silently the way "Cast Vote just goes disabled" did before.
const VotePanel = ({ vote }: { vote: number }) => {
	const { votePullRequest } = useContext(PullRequestContext);
	const liveVote = vote.toString();
	// Controlled select. Default to Approve when you haven't voted; otherwise start on your standing vote.
	const [selectedVote, setSelectedVote] = useState(vote === 0 ? '10' : liveVote);
	const [castState, setCastState] = useState<CastState>('idle');
	const successTimer = useRef<ReturnType<typeof setTimeout>>();

	useEffect(() => () => clearTimeout(successTimer.current), []);

	const cast = async (value: string) => {
		clearTimeout(successTimer.current);
		setCastState('busy');
		try {
			// votePullRequest -> appendReview replaces pr.reviewers, re-rendering Sidebar and this card
			// with a fresh `vote` prop, so the current-vote row updates without extra plumbing.
			await votePullRequest(parseInt(value));
			setCastState('success');
			successTimer.current = setTimeout(() => setCastState('idle'), 2500);
		} catch (_) {
			// postMessage rejections used to vanish (votePullRequest never caught); surface them instead.
			setCastState('error');
		}
	};

	const voteKey = VOTE_STATE_TEXT[liveVote] ? liveVote : '0';
	const busy = castState === 'busy';

	return (
		<div className="section review-card">
			<div className="section-title">Your Review</div>
			{/* aria-live so screen readers announce both the standing-vote change and the transient
			    confirmation without the user having to move focus. */}
			<div className={`current-vote-row${vote === 0 ? ' text-muted' : ''}`} aria-live="polite">
				<span className="vote-status">
					{REVIEW_STATE_ICON[voteKey]}
					{nbsp}
					<span className="current-vote-text">{VOTE_STATE_TEXT[voteKey]}</span>
				</span>
			</div>
			<div className="review-vote-actions">
				<select
					className="vote-select"
					value={selectedVote}
					disabled={busy}
					onChange={e => setSelectedVote(e.target.value)}
				>
					{VoteOrder.map(v => (
						<option key={v} value={v}>
							{VoteText[v]}
						</option>
					))}
				</select>
				{/* The button stays put in every phase; the success/failure text drops onto its own line
				    below so the select never reflows (replacing the button in-row shrank it to a stub). */}
				<button
					className="vote-button"
					aria-busy={busy}
					disabled={busy || selectedVote === liveVote}
					onClick={() => cast(selectedVote)}
				>
					{busy ? 'Casting…' : 'Vote'}
				</button>
			</div>
			{castState === 'success' ? (
				<div className="cast-feedback text-success" role="status">
					{checkIcon}
					{nbsp}Vote recorded
				</div>
			) : null}
			{/* Left below (not replacing) the button so the user can retry a failed cast. */}
			{castState === 'error' ? (
				<div className="cast-feedback text-danger" role="alert">
					Vote failed, try again
				</div>
			) : null}
			{vote !== 0 ? (
				<button className="reset-vote-link" disabled={busy} onClick={() => cast('0')}>
					Reset vote
				</button>
			) : null}
		</div>
	);
};

// UX-02: on a finished PR the vote-panel slot becomes a read-only outcome card - the first
// completed-state signal the sidebar has ever had (until now the badge and merge banner both lived in
// the main column). Status dot + label, the thread-resolution rollup, and your own final vote if any.
const OutcomeSummary = () => {
	const { pr } = useContext(PullRequestContext);
	const isMerged = pr.state === PullRequestStatus.Completed;
	const myVote = pr.reviewers.find(r => r.reviewer.id === pr.currentUser.id)?.state ?? 0;
	const voteKey = myVote.toString();
	return (
		<div className="section outcome-card">
			<div className="outcome-status">
				<span className={`status-dot ${isMerged ? 'status-dot-success' : 'status-dot-muted'}`} />
				<span className={`outcome-label${isMerged ? '' : ' text-muted'}`}>{isMerged ? 'Merged' : 'Abandoned'}</span>
			</div>
			<div className="outcome-threads text-muted">{getClosedCommentDescription(pr.threads ?? [])}</div>
			{myVote !== 0 ? (
				<div className="outcome-vote text-muted">
					Your vote:
					<span className="vote-status">
						{REVIEW_STATE_ICON[voteKey]}
						{nbsp}
						{VOTE_STATE_TEXT[voteKey]}
					</span>
				</div>
			) : null}
		</div>
	);
};
