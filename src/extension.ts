/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { LiveShare } from 'vsls/vscode.js';
import { Repository } from './api/api';
import { GitApiImpl } from './api/api1';
import { CredentialStore } from './azdo/credentials';
import { FileReviewedStatusService } from './azdo/fileReviewedStatusService';
import { FolderRepositoryManager, ReposManagerState } from './azdo/folderRepositoryManager';
import { PullRequestOverviewPanel } from './azdo/pullRequestOverview';
import { RepositoriesManager } from './azdo/repositoriesManager';
import { AzdoUserManager } from './azdo/userManager';
import { AzdoWorkItem } from './azdo/workItem';
import { registerCommands } from './commands';
import { parsePullRequestDeepLink, PullRequestDeepLinkParams } from './common/deepLink';
import { LocalStorageService } from './common/localStorageService';
import Logger from './common/logger';
import * as PersistentState from './common/persistentState';
import { Resource } from './common/resources';
import { handler as uriHandler } from './common/uri';
import { onceEvent } from './common/utils';
import { EXTENSION_ID, SETTINGS_NAMESPACE, URI_SCHEME_PR } from './constants';
import { findDeepLinkTarget, handleDeepLinkUri } from './deepLinkHandler';
import { registerBuiltinGitProvider, registerLiveShareGitProvider } from './gitProviders/api';
import { MockGitProvider } from './gitProviders/mockGitProvider';
import { MockRepository } from './gitProviders/mockRepository';
import { FileTypeDecorationProvider } from './view/fileTypeDecorationProvider';
import { getInMemPRContentProvider } from './view/inMemPRContentProvider';
import { PullRequestChangesTreeDataProvider } from './view/prChangesTreeDataProvider';
import { PullRequestsTreeDataProvider } from './view/prsTreeDataProvider';
import { ReviewManager } from './view/reviewManager';
import { ReviewsManager } from './view/reviewsManager';

const aiKey: string = '00000000-0000-0000-0000-000000000000';

const fetch = require('node-fetch');

// The built-in Promise replaces the old es6-promise polyfill.
fetch.Promise = Promise;

// Mutable module state lives in an object so functions mutate properties, not top-level bindings.
// telemetry: created in activate(), read by deactivate().
// deepLinkProcessor: deep links can arrive before init() has built the repositories manager
// (activation is still running, or no repository is open yet). Buffer them and drain once the
// processor is wired up.
const extensionState: {
	telemetry: TelemetryReporter | undefined;
	deepLinkProcessor: ((uri: vscode.Uri) => void) | undefined;
} = { telemetry: undefined, deepLinkProcessor: undefined };

const pendingDeepLinkUris: vscode.Uri[] = [];

// Resolves once repositories have finished loading (so a PR can be resolved), or after a cap so a stuck
// or unauthenticated load never blocks webview restore forever.
function waitForRepositoriesLoaded(reposManager: RepositoriesManager): Promise<void> {
	if (reposManager.state === ReposManagerState.RepositoriesLoaded) {
		return Promise.resolve();
	}
	return new Promise<void>(resolve => {
		const timer = setTimeout(() => {
			listener.dispose();
			resolve();
		}, 20_000);
		const listener = reposManager.onDidChangeState(() => {
			if (reposManager.state !== ReposManagerState.RepositoriesLoaded) {
				return;
			}
			clearTimeout(timer);
			listener.dispose();
			resolve();
		});
	});
}

async function init(
	context: vscode.ExtensionContext,
	git: GitApiImpl,
	credentialStore: CredentialStore,
	repositories: Repository[],
	tree: PullRequestsTreeDataProvider,
	liveshareApiPromise: Promise<LiveShare | undefined>,
	telemetry: TelemetryReporter,
): Promise<void> {
	context.subscriptions.push(Logger);
	Logger.appendLine('Git repository found, initializing review manager and pr tree view.');

	// vscode.authentication.onDidChangeSessions(async e => {
	// 	if (e.provider.id === 'github') {
	// 		await reposManager.clearCredentialCache();
	// 		if (reviewManagers) {
	// 			reviewManagers.forEach(reviewManager => reviewManager.updateState());
	// 		}
	// 	}
	// });

	const localStorageService = new LocalStorageService(context.workspaceState);
	const fileReviewedStatusService = new FileReviewedStatusService(localStorageService);

	vscode.authentication.onDidChangeSessions(async e => {
		if (e.provider.id !== 'microsoft') {
			return;
		}

		await reposManager.clearCredentialCache();
		if (reviewManagers) {
			reviewManagers.forEach(reviewManager => reviewManager.updateState());
		}
	});

	context.subscriptions.push(new FileTypeDecorationProvider());
	// Sort the repositories to match folders in a multiroot workspace (if possible).
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders) {
		repositories = repositories.toSorted((a, b) => {
			let indexA = workspaceFolders.length;
			let indexB = workspaceFolders.length;
			for (let i = 0; i < workspaceFolders.length; i++) {
				if (workspaceFolders[i].uri.toString() === a.rootUri.toString()) {
					indexA = i;
				} else if (workspaceFolders[i].uri.toString() === b.rootUri.toString()) {
					indexB = i;
				}
				if (indexA !== workspaceFolders.length && indexB !== workspaceFolders.length) {
					break;
				}
			}
			return indexA - indexB;
		});
	}

	const workItem = new AzdoWorkItem(credentialStore, telemetry);
	await workItem.ensure();
	context.subscriptions.push(workItem);

	const userManager = new AzdoUserManager(credentialStore, telemetry);
	await userManager.ensure();
	context.subscriptions.push(userManager);
	const folderManagers = repositories.map(
		repository => new FolderRepositoryManager(repository, telemetry, git, credentialStore, fileReviewedStatusService),
	);
	context.subscriptions.push(...folderManagers);
	const reposManager = new RepositoriesManager(folderManagers, credentialStore, telemetry);
	context.subscriptions.push(reposManager);

	liveshareApiPromise.then(api => {
		if (api) {
			// register the pull request provider to suggest PR contacts
			// TODO used by VLSS.
			// api.registerContactServiceProvider('github-pr', new GitHubContactServiceProvider(reposManager));
		}
	});
	const changesTree = new PullRequestChangesTreeDataProvider(context);
	context.subscriptions.push(changesTree);
	const reviewManagers = folderManagers.map(
		folderManager => new ReviewManager(context, folderManager.repository, folderManager, telemetry, changesTree),
	);
	const reviewsManager = new ReviewsManager(context, reposManager, reviewManagers, tree, changesTree, telemetry, git);
	context.subscriptions.push(reviewsManager);
	tree.initialize(reposManager);
	registerCommands(context, reposManager, reviewManagers, workItem, userManager, telemetry, credentialStore, tree);

	const deepLinkProcessor = (uri: vscode.Uri) => {
		handleDeepLinkUri(uri, reposManager, context.extensionPath, workItem, userManager).catch(e => {
			Logger.appendLine(`Handling vscode:// deep link failed: ${e}`);
		});
	};
	extensionState.deepLinkProcessor = deepLinkProcessor;
	const bufferedDeepLinkUris = [...pendingDeepLinkUris];
	pendingDeepLinkUris.length = 0;
	bufferedDeepLinkUris.forEach(uri => deepLinkProcessor(uri));

	// Persist open PR tabs across window reloads: VS Code keeps a placeholder for each open PR webview
	// and calls this serializer on reactivation with the state the webview saved (which includes the PR
	// identity under `restore`). Re-resolve the PR - reusing the deep-link resolver - and re-hydrate the
	// panel it hands back.
	context.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer('PullRequestOverview', {
			async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: { restore?: PullRequestDeepLinkParams }) {
				const params = state?.restore;
				if (!params) {
					panel.dispose();
					return;
				}
				await waitForRepositoriesLoaded(reposManager);
				const target = findDeepLinkTarget(reposManager, params);
				if (!target) {
					panel.dispose();
					return;
				}
				const pr = await target.azdoRepository.getPullRequest(params.prNumber);
				if (!pr) {
					panel.dispose();
					return;
				}
				PullRequestOverviewPanel.revive(panel, context.extensionPath, target.folderManager, pr, workItem, userManager);
			},
		}),
	);
	const layout = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<string>('fileListLayout');
	await vscode.commands.executeCommand('setContext', 'fileListLayout:flat', layout === 'flat');

	// A git repo only becomes a PR-tree node once it has a FolderRepositoryManager. With several nested
	// git repos in one workspace, the git extension opens them in an order that raced the old
	// onDidOpenRepository handler - it waited for a post-open `repo.state.onDidChange` that frequently
	// never fired on reload (the repo opened already settled), so repos like "ECS API" silently dropped
	// out of the tree after every reload. ensureManagerForRepo is idempotent (dedupes by root uri) and
	// the ReviewManager it creates drives the repo's initial load, so we can create eagerly and just
	// reconcile against the full git.repositories list whenever it might have changed.
	const ensureManagerForRepo = (repo: Repository): boolean => {
		const rootUri = repo.rootUri.toString();
		if (reposManager.folderManagers.some(manager => manager.repository.rootUri.toString() === rootUri)) {
			return false;
		}
		const folderManager = new FolderRepositoryManager(repo, telemetry, git, credentialStore, fileReviewedStatusService);
		reposManager.insertFolderManager(folderManager);
		reviewManagers.push(new ReviewManager(context, folderManager.repository, folderManager, telemetry, changesTree));
		// Remotes/PRs may load after the repo opens; refresh the tree when this manager finishes loading
		// so the node appears (and fills in) without another reload.
		context.subscriptions.push(folderManager.onDidChangeRepositories(() => tree.refresh()));
		return true;
	};

	const reconcileRepositories = () => {
		let added = false;
		for (const repo of git.repositories) {
			if (ensureManagerForRepo(repo)) {
				added = true;
			}
		}
		if (added) {
			tree.refresh();
		}
	};

	git.onDidChangeState(() => {
		reconcileRepositories();
		reviewManagers.forEach(reviewManager => reviewManager.updateState());
	});

	git.onDidOpenRepository(repo => {
		if (ensureManagerForRepo(repo)) {
			tree.refresh();
		}
	});

	// Sweep the full repo list now and a few times shortly after activation: the git extension opens
	// nested repos slightly after we initialize, and this catches the stragglers automatically (the
	// reload race) instead of the user having to reload again. All idempotent.
	reconcileRepositories();
	for (const delay of [1500, 5000, 15_000]) {
		const handle = setTimeout(() => reconcileRepositories(), delay);
		context.subscriptions.push(new vscode.Disposable(() => clearTimeout(handle)));
	}

	git.onDidCloseRepository(repo => {
		reposManager.removeRepo(repo);

		const reviewManagerIndex = reviewManagers.findIndex(
			manager => manager.repository.rootUri.toString() === repo.rootUri.toString(),
		);
		if (reviewManagerIndex) {
			const manager = reviewManagers[reviewManagerIndex];
			reviewManagers.splice(reviewManagerIndex);
			manager.dispose();
		}

		tree.refresh();
	});

	await vscode.commands.executeCommand('setContext', 'azdo:initialized', true);
	// TODO Investigate what is intialized in issues
	// const issuesFeatures = new IssueFeatureRegistrar(git, reposManager, reviewManagers, context, telemetry);
	// context.subscriptions.push(issuesFeatures);
	// await issuesFeatures.initialize();

	/* __GDPR__
		"startup" : {}
	*/
	telemetry.sendTelemetryEvent('startup');
}

export async function activate(context: vscode.ExtensionContext): Promise<GitApiImpl> {
	// initialize resources
	Resource.initialize(context);
	const apiImpl = new GitApiImpl();

	const version = vscode.extensions.getExtension(EXTENSION_ID)!.packageJSON.version;
	const telemetry = new TelemetryReporter(EXTENSION_ID, version, aiKey);
	extensionState.telemetry = telemetry;
	context.subscriptions.push(telemetry);

	PersistentState.init(context);

	// The URI handler must be registered during activation (not init) so vscode:// deep links are
	// captured even while repositories are still being discovered.
	context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));
	context.subscriptions.push(
		uriHandler.event(uri => {
			if (extensionState.deepLinkProcessor) {
				extensionState.deepLinkProcessor(uri);
				return;
			}
			pendingDeepLinkUris.push(uri);
			if (apiImpl.repositories.length === 0) {
				// Nothing will drain the queue until a repository opens; tell the user what to do.
				const params = parsePullRequestDeepLink(uri);
				vscode.window.showErrorMessage(
					params
						? `No workspace folder with a clone of '${params.repo}' is open. Open the folder containing ${params.repo} first, then follow the link again.`
						: 'Open a workspace folder containing an Azure DevOps repository first, then follow the link again.',
				);
			}
		}),
	);

	// const session = await registerGithubExtension();

	const builtInGitProvider = await registerBuiltinGitProvider(apiImpl);
	if (builtInGitProvider) {
		context.subscriptions.push(builtInGitProvider);
	} else {
		// Seed the remote here; doing it inside the MockGitProvider constructor made it an async constructor.
		const mockRepository = new MockRepository();
		void mockRepository.addRemote('origin', 'https://anksinha@dev.azure.com/anksinha/test/_git/test');
		const mockGitProvider = new MockGitProvider(mockRepository);
		context.subscriptions.push(apiImpl.registerGitProvider(mockGitProvider));
	}

	const credentialStore = new CredentialStore(telemetry, context.secrets, apiImpl);
	context.subscriptions.push(credentialStore);
	await credentialStore.initialize();

	const liveshareGitProvider = registerLiveShareGitProvider(apiImpl);
	context.subscriptions.push(liveshareGitProvider);
	const liveshareApiPromise = liveshareGitProvider.initialize();

	context.subscriptions.push(apiImpl);

	Logger.appendLine('Looking for git repository');

	const prTree = new PullRequestsTreeDataProvider(telemetry);
	context.subscriptions.push(prTree);

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(URI_SCHEME_PR, getInMemPRContentProvider()),
	);

	if (apiImpl.repositories.length > 0) {
		await init(context, apiImpl, credentialStore, apiImpl.repositories, prTree, liveshareApiPromise, telemetry);
	} else {
		onceEvent(apiImpl.onDidOpenRepository)(r =>
			init(context, apiImpl, credentialStore, [r], prTree, liveshareApiPromise, telemetry),
		);
	}

	return apiImpl;
}

export async function deactivate() {
	if (extensionState.telemetry) {
		extensionState.telemetry.dispose();
	}
}
