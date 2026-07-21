/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useEffect, useState } from 'react';
import { render } from 'react-dom';
import { Dashboard } from './dashboard';
import { getMessageHandler, MessageHandler } from '../common/message';

export interface DashboardEntry {
	key: string;
	repoLabel: string;
	number: number;
	title: string;
	url: string;
	createdAt?: string;
	activityAt?: string;
	sourceBranch?: string;
	targetBranch?: string;
	author: { name?: string; url?: string; avatarUrl?: string };
	isDraft: boolean;
	state?: number;
	blocker?: 'conflicts' | 'blocked by policy';
	autoComplete: boolean;
	reviewers: { name?: string; url?: string; avatarUrl?: string; vote: number }[];
}

export interface DashboardCategory {
	type: number;
	label: string;
	entries: DashboardEntry[];
	hasMore: boolean;
}

export interface ClosedState {
	entries: DashboardEntry[];
	hasMore: boolean;
}

export function main() {
	render(<Root />, document.querySelector('#app'));
}

function Root() {
	const [categories, setCategories] = useState<DashboardCategory[] | undefined>(undefined);
	// undefined = never requested yet. The Closed tab only starts fetching once the user actually
	// clicks it (see the tab-switch effect in dashboard.tsx) - opening the dashboard, or hitting
	// Refresh, must not by itself trigger a closed-PR fetch.
	const [closed, setClosed] = useState<ClosedState | undefined>(undefined);
	const [handler] = useState<MessageHandler>(() =>
		getMessageHandler(message => {
			if (message?.command === 'dashboard.update') {
				setCategories(message.categories);
			} else if (message?.command === 'dashboard.closedUpdate') {
				setClosed({ entries: message.entries, hasMore: message.hasMore });
			}
		}),
	);

	useEffect(() => {
		handler.postMessage({ command: 'ready' });
	}, [handler]);

	if (!categories) {
		return <div className="loading-indicator">Loading...</div>;
	}

	return (
		<Dashboard
			categories={categories}
			closed={closed}
			onRefresh={() => {
				// The host resets its own closed-PR cursors on refresh (see refreshAll in
				// prDashboardPanel.ts) but does not re-fetch them; reset local state to match so a
				// still-open Closed tab re-requests page 1 instead of appending onto now-stale entries.
				setClosed(undefined);
				handler.postMessage({ command: 'dashboard.refresh' });
			}}
			onLoadMore={(type: number) => handler.postMessage({ command: 'dashboard.loadMore', args: { type } })}
			onLoadMoreClosed={() => handler.postMessage({ command: 'dashboard.loadMoreClosed' })}
			onOpenPullRequest={(key: string) => handler.postMessage({ command: 'dashboard.openPullRequest', args: { key } })}
			onCopyLink={(key: string) => handler.postMessage({ command: 'dashboard.copyLink', args: { key } })}
		/>
	);
}
