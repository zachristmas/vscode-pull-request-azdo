/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitPullRequestCommentThread } from 'azure-devops-node-api/interfaces/GitInterfaces';
import * as vscode from 'vscode';
import { DiffChangeType, DiffHunk } from './diffHunk';
import { getZeroBased } from './diffPositionMapping';

/**
 * For the base file, the only commentable areas are deleted lines. For the modified file,
 * comments can be added on any part of the diff hunk.
 * @param diffHunks The diff hunks of the file
 * @param isBase Whether the commenting ranges are calculated for the base or modified file
 */
// Contiguous runs of deleted lines in a hunk - the only commentable areas on the base file.
function getDeletedLineRanges(diffHunk: DiffHunk): vscode.Range[] {
	const ranges: vscode.Range[] = [];
	let startingLine: number | undefined;
	let endingLine: number | undefined;
	for (let j = 0; j < diffHunk.diffLines.length; j++) {
		const diffLine = diffHunk.diffLines[j];
		if (diffLine.type === DiffChangeType.Delete) {
			if (startingLine !== undefined) {
				endingLine = getZeroBased(diffLine.oldLineNumber);
			} else {
				startingLine = getZeroBased(diffLine.oldLineNumber);
				endingLine = getZeroBased(diffLine.oldLineNumber);
			}
		} else if (startingLine !== undefined && endingLine !== undefined) {
			ranges.push(new vscode.Range(startingLine, 0, endingLine, 0));
			startingLine = undefined;
			endingLine = undefined;
		}
	}

	if (startingLine !== undefined && endingLine !== undefined) {
		ranges.push(new vscode.Range(startingLine, 0, endingLine, 0));
	}

	return ranges;
}

// The whole hunk (with its overflow buffer) is commentable on the modified file.
function getModifiedHunkRanges(diffHunk: DiffHunk): vscode.Range[] {
	if (!diffHunk.newLineNumber) {
		return [];
	}
	const startingLine = getZeroBased(diffHunk.newLineNumber);
	const length = getZeroBased(diffHunk.newLength);
	return [new vscode.Range(startingLine, 0, startingLine + length, 0)];
}

export function getCommentingRanges(diffHunks: DiffHunk[], isBase: boolean): vscode.Range[] {
	const ranges: vscode.Range[] = [];

	for (const diffHunk of diffHunks) {
		if (isBase) {
			ranges.push(...getDeletedLineRanges(diffHunk));
		} else {
			ranges.push(...getModifiedHunkRanges(diffHunk));
		}
	}

	return ranges;
}

// ITER-01: prefer the tracked threadContext side; fall back to creation-time trackingCriteria only when
// the thread has no threadContext (mirrors getDiffSide/getPositionFromThread in azdo/utils.ts).
export function mapThreadsToBase(threads: GitPullRequestCommentThread[]): GitPullRequestCommentThread[] {
	return threads.filter(
		c =>
			(c.threadContext !== undefined
				? c.threadContext?.leftFileStart
				: c.pullRequestThreadContext?.trackingCriteria?.origLeftFileStart) !== undefined,
	);
}

export function mapThreadsToModified(threads: GitPullRequestCommentThread[]): GitPullRequestCommentThread[] {
	return threads.filter(
		c =>
			(c.threadContext !== undefined
				? c.threadContext?.rightFileStart
				: c.pullRequestThreadContext?.trackingCriteria?.origRightFileStart) !== undefined,
	);
}
