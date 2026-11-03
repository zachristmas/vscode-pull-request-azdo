import { strict as assert } from 'assert';

import { GitPullRequest } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { createSandbox, SinonSandbox } from 'sinon';
import { createMock } from 'ts-auto-mock';
import { Repository } from '../../api/api';
import { GitApiImpl, RefType } from '../../api/api1';
import { CredentialStore } from '../../azdo/credentials';
import { IRepository } from '../../azdo/interface';
import { PullRequestGitHelper } from '../../azdo/pullRequestGitHelper';
import { IResolvedPullRequestModel, PullRequestModel } from '../../azdo/pullRequestModel';
import { convertAzdoPullRequestToRawPullRequest } from '../../azdo/utils';
import { Protocol } from '../../common/protocol';
import { Remote } from '../../common/remote';
import { MockGitProvider } from '../../gitProviders/mockGitProvider';
import { MockAzdoRepository } from '../mocks/mockAzdoRepository';
import { MockCommandRegistry } from '../mocks/mockCommandRegistry';
import { createFakeSecretStorage } from '../mocks/mockExtensionContext';
import { MockRepository } from '../mocks/mockRepository';
import { MockTelemetry } from '../mocks/mockTelemetry';

function fakeRepository(sandbox: SinonSandbox) {
	return {
		getBranch: sandbox.stub(),
		checkout: sandbox.stub().resolves(),
		createBranch: sandbox.stub().resolves(),
		fetch: sandbox.stub().resolves(),
		setBranchUpstream: sandbox.stub().resolves(),
		pull: sandbox.stub().resolves(),
	};
}

describe('PullRequestGitHelper', function () {
	let sinon: SinonSandbox;
	let repository: MockRepository;
	let telemetry: MockTelemetry;
	let credentialStore: CredentialStore;

	beforeEach(function () {
		sinon = createSandbox();

		MockCommandRegistry.install(sinon);

		repository = new MockRepository();
		repository.addRemote('origin', 'git@dev.azure.com.com:aaa/aaa/bbb/_git/bbb');
		telemetry = new MockTelemetry();
		const secretStore = createFakeSecretStorage();

		const gitImpl = new GitApiImpl();
		const mockGitProvider = new MockGitProvider(repository);
		gitImpl.registerGitProvider(mockGitProvider);
		credentialStore = new CredentialStore(telemetry, secretStore, gitImpl);
	});

	afterEach(function () {
		sinon.restore();
	});

	describe('checkoutFromFork', function () {
		it('fetches, checks out, and configures a branch from a fork', async function () {
			const url = 'https://aaa@dev.azure.com/aaa/bbb/you/bbb';
			const remote = new Remote('elsewhere', url, new Protocol(url));
			// const azdoRepository = sinon.mock(new AzdoRepository(remote, credentialStore, telemetry));
			// azdoRepository.expects('getBranchRef').resolves({
			// 	ref: '',
			// 	sha: '',
			// 	exist: true,
			// });

			const azdoRepository = new MockAzdoRepository(remote, credentialStore, telemetry, sinon);
			azdoRepository.getBranchRef = sinon.stub(azdoRepository, 'getBranchRef').resolves({
				ref: 'my-branch',
				sha: '',
				exists: true,
				repo: createMock<IRepository>({
					cloneUrl: 'https://dev.azure.com/aaa/bbb/you/bbb',
				}),
			});

			const prItem = await convertAzdoPullRequestToRawPullRequest(
				createMock<GitPullRequest>({
					pullRequestId: 100,
					createdBy: {
						id: '1134',
						uniqueName: 'me',
					},
					sourceRefName: 'ref/heads/my-branch',
					targetRefName: 'ref/heads/main',
				}),
				azdoRepository,
			);

			repository.expectFetch('you', 'my-branch:pr/me/100', 1);
			repository.expectPull(true);

			const pullRequest = new PullRequestModel(telemetry, azdoRepository, remote, prItem);

			const resolved = pullRequest.isResolved();
			if (!resolved) {
				assert.fail('pull request head not resolved successfully');
			}

			await PullRequestGitHelper.checkoutFromFork(repository, pullRequest, undefined);

			assert.deepEqual(repository.state.remotes, [
				{
					name: 'you',
					fetchUrl: 'https://dev.azure.com/aaa/bbb/you/bbb',
					pushUrl: 'https://dev.azure.com/aaa/bbb/you/bbb',
					isReadOnly: false,
				},
			]);
			assert.deepEqual(repository.state.HEAD, {
				type: RefType.Head,
				name: 'pr/me/100',
				commit: undefined,
				upstream: {
					remote: 'you',
					name: 'my-branch',
				},
			});
			assert.strictEqual(await repository.getConfig('branch.pr/me/100.github-pr-owner-number'), 'you#bbb#100');
		});
	});

	describe('fetchAndCheckout', function () {
		const url = 'https://dev.azure.com/org/project/_git/repo';
		const remote = new Remote('origin', url, new Protocol(url));
		const pullRequest = ({
			validatePullRequestModel: () => true,
			head: { ref: 'feature', repositoryCloneUrl: remote.gitProtocol },
			base: { repositoryCloneUrl: remote.gitProtocol },
		} as unknown) as PullRequestModel & IResolvedPullRequestModel;

		beforeEach(function () {
			sinon.stub(PullRequestGitHelper, 'associateBranchWithPullRequest').resolves();
			sinon.stub(PullRequestGitHelper, 'unshallow').resolves();
		});

		it('surfaces a failed checkout of an existing branch instead of trying to create it', async function () {
			const repo = fakeRepository(sinon);
			repo.getBranch.withArgs('feature').resolves({ name: 'feature', upstream: { remote: 'origin', name: 'feature' } });
			repo.checkout.rejects(new Error('Your local changes would be overwritten by checkout'));

			await assert.rejects(
				PullRequestGitHelper.fetchAndCheckout((repo as unknown) as Repository, [remote], pullRequest),
				/local changes would be overwritten/,
			);
			assert.equal(repo.createBranch.callCount, 0);
		});

		it('creates the branch from the remote when there is no local one', async function () {
			const repo = fakeRepository(sinon);
			repo.getBranch.withArgs('feature').rejects(new Error('No such branch: feature'));
			repo.getBranch.withArgs('refs/remotes/origin/feature').resolves({ commit: 'abc123' });

			await PullRequestGitHelper.fetchAndCheckout((repo as unknown) as Repository, [remote], pullRequest);

			assert.deepEqual(repo.createBranch.firstCall.args, ['feature', true, 'abc123']);
			assert.equal(repo.checkout.callCount, 0);
		});
	});
});
