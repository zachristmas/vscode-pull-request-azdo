/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import { buildShareableLink } from '../../common/deepLink';

// Pure helper - no extension host needed, so this runs cleanly headless.
describe('buildShareableLink', () => {
	const base = 'https://pr.example.com';

	it('uses <base>/<project>/<pr> when the repo matches the project', () => {
		assert.equal(
			buildShareableLink(base, { orgUrl: 'o', project: 'ECS Stores', repo: 'ECS Stores', prNumber: 6006 }),
			'https://pr.example.com/ECS+Stores/6006',
		);
	});

	it('includes the repo segment when it differs from the project', () => {
		assert.equal(
			buildShareableLink(base, { orgUrl: 'o', project: 'ECS Stores', repo: 'OtherRepo', prNumber: 42 }),
			'https://pr.example.com/ECS+Stores/OtherRepo/42',
		);
	});

	it('encodes spaces as + and strips trailing slashes from the base', () => {
		assert.equal(
			buildShareableLink('https://pr.example.com/', { orgUrl: 'o', project: 'A B', repo: 'A B', prNumber: 1 }),
			'https://pr.example.com/A+B/1',
		);
	});
});
