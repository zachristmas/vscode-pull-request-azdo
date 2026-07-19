/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
 
import { useContext, useEffect, useState } from 'react';
import { render } from 'react-dom';
import { Overview } from './overview';
import { PullRequest } from '../common/cache';
import PullRequestContext from '../common/context';

export function main() {
	render(<Root>{pr => <Overview {...pr} />}</Root>, document.querySelector('#app'));
}

export function Root({ children }: { children: (pr: PullRequest) => JSX.Element }) {
	const ctx = useContext(PullRequestContext);
	const [pr, setPR] = useState<PullRequest>(ctx.pr);
	useEffect(() => {
		// PRContext is a plain class whose public API is this onchange property, not an EventTarget.
		// eslint-disable-next-line unicorn/prefer-add-event-listener
		ctx.onchange = setPR;
		setPR(ctx.pr);
	}, []);
	ctx.postMessage({ command: 'ready' });
	ctx.postMessage({ command: 'pr.debug', args: 'initialized ' + (pr ? 'with PR' : 'without PR') });
	return pr ? children(pr) : <div className="loading-indicator">Loading...</div>;
}
