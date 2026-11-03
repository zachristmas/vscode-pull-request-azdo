import { strict as assert } from 'assert';
import * as azdev from 'azure-devops-node-api';
import { createSandbox, SinonSandbox, SinonStub } from 'sinon';
import * as vscode from 'vscode';
import { GitApiImpl } from '../../api/api1';
import { CredentialStore } from '../../azdo/credentials';
import { SETTINGS_NAMESPACE } from '../../constants';
import { createFakeSecretStorage } from '../mocks/mockExtensionContext';
import { MockTelemetry } from '../mocks/mockTelemetry';

const SESSION: vscode.AuthenticationSession = {
	id: 'session-1',
	accessToken: 'not-a-jwt',
	account: { id: 'account-1', label: 'someone@example.com' },
	scopes: [],
};

function isPrompting(options: vscode.AuthenticationGetSessionOptions | undefined): boolean {
	return !!options?.createIfNone || !!options?.forceNewSession;
}

describe('CredentialStore sign-in prompts', function () {
	let sinon: SinonSandbox;
	let getSession: SinonStub;
	let showErrorMessage: SinonStub;
	let store: CredentialStore;
	let patToken: string | undefined;

	function sessionOptions(call: number): vscode.AuthenticationGetSessionOptions | undefined {
		return getSession.getCall(call).args[2] as vscode.AuthenticationGetSessionOptions | undefined;
	}

	beforeEach(function () {
		sinon = createSandbox();
		patToken = undefined;
		getSession = sinon.stub(vscode.authentication, 'getSession').resolves(undefined);
		showErrorMessage = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
		sinon.stub(azdev.WebApi.prototype, 'connect').resolves({ authenticatedUser: { id: 'user-1' } } as never);

		const getConfiguration = vscode.workspace.getConfiguration.bind(vscode.workspace);
		sinon.stub(vscode.workspace, 'getConfiguration').callsFake((section?: string) => {
			if (section !== SETTINGS_NAMESPACE) {
				return getConfiguration(section);
			}
			const values: Record<string, string | undefined> = {
				orgUrl: 'https://dev.azure.com/fake-org',
				patToken,
			};
			return ({ get: (key: string) => values[key] } as unknown) as vscode.WorkspaceConfiguration;
		});

		store = new CredentialStore(new MockTelemetry(), createFakeSecretStorage(), new GitApiImpl());
	});

	afterEach(function () {
		store.dispose();
		sinon.restore();
	});

	it('does not prompt when signing in in the background', async function () {
		await store.initialize();

		assert.equal(getSession.callCount, 1);
		assert.equal(isPrompting(sessionOptions(0)), false);
		assert.equal(store.isAuthenticated(), false);
	});

	it('does not offer "Try again" when a background sign-in fails', async function () {
		getSession.rejects(new Error('network_error: Network request failed'));

		await store.initialize();

		assert.equal(showErrorMessage.callCount, 0);
	});

	it('still offers "Try again" when a PAT sign-in fails', async function () {
		patToken = 'bad-pat';
		(azdev.WebApi.prototype.connect as SinonStub).rejects(new Error('401 Unauthorized'));

		await store.initialize();

		assert.equal(showErrorMessage.callCount, 1);
	});

	it('prompts only for the explicit sign-in, then goes back to background', async function () {
		getSession.resolves(SESSION);
		const found = sinon.spy();
		store.onDidFindSession(found);

		await store.forceAuthentication();
		await store.initialize();

		assert.equal(sessionOptions(0)?.createIfNone, true);
		assert.equal(isPrompting(sessionOptions(1)), false);
		assert.ok(store.getHub(), 'expected to be signed in');
		// Reusing a session fires no onDidChangeSessions, so the store must announce it.
		assert.equal(found.callCount, 1);
	});

	it('finds a session another window signed in when the window gains focus', async function () {
		await store.initialize();
		getSession.resetHistory();
		getSession.resolves(SESSION);
		const found = sinon.spy();
		store.onDidFindSession(found);

		await ((store as unknown) as { checkForSession(): Promise<void> }).checkForSession();

		assert.deepEqual(sessionOptions(0), { silent: true });
		assert.equal(found.callCount, 1);
	});

	it('looks again a minute after a failed sign-in, for the window that never refocuses', async function () {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		await store.initialize();
		getSession.resolves(SESSION);
		const found = sinon.spy();
		store.onDidFindSession(found);

		clock.tick(60_000);
		// The timer only starts the async check; let it settle (setImmediate is not faked).
		await new Promise(resolve => setImmediate(resolve));

		assert.equal(found.callCount, 1);
	});

	it('does not look for a session on focus after an explicit sign-out', async function () {
		await store.logout();
		getSession.resetHistory();

		await ((store as unknown) as { checkForSession(): Promise<void> }).checkForSession();

		assert.equal(getSession.callCount, 0);
	});
});
