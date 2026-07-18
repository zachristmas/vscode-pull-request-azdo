import {
	GitPullRequest,
	GitPullRequestSearchCriteria,
	GitRepository,
	PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { Identity } from 'azure-devops-node-api/interfaces/IdentitiesInterfaces';
import * as vscode from 'vscode';
import { Azdo, CredentialStore } from './credentials';
import { FileReviewedStatusService, FileViewedStatus } from './fileReviewedStatusService';
import { IAccount, IGitHubRef } from './interface';
import { PullRequestModel } from './pullRequestModel';
import { parseAzdoRemoteUrl } from './remoteUrlParser';
import {
	convertAzdoBranchRefToIGitHubRef,
	convertAzdoPullRequestToRawPullRequest,
	convertBranchRefToBranchName,
} from './utils';
import Logger from '../common/logger';
import { parseRemote, Remote } from '../common/remote';
import { ITelemetry } from '../common/telemetry';
import { PRCommentControllerRegistry } from '../view/pullRequestCommentControllerRegistry';

export const PULL_REQUEST_PAGE_SIZE = 20;

export type IMetadata = GitRepository;

export class AzdoRepository implements vscode.Disposable {
	static ID = 'AzdoRepository';
	protected _initialized: boolean = false;
	protected _hub: Azdo | undefined;
	protected _metadata: IMetadata | undefined;
	private _metadataNotFound: boolean = false;
	private _policyTypeMap: Map<string, string> | undefined;
	private _toDispose: vscode.Disposable[] = [];
	public commentsController?: vscode.CommentController;
	public commentsHandler?: PRCommentControllerRegistry;
	public readonly isGitHubDotCom: boolean = false; // TODO: WTF is this for? Enterprise?

	constructor(
		public remote: Remote,
		private readonly _credentialStore: CredentialStore,
		private readonly _fileReviewedStatusService: FileReviewedStatusService,
		private readonly _telemetry: ITelemetry,
	) {
		// this.isGitHubDotCom = remote.host.toLowerCase() === 'github.com';
	}

	public equals(repo: AzdoRepository): boolean {
		return this.remote.equals(repo.remote);
	}

	async ensure(): Promise<AzdoRepository> {
		this._initialized = true;

		if (!this._credentialStore.isAuthenticated()) {
			await this._credentialStore.initialize();
		}
		this._hub = this._credentialStore.getHub();

		return this;
	}

	public get azdo(): Azdo | undefined {
		return this._hub;
	}

	public async ensureCommentsController(): Promise<void> {
		try {
			if (this.commentsController) {
				return;
			}

			await this.ensure();
			this.commentsController = vscode.comments.createCommentController(
				`azdopr-browse-${this.remote.normalizedHost}`,
				`Azdo Pull Request for ${this.remote.normalizedHost}`,
			);
			this.commentsHandler = new PRCommentControllerRegistry(this.commentsController);
			this._toDispose.push(this.commentsController);
		} catch (e) {
			console.log(e);
		}
	}

	dispose() {
		this._toDispose.forEach(d => d.dispose());
	}

	async getMetadata(): Promise<IMetadata | undefined> {
		Logger.debug(`Fetch metadata - enter`, AzdoRepository.ID);
		await this.ensure();
		const gitApi = await this._hub?.connection?.getGitApi();
		if (this._metadata) {
			Logger.debug(`Fetch metadata for repo: ${this._metadata.id}/${this._metadata.name} - cache hit`, AzdoRepository.ID);
			return this._metadata;
		}
		if (this._metadataNotFound) {
			return undefined;
		}

		const repoName = this.remote.repositoryName;
		const parsedRemote = parseAzdoRemoteUrl(this.remote.url);
		const remoteProjectName = parsedRemote?.projectName ?? this._hub?.projectName;
		// Track whether every lookup got a clean answer from the server; only a clean
		// "not found" is cached, a thrown lookup stays retryable.
		let lookupFailed = false;

		if (remoteProjectName) {
			Logger.debug(`Searching for repo ${repoName} in ${remoteProjectName} project`, AzdoRepository.ID);
			try {
				const repos = await gitApi?.getRepositories(remoteProjectName);
				this._metadata = repos?.find(v => v.name?.toLowerCase() === repoName?.toLowerCase());
			} catch (e) {
				lookupFailed = true;
				Logger.appendLine(`Project-scoped repository lookup in '${remoteProjectName}' failed: ${e}`, AzdoRepository.ID);
			}
		}

		if (!this._metadata) {
			// Legacy visualstudio.com remotes and multi-project workspaces can carry a project
			// name that doesn't match this repo (or none at all): fall back to an org-wide search.
			try {
				const repos = await gitApi?.getRepositories();
				const matches = repos?.filter(v => v.name?.toLowerCase() === repoName?.toLowerCase()) ?? [];
				this._metadata =
					matches.find(v => v.project?.name?.toLowerCase() === parsedRemote?.projectName?.toLowerCase()) ??
					matches[0];
			} catch (e) {
				lookupFailed = true;
				Logger.appendLine(`Org-wide repository lookup for '${repoName}' failed: ${e}`, AzdoRepository.ID);
			}
		}

		if (!this._metadata) {
			this._metadataNotFound = !lookupFailed;
			Logger.appendLine(
				`Fetch metadata ${repoName} failed. No repo by that name in project '${remoteProjectName}' or the organization.`,
				AzdoRepository.ID,
			);
			return undefined;
		}
		Logger.debug(`Fetch metadata ${this._metadata?.id}/${this._metadata?.name} - done`, AzdoRepository.ID);
		return this._metadata;
	}

	async getRepositoryId(): Promise<string | undefined> {
		return (await this.getMetadata())?.id;
	}

	private unresolvedRepositoryMessage(): string {
		return `unable to resolve Azure DevOps repository '${this.remote.repositoryName}' for remote '${this.remote.remoteName}' (${this.remote.url})`;
	}

	/**
	 * POL-01: display names for policy types, resolved at runtime rather than hardcoded GUIDs
	 * (ROADMAP Section 4). Cached per-repo instance like `_metadata`.
	 */
	async getPolicyTypeMap(): Promise<Map<string, string>> {
		if (this._policyTypeMap) {
			return this._policyTypeMap;
		}

		const map = new Map<string, string>();
		try {
			await this.ensure();
			const metadata = await this.getMetadata();
			const project = metadata?.project?.id ?? metadata?.project?.name;
			if (!project) {
				// Without a project the route degrades to an org-level call the server rejects;
				// return the empty map uncached so a later call can retry once metadata resolves.
				Logger.appendLine(
					`AzdoRepository> Fetching policy types skipped: ${this.unresolvedRepositoryMessage()}`,
					AzdoRepository.ID,
				);
				return map;
			}
			const policyApi = await this._hub?.connection.getPolicyApi();
			const types = await policyApi?.getPolicyTypes(project);
			if (!types) {
				return map;
			}
			types.forEach(t => {
				if (t.id && t.displayName) {
					map.set(t.id, t.displayName);
				}
			});
		} catch (e) {
			// Cache only successful fetches - a transient failure here used to pin an empty map
			// for the lifetime of the repo instance, hiding policy display names forever.
			Logger.appendLine(`AzdoRepository> Fetching policy types failed: ${e}`, AzdoRepository.ID);
			return map;
		}

		this._policyTypeMap = map;
		return map;
	}

	async resolveRemote(): Promise<void> {
		try {
			Logger.debug(
				`Resolving Remote for remoteName: ${this.remote.remoteName} and gitProtocol: ${this.remote.gitProtocol}`,
				AzdoRepository.ID,
			);
			const metadata = await this.getMetadata();
			Logger.debug(`Resolving Remote for remoteUrl: ${metadata?.remoteUrl}`, AzdoRepository.ID);
			const remote = parseRemote(this.remote.remoteName, metadata?.remoteUrl, this.remote.gitProtocol)!;
			// TODO Disabling this as it fixes #5 Dont know what it does
			// this.remote = remote;
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			remote;
		} catch (e) {
			Logger.appendLine(`Unable to resolve remote: ${e}`, AzdoRepository.ID);
		}
	}

	async getDefaultBranch(): Promise<string> {
		try {
			Logger.debug(`Fetch default branch - enter`, AzdoRepository.ID);
			const metadata = await this.getMetadata();
			Logger.debug(`Fetch default branch - done`, AzdoRepository.ID);

			return convertBranchRefToBranchName(metadata?.defaultBranch || 'refs/heads/main');
		} catch (e) {
			Logger.appendLine(`AzdoRepository> Fetching default branch failed: ${e}`);
		}

		return 'main';
	}

	async getAllActivePullRequests(): Promise<PullRequestModel[]> {
		return await this.getPullRequests({ status: PullRequestStatus.Active });
	}

	async getPullRequestForBranch(branch: string): Promise<PullRequestModel[]> {
		return await this.getPullRequests({ sourceRefName: branch });
	}

	async createPullRequest(pullRequest: GitPullRequest): Promise<PullRequestModel | undefined> {
		Logger.debug(`Creating pull request`, AzdoRepository.ID);
		try {
			const azdo = await this.ensure();
			const metadata = await this.getMetadata();
			if (!metadata?.id) {
				throw new Error(this.unresolvedRepositoryMessage());
			}
			const gitApi = await azdo._hub?.connection?.getGitApi();
			const created = await gitApi?.createPullRequest(pullRequest, metadata.id);
			if (!created) {
				throw new Error('The Azure DevOps API returned no pull request.');
			}
			Logger.debug(`Created pull request ${created.pullRequestId}`, AzdoRepository.ID);
			// Convert like every other read path does: the raw GitPullRequest lacks the head/base
			// refs PullRequestModel.update() needs, so returning it unconverted produced a model
			// that couldn't resolve its branches.
			return new PullRequestModel(
				this._telemetry,
				this,
				this.remote,
				await convertAzdoPullRequestToRawPullRequest(created, this),
			);
		} catch (e) {
			Logger.appendLine(`AzdoRepository> Creating pull request failed: ${e}`);
			return undefined;
		}
	}

	async getPullRequests(search: GitPullRequestSearchCriteria): Promise<PullRequestModel[]> {
		try {
			Logger.debug(`Fetch pull requests for branch - enter`, AzdoRepository.ID);
			const azdo = await this.ensure();
			const metadata = await this.getMetadata();
			if (!metadata?.id) {
				// An empty repositoryId turns the URL into an org-level by-NAME repository
				// reference ("A project name is required...") on the server. Skip quietly:
				// unresolvable remotes (wiki repos, no access) simply have no PRs to show.
				Logger.appendLine(`Fetching pull requests skipped: ${this.unresolvedRepositoryMessage()}`, AzdoRepository.ID);
				return [];
			}
			const gitApi = await azdo._hub?.connection.getGitApi();
			const result = await gitApi?.getPullRequests(metadata.id, search);

			if (!result || result.length === 0) {
				Logger.appendLine(
					`Warning: no result data for ${this.remote.owner}/${
						this.remote.repositoryName
					} for search: ${JSON.stringify(search)}`,
				);
				return [];
			}

			const pullRequests = await Promise.all(
				result.map(async pullRequest => {
					const pr = await convertAzdoPullRequestToRawPullRequest(pullRequest, this);
					return new PullRequestModel(this._telemetry, this, this.remote, pr);
				}),
			);

			Logger.debug(`Fetch pull requests for branch - done`, AzdoRepository.ID);
			return pullRequests;
		} catch (e) {
			Logger.appendLine(`Fetching pull requests for search: ${JSON.stringify(search)} failed: ${e}`, AzdoRepository.ID);
			if ((e as { code?: number }).code === 404) {
				// TODO: not found
				vscode.window.showWarningMessage(
					`Fetching pull requests for remote '${this.remote.remoteName}' failed, please check if the url ${this.remote.url} is valid.`,
				);
				return [];
			} else {
				throw e;
			}
		}
	}

	// async getAuthenticatedUserName(): Promise<string> {
	// 	const user = await this.getAuthenticatedUser();
	// 	return user?.coreAttributes['displayName']?.value;
	// }

	// async getAuthenticatedUser(): Promise<Profile | undefined> {
	// 	try {
	// 		const azdo = await this.ensure();
	// 		// Profile api can't be hit at the org level, has to be hit at the deployment level, so url should be structured like set API_URL=https://vssps.dev.azure.com/{orgName}
	// 		const serverUrl = this.azdo?.orgUrl.replace('://dev.azure.com', '://app.vssps.visualstudio.com') || '';
	// 		console.log(serverUrl)
	// 		const profileApi = await azdo._hub?.connection.getProfileApi('https://app.vssps.visualstudio.com');
	// 		const user = await profileApi?.getProfile('me', true);
	// 		return user;
	// 	} catch (e) {
	// 		console.log(e);
	// 	}
	// }

	async getAuthenticatedUserName(): Promise<string> {
		const user = await this.getAuthenticatedUser();
		return user?.properties['Account']['$value'];
	}

	async getAuthenticatedUser(): Promise<Identity | undefined> {
		const azdo = await this.ensure();
		return azdo._hub?.authenticatedUser;
	}

	async getPullRequest(id: number): Promise<PullRequestModel | undefined> {
		try {
			Logger.debug(`Fetch pull request ${id} - enter`, AzdoRepository.ID);
			const azdo = await this.ensure();
			const gitApi = await azdo._hub?.connection.getGitApi();
			const pullRequest = await gitApi?.getPullRequestById(id);

			if (!pullRequest) {
				Logger.debug(`Fetch pull request ${id} - failed. No PR with such ID`, AzdoRepository.ID);
				return undefined;
			}

			Logger.debug(`Fetch pull request ${id} - done`, AzdoRepository.ID);

			return new PullRequestModel(
				this._telemetry,
				this,
				this.remote,
				await convertAzdoPullRequestToRawPullRequest(pullRequest, this),
			);
		} catch (e) {
			Logger.appendLine(`Azdo> Unable to fetch PR: ${e}`);
			return;
		}
	}

	async getBranchRef(branchName: string): Promise<IGitHubRef | undefined> {
		try {
			Logger.debug(`Get branch for name ${branchName} - enter`, AzdoRepository.ID);
			const azdo = await this.ensure();
			const metadata = await this.getMetadata();
			if (!metadata?.id) {
				throw new Error(this.unresolvedRepositoryMessage());
			}
			const gitApi = await azdo._hub?.connection.getGitApi();
			const branch = await gitApi?.getBranch(metadata.id, branchName);

			if (!branch) {
				Logger.debug(`Get branch for name ${branchName} - failed. No branch with such name`, AzdoRepository.ID);
				return undefined;
			}

			Logger.debug(`Get branch for name ${branchName} - done`, AzdoRepository.ID);
			return convertAzdoBranchRefToIGitHubRef(branch, this.remote.url);
		} catch (e) {
			Logger.appendLine(`Azdo> Unable to fetch PR: ${e}`);
			return {
				ref: branchName,
				repo: { cloneUrl: this.remote.url },
				sha: '',
				exists: false,
			};
		}
	}

	async listBranches(): Promise<string[]> {
		try {
			Logger.debug(`List branches for ${this.remote.owner}/${this.remote.repositoryName} - enter`, AzdoRepository.ID);
			const azdo = await this.ensure();
			const metadata = await this.getMetadata();
			if (!metadata?.id) {
				throw new Error(this.unresolvedRepositoryMessage());
			}
			const gitApi = await azdo._hub?.connection.getGitApi();
			const branches = await gitApi?.getBranches(metadata.id);
			Logger.debug(`List branches for ${this.remote.owner}/${this.remote.repositoryName} - done`, AzdoRepository.ID);
			return branches?.map(branch => branch.name!) ?? [];
		} catch (e) {
			Logger.debug(`List branches for ${this.remote.owner}/${this.remote.repositoryName} failed`, AzdoRepository.ID);
			throw e;
		}
	}

	getFileReviewedStatusForPr(prId: number) {
		return this._fileReviewedStatusService.getFileReviewedStatusForPr(prId);
	}

	setFileReviewedStatusForPr(prId: number, fileViewedStatus: FileViewedStatus) {
		this._fileReviewedStatusService.setFileReviewedStatusForPr(prId, fileViewedStatus);
	}

	async getAssignableUsers(): Promise<IAccount[]> {
		// TODO LATER
		return [];
	}

	async getMentionableUsers(): Promise<IAccount[]> {
		// TODO LATER
		return [];
	}
}
