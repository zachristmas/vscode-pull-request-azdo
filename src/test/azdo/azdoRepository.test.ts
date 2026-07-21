import path from 'path';
import { expect } from 'chai';
import * as dotenv from 'dotenv';
import { createSandbox, SinonSandbox, SinonStubbedInstance } from 'sinon';
import * as vscode from 'vscode';
import { GitApiImpl } from '../../api/api1';
import { AzdoRepository } from '../../azdo/azdoRepository';
import { CredentialStore } from '../../azdo/credentials';
import { FileReviewedStatusService } from '../../azdo/fileReviewedStatusService';
import { Protocol } from '../../common/protocol';
import { Remote } from '../../common/remote';
import { SETTINGS_NAMESPACE } from '../../constants';
import { MockGitProvider } from '../../gitProviders/mockGitProvider';
import { MockCommandRegistry } from '../mocks/mockCommandRegistry';
import { createFakeSecretStorage } from '../mocks/mockExtensionContext';
import { MockRepository } from '../mocks/mockRepository';
import { MockTelemetry } from '../mocks/mockTelemetry';
import { asReal } from '../mocks/stub';

// Org/project/repo are parameterized (env-driven) rather than hardcoded to one person's ADO
// tenant, since this suite makes a real network call - whoever owns AZDO_PAT_TOKEN_TEST /
// VSCODE_PR_AZDO_TEST_PAT decides what it authenticates against. test_workspace/.vscode/settings.json
// still needs azdoPullRequests.orgUrl/projectName pointed at the same org (CredentialStore resolves
// the org from settings, not from the remote URL passed to AzdoRepository).
const TEST_REPO_NAME = process.env.VSCODE_PR_AZDO_TEST_REPO ?? 'test';
const TEST_REPO_URL =
	process.env.VSCODE_PR_AZDO_TEST_REPO_URL ?? `https://dev.azure.com/anksinha/test/_git/${TEST_REPO_NAME}`;

describe('AzdoRepository', function () {
	let sinon: SinonSandbox;
	let credentialStore: CredentialStore;
	let telemetry: MockTelemetry;
	let fileReviewedStatusService: SinonStubbedInstance<FileReviewedStatusService>;

	// eslint-disable-next-line unicorn/no-this-outside-of-class -- mocha suite context
	this.timeout(1_000_000);

	before(async function () {
		dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

		// This suite hits a real ADO org over the network. Without a PAT, CredentialStore falls
		// through to interactive OAuth (createIfNone: true by default), which just hangs forever in
		// CI or any other unattended run - it used to eat the full 12-minute job timeout on every
		// single run. Skip instead of relying on an outer timeout to bail it out.
		if (!process.env.VSCODE_PR_AZDO_TEST_PAT) {
			// eslint-disable-next-line unicorn/no-this-outside-of-class -- mocha suite context
			this.skip();
			return;
		}

		// Feed the PAT through the same VS Code setting a real user would configure manually
		// (CredentialStore.acquireToken reads azdoPullRequests.patToken), so this exercises the
		// actual production auth path instead of a test-only shortcut.
		await vscode.workspace
			.getConfiguration(SETTINGS_NAMESPACE)
			.update('patToken', process.env.VSCODE_PR_AZDO_TEST_PAT, vscode.ConfigurationTarget.Global);
	});

	beforeEach(function () {
		sinon = createSandbox();
		MockCommandRegistry.install(sinon);

		const secretStorage = createFakeSecretStorage();

		telemetry = new MockTelemetry();
		const repository = new MockRepository();
		const gitImpl = new GitApiImpl();
		const mockGitProvider = new MockGitProvider(repository);
		gitImpl.registerGitProvider(mockGitProvider);
		credentialStore = new CredentialStore(telemetry, secretStorage, gitImpl);
		fileReviewedStatusService = sinon.createStubInstance(FileReviewedStatusService);
	});

	afterEach(function () {
		sinon.restore();
	});

	describe('getMetadata', function () {
		it('get repo information from Azdo', async function () {
			await credentialStore.initialize();
			const remote = new Remote('origin', TEST_REPO_URL, new Protocol(TEST_REPO_URL));
			const azdoRepo = new AzdoRepository(remote, credentialStore, asReal(fileReviewedStatusService), telemetry);
			const metadata = await azdoRepo.getMetadata();
			expect(metadata?.name).to.be.eq(TEST_REPO_NAME);
		});
	});

	// describe('branch', function () {
	// 	it('get default branch', async function () {
	// 		await credentialStore.initialize();
	// 		const url = 'https://dev.azure.com/anksinha/test/_git/test';
	// 		const remote = new Remote('origin', url, new Protocol(url));
	// 		const azdoRepo = new AzdoRepository(remote, credentialStore, telemetry);
	// 		const branch = await azdoRepo.getDefaultBranch();
	// 		expect(branch).to.be.eq('main');
	// 	});

	// 	it('get specific branch', async function () {
	// 		await credentialStore.initialize();
	// 		const url = 'https://dev.azure.com/anksinha/test/_git/test';
	// 		const remote = new Remote('origin', url, new Protocol(url));
	// 		const azdoRepo = new AzdoRepository(remote, credentialStore, telemetry);
	// 		const branch = await azdoRepo.getBranchRef('main');
	// 		expect(branch?.ref).to.be.eq('main');
	// 	});
	// });

	// describe('pr', function () {
	// 	it('get all PRs', async function () {
	// 		await credentialStore.initialize();
	// 		const url = 'https://dev.azure.com/anksinha/test/_git/test';
	// 		const remote = new Remote('origin', url, new Protocol(url));
	// 		const azdoRepo = new AzdoRepository(remote, credentialStore, telemetry);
	// 		const prs = await azdoRepo.getAllPullRequests();
	// 		expect(prs?.length).to.be.greaterThan(2);
	// 	});

	// 	it('get PR for test_pr branch', async function () {
	// 		await credentialStore.initialize();
	// 		const url = 'https://dev.azure.com/anksinha/test/_git/test';
	// 		const remote = new Remote('origin', url, new Protocol(url));
	// 		const azdoRepo = new AzdoRepository(remote, credentialStore, telemetry);
	// 		const prs = await azdoRepo.getPullRequestForBranch('refs/heads/test_pr');
	// 		expect(prs?.length).to.be.greaterThan(0);
	// 	});

	// 	it('get PR for main branch', async function () {
	// 		await credentialStore.initialize();
	// 		const url = 'https://dev.azure.com/anksinha/test/_git/test';
	// 		const remote = new Remote('origin', url, new Protocol(url));
	// 		const azdoRepo = new AzdoRepository(remote, credentialStore, telemetry);
	// 		const prs = await azdoRepo.getPullRequestForBranch('refs/heads/main');
	// 		expect(prs?.length).to.be.eq(0);
	// 	});

	// 	it('get PR for deleted branch', async function () {
	// 		await credentialStore.initialize();
	// 		const url = 'https://dev.azure.com/anksinha/test/_git/test';
	// 		const remote = new Remote('origin', url, new Protocol(url));
	// 		const azdoRepo = new AzdoRepository(remote, credentialStore, telemetry);
	// 		const prs = await azdoRepo.getPullRequestForBranch('refs/heads/this_does_not_exist');
	// 		expect(prs?.length).to.be.eq(0);
	// 	});
	// });

	// describe('authenticatedUser', function () {
	// 	it('get my identity', async function () {
	// 		await credentialStore.initialize();
	// 		const url = 'https://dev.azure.com/anksinha/test/_git/test';
	// 		const remote = new Remote('origin', url, new Protocol(url));
	// 		const azdoRepo = new AzdoRepository(remote, credentialStore, telemetry);
	// 		const user = await azdoRepo.getAuthenticatedUser();
	// 		// tslint:disable-next-line: no-unused-expression
	// 		expect(user?.id).exist;
	// 	});

	// 	it('get my username', async function () {
	// 		await credentialStore.initialize();
	// 		const url = 'https://dev.azure.com/anksinha/test/_git/test';
	// 		const remote = new Remote('origin', url, new Protocol(url));
	// 		const azdoRepo = new AzdoRepository(remote, credentialStore, telemetry);
	// 		const user = await azdoRepo.getAuthenticatedUserName();
	// 		console.log(user);
	// 		// tslint:disable-next-line: no-unused-expression
	// 		expect(user).is.not.empty;
	// 	});
	// });
});
