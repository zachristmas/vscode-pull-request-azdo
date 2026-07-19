import { strict as assert } from 'assert';
import path from 'path';
import { GitPullRequest, GitStatusState } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { createSandbox, match as sinonMatch, SinonSandbox, SinonStubbedInstance } from 'sinon';
import { createMock } from 'ts-auto-mock';
import * as vscode from 'vscode';

import { GitApiImpl } from '../../api/api1';
import { CredentialStore } from '../../azdo/credentials';
import { FileReviewedStatusService } from '../../azdo/fileReviewedStatusService';
import { FolderRepositoryManager } from '../../azdo/folderRepositoryManager';
import { PullRequestModel } from '../../azdo/pullRequestModel';
import { PullRequestOverviewPanel } from '../../azdo/pullRequestOverview';
import { AzdoUserManager } from '../../azdo/userManager';
import { convertAzdoPullRequestToRawPullRequest } from '../../azdo/utils';
import { AzdoWorkItem } from '../../azdo/workItem';
import { Protocol } from '../../common/protocol';
import { Remote } from '../../common/remote';
import { MockGitProvider } from '../../gitProviders/mockGitProvider';
import { MockAzdoRepository } from '../mocks/mockAzdoRepository';
import { MockCommandRegistry } from '../mocks/mockCommandRegistry';
import { createFakeSecretStorage, MockExtensionContext } from '../mocks/mockExtensionContext';
import { MockRepository } from '../mocks/mockRepository';
import { MockTelemetry } from '../mocks/mockTelemetry';
import { asReal } from '../mocks/stub';

const EXTENSION_PATH = path.resolve(__dirname, '../../..');

describe('PullRequestOverview', function () {
	let sinon: SinonSandbox;
	let pullRequestManager: FolderRepositoryManager;
	let context: MockExtensionContext;
	let remote: Remote;
	let repo: MockAzdoRepository;
	let telemetry: MockTelemetry;
	let workItem: AzdoWorkItem;
	let userManager: AzdoUserManager;
	let fileReviewedStatusService: SinonStubbedInstance<FileReviewedStatusService>;

	beforeEach(async function () {
		sinon = createSandbox();
		MockCommandRegistry.install(sinon);
		context = new MockExtensionContext();

		const repository = new MockRepository();
		telemetry = new MockTelemetry();
		const gitImpl = new GitApiImpl();
		const mockGitProvider = new MockGitProvider(repository);
		gitImpl.registerGitProvider(mockGitProvider);
		const credentialStore = new CredentialStore(telemetry, createFakeSecretStorage(), gitImpl);
		fileReviewedStatusService = sinon.createStubInstance(FileReviewedStatusService);
		pullRequestManager = new FolderRepositoryManager(
			repository,
			telemetry,
			new GitApiImpl(),
			credentialStore,
			asReal(fileReviewedStatusService),
		);
		workItem = new AzdoWorkItem(credentialStore, telemetry);
		userManager = new AzdoUserManager(credentialStore, telemetry);

		const url = 'https://dev.azure.com.com/aaa/bbb/_git/bbb';
		remote = new Remote('origin', url, new Protocol(url));
		repo = new MockAzdoRepository(remote, pullRequestManager.credentialStore, telemetry, sinon);
	});

	afterEach(function () {
		// UX-04: dispose every open panel (one per PR now, not a singleton). Snapshot the values
		// first since dispose() mutates the map.
		for (const panel of PullRequestOverviewPanel.panels.values()) {
			panel.dispose();
		}

		pullRequestManager.dispose();
		context.dispose();
		sinon.restore();
	});

	describe('createOrShow', function () {
		it('creates a new panel', async function () {
			assert.strictEqual(PullRequestOverviewPanel.panels.size, 0);
			const createWebviewPanel = sinon.spy(vscode.window, 'createWebviewPanel');

			const prItem = await convertAzdoPullRequestToRawPullRequest(
				createMock<GitPullRequest>({ pullRequestId: 1000 }),
				repo,
			);
			const prModel = new PullRequestModel(telemetry, repo, remote, prItem);

			await PullRequestOverviewPanel.createOrShow(EXTENSION_PATH, pullRequestManager, prModel, workItem, userManager);

			const distUri = vscode.Uri.file(path.resolve(EXTENSION_PATH, 'dist'));
			assert.ok(
				createWebviewPanel.calledWith(sinonMatch.string, 'Pull Request #1000', vscode.ViewColumn.One, {
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [distUri],
				}),
			);
			assert.strictEqual(PullRequestOverviewPanel.panels.size, 1);
			assert.ok(PullRequestOverviewPanel.panels.has(1000));
		});

		it('reveals the existing tab when the same PR is reopened', async function () {
			const createWebviewPanel = sinon.spy(vscode.window, 'createWebviewPanel');

			const prItem = await convertAzdoPullRequestToRawPullRequest(
				createMock<GitPullRequest>({ pullRequestId: 1000 }),
				repo,
			);
			const prModel = new PullRequestModel(telemetry, repo, remote, prItem);
			sinon.stub(pullRequestManager, 'resolvePullRequest').resolves(prModel);
			sinon.stub(prModel, 'getStatusChecks').resolves({ state: GitStatusState.Pending, statuses: [] });

			await PullRequestOverviewPanel.createOrShow(EXTENSION_PATH, pullRequestManager, prModel, workItem, userManager);
			await PullRequestOverviewPanel.createOrShow(EXTENSION_PATH, pullRequestManager, prModel, workItem, userManager);

			// Reopening the same PR reveals the existing tab; it does not spawn a second one.
			assert.strictEqual(createWebviewPanel.callCount, 1);
			assert.strictEqual(PullRequestOverviewPanel.panels.size, 1);
		});

		it('opens a separate tab for each PR', async function () {
			const createWebviewPanel = sinon.spy(vscode.window, 'createWebviewPanel');

			const prItem0 = await convertAzdoPullRequestToRawPullRequest(
				createMock<GitPullRequest>({ pullRequestId: 1000 }),
				repo,
			);
			const prModel0 = new PullRequestModel(telemetry, repo, remote, prItem0);
			const resolveStub = sinon.stub(pullRequestManager, 'resolvePullRequest').resolves(prModel0);
			sinon.stub(prModel0, 'getStatusChecks').resolves({ state: GitStatusState.Pending, statuses: [] });
			await PullRequestOverviewPanel.createOrShow(EXTENSION_PATH, pullRequestManager, prModel0, workItem, userManager);

			const panel0 = PullRequestOverviewPanel.panels.get(1000);
			assert.notStrictEqual(panel0, undefined);
			assert.strictEqual(createWebviewPanel.callCount, 1);

			const prItem1 = await convertAzdoPullRequestToRawPullRequest(
				createMock<GitPullRequest>({ pullRequestId: 2000 }),
				repo,
			);
			const prModel1 = new PullRequestModel(telemetry, repo, remote, prItem1);
			resolveStub.resolves(prModel1);
			sinon.stub(prModel1, 'getStatusChecks').resolves({ state: GitStatusState.Pending, statuses: [] });
			await PullRequestOverviewPanel.createOrShow(EXTENSION_PATH, pullRequestManager, prModel1, workItem, userManager);

			const panel1 = PullRequestOverviewPanel.panels.get(2000);
			// A different PR opens its own tab rather than repurposing the first (the old singleton bug).
			assert.strictEqual(createWebviewPanel.callCount, 2);
			assert.notStrictEqual(panel0, panel1);
			assert.strictEqual(PullRequestOverviewPanel.panels.size, 2);
			assert.strictEqual(panel0!.getCurrentTitle(), 'Pull Request #1000');
			assert.strictEqual(panel1!.getCurrentTitle(), 'Pull Request #2000');
		});
	});
});
