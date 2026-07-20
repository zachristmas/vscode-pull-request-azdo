/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Comment } from 'azure-devops-node-api/interfaces/GitInterfaces';
import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { prism, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import gfm from 'remark-gfm';

import { Dropdown } from './dropdown';
import { commentIcon, editIcon } from './icon';
import { MentionTextarea } from './mentionTextarea';
import { nbsp, Spaced } from './space';
import { Timestamp } from './timestamp';
import { AuthorLink, Avatar } from './user';
import { PullRequestVote } from '../../src/azdo/interface';
import { resolveMentions } from '../../src/common/mentions';
import { PullRequest, ReviewType } from '../common/cache';
import PullRequestContext from '../common/context';
import emitter from '../common/events';
import { useStateProp } from '../common/hooks';
import { buildMentionNameMap } from '../common/mentions';
import { linkifyPullRequests, linkifyWorkItems } from '../common/references';

const { useCallback, useContext, useEffect, useRef, useState } = React;
export type Props = Partial<Comment> & {
	headerInEditMode?: boolean;
	isPRDescription?: boolean;
	threadId: number;
	canEdit?: boolean;
};

export function CommentView(comment: Props) {
	const { threadId, content, canEdit, isPRDescription } = comment;
	const id = threadId * 1000 + comment.id!;
	const [bodyMd, setBodyMd] = useStateProp(content);
	const [bodyHTMLState, setBodyHtml] = useStateProp(content);
	const { editComment, setDescription, pr } = useContext(PullRequestContext);
	const currentDraft = pr.pendingCommentDrafts && pr.pendingCommentDrafts[id];
	const [inEditMode, setEditMode] = useState(!!currentDraft);

	if (inEditMode) {
		return React.cloneElement(
			comment.headerInEditMode ? <CommentBox for={comment} isDescription={isPRDescription} /> : <></>,
			{},
			[
				<EditComment
					id={id}
					body={currentDraft || bodyMd || ''}
					onCancel={() => {
						if (pr.pendingCommentDrafts) {
							delete pr.pendingCommentDrafts[id];
						}
						setEditMode(false);
					}}
					onSave={async text => {
						try {
							const result = isPRDescription
								? await setDescription(text)
								: await editComment({ comment: comment, threadId, text });

							setBodyHtml(result.bodyHTML);
							setBodyMd(text);
						} finally {
							setEditMode(false);
						}
					}}
				/>,
			],
		);
	}

	return (
		<CommentBox for={comment} isDescription={isPRDescription}>
			{/* UX-03: always rendered, shown by CSS on hover AND :focus-within so keyboard users can
			    reach quote/edit (the old showActionBar state was mouse-only). */}
			<div className="action-bar comment-actions">
				<button title="Quote reply" onClick={() => emitter.emit('quoteReply', bodyMd)}>
					{commentIcon}
				</button>
				{canEdit ? (
					<button title="Edit comment" onClick={() => setEditMode(true)}>
						{editIcon}
					</button>
				) : null}
				{/* {canDelete ? <button title='Delete comment' onClick={() => deleteComment({ id, pullRequestReviewId })} >{deleteIcon}</button> : null} */}
			</div>
			<CommentBody
				commentContent={comment.content}
				commentId={comment.id}
				threadId={comment.threadId}
				bodyHTML={bodyHTMLState}
				body={bodyMd}
			/>
		</CommentBox>
	);
}

type CommentBoxProps = {
	readonly for: Partial<Comment>;
	readonly header?: React.ReactChild;
	readonly onMouseEnter?: any;
	readonly onMouseLeave?: any;
	readonly children?: any;
	// The PR description reuses this box but is not a comment: it reads "created" (not "commented")
	// and carries a distinct class so it can be styled apart from the comment thread.
	readonly isDescription?: boolean;
};

function CommentBox({ for: comment, onMouseEnter, onMouseLeave, children, isDescription }: CommentBoxProps) {
	const { author, publishedDate, _links } = comment;
	const htmlUrl = _links.self.href;
	return (
		<div
			className={`comment-container comment review-comment${isDescription ? ' pr-description' : ''}`}
			{...{ onMouseEnter, onMouseLeave }}
		>
			<div className="review-comment-container">
				<div className="review-comment-header">
					<Spaced>
						<Avatar url={author!.profileUrl!} avatarUrl={author!['_links']?.['avatar']?.['href']} />
						<AuthorLink url={author!.profileUrl!} text={author!.displayName!} />
						{publishedDate ? (
							<>
								{isDescription ? 'created' : 'commented'}
								{nbsp}
								<Timestamp href={htmlUrl} date={publishedDate} />
							</>
						) : (
							<em>pending</em>
						)}
						{/* {
						isDraft
							? <>
								<span className='pending-label'>Pending</span>
							</>
							: null
					} */}
						{/* UX-03: the thread status control moved to the thread header (CommentEventView in
						    timeline.tsx), which owns thread.status - no more per-comment c.id===1 guessing. */}
					</Spaced>
				</div>
				{children}
			</div>
		</div>
	);
}

type FormInputSet = {
	[name: string]: HTMLInputElement | HTMLTextAreaElement;
};

type EditCommentProps = {
	readonly id: number;
	readonly body: string;
	readonly onCancel: () => void;
	readonly onSave: (body: string) => Promise<any>;
};

// UX-03: surface the composer affordances. The Cmd/Ctrl+Enter submit handler already exists on every
// composer; this just makes it (and markdown support) discoverable.
const ComposerHint = () => <div className="composer-hint">Markdown supported · Cmd/Ctrl+Enter to submit</div>;

function EditComment({ id, body, onCancel, onSave }: EditCommentProps) {
	const { updateDraft } = useContext(PullRequestContext);
	const draftComment = useRef<{ body: string; dirty: boolean }>({ body, dirty: false });
	const form = useRef<HTMLFormElement>(null);

	useEffect(() => {
		const interval = setInterval(() => {
			if (!draftComment.current.dirty) {
				return;
			}

			updateDraft(id, draftComment.current.body);
			draftComment.current.dirty = false;
		}, 500);
		return () => clearInterval(interval);
	}, [draftComment, id, updateDraft]);

	const submit = useCallback(async () => {
		const { markdown, submitButton }: FormInputSet = form.current!;
		submitButton.disabled = true;
		try {
			await onSave(markdown.value);
		} finally {
			submitButton.disabled = false;
		}
	}, [form, onSave]);

	const onSubmit = useCallback(
		event => {
			event.preventDefault();
			submit();
		},
		[submit],
	);

	const onKeyDown = useCallback(
		e => {
			if (!((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
				return;
			}

			e.preventDefault();
			submit();
		},
		[submit],
	);

	const onInput = useCallback(
		e => {
			draftComment.current.body = (e.target as HTMLTextAreaElement).value;
			draftComment.current.dirty = true;
		},
		[draftComment],
	);

	return (
		<form ref={form} onSubmit={onSubmit}>
			{/* item 5: focus the textarea when this composer swaps in (Edit clicked), so the caret lands
			    where the user is about to type without a manual click. */}
			<MentionTextarea name="markdown" autoFocus defaultValue={body} onKeyDown={onKeyDown} onInput={onInput} />
			<ComposerHint />
			<div className="form-actions">
				<button className="secondary" onClick={onCancel}>
					Cancel
				</button>
				<input type="submit" name="submitButton" value="Save" />
			</div>
		</form>
	);
}

export interface Embodied {
	commentContent: string | undefined;
	commentId: number | undefined;
	threadId: number;
	bodyHTML?: string;
	body?: string;
}

const renderers = {
	code: ({ language, value }: { language?: string; value?: string }) => {
		// UX-03: match the editor theme instead of hardcoding dracula (purple-on-dark inside a light
		// VS Code). VS Code stamps document.body with vscode-light / vscode-dark / vscode-high-contrast.
		const isLight = document.body.classList.contains('vscode-light');
		return (
			<SyntaxHighlighter
				style={isLight ? prism : vscDarkPlus}
				language={language}
				showLineNumbers={true}
				wrapLongLines={true}
				children={value}
			/>
		);
	},
};

export const CommentBody = ({ commentContent, commentId, threadId, bodyHTML, body }: Embodied) => {
	// Hook must run unconditionally (rules-of-hooks); it was previously below the early return.
	const { applyPatch, pr } = useContext(PullRequestContext);
	if (!body && !bodyHTML) {
		// UX-03: dashed-border muted placeholder rather than a bare line - it reads as a fillable slot
		// (Edit lives in the hover/focus actions, canEdit permitting).
		return (
			<div className="comment-body">
				<div className="description-placeholder text-muted">No description provided</div>
			</div>
		);
	}

	// Resolve ADO @<guid> mention tokens to @Display Name before rendering so no raw id leaks (names
	// come from PR participants + mentions picked this session; unknown ids fall back to @user).
	// The repo web url is the current PR url minus its /pullrequest/<id> suffix; used to build `!<id>` links.
	const repoWebUrl = pr.url?.replace(/\/pullrequest\/\d+$/i, '');
	const withMentions = resolveMentions(body ?? '', buildMentionNameMap(pr));
	const withWorkItems = linkifyWorkItems(withMentions, pr.workItems);
	const resolvedBody = linkifyPullRequests(withWorkItems, pr.relatedPRs, repoWebUrl);
	// const renderedBody = <div dangerouslySetInnerHTML={{ __html: bodyHTML }} />;
	const renderedBody = <ReactMarkdown renderers={renderers} plugins={[gfm]} children={resolvedBody} />;
	const containsSuggestion = (body || bodyHTML || '').includes('```diff');
	const applyPatchButton = containsSuggestion ? (
		<button onClick={() => applyPatch(commentContent!, commentId!, threadId)}>Apply Patch</button>
	) : (
		<></>
	);

	return (
		<div className="comment-body">
			{renderedBody}
			{applyPatchButton}
		</div>
	);
};

export type ReplyToThreadProps = {
	readonly onCancel: () => void;
	readonly onSave: (body: string) => Promise<any>;
};

export function ReplyToThread({ onCancel, onSave }: ReplyToThreadProps) {
	const form = useRef<HTMLFormElement>(null);

	const submit = useCallback(async () => {
		const { markdown, submitButton }: FormInputSet = form.current!;
		submitButton.disabled = true;
		try {
			await onSave(markdown.value);
		} finally {
			submitButton.disabled = false;
		}
	}, [form, onSave]);

	const onSubmit = useCallback(
		event => {
			event.preventDefault();
			submit();
		},
		[submit],
	);

	const onKeyDown = useCallback(
		e => {
			if (!((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
				return;
			}

			e.preventDefault();
			submit();
		},
		[submit],
	);

	return (
		<form ref={form} onSubmit={onSubmit}>
			{/* item 5: focus the textarea when the ghost Reply field swaps in, so the user can type
			    immediately without clicking into it. */}
			<MentionTextarea name="markdown" autoFocus onKeyDown={onKeyDown} />
			<ComposerHint />
			<div className="form-actions">
				<button className="secondary" onClick={onCancel}>
					Cancel
				</button>
				<input type="submit" name="submitButton" value="Save" />
			</div>
		</form>
	);
}

export function AddComment({ pendingCommentText, hasWritePermission, isIssue, isActive }: PullRequest & { isActive: boolean }) {
	const { updatePR, comment, close } = useContext(PullRequestContext);
	const [isBusy, setBusy] = useState(false);
	const form = useRef<HTMLFormElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		// Registering on every render leaked one listener per render; subscribe once with cleanup.
		const quoteReply = (message: string) => {
			updatePR({ pendingCommentText: `> ${message} \n\n` });
			textareaRef.current!.scrollIntoView();
			textareaRef.current!.focus();
		};
		emitter.addListener('quoteReply', quoteReply);
		return () => {
			emitter.removeListener('quoteReply', quoteReply);
		};
	}, [updatePR]);

	const submit = useCallback(
		async (command: (body: string) => Promise<any> = comment) => {
			try {
				setBusy(true);
				const { body }: FormInputSet = form.current!;
				await command(body.value);
				updatePR({ pendingCommentText: '' });
			} finally {
				setBusy(false);
			}
		},
		[comment, updatePR, setBusy],
	);

	const onSubmit = useCallback(
		e => {
			e.preventDefault();
			submit();
		},
		[submit],
	);

	const onKeyDown = useCallback(
		e => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
				submit();
			}
		},
		[submit],
	);

	const onClick = useCallback(
		e => {
			e.preventDefault();
			const { command } = e.target.dataset;
			const commands: { [command: string]: typeof close } = { close };
			submit(commands[command]);
		},
		[submit, close],
	);

	return (
		<form id="comment-form" ref={form} className="comment-form main-comment-form" onSubmit={onSubmit}>
			<MentionTextarea
				id="comment-textarea"
				name="body"
				ref={textareaRef}
				onInput={({ target }) => updatePR({ pendingCommentText: (target as HTMLTextAreaElement).value })}
				onKeyDown={onKeyDown}
				value={pendingCommentText}
				placeholder="Leave a comment"
			/>
			<ComposerHint />
			<div className="form-actions">
				{/* UX-02: drop the Close button entirely on a finished PR (§2.2) rather than rendering it
				    disabled. The comment box itself stays - ADO allows commenting on completed PRs. */}
				{hasWritePermission && !isIssue && isActive ? (
					<button id="close" className="secondary" disabled={isBusy} onClick={onClick} data-command="close">
						Close Pull Request
					</button>
				) : null}
				<input
					id="reply"
					value="Comment"
					type="submit"
					className="secondary"
					disabled={isBusy || !pendingCommentText}
				/>
			</div>
		</form>
	);
}

const COMMENT_METHODS = {
	comment: 'Comment',
	approve: 'Approve',
	requestChanges: 'Request Changes',
};

export const AddCommentSimple = (pr: PullRequest) => {
	const { updatePR, votePullRequest, submit } = useContext(PullRequestContext);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	async function submitAction(selected: string): Promise<void> {
		const { value } = textareaRef.current!;
		switch (selected) {
			case ReviewType.Approve:
				// Optionally post the typed text as a comment first, then record the ADO vote.
				if (value) {
					await submit(value);
				}
				await votePullRequest(PullRequestVote.APPROVED);
				break;
			case ReviewType.RequestChanges:
				// ADO's closest idiom to "request changes" is Waiting for author (-5).
				if (value) {
					await submit(value);
				}
				await votePullRequest(PullRequestVote.WAITING_FOR_AUTHOR);
				break;
			default:
				await submit(value);
		}
		updatePR({ pendingCommentText: '', pendingReviewType: undefined });
	}

	const onChangeTextarea = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
		updatePR({ pendingCommentText: e.target.value });
	};

	const availableActions = pr.isAuthor ? { comment: 'Comment' } : COMMENT_METHODS;

	return (
		<span>
			<MentionTextarea
				id="comment-textarea"
				name="body"
				placeholder="Leave a comment"
				ref={textareaRef}
				value={pr.pendingCommentText}
				onChange={onChangeTextarea}
			/>
			<Dropdown options={availableActions} defaultOption="comment" submitAction={submitAction} />
		</span>
	);
};
