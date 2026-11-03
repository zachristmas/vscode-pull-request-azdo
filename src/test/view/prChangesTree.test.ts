import { strict as assert } from 'assert';
import { createSandbox, SinonSandbox } from 'sinon';
import * as vscode from 'vscode';
import { FolderRepositoryManager } from '../../azdo/folderRepositoryManager';
import { PullRequestModel } from '../../azdo/pullRequestModel';
import { PullRequestChangesTreeDataProvider } from '../../view/prChangesTreeDataProvider';
import { MockExtensionContext } from '../mocks/mockExtensionContext';

const noopDisposable = { dispose: () => {} };
const noopEvent = () => noopDisposable;

describe('PullRequestChangesTreeDataProvider', function () {
	let sinon: SinonSandbox;

	beforeEach(function () {
		sinon = createSandbox();
	});

	afterEach(function () {
		sinon.restore();
	});

	it('refreshes before revealing the view, so the refresh cannot cancel its first load', async function () {
		const events: string[] = [];
		sinon.stub(vscode.window, 'createTreeView').returns({ onDidChangeVisibility: noopEvent, dispose: () => {} } as never);
		sinon.stub(vscode.commands, 'executeCommand').callsFake(async (command: string) => {
			events.push(command);
		});
		const provider = new PullRequestChangesTreeDataProvider(new MockExtensionContext());
		provider.onDidChangeTreeData(() => {
			events.push('refresh');
		});
		const pullRequest = ({
			item: { title: 'A PR', createdBy: { imageUrl: 'https://example.com/avatar.png' } },
			getPullRequestId: () => 1,
		} as unknown) as PullRequestModel;

		await provider.addPrToView({} as FolderRepositoryManager, pullRequest, [], []);

		assert.deepEqual(events, ['refresh', 'setContext']);
		provider.dispose();
	});
});
