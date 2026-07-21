/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ClosedState, DashboardCategory, DashboardEntry } from './app';
import { getStatus } from '../components/header';
import { copyIcon } from '../components/icon';
import { REVIEW_STATE_ICON, VOTE_STATE_TEXT } from '../components/reviewer';
import { Timestamp } from '../components/timestamp';
import { AuthorLink, Avatar } from '../components/user';

type SortField = 'activity' | 'created';
type SortDirection = 'desc' | 'asc';
type Tab = 'open' | 'closed';

function entryTimestamp(entry: DashboardEntry, field: SortField): number {
	const value = field === 'activity' ? entry.activityAt ?? entry.createdAt : entry.createdAt;
	return value ? new Date(value).getTime() : 0;
}

function sortEntries(entries: DashboardEntry[], field: SortField, direction: SortDirection): DashboardEntry[] {
	const sorted = entries.toSorted((a, b) => entryTimestamp(a, field) - entryTimestamp(b, field));
	return direction === 'desc' ? sorted.toReversed() : sorted;
}

interface DashboardProps {
	categories: DashboardCategory[];
	closed: ClosedState | undefined;
	onRefresh: () => void;
	onLoadMore: (type: number) => void;
	onLoadMoreClosed: () => void;
	onOpenPullRequest: (key: string) => void;
	onCopyLink: (key: string) => void;
}

export function Dashboard({
	categories,
	closed,
	onRefresh,
	onLoadMore,
	onLoadMoreClosed,
	onOpenPullRequest,
	onCopyLink,
}: Readonly<DashboardProps>) {
	// Defaults to the most recently active PRs first (see getActivityDate in dashboardData.ts); an
	// explicit "Created date" option is also available, in either direction. The same control
	// applies to both tabs.
	const [sortField, setSortField] = useState<SortField>('activity');
	const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
	const [tab, setTab] = useState<Tab>('open');

	// Closed PRs load only once the Closed tab is actually visited - not on dashboard open, and not
	// merely because ClosedSection is mounted (it stays mounted across tab switches; see below).
	// `closed` resets to undefined on refresh too (see onRefresh in app.tsx), so re-visiting the tab
	// after a refresh re-fires this the same way a first visit does.
	useEffect(() => {
		if (tab === 'closed' && closed === undefined) {
			onLoadMoreClosed();
		}
	}, [tab, closed, onLoadMoreClosed]);

	const total = categories.reduce((sum, category) => sum + category.entries.length, 0);
	return (
		<div id="dashboard">
			<div className="dashboard-header">
				<h1>Pull Request Dashboard</h1>
				<div className="dashboard-header-actions">
					<label className="dashboard-sort-label">
						Sort by
						<select value={sortField} onChange={e => setSortField(e.target.value as SortField)}>
							<option value="activity">Recent activity</option>
							<option value="created">Created date</option>
						</select>
					</label>
					<button
						className="secondary"
						onClick={() => setSortDirection(d => (d === 'desc' ? 'asc' : 'desc'))}
						title="Toggle sort direction"
					>
						{sortDirection === 'desc' ? '↓ Newest first' : '↑ Oldest first'}
					</button>
					<button className="secondary" onClick={onRefresh}>
						Refresh
					</button>
				</div>
			</div>
			<div className="pr-tabs" role="tablist" aria-label="Dashboard views">
				<button
					role="tab"
					aria-selected={tab === 'open'}
					className={`pr-tab${tab === 'open' ? ' selected' : ''}`}
					onClick={() => setTab('open')}
				>
					Open
				</button>
				<button
					role="tab"
					aria-selected={tab === 'closed'}
					className={`pr-tab${tab === 'closed' ? ' selected' : ''}`}
					onClick={() => setTab('closed')}
				>
					Closed
				</button>
			</div>
			{/* Both tabs stay mounted (toggled via .hidden) rather than conditionally rendered, so
			    switching tabs doesn't remount ClosedSection and re-trigger its initial page fetch. */}
			<div className={tab === 'open' ? '' : 'hidden'}>
				{total === 0 ? (
					<div className="dashboard-empty">No pull requests found across the repos in this workspace.</div>
				) : (
					categories.map(category => (
						<CategorySection
							key={category.type}
							category={category}
							sortField={sortField}
							sortDirection={sortDirection}
							onLoadMore={onLoadMore}
							onOpenPullRequest={onOpenPullRequest}
							onCopyLink={onCopyLink}
						/>
					))
				)}
			</div>
			<div className={tab === 'closed' ? '' : 'hidden'}>
				<ClosedSection
					closed={closed}
					sortField={sortField}
					sortDirection={sortDirection}
					onLoadMoreClosed={onLoadMoreClosed}
					onOpenPullRequest={onOpenPullRequest}
					onCopyLink={onCopyLink}
				/>
			</div>
		</div>
	);
}

function CategorySection({
	category,
	sortField,
	sortDirection,
	onLoadMore,
	onOpenPullRequest,
	onCopyLink,
}: Readonly<{
	category: DashboardCategory;
	sortField: SortField;
	sortDirection: SortDirection;
	onLoadMore: (type: number) => void;
	onOpenPullRequest: (key: string) => void;
	onCopyLink: (key: string) => void;
}>) {
	if (category.entries.length === 0 && !category.hasMore) {
		return null;
	}
	const entries = sortEntries(category.entries, sortField, sortDirection);
	return (
		<section className="dashboard-category">
			<h2 className="dashboard-category-title">
				{category.label}
				<span className="dashboard-count">{category.entries.length}</span>
			</h2>
			<div className="dashboard-rows">
				{entries.map(entry => (
					<PullRequestRow
						key={entry.key}
						entry={entry}
						sortField={sortField}
						onOpenPullRequest={onOpenPullRequest}
						onCopyLink={onCopyLink}
					/>
				))}
			</div>
			{category.hasMore ? (
				<button className="link-button dashboard-load-more" onClick={() => onLoadMore(category.type)}>
					Continue fetching from other remotes
				</button>
			) : null}
		</section>
	);
}

// Infinite-scroll list of closed (completed/abandoned) PRs: a sentinel element at the bottom of the
// list triggers the next page as it scrolls into view, backed by the real skip/top pagination in
// prDashboardPanel.ts (unlike the Open tab's categories, a repo's closed history can be large enough
// that fetching it all up front isn't reasonable). Page 1 is requested by the Dashboard component's
// tab-switch effect, not by this component mounting - it stays mounted across tab switches (see the
// .hidden toggle in Dashboard) so a plain mount can't be used as the "tab opened" signal.
function ClosedSection({
	closed,
	sortField,
	sortDirection,
	onLoadMoreClosed,
	onOpenPullRequest,
	onCopyLink,
}: Readonly<{
	closed: ClosedState | undefined;
	sortField: SortField;
	sortDirection: SortDirection;
	onLoadMoreClosed: () => void;
	onOpenPullRequest: (key: string) => void;
	onCopyLink: (key: string) => void;
}>) {
	const sentinelRef = useRef<HTMLDivElement>(null);
	const hasMore = closed?.hasMore ?? false;

	// Only arms once page 1 has landed (closed !== undefined); a hidden (display:none) sentinel never
	// reports as intersecting, so this also never fires while the Closed tab isn't the visible one.
	useEffect(() => {
		if (!hasMore) {
			return;
		}
		const sentinel = sentinelRef.current;
		if (!sentinel) {
			return;
		}
		const observer = new IntersectionObserver(
			entries => {
				if (entries.some(e => e.isIntersecting)) {
					onLoadMoreClosed();
				}
			},
			{ rootMargin: '200px' },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm only when the sentinel could re-enter view (a page just landed)
	}, [closed?.entries.length, hasMore]);

	if (!closed) {
		return (
			<section className="dashboard-category">
				<div className="dashboard-empty">Loading…</div>
			</section>
		);
	}

	const entries = sortEntries(closed.entries, sortField, sortDirection);
	let sentinelText: string | null = null;
	if (hasMore) {
		sentinelText = 'Loading more…';
	} else if (entries.length > 0) {
		sentinelText = 'No more closed pull requests.';
	}
	return (
		<section className="dashboard-category">
			<div className="dashboard-rows">
				{entries.map(entry => (
					<PullRequestRow
						key={entry.key}
						entry={entry}
						sortField={sortField}
						onOpenPullRequest={onOpenPullRequest}
						onCopyLink={onCopyLink}
					/>
				))}
			</div>
			{!hasMore && entries.length === 0 ? <div className="dashboard-empty">No closed pull requests found.</div> : null}
			<div ref={sentinelRef} className="dashboard-scroll-sentinel">
				{sentinelText}
			</div>
		</section>
	);
}

function PullRequestRow({
	entry,
	sortField,
	onOpenPullRequest,
	onCopyLink,
}: Readonly<{
	entry: DashboardEntry;
	sortField: SortField;
	onOpenPullRequest: (key: string) => void;
	onCopyLink: (key: string) => void;
}>) {
	const status = getStatus((entry.state ?? PullRequestStatus.NotSet) as PullRequestStatus, entry.isDraft);
	const open = () => onOpenPullRequest(entry.key);
	// Show whichever timestamp the current sort is ordering by, so the visible order and the visible
	// date agree - "Recent activity" falls back to createdAt for a PR with no push/close recorded.
	const timestampLabel = sortField === 'activity' ? 'Updated' : 'Created';
	const timestampValue = sortField === 'activity' ? entry.activityAt ?? entry.createdAt : entry.createdAt;
	return (
		<div
			className="dashboard-row"
			role="button"
			tabIndex={0}
			onClick={open}
			onKeyDown={e => {
				if (!(e.key === 'Enter' || e.key === ' ')) {
					return;
				}

				e.preventDefault();
				open();
			}}
		>
			<Avatar url={entry.author.url ?? ''} avatarUrl={entry.author.avatarUrl ?? ''} />
			<div className="dashboard-row-main">
				<div className="dashboard-row-title">
					<span className="repo-chip">{entry.repoLabel}</span>
					<span className="pr-title">
						#{entry.number}: {entry.isDraft ? '[DRAFT] ' : ''}
						{entry.title}
					</span>
				</div>
				{entry.sourceBranch && entry.targetBranch ? (
					<div className="dashboard-row-branches">
						<code>{entry.sourceBranch}</code> <span aria-hidden="true">→</span> <code>{entry.targetBranch}</code>
					</div>
				) : null}
				<div className="dashboard-row-subtitle">
					<span className={`status-badge status-${status.toLowerCase()}`}>{status}</span>
					<AuthorLink url={entry.author.url ?? ''} text={entry.author.name ?? 'Unknown'} />
					{timestampValue ? (
						<span>
							{timestampLabel} <Timestamp date={timestampValue} />
						</span>
					) : null}
					{entry.autoComplete ? <span className="auto-complete-badge">auto-complete</span> : null}
					{entry.blocker ? <span className="blocker-badge">{entry.blocker}</span> : null}
				</div>
			</div>
			{entry.reviewers.length > 0 ? (
				<div className="dashboard-row-reviewers">
					{entry.reviewers.map((reviewer, i) => (
						<span
							className="dashboard-reviewer"
							key={i}
							title={`${reviewer.name ?? 'Unknown'}: ${VOTE_STATE_TEXT[reviewer.vote.toString()] ?? ''}`}
						>
							<Avatar url={reviewer.url ?? ''} avatarUrl={reviewer.avatarUrl ?? ''} />
							<span className="dashboard-reviewer-vote">{REVIEW_STATE_ICON[reviewer.vote.toString()]}</span>
						</span>
					))}
				</div>
			) : null}
			<button
				type="button"
				className="dashboard-copy-link"
				title="Copy shareable link"
				aria-label={`Copy link to PR #${entry.number}`}
				onClick={e => {
					e.stopPropagation();
					onCopyLink(entry.key);
				}}
			>
				{copyIcon}
			</button>
		</div>
	);
}
