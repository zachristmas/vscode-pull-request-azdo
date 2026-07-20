/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import PullRequestContext from '../common/context';
import { recordMentionPick } from '../common/mentions';

const { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } = React;

export interface MentionIdentity {
	id: string;
	displayName: string;
	uniqueName?: string;
}

// One autocomplete suggestion, shape-agnostic so the same dropdown can render people (@), work items
// (#/AB#), and pull requests (!). `insertText` is exactly what replaces the trigger+query on accept.
export interface CompletionItem {
	id: string;
	label: string;
	detail?: string;
	insertText: string;
}

// A trigger provider: decides whether its trigger is active at the caret (detect), fetches suggestions
// (search), and optionally records a side effect on accept (onPick) - e.g. @mention picks feed the
// submit-time `@Display Name` -> `@<guid>` rewrite (see webviews/common/mentions).
interface CompletionProvider {
	detect(before: string): { at: number; query: string } | null;
	search(query: string): Promise<CompletionItem[] | undefined>;
	onPick?(item: CompletionItem): void;
}

type MentionTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

// A trigger opens the menu only at a word boundary: start of input, after whitespace, or after `(`.
function boundaryOk(prev: string): boolean {
	return !prev || prev === '(' || /\s/.test(prev);
}

// A query stays "active" until it wraps a line, runs long, or ends in whitespace (the token is done).
// Shared by every provider so the close behaviour matches the original @mention logic exactly.
function activeQuery(query: string): boolean {
	return !(query.includes('\n') || query.length > 60 || /\s$/.test(query));
}

// PullRequestStatus enum values (azure-devops-node-api GitInterfaces) as picker detail text.
const PR_STATUS_LABEL: Record<number, string> = { 1: 'Active', 2: 'Abandoned', 3: 'Completed' };

// Build the trigger providers bound to the host-backed searches on the PR context. `@` behaves exactly
// as before; `#`/`AB#` searches work items; `!` searches pull requests.
function buildProviders(ctx: React.ContextType<typeof PullRequestContext>): CompletionProvider[] {
	const mention: CompletionProvider = {
		detect(before) {
			const at = before.lastIndexOf('@');
			if (at === -1) {
				return null;
			}
			if (!boundaryOk(at > 0 ? before[at - 1] : '')) {
				return null;
			}
			const query = before.slice(at + 1);
			if (!activeQuery(query)) {
				return null;
			}
			return { at, query };
		},
		async search(query) {
			const results = await ctx.searchIdentities(query);
			return (results ?? []).map(u => ({
				id: u.id,
				label: u.displayName,
				detail: u.uniqueName,
				insertText: `@${u.displayName} `,
			}));
		},
		onPick(item) {
			recordMentionPick(item.id, item.label);
		},
	};

	const workItem: CompletionProvider = {
		detect(before) {
			const hash = before.lastIndexOf('#');
			if (hash === -1) {
				return null;
			}
			let at = hash;
			// Accept both `#123` and the GitHub-muscle-memory `AB#123`; either inserts the canonical `#123`.
			const abPrefix = hash >= 2 && before.slice(hash - 2, hash).toUpperCase() === 'AB';
			if (abPrefix) {
				if (!boundaryOk(hash > 2 ? before[hash - 3] : '')) {
					return null;
				}
				at = hash - 2;
			} else if (!boundaryOk(hash > 0 ? before[hash - 1] : '')) {
				return null;
			}
			const query = before.slice(hash + 1);
			if (!activeQuery(query)) {
				return null;
			}
			return { at, query };
		},
		async search(query) {
			const results = await ctx.searchWorkItems(query);
			return (results ?? []).map(w => ({
				id: String(w.id),
				label: `#${w.id} ${w.title}`,
				detail: [w.workItemType, w.state].filter(Boolean).join(' · '),
				insertText: `#${w.id} `,
			}));
		},
	};

	const pullRequest: CompletionProvider = {
		detect(before) {
			const bang = before.lastIndexOf('!');
			if (bang === -1) {
				return null;
			}
			if (!boundaryOk(bang > 0 ? before[bang - 1] : '')) {
				return null;
			}
			const query = before.slice(bang + 1);
			if (!activeQuery(query)) {
				return null;
			}
			// `!` is common in prose; only treat it as a PR ref when the query is empty or numeric.
			if (query.length > 0 && !/^\d+$/.test(query)) {
				return null;
			}
			return { at: bang, query };
		},
		async search(query) {
			const results = await ctx.searchPullRequests(query);
			return (results ?? []).map(p => ({
				id: `pr-${p.id}`,
				label: `!${p.id} ${p.title}`,
				detail: PR_STATUS_LABEL[p.status] ?? '',
				insertText: `!${p.id} `,
			}));
		},
	};

	return [mention, workItem, pullRequest];
}

// A drop-in <textarea> with an autocomplete dropdown. Typing a trigger (`@`, `#`/`AB#`) at a word
// boundary queries the host; selecting a suggestion inserts its readable text (`@Display Name`,
// `#123`) and records any needed side effect (e.g. the mention pick for submit-time token rewriting).
export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>((props, forwardedRef) => {
	const { onInput, onChange, onKeyDown, ...rest } = props;
	const ctx = useContext(PullRequestContext);
	const innerRef = useRef<HTMLTextAreaElement | null>(null);
	useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement);

	const providers = useMemo(() => buildProviders(ctx), [ctx]);

	const [items, setItems] = useState<CompletionItem[]>([]);
	const [open, setOpen] = useState(false);
	const [index, setIndex] = useState(0);
	// The active trigger: which provider fired and the anchor offset to replace from, read when accepting.
	const active = useRef<{ provider: CompletionProvider; at: number } | null>(null);
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

	const runSearch = useCallback(async (provider: CompletionProvider, query: string) => {
		const seq = ++reqSeq.current;
		const results = await provider.search(query);
		if (seq !== reqSeq.current) {
			return; // a newer keystroke superseded this search
		}
		setItems(results ?? []);
		setIndex(0);
		setOpen((results ?? []).length > 0);
	}, []);

	const detect = useCallback(
		(el: HTMLTextAreaElement) => {
			const caret = el.selectionStart ?? el.value.length;
			const before = el.value.slice(0, caret);
			// Ask every provider; the one whose trigger sits closest to the caret (largest anchor) wins.
			let best: { provider: CompletionProvider; at: number; query: string } | null = null;
			for (const provider of providers) {
				const match = provider.detect(before);
				if (match && (!best || match.at > best.at)) {
					best = { provider, at: match.at, query: match.query };
				}
			}
			if (!best) {
				closeMenu();
				return;
			}
			active.current = { provider: best.provider, at: best.at };
			void runSearch(best.provider, best.query);
		},
		[providers, closeMenu, runSearch],
	);

	const accept = useCallback(
		(item: CompletionItem) => {
			const el = innerRef.current;
			const anchor = active.current;
			if (!el || !anchor) {
				return;
			}
			const caret = el.selectionStart ?? el.value.length;
			const insert = item.insertText;
			el.value = el.value.slice(0, anchor.at) + insert + el.value.slice(caret);
			const pos = anchor.at + insert.length;
			el.setSelectionRange(pos, pos);
			anchor.provider.onPick?.(item);
			closeMenu();
			notifyParent(el);
			el.focus();
		},
		[closeMenu, notifyParent],
	);

	// Forward onInput and run trigger-detection. onChange is forwarded separately so composers wired via
	// either handler (AddComment uses onInput, AddCommentSimple uses onChange) keep their value synced.
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
					// Accept the highlighted item; do not let Enter add a newline or submit the composer.
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
							<span className="mention-suggestion-name">{item.label}</span>
							{item.detail ? <span className="mention-suggestion-detail">{item.detail}</span> : null}
						</li>
					))}
				</ul>
			) : null}
		</span>
	);
});

MentionTextarea.displayName = 'MentionTextarea';
