/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as React from 'react';
// eslint-disable-next-line no-duplicate-imports
import { useContext, useState } from 'react';
import { PullRequestVote, ReviewState } from '../../src/azdo/interface';
import PullRequestContext from '../common/context';
import { approveIcon, approveSuggestionIcon, deleteIcon, noVoteIcon, rejectedIcon, waitingForAuthorIcon } from './icon';
import { VoteText } from './sidebar';
import { nbsp } from './space';
import { AuthorLink, Avatar } from './user';

export function Reviewer(reviewState: ReviewState & { canDelete: boolean }) {
	const { reviewer, state, isRequired, canDelete } = reviewState;
	const [showDelete, setShowDelete] = useState(false);
	const { removeReviewer } = useContext(PullRequestContext);
	const voteKey = state?.toString() ?? PullRequestVote.NO_VOTE.toString();
	return (
		<div
			className="section-item reviewer"
			onMouseEnter={state === PullRequestVote.NO_VOTE ? () => setShowDelete(true) : null}
			onMouseLeave={state === PullRequestVote.NO_VOTE ? () => setShowDelete(false) : null}
		>
			<Avatar url={reviewer.url} avatarUrl={reviewer.avatarUrl} />
			<AuthorLink url={reviewer.url} text={reviewer.name} />
			{/* POL-10: required reviewers (min-reviewer/required-reviewer policies) were indistinguishable
			    from optional ones - data was already flowing to the webview, just never rendered. */}
			{isRequired ? <span className="required-badge">Required</span> : null}
			{canDelete && showDelete ? (
				<>
					{nbsp}
					<a className="remove-item" onClick={() => removeReviewer(reviewState.reviewer.id)}>
						{deleteIcon}️
					</a>
				</>
			) : null}
			{/* VOTE-07: five distinct glyphs/colors (not just gray check/dot/X with a tooltip-only
			    difference), with the vote text inline so it doesn't require a hover to see. */}
			<span className="push-right vote-status" title={VoteText[voteKey]}>
				{REVIEW_STATE_ICON[voteKey]}
				{nbsp}
				<span className="vote-status-text">{VoteText[voteKey]}</span>
			</span>
		</div>
	);
}

const REVIEW_STATE_ICON: { [state: string]: React.ReactElement } = {
	'10': approveIcon,
	'5': approveSuggestionIcon,
	'-5': waitingForAuthorIcon,
	'-10': rejectedIcon,
	'0': noVoteIcon,
};
