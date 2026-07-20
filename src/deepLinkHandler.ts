import * as vscode from 'vscode';
import { AzdoRepository } from './azdo/azdoRepository';
import { FolderRepositoryManager } from './azdo/folderRepositoryManager';
import { PullRequestModel } from './azdo/pullRequestModel';
import { PullRequestOverviewPanel } from './azdo/pullRequestOverview';
import { parseAzdoRemoteUrl } from './azdo/remoteUrlParser';
import { RepositoriesManager } from './azdo/repositoriesManager';
import { AzdoUserManager } from './azdo/userManager';
import { AzdoWorkItem } from './azdo/workItem';
import { parsePullRequestDeepLink, PullRequestDeepLinkParams } from './common/deepLink';
import Logger from './common/logger';

const ID = 'DeepLinkHandler';

interface DeepLinkTarget {
	folderManager: FolderRepositoryManager;
	azdoRepository: AzdoRepository;
}

// Regex-free so a hostile org URL can't trigger super-linear backtracking.
function trimTrailingSlashes(value: string): string {
	let end = value.length;
	while (end > 0 && value.charAt(end - 1) === '/') {
		end--;
	}
	return value.slice(0, end);
}

// Normalizes both org-url shapes (https://dev.azure.com/<org> and legacy
// https://<org>.visualstudio.com) down to the bare org name for comparison.
function orgNameFromUrl(orgUrl: string): string | undefined {
	const trimmed = trimTrailingSlashes(orgUrl.trim());
	const devAzure = /^https?:\/\/dev\.azure\.com\/([^/]+)$/i.exec(trimmed);
	if (devAzure) {
		try {
			return decodeURIComponent(devAzure[1]).toLowerCase();
		} catch {
			return devAzure[1].toLowerCase();
		}
	}
	const legacy = /^https?:\/\/([^./]+)\.visualstudio\.com(?:\/DefaultCollection)?$/i.exec(trimmed);
	if (legacy) {
		return legacy[1].toLowerCase();
	}
	return undefined;
}

function matchCandidate(
	folderManager: FolderRepositoryManager,
	azdoRepository: AzdoRepository,
	wantedOrg: string,
	wantedRepo: string,
	wantedProject: string,
): { target: DeepLinkTarget; projectMatches: boolean } | undefined {
	const parsed = parseAzdoRemoteUrl(azdoRepository.remote.url);
	if (!parsed) {
		return undefined;
	}
	const org = orgNameFromUrl(parsed.orgUrl) ?? parsed.orgUrl.toLowerCase();
	if (org !== wantedOrg || parsed.repositoryName.toLowerCase() !== wantedRepo) {
		return undefined;
	}
	return {
		target: { folderManager, azdoRepository },
		projectMatches: parsed.projectName.toLowerCase() === wantedProject,
	};
}

function findDeepLinkTarget(reposManager: RepositoriesManager, params: PullRequestDeepLinkParams): DeepLinkTarget | undefined {
	const wantedOrg = orgNameFromUrl(params.orgUrl) ?? trimTrailingSlashes(params.orgUrl.trim()).toLowerCase();
	const wantedRepo = params.repo.toLowerCase();
	const wantedProject = params.project.toLowerCase();

	const candidates: { target: DeepLinkTarget; projectMatches: boolean }[] = [];
	for (const folderManager of reposManager.folderManagers) {
		for (const azdoRepository of folderManager.azdoRepositories) {
			const candidate = matchCandidate(folderManager, azdoRepository, wantedOrg, wantedRepo, wantedProject);
			if (candidate) {
				candidates.push(candidate);
			}
		}
	}

	// Repo names are only unique per project, so prefer an exact project match; a same-named repo
	// in another project of the same org is still a better guess than failing outright.
	return (candidates.find(candidate => candidate.projectMatches) ?? candidates[0])?.target;
}

export async function handleDeepLinkUri(
	uri: vscode.Uri,
	reposManager: RepositoriesManager,
	extensionPath: string,
	workItem: AzdoWorkItem,
	azdoUserManager: AzdoUserManager,
): Promise<void> {
	const params = parsePullRequestDeepLink(uri);
	if (!params) {
		Logger.appendLine(`Ignoring unrecognized deep link: ${uri.toString()}`, ID);
		return;
	}
	Logger.appendLine(`Handling deep link for PR ${params.prNumber} in ${params.repo}`, ID);

	const target = findDeepLinkTarget(reposManager, params);
	if (!target) {
		// VS Code opened but the repo isn't in any window, so the PR can't be shown here. Rather than
		// dead-end, offer the Azure DevOps web page (the same fallback the redirect page shows).
		const openWeb = 'Open on the web';
		const base = trimTrailingSlashes(params.orgUrl.trim());
		const webUrl = `${base}/${encodeURIComponent(params.project)}/_git/${encodeURIComponent(params.repo)}/pullrequest/${
			params.prNumber
		}`;
		const choice = await vscode.window.showErrorMessage(
			`'${params.repo}' is not active in VS Code, so its pull request can't be opened here. If you closed it in the Source Control view, reopen it (Command Palette: "Git: Reopen Closed Repositories"); otherwise open the folder containing ${params.repo}. Then follow the link again, or open it on the web.`,
			openWeb,
		);
		if (choice === openWeb) {
			await vscode.env.openExternal(vscode.Uri.parse(webUrl));
		}
		return;
	}

	const pullRequest = await target.azdoRepository.getPullRequest(params.prNumber);
	if (!pullRequest) {
		vscode.window.showErrorMessage(`Pull request ${params.prNumber} could not be loaded from '${params.repo}'.`);
		return;
	}

	await PullRequestOverviewPanel.createOrShow(extensionPath, target.folderManager, pullRequest, workItem, azdoUserManager);

	if (params.filePath) {
		try {
			await PullRequestModel.openDiffForFile(target.folderManager, pullRequest, params.filePath, params.line);
		} catch (e) {
			Logger.appendLine(`Deep link file diff failed: ${e}`, ID);
			vscode.window.showWarningMessage(
				`Opened pull request ${params.prNumber}, but the diff for '${params.filePath}' could not be opened.`,
			);
		}
	}
}
