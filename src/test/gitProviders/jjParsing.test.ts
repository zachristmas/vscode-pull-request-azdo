/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import {
	expandRename,
	FIELD_SEPARATOR,
	parseAheadBehind,
	parseGitCommit,
	parseGitConfigList,
	parseGitRemotes,
	parseJjBookmarkList,
	parseJjCommits,
	parseLsTree,
	parseNameStatus,
	parseRemoteRef,
	parseSummary,
	quoteRevsetSymbol,
	RECORD_SEPARATOR,
	sniffMimetype,
	stripHeadsPrefix,
} from '../../gitProviders/jj/jjParsing';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('jj git provider parsing', () => {
	describe('parseJjCommits', () => {
		it('separates the working copy from its parent and attaches bookmarks', () => {
			const output = [
				`commit\t${SHA_A}\ttrue\ttrue\t`,
				`commit\t${SHA_B}\tfalse\tfalse\tfix: something`,
				'local\tbug/123-x',
				'remote\tbug/123-x\torigin\ttrue',
				'remote\tbug/123-x\tgit\ttrue',
				'',
			].join('\n');
			const commits = parseJjCommits(output);
			assert.equal(commits.length, 2);
			const [workingCopy, parent] = commits;
			assert.equal(workingCopy.isWorkingCopy, true);
			assert.equal(workingCopy.empty, true);
			assert.equal(parent.isWorkingCopy, false);
			assert.equal(parent.description, 'fix: something');
			assert.deepEqual(parent.localBookmarks, ['bug/123-x']);
			// The colocated-repo `git` pseudo remote is not an upstream.
			assert.deepEqual(parent.remoteBookmarks, [{ name: 'bug/123-x', remote: 'origin', tracked: true }]);
		});

		it('keeps tabs inside a description', () => {
			const commits = parseJjCommits(`commit\t${SHA_A}\tfalse\tfalse\ta\tb\n`);
			assert.equal(commits[0].description, 'a\tb');
		});
	});

	describe('parseJjBookmarkList', () => {
		it('skips the git pseudo remote and absent targets', () => {
			const entries = parseJjBookmarkList(
				[`feat\t\t${SHA_A}\tfalse`, `feat\tgit\t${SHA_A}\ttrue`, 'feat\torigin\t\ttrue', `feat\tpr\t${SHA_B}\tfalse`, ''].join('\n'),
			);
			assert.deepEqual(entries, [
				{ name: 'feat', remote: undefined, commitId: SHA_A, tracked: false },
				{ name: 'feat', remote: 'origin', commitId: undefined, tracked: true },
				{ name: 'feat', remote: 'pr', commitId: SHA_B, tracked: false },
			]);
		});
	});

	describe('parseSummary / expandRename', () => {
		it('parses statuses and both rename spellings', () => {
			assert.deepEqual(parseSummary('R src/{old => new}.ts\nR a.txt => b.txt\nA x\nD y\nM z\n'), [
				{ status: 'renamed', path: 'src/new.ts', previousPath: 'src/old.ts' },
				{ status: 'renamed', path: 'b.txt', previousPath: 'a.txt' },
				{ status: 'added', path: 'x' },
				{ status: 'deleted', path: 'y' },
				{ status: 'modified', path: 'z' },
			]);
		});

		it('leaves a non-rename untouched', () => {
			assert.deepEqual(expandRename('plain.txt'), { previousPath: 'plain.txt', path: 'plain.txt' });
		});
	});

	describe('parseNameStatus', () => {
		it('reads NUL-separated records including renames with two paths', () => {
			assert.deepEqual(parseNameStatus('M\0a.ts\0R100\0old.ts\0new.ts\0A\0n.ts\0'), [
				{ status: 'modified', path: 'a.ts' },
				{ status: 'renamed', previousPath: 'old.ts', path: 'new.ts' },
				{ status: 'added', path: 'n.ts' },
			]);
		});

		it('returns nothing for empty output', () => {
			assert.deepEqual(parseNameStatus(''), []);
		});
	});

	describe('git output', () => {
		it('parses a commit record with a multi-line body', () => {
			const record = [SHA_A, `${SHA_B} ${SHA_A}`, 'Ada', 'ada@example.test', '1700000000', '1700000001', 'title\n\nbody\n'].join(FIELD_SEPARATOR);
			const commit = parseGitCommit(`${record}${RECORD_SEPARATOR}`);
			assert.ok(commit);
			assert.equal(commit.hash, SHA_A);
			assert.deepEqual(commit.parents, [SHA_B, SHA_A]);
			assert.equal(commit.authorName, 'Ada');
			assert.equal(commit.authorDate?.getTime(), 1_700_000_000_000);
			assert.equal(commit.message, 'title\n\nbody');
		});

		it('rejects output that is not a commit', () => {
			assert.equal(parseGitCommit('fatal: bad revision'), undefined);
		});

		it('parses remotes, config, ls-tree and rev-list counts', () => {
			assert.deepEqual(parseGitRemotes('origin\thttps://example.test/a (fetch)\norigin\thttps://example.test/b (push)\n'), [
				{ name: 'origin', fetchUrl: 'https://example.test/a', pushUrl: 'https://example.test/b' },
			]);
			assert.deepEqual(parseGitConfigList('remote.origin.url\nhttps://example.test/a\0branch.x.github-pr-owner-number\no#r#7\0flag\0'), [
				{ key: 'remote.origin.url', value: 'https://example.test/a' },
				{ key: 'branch.x.github-pr-owner-number', value: 'o#r#7' },
				{ key: 'flag', value: '' },
			]);
			assert.deepEqual(parseLsTree(`100644 blob ${SHA_A}    1852\tpackage.json\0`), {
				mode: '100644',
				type: 'blob',
				object: SHA_A,
				size: 1852,
				path: 'package.json',
			});
			assert.equal(parseLsTree(''), undefined);
			assert.deepEqual(parseAheadBehind('3\t1\n'), { ahead: 3, behind: 1 });
			assert.deepEqual(parseAheadBehind('garbage'), { ahead: 0, behind: 0 });
		});
	});

	describe('refs and revsets', () => {
		it('recognises remote refs and strips refs/heads', () => {
			assert.deepEqual(parseRemoteRef('refs/remotes/origin/bug/123-x'), { remote: 'origin', name: 'bug/123-x' });
			assert.equal(parseRemoteRef('main'), undefined);
			assert.equal(stripHeadsPrefix('refs/heads/main'), 'main');
			assert.equal(stripHeadsPrefix('main'), 'main');
		});

		it('quotes bookmark names as revset symbols', () => {
			assert.equal(quoteRevsetSymbol('bug/123-x'), '"bug/123-x"');
			assert.equal(quoteRevsetSymbol(String.raw`a"b\c`), String.raw`"a\"b\\c"`);
		});
	});

	describe('sniffMimetype', () => {
		it('detects images by magic bytes and falls back to text', () => {
			assert.equal(sniffMimetype(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), 'image/png');
			assert.equal(sniffMimetype(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
			assert.equal(sniffMimetype(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')), 'image/svg+xml');
			assert.equal(sniffMimetype(Buffer.from('const x = 1;')), 'text/plain');
		});
	});
});
