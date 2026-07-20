import * as azdev from 'azure-devops-node-api';
import { IRequestHandler } from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import { Identity } from 'azure-devops-node-api/interfaces/IdentitiesInterfaces';
import * as jwt from 'jsonwebtoken';
import * as vscode from 'vscode';
import { IGit } from '../api/api';
import Logger from '../common/logger';
import { parseRepositoryRemotes, Remote } from '../common/remote';
import { ITelemetry } from '../common/telemetry';
import { errorMessage } from '../common/utils';
import { EXTENSION_ID, SETTINGS_NAMESPACE } from '../constants';
import { initAvatarCache } from './avatarCache';
import { parseAzdoRemoteUrl } from './remoteUrlParser';

const PROJECT_SETTINGS = 'projectName';
const ORGURL_SETTINGS = 'orgUrl';
const PATTOKEN_SETTINGS = 'patToken';
const TRY_AGAIN = vscode.l10n.t('Try again?');
const CANCEL = vscode.l10n.t('Cancel');
const ERROR = vscode.l10n.t('Error signing in to Azure DevOps');

class AzdoOrgConfig {
	constructor(public orgUrl: string, public projectName: string) {}
}

// Ordering used by inferOrgConfigFromGitRemote: origin first, then upstream, then the rest.
const rankRemoteForOrgInference = (r: Remote): number => {
	if (r.remoteName === 'origin') {
		return 0;
	}
	return r.remoteName === 'upstream' ? 1 : 2;
};

export class Azdo {
	private _authHandler: IRequestHandler;
	public connection: azdev.WebApi;
	public authenticatedUser: Identity | undefined;

	constructor(
		public orgUrl: string,
		public projectName: string,
		private token: string,
		private isPatTokenAuth: boolean = false,
	) {
		this._authHandler = isPatTokenAuth
			? azdev.getPersonalAccessTokenHandler(token, true)
			: azdev.getBearerHandler(token, true);
		this.connection = this.getNewWebApiClient(this.orgUrl);
	}

	public getNewWebApiClient(orgUrl: string): azdev.WebApi {
		return new azdev.WebApi(orgUrl, this._authHandler);
	}

	public isTokenExpired(): boolean {
		try {
			if (this.isPatTokenAuth) {
				return false;
			}

			const decodedToken = jwt.decode(this.token) as { exp: number };
			if (!decodedToken || !decodedToken.exp) {
				return true;
			}
			const expirationTime = decodedToken.exp * 1000; // Convert to milliseconds
			const currentTime = Date.now();
			const bufferTime = 60 * 1000; // 1 minute in milliseconds

			return currentTime >= expirationTime - bufferTime;
		} catch {
			// If there's an error decoding the token, consider it expired
			return true;
		}
	}
}

export class CredentialStore implements vscode.Disposable {
	static readonly ID = 'AzdoRepository';
	private _azdoAPI: Azdo | undefined;
	private orgConfig: AzdoOrgConfig | undefined;
	private _disposables: vscode.Disposable[];
	private _onDidInitialize: vscode.EventEmitter<void> = new vscode.EventEmitter();
	public readonly onDidInitialize: vscode.Event<void> = this._onDidInitialize.event;
	private _sessionId: string | undefined;
	private _sessionOptions: vscode.AuthenticationGetSessionOptions = { createIfNone: true };

	constructor(
		private readonly _telemetry: ITelemetry,
		private readonly _secretStore: vscode.SecretStorage,
		private readonly _gitAPI: IGit,
	) {
		this._disposables = [];
		this._disposables.push(
			vscode.authentication.onDidChangeSessions(async () => {
				if (!this.isAuthenticated()) {
					return await this.initialize();
				}
			}),
		);
	}

	public async initialize(): Promise<void> {
		this._azdoAPI = await this.login();
	}

	public async reset() {
		this._sessionOptions.forceNewSession = false;
		this._sessionOptions.createIfNone = false;
		this._sessionOptions.clearSessionPreference = false;
		await this.initialize();
	}

	public async forceAuthentication() {
		this._sessionOptions.forceNewSession = true;
		this._sessionOptions.createIfNone = false;
		this._sessionOptions.clearSessionPreference = true;
		await this.initialize();
	}

	public isAuthenticated(): boolean {
		return !!this._azdoAPI && !this._azdoAPI.isTokenExpired();
	}

	public getHub(): Azdo | undefined {
		return this._azdoAPI;
	}

	public async logout(): Promise<void> {
		this._azdoAPI = undefined;
	}

	public inferOrgConfigFromGitRemote(remotes: Remote[]): AzdoOrgConfig | undefined {
		if (remotes.length === 0) {
			Logger.appendLine('Unable to infer org config from git. Repository has no remotes.', CredentialStore.ID);
			return undefined;
		}

		// Prefer origin, then upstream, then anything that parses as an ADO remote
		const ordered = remotes.toSorted((a, b) => rankRemoteForOrgInference(a) - rankRemoteForOrgInference(b));

		for (const remote of ordered) {
			Logger.appendLine('Inferring org config from url: ' + remote.url, CredentialStore.ID);
			const parsed = parseAzdoRemoteUrl(remote.url);
			if (parsed) {
				Logger.appendLine(`Inferred orgUrl: ${parsed.orgUrl}, projectName: ${parsed.projectName}`, CredentialStore.ID);
				return new AzdoOrgConfig(parsed.orgUrl, parsed.projectName);
			}
		}

		Logger.appendLine(
			`Unable to infer org config from git. No remote matched an Azure DevOps URL shape. Remotes: ${remotes
				.map(r => r.remoteName)
				.join(',')}`,
			CredentialStore.ID,
		);
		return undefined;
	}

	public getOrgConfig(): AzdoOrgConfig | undefined {
		const projectName = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<string | undefined>(PROJECT_SETTINGS);
		const orgUrl = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<string | undefined>(ORGURL_SETTINGS);

		// orgUrl is all sign-in needs; the project is optional. Each repository derives its own project
		// from its remote, and repo lookup falls back to an org-wide search when none is set - so a
		// configured orgUrl is enough even with no project. Only infer from git when orgUrl is absent.
		if (orgUrl) {
			return new AzdoOrgConfig(orgUrl, projectName ?? '');
		}

		const remotes = this._gitAPI.repositories.map(r => parseRepositoryRemotes(r));
		const inferredConfigs = remotes
			.map(r => this.inferOrgConfigFromGitRemote(r))
			.filter((c): c is AzdoOrgConfig => !!c && !!c.orgUrl);

		// TODO: Need better way of handling multiple repositories. CredentialStore should be initialized within each FolderRepositoryManager and scoped to particular AzDORepository.
		if (new Set(inferredConfigs.map(a => a.orgUrl)).size !== 1) {
			Logger.appendLine(
				`Unable to infer org config from git. Repository Length: ${
					this._gitAPI.repositories.length
				}. Inferred Configs: ${JSON.stringify(inferredConfigs)}`,
				CredentialStore.ID,
			);
			return undefined;
		}

		// Prefer an inferred config that also carries a project; otherwise the project stays empty.
		const chosen = inferredConfigs.find(c => !!c.projectName) ?? inferredConfigs[0];
		Logger.appendLine(`Selected orgUrl: ${chosen.orgUrl}, projectName: ${chosen.projectName}`, CredentialStore.ID);
		return new AzdoOrgConfig(chosen.orgUrl, chosen.projectName ?? '');
	}

	// When the org can't be determined (no orgUrl setting and no Azure DevOps git remote), ask for the
	// organization URL directly instead of only pointing at Settings, and persist it (globally) so
	// sign-in does not ask again. The project stays optional.
	private async promptForOrgConfig(): Promise<AzdoOrgConfig | undefined> {
		const entered = await vscode.window.showInputBox({
			ignoreFocusOut: true,
			title: 'Azure DevOps Organization URL',
			prompt: 'Enter your Azure DevOps organization URL to sign in',
			placeHolder: 'https://dev.azure.com/your-organization',
			validateInput: value => {
				const trimmed = value.trim();
				if (!trimmed) {
					return 'Organization URL is required';
				}
				return /^https?:\/\/\S+/i.test(trimmed)
					? null
					: 'Enter a full URL, e.g. https://dev.azure.com/your-organization';
			},
		});
		const orgUrl = entered?.trim();
		if (!orgUrl) {
			return undefined;
		}
		await vscode.workspace
			.getConfiguration(SETTINGS_NAMESPACE)
			.update(ORGURL_SETTINGS, orgUrl, vscode.ConfigurationTarget.Global);
		const projectName = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<string>(PROJECT_SETTINGS) ?? '';
		return new AzdoOrgConfig(orgUrl, projectName);
	}

	// Org config from settings or a git remote if possible, otherwise prompt the user for the org URL.
	private async resolveOrgConfig(): Promise<AzdoOrgConfig | undefined> {
		return this.getOrgConfig() ?? (await this.promptForOrgConfig());
	}

	// Missing-org-config error notification with a shortcut into the extension settings.
	private showMissingOrgConfigError(): void {
		vscode.window
			.showErrorMessage(
				vscode.l10n.t(
					'Azure DevOps sign-in failed: could not determine your organization. Set "azdoPullRequests.orgUrl" in settings, or open a folder whose git remote points at an Azure DevOps URL. (The project name is optional.)',
				),
				vscode.l10n.t('Open Settings'),
			)
			.then(choice => {
				if (choice) {
					vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${EXTENSION_ID}`);
				}
			});
	}

	// Resolves the auth token for login: the configured PAT when set, otherwise a Microsoft
	// auth session token. Returns undefined (after logging + telemetry) when neither works.
	private async acquireToken(): Promise<{ token: string; isPatTokenAuth: boolean } | undefined> {
		const patToken = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<string | undefined>(PATTOKEN_SETTINGS);
		if (patToken) {
			return { token: patToken, isPatTokenAuth: true };
		}

		const session = await this.getSession(this._sessionOptions);
		if (!session) {
			Logger.appendLine('Auth> Unable to get session', CredentialStore.ID);
			this._telemetry.sendTelemetryEvent('auth.failed');
			return undefined;
		}

		this._sessionId = session.id;
		const token = await this.getToken(session);

		if (!token) {
			Logger.appendLine('Auth> Unable to get token', CredentialStore.ID);
			this._telemetry.sendTelemetryEvent('auth.failed');
			return undefined;
		}

		return { token, isPatTokenAuth: false };
	}

	public async login(): Promise<Azdo | undefined> {
		/* __GDPR__
			"auth.start" : {}
		*/
		this._telemetry.sendTelemetryEvent('auth.start');

		// Falls back to asking for the org URL when it can't be read from settings or a git remote,
		// rather than dead-ending at an error the user has to translate into a settings edit.
		const orgConfig = await this.resolveOrgConfig();
		if (!orgConfig) {
			Logger.appendLine('Unable to get org config', CredentialStore.ID);
			this._telemetry.sendTelemetryEvent('auth.failed');
			this.showMissingOrgConfigError();
			return undefined;
		}

		let retry: boolean = true;

		while (retry) {
			try {
				const auth = await this.acquireToken();
				if (!auth) {
					return undefined;
				}

				const azdo = new Azdo(orgConfig.orgUrl, orgConfig.projectName, auth.token, auth.isPatTokenAuth);
				const connectionData = await azdo.connection.connect();
				azdo.authenticatedUser = connectionData.authenticatedUser;
				initAvatarCache(azdo.connection);

				Logger.debug(`Auth> Successful: Logged userid: ${azdo?.authenticatedUser?.id}`, CredentialStore.ID);
				this._telemetry.sendTelemetryEvent('auth.success');
				this._sessionOptions.forceNewSession = false;
				this._sessionOptions.createIfNone = true;
				this._sessionOptions.clearSessionPreference = false;

				return azdo;
			} catch (e) {
				Logger.appendLine(`Auth> Failed: ${errorMessage(e)}`, CredentialStore.ID);
				this._telemetry.sendTelemetryEvent('auth.failed');
				if (e instanceof Error && e.stack) {
					Logger.appendLine(e.stack);
				}
				if (errorMessage(e) === 'User canceled authentication') {
					return undefined;
				}
			}

			retry = (await vscode.window.showErrorMessage(ERROR, TRY_AGAIN, CANCEL)) === TRY_AGAIN;
			if (retry) {
				this._sessionOptions.forceNewSession = true;
				this._sessionOptions.createIfNone = false;
				this._sessionOptions.clearSessionPreference = true;
			}
		}
	}

	private async getSession(
		sessionOptions: vscode.AuthenticationGetSessionOptions,
	): Promise<vscode.AuthenticationSession | undefined> {
		return await vscode.authentication.getSession(
			// Specifies the Microsoft Auth Provider
			'microsoft',
			// This GUID is the Azure DevOps GUID and you basically ask for a token that can be used to interact with AzDO. This is publicly documented all over
			['499b84ac-1321-427f-aa17-267ca6975798/.default', 'offline_access'],
			sessionOptions,
		);
	}

	private async getToken(session: vscode.AuthenticationSession): Promise<string | undefined> {
		return session?.accessToken;
	}

	public getAuthenticatedUser(): Identity | undefined {
		return this._azdoAPI?.authenticatedUser;
	}

	dispose() {
		this._disposables.forEach(disposable => disposable.dispose());
	}
}
