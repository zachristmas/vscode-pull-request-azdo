/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useContext, useState } from 'react';
import type { DiffChangeType, DiffHunk, DiffLine } from '../../src/common/diffHunk';
import { FileChangeStatus, FileChangeSummary } from '../common/cache';
import PullRequestContext from '../common/context';

// Local copy of diff.tsx's class map so this component does not need diff.tsx to export it. Indexed by
// DiffChangeType (0 Context, 1 Add, 2 Delete, 3 Control).
const DIFF_CHANGE_CLASS = ['context', 'add', 'delete', 'control'];
const diffLineClass = (type: DiffChangeType) => DIFF_CHANGE_CLASS[type] ?? 'context';
const diffLineKey = (line: DiffLine) => `${line.oldLineNumber}->${line.newLineNumber}`;
const hunkKey = (hunk: DiffHunk) => `${hunk.oldLineNumber}-${hunk.newLineNumber}`;

const STATUS_LABEL: Record<FileChangeStatus, string> = {
	A: 'Added',
	M: 'Modified',
	D: 'Deleted',
	R: 'Renamed',
	'?': 'Changed',
};

// Renders every line of a hunk (unlike diff.tsx's Hunk, which tails the last few lines for thread cards).
const HunkPreview = ({ hunk }: { hunk: DiffHunk }) => (
	<div className="diff file-diff-preview">
		{hunk.diffLines.map(line => (
			<div key={diffLineKey(line)} className={`diffLine ${diffLineClass(line.type)}`}>
				<span className="diffTypeSign">{(line as any)._raw?.slice(0, 1)}</span>
				<span className="diffLineContent">{(line as any)._raw?.slice(1)}</span>
			</div>
		))}
	</div>
);

const FileRow = ({ file }: { file: FileChangeSummary }) => {
	const { openFileDiff } = useContext(PullRequestContext);
	const [expanded, setExpanded] = useState(false);
	const canPreview = !!file.hunks && file.hunks.length > 0;
	const renamed = file.status === 'R' && file.previousFileName && file.previousFileName !== file.fileName;

	return (
		<div className="changed-file">
			<div className="changed-file-header">
				<button
					className="changed-file-toggle"
					disabled={!canPreview}
					aria-expanded={expanded}
					title={canPreview ? 'Toggle inline preview' : 'No inline preview - open the full diff'}
					onClick={() => setExpanded(value => !value)}
				>
					<span className={`file-status status-${file.status}`} title={STATUS_LABEL[file.status]}>
						{file.status}
					</span>
					<span className="file-name">
						{renamed ? `${file.previousFileName} -> ${file.fileName}` : file.fileName}
					</span>
				</button>
				<span className="file-stats">
					{file.additions > 0 ? <span className="additions">+{file.additions}</span> : null}
					{file.deletions > 0 ? <span className="deletions">-{file.deletions}</span> : null}
					{file.binary ? <span className="file-note">binary</span> : null}
					{file.truncated ? <span className="file-note">large diff</span> : null}
				</span>
				<button className="open-file-diff link-button" onClick={() => openFileDiff(file.fileName)}>
					Open diff
				</button>
			</div>
			{expanded && canPreview ? (
				<div className="changed-file-preview">
					{file.hunks!.map(hunk => (
						<HunkPreview key={hunkKey(hunk)} hunk={hunk} />
					))}
				</div>
			) : null}
		</div>
	);
};

export const ChangedFiles = ({ files }: { files?: FileChangeSummary[] }) => {
	const [open, setOpen] = useState(true);
	if (!files || files.length === 0) {
		return null;
	}
	const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
	const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

	return (
		<div id="changed-files" className="section">
			<button className="changed-files-title" aria-expanded={open} onClick={() => setOpen(value => !value)}>
				<span className="changed-files-heading">Files changed ({files.length})</span>
				<span className="file-stats">
					<span className="additions">+{totalAdditions}</span>
					<span className="deletions">-{totalDeletions}</span>
				</span>
			</button>
			{open ? (
				<div className="changed-files-list">
					{files.map(file => (
						<FileRow key={file.fileName} file={file} />
					))}
				</div>
			) : null}
		</div>
	);
};
