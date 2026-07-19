/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live reproduction for the "incompatibility with the GitHub Pull Requests extension" known issue.
 *
 * These tests run inside a real VS Code Extension Host (@vscode/test-electron), which is the only
 * place the shared commenting surface actually exists. They establish two facts:
 *
 *  Part A: VS Code keeps a single global list of comment controllers and lets each one own a thread and
 *          advertise commenting ranges on the SAME `file:` document. Neither the controller id nor the
 *          document scheme partitions the gutter, so two coexisting review extensions can both light the
 *          same line. This is the real (and only) overlap surface with GitHub.vscode-pull-request-github.
 *
 *  Part B: This extension's ReviewCommentController must therefore keep its `file:` footprint to exactly
 *          the active PR's changed files. It must NOT claim (commenting ranges) or route (hasCommentThread)
 *          a workspace file that is not part of the checked-out PR. Before the fix `hasCommentThread`
 *          returned true for ANY workspace file under the repo root; this guards the fix.
 *
 * The controller is built from lightweight mocks (no FolderRepositoryManager/updateRepositories) so the
 * suite does not depend on the heavy shared harness, whose beforeEach hangs headless in some environments.
 */

import { strict as assert } from 'assert';
import fs from 'fs';
import os from 'os';
import nodePath from 'path';
import { GitPullRequest, GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { createSandbox, SinonSandbox } from 'sinon';
import { createMock } from 'ts-auto-mock';
import * as vscode from 'vscode';
import { FolderRepositoryManager } from '../../azdo/folderRepositoryManager';
import { GHPRCommentThread } from '../../azdo/prComment';
import { DiffLine } from '../../common/diffHunk';
import { GitChangeType } from '../../common/file';
import { toReviewUri } from '../../common/uri';
import { URI_SCHEME_REVIEW } from '../../constants';
import { PullRequestsTreeDataProvider } from '../../view/prsTreeDataProvider';
import { ReviewCommentController } from '../../view/reviewCommentController';
import { GitFileChangeNode } from '../../view/treeNodes/fileChangeNode';
import { MockRepository } from '../mocks/mockRepository';

function createGHPRCommentThread(uri: vscode.Uri): GHPRCommentThread {
	return {
		threadId: 1,
		uri,
		range: new vscode.Range(new vscode.Position(21, 0), new vscode.Position(21, 0)),
		comments: [],
		collapsibleState: vscode.CommentThreadCollapsibleState.Expanded,
		label: 'Start discussion',
		dispose: () => {},
		rawThread: createMock<GitPullRequestCommentThread>(),
		canReply: false,
	};
}

// provideCommentingRanges only reads document.uri; a typed partial (not an inline literal cast) keeps
// consistent-type-assertions happy while giving the method the single field it needs.
function fakeDocument(uri: vscode.Uri): vscode.TextDocument {
	const partial: Partial<vscode.TextDocument> = { uri };
	return partial as vscode.TextDocument;
}

// A VS Code Event stub: registering a listener returns a no-op Disposable.
const noopEvent = () => ({ dispose: () => {} });

// #region Part A: VS Code shared commenting surface (the real overlap point). No harness setup needed.

describe('GitHub Pull Requests extension coexistence: VS Code shared commenting surface', function () {
	it('lets two comment controllers coexist and both own a thread on the SAME file: document', function () {
		const tmpDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'azdopr-overlap-'));
		const filePath = nodePath.join(tmpDir, 'shared.ts');
		fs.writeFileSync(filePath, 'const a = 1;\nconst b = 2;\nconst c = 3;\n');
		const fileUri = vscode.Uri.file(filePath);
		const range = new vscode.Range(0, 0, 0, 0);

		// Two independent comment controllers with distinct ids, standing in for this extension and
		// GitHub.vscode-pull-request-github. Each also advertises commenting ranges: VS Code consults every
		// controller for a document, so neither the controller id nor the document scheme partitions the
		// gutter. Two review extensions can both light the same line when one branch is a PR on both.
		const controllers: vscode.CommentController[] = [];
		for (const id of ['coexist-a', 'coexist-b']) {
			const controller = vscode.comments.createCommentController(id, id);
			controller.commentingRangeProvider = { provideCommentingRanges: () => [range] };
			controllers.push(controller);
		}

		try {
			// Creating a thread on the same uri from BOTH controllers succeeds independently: VS Code does
			// not reject the second, does not merge them, and does not route by id. The surface is shared.
			const threadA = controllers[0].createCommentThread(fileUri, range, []);
			const threadB = controllers[1].createCommentThread(fileUri, range, []);

			assert.ok(threadA, 'controller A must own a thread on the shared file');
			assert.ok(threadB, 'controller B must own a thread on the shared file');
			assert.notEqual(threadA, threadB, 'the two controllers own distinct threads on the same document');
			assert.equal(threadA.uri.toString(), fileUri.toString());
			assert.equal(threadB.uri.toString(), fileUri.toString());

			threadA.dispose();
			threadB.dispose();
		} finally {
			controllers.forEach(c => c.dispose());
			fs.rmdirSync(tmpDir, { recursive: true });
		}
	});
});

// #endregion

// #region Part B: this extension keeps its file: footprint to the active PR's changed files.

describe('GitHub Pull Requests extension coexistence: ReviewCommentController scoping', function () {
	const rootUri = new MockRepository().rootUri;
	const prFileName = 'data/products.json';
	const prFileUri = vscode.Uri.parse(`${rootUri.toString()}/${prFileName}`);
	const foreignFileUri = vscode.Uri.parse(`${rootUri.toString()}/src/unrelated.ts`);

	let sinon: SinonSandbox;
	let repository: MockRepository;
	let manager: FolderRepositoryManager;
	const disposables: vscode.Disposable[] = [];

	beforeEach(function () {
		sinon = createSandbox();
		repository = new MockRepository();

		// A minimal active PR built by hand (ts-auto-mock cannot mock PullRequestModel/FolderRepositoryManager
		// because of their deep types). ReviewCommentController only reads getPullRequestId()/item.title (the
		// controller id) and isResolved() (the provideCommentingRanges workspace-file gate). Building it by
		// hand also avoids FolderRepositoryManager.updateRepositories() and the credential login() flow, both
		// of which hang headless in the shared harness.
		const pr: any = {
			getPullRequestId: () => 1,
			isResolved: () => true,
			item: createMock<GitPullRequest>(),
			// Fields the GitFileChangeNode constructor reads when building _localFileChanges.
			fileChangeViewedState: {},
			reviewThreadsCache: [],
			onDidChangeFileViewedState: noopEvent,
			onDidChangeReviewThreads: noopEvent,
		};
		const mgr: any = { activePullRequest: pr };
		manager = mgr;

		sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns({ uri: repository.rootUri, name: '', index: 0 });
		// getWorkspaceFileCommentingRanges -> getContentDiff -> diffWithHEAD for an in-PR file.
		sinon.stub(repository, 'diffWithHEAD').resolves('');
	});

	afterEach(function () {
		disposables.forEach(d => d.dispose());
		disposables.length = 0;
		sinon.restore();
	});

	function localFileChange(): GitFileChangeNode {
		return new GitFileChangeNode(
			createMock<PullRequestsTreeDataProvider>(),
			manager.activePullRequest as any,
			GitChangeType.MODIFY,
			prFileName,
			undefined,
			'https://example.com',
			prFileUri,
			toReviewUri(prFileUri, prFileName, undefined, '1', false, { base: true }, rootUri),
			[
				{
					oldLineNumber: 22,
					oldLength: 5,
					newLineNumber: 22,
					newLength: 11,
					positionInHunk: 0,
					diffLines: [
						new DiffLine(3, -1, -1, 0, '@@ -22,5 +22,11 @@', true),
						new DiffLine(0, 22, 22, 1, "     'title': 'Papayas',", true),
						new DiffLine(1, -1, 25, 4, '+  {', true),
						new DiffLine(0, 26, 32, 11, '+  {', true),
					],
				},
			],
			[],
			'abcd',
		);
	}

	function makeController(): ReviewCommentController {
		const controller = new ReviewCommentController(manager, repository, [localFileChange()], _c => ({
			canDelete: false,
			canEdit: false,
		}));
		disposables.push(controller);
		return controller;
	}

	it('claims commenting ranges on a workspace file that IS in the active PR', async function () {
		const controller = makeController();
		const token = new vscode.CancellationTokenSource().token;

		const ranges = await controller.provideCommentingRanges(fakeDocument(prFileUri), token);
		assert.notEqual(ranges, undefined, 'Expected commenting ranges for a file in the active PR');
	});

	it('declines commenting ranges on a workspace file that is NOT in the active PR', async function () {
		const controller = makeController();
		const token = new vscode.CancellationTokenSource().token;

		const ranges = await controller.provideCommentingRanges(fakeDocument(foreignFileUri), token);
		// Guards PR #13: a workspace file outside the PR diff must be declined (undefined), not claimed ([]),
		// so the extension never lights the gutter on a file GitHub's extension may own.
		assert.equal(ranges, undefined, 'Expected the extension to DECLINE a file that is not in the active PR');
	});

	it('routes hasCommentThread for its own review_azdo scheme', function () {
		const controller = makeController();
		const reviewUri = toReviewUri(prFileUri, prFileName, undefined, '1', false, { base: false }, rootUri);
		const thread = createGHPRCommentThread(reviewUri);
		assert.equal(reviewUri.scheme, URI_SCHEME_REVIEW);
		assert.equal(controller.hasCommentThread(thread), true);
	});

	it('routes hasCommentThread for a workspace file that IS in the active PR', function () {
		const controller = makeController();
		const thread = createGHPRCommentThread(prFileUri);
		assert.equal(controller.hasCommentThread(thread), true);
	});

	it('does NOT route hasCommentThread for a workspace file that is not in the active PR', function () {
		const controller = makeController();
		// Before the fix this returned true for ANY workspace file under the repo root: the mis-routing
		// surface flagged in the investigation. It must be scoped to the active PR's changed files.
		const thread = createGHPRCommentThread(foreignFileUri);
		assert.equal(
			controller.hasCommentThread(thread),
			false,
			'A workspace file outside the PR diff must not be claimed by ReviewCommentController',
		);
	});
});

// #endregion
