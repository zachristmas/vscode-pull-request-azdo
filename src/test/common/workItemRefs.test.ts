/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import { inferWorkItemIdsFromBranch, parseWorkItemIds } from '../../common/workItemRefs';

// Pure helpers - no extension host needed, so these run cleanly headless.
describe('workItemRefs', () => {
	describe('inferWorkItemIdsFromBranch', () => {
		it('returns [] for empty / undefined', () => {
			assert.deepEqual(inferWorkItemIdsFromBranch(undefined), []);
			assert.deepEqual(inferWorkItemIdsFromBranch(''), []);
		});

		it('reads an explicit #id marker', () => {
			assert.deepEqual(inferWorkItemIdsFromBranch('fix/#1234-crash'), [1234]);
		});

		it('reads the GitHub-style AB#id marker', () => {
			assert.deepEqual(inferWorkItemIdsFromBranch('feature/AB#987'), [987]);
		});

		it('reads a leading numeric segment', () => {
			assert.deepEqual(inferWorkItemIdsFromBranch('1234-add-thing'), [1234]);
			assert.deepEqual(inferWorkItemIdsFromBranch('users/zach/5678'), [5678]);
			assert.deepEqual(inferWorkItemIdsFromBranch('feature/42/subtask'), [42]);
		});

		it('de-duplicates and preserves order', () => {
			assert.deepEqual(inferWorkItemIdsFromBranch('AB#12/also-#12'), [12]);
		});

		it('ignores numbers embedded in words (not a work-item ref)', () => {
			assert.deepEqual(inferWorkItemIdsFromBranch('release/v2-hotfix'), []);
			assert.deepEqual(inferWorkItemIdsFromBranch('feature/oauth2-login'), []);
		});
	});

	describe('parseWorkItemIds', () => {
		it('parses a comma/space separated list', () => {
			assert.deepEqual(parseWorkItemIds('12, 34 56'), [12, 34, 56]);
		});

		it('drops non-numeric and non-positive tokens, de-duplicates', () => {
			assert.deepEqual(parseWorkItemIds('12, abc, 0, -3, 12'), [12]);
		});

		it('returns [] for empty / undefined', () => {
			assert.deepEqual(parseWorkItemIds(undefined), []);
			assert.deepEqual(parseWorkItemIds(' '), []);
		});
	});
});
