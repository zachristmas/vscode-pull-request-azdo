/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as React from 'react';
// eslint-disable-next-line no-duplicate-imports
import { useContext } from 'react';
import { PullRequestVote, ReviewState } from '../../src/azdo/interface';
import PullRequestContext from '../common/context';
import { approveIcon, approveSuggestionIcon, deleteIcon, noVoteIcon, rejectedIcon, waitingForAuthorIcon } from './icon';
import { VoteText } from './sidebar';
import { nbsp } from './space';
import { AuthorLink, Avatar } from './user';

export function Reviewer(reviewState: ReviewState & { canDelete: boolean }) {
	const { reviewer, state, isRequired, canDelete } = reviewState;
	const { removeReviewer } = useContext(PullRequestContext);
	const voteKey = state?.toString() ?? PullRequestVote.NO_VOTE.toString();
	// Only a not-yet-voted reviewer can be removed. (Preserves the prior gate, which lived on the
	// mouse-enter handler.)
	const canRemove = canDelete && state === PullRequestVote.NO_VOTE;
	return (
		<div className="section-item reviewer">
			<Avatar url={reviewer.url!} avatarUrl={reviewer.avatarUrl!} />
			<AuthorLink url={reviewer.url!} text={reviewer.name!} />
			{/* POL-10: required reviewers (min-reviewer/required-reviewer policies) were indistinguishable
			    from optional ones - data was already flowing to the webview, just never rendered. */}
			{isRequired ? <span className="required-badge">Required</span> : null}
			{/* item 2: keyboard-reachable remove - a real button always in the DOM, revealed on row
			    hover/focus-within by CSS instead of the old mouse-only showDelete state. */}
			{canRemove ? (
				<>
					{nbsp}
					<button
						type="button"
						className="remove-item"
						title="Remove reviewer"
						aria-label={`Remove reviewer ${reviewer.name}`}
						onClick={() => removeReviewer(reviewState.reviewer.id!)}
					>
						{deleteIcon}
					</button>
				</>
			) : null}
			{/* VOTE-07: five distinct glyphs/colors (not just gray check/dot/X with a tooltip-only
			    difference), with the vote text inline so it doesn't require a hover to see. */}
			<span className="push-right vote-status" title={VOTE_STATE_TEXT[voteKey]}>
				{REVIEW_STATE_ICON[voteKey]}
				{nbsp}
				<span className="vote-status-text">{VOTE_STATE_TEXT[voteKey]}</span>
			</span>
		</div>
	);
}

// UX-01: exported so the "Your review" card (sidebar.tsx) shows the same glyph/text as the reviewer
// row; a single source of truth means the card and the row can't disagree about your standing vote.
export const REVIEW_STATE_ICON: { [state: string]: React.ReactElement } = {
	'10': approveIcon,
	'5': approveSuggestionIcon,
	'-5': waitingForAuthorIcon,
	'-10': rejectedIcon,
	'0': noVoteIcon,
};

// sidebar.tsx's VoteText labels the vote-select dropdown's ACTIONS ('0' = "Reset Vote", the action of
// clearing your vote). Reusing it here for STATE display read oddly - "Reset Vote" next to a reviewer
// who simply hasn't voted yet looks like a stray action prompt, not a status. Every other vote value
// reads fine as both an action and a state; only '0' needs its own label here.
export const VOTE_STATE_TEXT: { [state: string]: string } = {
	...VoteText,
	'0': 'No vote',
};
