/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';

import type { IComment } from '../../src/common/comment';
import type { DiffChangeType, DiffHunk, DiffLine } from '../../src/common/diffHunk';
import PullRequestContext from '../common/context';

const { useContext } = React;

function Diff({
	comment,
	hunks,
	path,
	outdated = false,
}: {
	readonly comment: IComment;
	readonly hunks: DiffHunk[];
	readonly outdated: boolean;
	readonly path: string;
}) {
	const { openDiff } = useContext(PullRequestContext);
	return (
		<div className="diff">
			<div className="diffHeader">
				{outdated ? (
					<span>
						<span>{path}</span>
						<span className="outdatedLabel">Outdated</span>
					</span>
				) : (
					<a className="diffPath" onClick={() => openDiff(comment)}>
						{path}
					</a>
				)}
			</div>
			{hunks.map(hunk => (
				<Hunk hunk={hunk} />
			))}
		</div>
	);
}

export default Diff;

export const Hunk = ({ hunk, maxLines = 4 }: { hunk: DiffHunk; maxLines?: number }) => (
	<>
		{hunk.diffLines.slice(-maxLines).map(line => (
			<div key={keyForDiffLine(line)} className={`diffLine ${getDiffChangeClass(line.type)}`}>
				<LineNumber num={line.oldLineNumber} />
				<LineNumber num={line.newLineNumber} />
				<span className="diffTypeSign">{(line as any)._raw.slice(0, 1)}</span>
				<span className="lineContent">{(line as any)._raw.slice(1)}</span>
			</div>
		))}
	</>
);

const keyForDiffLine = (diffLine: DiffLine) => `${diffLine.oldLineNumber}->${diffLine.newLineNumber}`;

const LineNumber = ({ num }: { num: number }) => <span className="lineNumber">{num > 0 ? num : ' '}</span>;

// Class name keyed by the DiffChangeType numeric value (0 Context, 1 Add, 2 Delete, 3 Control).
// A local lookup rather than the DiffChangeType runtime enum, which would drag the extension-only
// diffHunk module graph (and `vscode`) into the webview bundle.
const DIFF_CHANGE_CLASS = ['context', 'add', 'delete', 'control'];
const getDiffChangeClass = (type: DiffChangeType) => DIFF_CHANGE_CLASS[type] ?? 'context';
