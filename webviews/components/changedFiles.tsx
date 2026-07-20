/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useContext } from 'react';
import { FileChangeStatus, FileChangeSummary } from '../common/cache';
import PullRequestContext from '../common/context';

const STATUS_LABEL: Record<FileChangeStatus, string> = {
	A: 'Added',
	M: 'Modified',
	D: 'Deleted',
	R: 'Renamed',
	'?': 'Changed',
};

// A file row. The whole row opens the full diff in the editor (ADO's diff API returns changed line
// numbers, not text, so there is nothing to preview inline - the native diff editor fetches both blobs
// and renders the real content).
const FileRow = ({ file }: { file: FileChangeSummary }) => {
	const { openFileDiff } = useContext(PullRequestContext);
	const renamed = file.status === 'R' && file.previousFileName && file.previousFileName !== file.fileName;
	return (
		<button className="changed-file-row" onClick={() => openFileDiff(file.fileName)} title="Open diff">
			<span className={`file-status status-${file.status}`} title={STATUS_LABEL[file.status]}>
				{file.status}
			</span>
			<span className="file-name">{renamed ? `${file.previousFileName} -> ${file.fileName}` : file.fileName}</span>
			<span className="file-stats">
				{file.additions > 0 ? <span className="additions">+{file.additions}</span> : null}
				{file.deletions > 0 ? <span className="deletions">-{file.deletions}</span> : null}
			</span>
		</button>
	);
};

export const ChangedFiles = ({ files }: { files?: FileChangeSummary[] }) => {
	if (!files || files.length === 0) {
		return <div className="changed-files-empty">No file changes to show.</div>;
	}
	const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
	const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

	return (
		<div id="changed-files">
			<div className="changed-files-summary">
				{files.length} {files.length === 1 ? 'file' : 'files'} changed
				<span className="file-stats">
					<span className="additions">+{totalAdditions}</span>
					<span className="deletions">-{totalDeletions}</span>
				</span>
			</div>
			<div className="changed-files-list">
				{files.map(file => (
					<FileRow key={file.fileName} file={file} />
				))}
			</div>
		</div>
	);
};
