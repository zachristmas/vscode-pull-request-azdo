/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import PullRequestContext from '../common/context';
import { recordMentionPick } from '../common/mentions';

const { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } = React;

export interface MentionIdentity {
	id: string;
	displayName: string;
	uniqueName?: string;
}

type MentionTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

// A drop-in <textarea> that opens an @mention people-picker. Typing `@` (at a word boundary) queries ADO
// identities via the host; selecting one inserts the readable `@Display Name` and records the pick so the
// outgoing text can be rewritten to the `@<guid>` token on submit (see webviews/common/mentions).
export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>((props, forwardedRef) => {
	const { onInput, onChange, onKeyDown, ...rest } = props;
	const ctx = useContext(PullRequestContext);
	const innerRef = useRef<HTMLTextAreaElement | null>(null);
	useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement);

	const [items, setItems] = useState<MentionIdentity[]>([]);
	const [open, setOpen] = useState(false);
	const [index, setIndex] = useState(0);
	// Anchor offset of the active `@` and the current query, read synchronously when accepting.
	const active = useRef<{ at: number; query: string } | null>(null);
	const reqSeq = useRef(0);

	const notifyParent = useCallback(
		(el: HTMLTextAreaElement) => {
			const synthetic = ({ target: el, currentTarget: el } as unknown) as React.FormEvent<HTMLTextAreaElement>;
			onInput?.(synthetic);
			onChange?.((synthetic as unknown) as React.ChangeEvent<HTMLTextAreaElement>);
		},
		[onInput, onChange],
	);

	const closeMenu = useCallback(() => {
		active.current = null;
		setOpen(false);
		setItems([]);
		setIndex(0);
	}, []);

	const runSearch = useCallback(
		async (query: string) => {
			const seq = ++reqSeq.current;
			const results = await ctx.searchIdentities(query);
			if (seq !== reqSeq.current) {
				return; // a newer keystroke superseded this search
			}
			setItems(results ?? []);
			setIndex(0);
			setOpen((results ?? []).length > 0);
		},
		[ctx],
	);

	const detect = useCallback(
		(el: HTMLTextAreaElement) => {
			const caret = el.selectionStart ?? el.value.length;
			const before = el.value.slice(0, caret);
			const at = before.lastIndexOf('@');
			if (at === -1) {
				closeMenu();
				return;
			}
			const prev = at > 0 ? before[at - 1] : '';
			// Only treat `@` as a mention trigger at the start or after whitespace/open paren.
			if (prev && prev !== '(' && !/\s/.test(prev)) {
				closeMenu();
				return;
			}
			const query = before.slice(at + 1);
			// A completed mention (just inserted as `@Display Name `) or any query with trailing whitespace
			// is no longer an active trigger - close instead of re-opening on the inserted name.
			if (query.includes('\n') || query.length > 60 || /\s$/.test(query)) {
				closeMenu();
				return;
			}
			active.current = { at, query };
			void runSearch(query);
		},
		[closeMenu, runSearch],
	);

	const accept = useCallback(
		(item: MentionIdentity) => {
			const el = innerRef.current;
			const anchor = active.current;
			if (!el || !anchor) {
				return;
			}
			const caret = el.selectionStart ?? el.value.length;
			const insert = `@${item.displayName} `;
			el.value = el.value.slice(0, anchor.at) + insert + el.value.slice(caret);
			const pos = anchor.at + insert.length;
			el.setSelectionRange(pos, pos);
			recordMentionPick(item.id, item.displayName);
			closeMenu();
			notifyParent(el);
			el.focus();
		},
		[closeMenu, notifyParent],
	);

	// Forward onInput and run @-detection. onChange is forwarded separately so composers wired via either
	// handler (AddComment uses onInput, AddCommentSimple uses onChange) keep their controlled value synced.
	const handleInput = useCallback(
		(e: React.FormEvent<HTMLTextAreaElement>) => {
			onInput?.(e);
			detect(e.currentTarget);
		},
		[onInput, detect],
	);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			onChange?.(e);
		},
		[onChange],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (open && items.length > 0) {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					setIndex(i => (i + 1) % items.length);
					return;
				}
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					setIndex(i => (i - 1 + items.length) % items.length);
					return;
				}
				if (e.key === 'Enter' || e.key === 'Tab') {
					// Accept the highlighted identity; do not let Enter add a newline or submit the composer.
					e.preventDefault();
					e.stopPropagation();
					accept(items[index]);
					return;
				}
				if (e.key === 'Escape') {
					e.preventDefault();
					closeMenu();
					return;
				}
			}
			onKeyDown?.(e);
		},
		[open, items, index, accept, closeMenu, onKeyDown],
	);

	// Recompute the trigger when the caret moves without editing (arrow keys, clicks).
	const handleSelect = useCallback(() => {
		if (innerRef.current) {
			detect(innerRef.current);
		}
	}, [detect]);

	useEffect(() => closeMenu, [closeMenu]);

	return (
		<span className="mention-textarea-wrap" style={{ position: 'relative', display: 'block' }}>
			<textarea
				{...rest}
				ref={innerRef}
				onInput={handleInput}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				onSelect={handleSelect}
				onBlur={() => setTimeout(closeMenu, 150)}
			/>
			{open && items.length > 0 ? (
				<ul className="mention-suggestions" role="listbox">
					{items.map((item, i) => (
						<li
							key={item.id}
							role="option"
							aria-selected={i === index}
							className={i === index ? 'mention-suggestion selected' : 'mention-suggestion'}
							// mousedown (not click) so selecting fires before the textarea blur closes the menu.
							onMouseDown={e => {
								e.preventDefault();
								accept(item);
							}}
							onMouseEnter={() => setIndex(i)}
						>
							<span className="mention-suggestion-name">{item.displayName}</span>
							{item.uniqueName ? <span className="mention-suggestion-detail">{item.uniqueName}</span> : null}
						</li>
					))}
				</ul>
			) : null}
		</span>
	);
});

MentionTextarea.displayName = 'MentionTextarea';
