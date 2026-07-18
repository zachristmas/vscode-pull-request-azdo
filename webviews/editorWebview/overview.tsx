/* eslint-disable import-x/no-named-as-default */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';
import * as React from 'react';
import { PullRequest } from '../common/cache';

import { AddComment, CommentView } from '../components/comment';
import { Header } from '../components/header';
import StatusChecks from '../components/merge';
import Sidebar from '../components/sidebar';
import Timeline from '../components/timeline';

export const Overview = (pr: PullRequest) => {
	// UX-02: a single read-only signal threaded to every surface that must lose its edit affordances
	// on a completed/abandoned PR (header buttons, title Edit, vote panel, reviewer/work-item add and
	// remove, the Close button).
	const isActive = pr.state === PullRequestStatus.Active;
	return (
		<>
			<div id="title" className="title">
				<div className="details">
					<Header {...pr} isActive={isActive} />
				</div>
			</div>
			<Sidebar {...pr} isActive={isActive} />
			<div id="main">
				<StatusChecks pr={pr} isSimple={false} />
				<div id="description">
					<CommentView
						isPRDescription
						threadId={0}
						content={pr.body}
						author={{
							displayName: pr.author.name,
							profileUrl: pr.author.url,
							id: pr.author.id,
							uniqueName: pr.author.email,
							_links: { avatar: { href: pr.author.avatarUrl } },
						}}
						_links={{ self: { href: pr.url } }}
						publishedDate={new Date(pr.createdAt)}
						canEdit={pr.canEdit}
					/>
				</div>
				<AddComment {...pr} isActive={isActive} />
				<Timeline threads={pr.threads ?? []} currentUser={pr.currentUser} />
			</div>
		</>
	);
};
