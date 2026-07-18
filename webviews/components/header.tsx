/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CommentThreadStatus,
	GitPullRequestCommentThread,
	PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import * as React from 'react';
 
import { useContext, useState } from 'react';

import { checkIcon, copyIcon, editIcon } from './icon';
import { Spaced } from './space';
// eslint-disable-next-line import-x/no-named-as-default
import Timestamp from './timestamp';
import { AuthorLink, Avatar } from './user';
import { PullRequest } from '../common/cache';
import PullRequestContext from '../common/context';
import { useStateProp } from '../common/hooks';

export function Header({
	canEdit,
	state,
	head,
	base,
	title,
	number,
	url,
	createdAt,
	author,
	isCurrentlyCheckedOut,
	isDraft,
	isIssue,
	threads,
	isActive,
}: PullRequest & { isActive: boolean }) {
	return (
		<>
			<Title {...{ title, number, url, canEdit, isCurrentlyCheckedOut, isIssue, isDraft, state, isActive }} />
			<div className="subtitle">
				<div id="status">{getStatus(state, !!isDraft)}</div>
				{!isIssue ? <Avatar url={author.url!} avatarUrl={author.avatarUrl!} /> : null}
				<span className="author">
					{!isIssue ? (
						<Spaced>
							<AuthorLink url={author.url!} text={author.name!} />
							{getActionText(state)}
							into <code>{base}</code>
							from <code>{head}</code>
						</Spaced>
					) : null}
				</span>
				<span className="created-at">
					<Spaced>
						Created <Timestamp date={createdAt} href={url} />
					</Spaced>
				</span>
			</div>
			<div className="subtitle">{getClosedCommentDescription(threads ?? [])}</div>
		</>
	);
}

function Title({
	title,
	number,
	url,
	canEdit,
	isCurrentlyCheckedOut,
	isIssue,
	isDraft,
	state,
	isActive,
}: Partial<PullRequest> & { isActive?: boolean }) {
	const [inEditMode, setEditMode] = useState(false);
	const [currentTitle, setCurrentTitle] = useStateProp(title);
	const { setTitle, refresh, copyPrLink, convertToDraft, updatePR } = useContext(PullRequestContext);
	const canConvertToDraft = !isIssue && !isDraft && state === PullRequestStatus.Active;
	const editableTitle = inEditMode ? (
		<form
			className="editing-form title-editing-form"
			onSubmit={async evt => {
				evt.preventDefault();
				try {
					const txt = (evt.target as any).text.value;
					await setTitle(txt);
					setCurrentTitle(txt);
				} finally {
					setEditMode(false);
				}
			}}
		>
			<textarea name="text" style={{ width: '100%' }} defaultValue={currentTitle}></textarea>
			<div className="form-actions">
				<button className="secondary" onClick={() => setEditMode(false)}>
					Cancel
				</button>
				<input type="submit" value="Update" />
			</div>
		</form>
	) : (
		<h2>
			{currentTitle} (<a href={url}>#{number}</a>)
		</h2>
	);

	return (
		<div className="overview-title">
			{editableTitle}
			<div className="block-select">
				{/*
			  For whatever reason, triple click on a block element in MacOS will select everything in that element, *and* every `user-select: false` block adjacent to that element.
			  Add an empty selectable div here to block triple click on title from selecting the following buttons. Issue #628.
			*/}
			</div>
			{/* item 2: the title actions (Edit / Copy Link / Convert to draft) are always in the DOM now
			    and revealed on hover OR focus-within (see index.css .title-action-bar), so keyboard users
			    can reach them - they were previously gated on an onMouseEnter-only showActionBar state. */}
			{canEdit && !inEditMode ? (
				<div className="flex-action-bar comment-actions title-action-bar">
					{isActive ? (
						<button title="Edit" onClick={() => setEditMode(true)}>
							{editIcon}
						</button>
					) : null}
					{
						<button title="Copy Link" onClick={copyPrLink}>
							{copyIcon}
						</button>
					}
					{canConvertToDraft ? (
						<button
							title="Convert to draft"
							onClick={async () => {
								const result = await convertToDraft();
								if (result && result.isDraft) {
									updatePR({ isDraft: true });
								}
							}}
						>
							Convert to draft
						</button>
					) : null}
				</div>
			) : (
				<div className="flex-action-bar comment-actions title-action-bar"></div>
			)}
			<div className="button-group">
				<CheckoutButtons {...{ isCurrentlyCheckedOut, isIssue, isActive }} />
				<button onClick={refresh}>Refresh</button>
			</div>
		</div>
	);
}

const CheckoutButtons = ({
	isCurrentlyCheckedOut,
	isIssue,
	isActive,
}: {
	isCurrentlyCheckedOut?: boolean;
	isIssue?: boolean;
	isActive?: boolean;
}) => {
	const { exitReviewMode, checkout } = useContext(PullRequestContext);
	const [isBusy, setBusy] = useState(false);

	const onClick = async (command: string) => {
		try {
			setBusy(true);

			switch (command) {
				case 'checkout':
					await checkout();
					break;
				case 'exitReviewMode':
					await exitReviewMode();
					break;
				default:
					throw new Error(`Can't find action ${command}`);
			}
		} finally {
			setBusy(false);
		}
	};

	if (isCurrentlyCheckedOut) {
		return (
			<>
				<button aria-live="polite" className="checkedOut" disabled>
					{checkIcon} Checked Out
				</button>
				<button aria-live="polite" disabled={isBusy} onClick={() => onClick('exitReviewMode')}>
					Exit Review Mode
				</button>
			</>
		);
	} else if (!isIssue && isActive) {
		// UX-02: never offer plain Checkout on a finished PR (§2.2). Exit Review Mode above stays
		// available regardless of state so a user can leave review mode of a merged PR.
		return (
			<button aria-live="polite" disabled={isBusy} onClick={() => onClick('checkout')}>
				Checkout
			</button>
		);
	} else {
		return null;
	}
};

export function getStatus(state: PullRequestStatus, isDraft: boolean) {
	if (state === PullRequestStatus.Completed) {
		return 'Merged';
	} else if (state === PullRequestStatus.Active) {
		return isDraft ? 'Draft' : 'Open';
	} else {
		return 'Closed';
	}
}

function getActionText(state: PullRequestStatus) {
	return state === PullRequestStatus.Completed ? 'merged changes' : 'wants to merge changes';
}

export function getClosedCommentDescription(threads: GitPullRequestCommentThread[]) {
	const active = threads
		.filter(t => !t.isDeleted)
		.filter(t => t.status === CommentThreadStatus.Active || t.status === CommentThreadStatus.Pending).length;
	const all = threads
		.filter(t => !t.isDeleted)
		.filter(t => t.status !== undefined && t.status !== CommentThreadStatus.Unknown).length;

	return all > 0 ? `${all - active}/${all} comments resolved` : 'No comments';
}
