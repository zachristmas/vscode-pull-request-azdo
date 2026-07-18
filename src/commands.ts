/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as pathLib from 'path';
import { GitPullRequestCommentThread, GitPullRequestMergeStrategy } from 'azure-devops-node-api/interfaces/GitInterfaces';
import * as vscode from 'vscode';
import { GitErrorCodes } from './api/api1';
import { CredentialStore } from './azdo/credentials';
import { FolderRepositoryManager } from './azdo/folderRepositoryManager';
import { PullRequest, PullRequestVote } from './azdo/interface';
import { GHPRComment, GHPRCommentThread, TemporaryComment } from './azdo/prComment';
import { PullRequestModel } from './azdo/pullRequestModel';
import { PullRequestOverviewPanel } from './azdo/pullRequestOverview';
import { RepositoriesManager } from './azdo/repositoriesManager';
import { AzdoUserManager } from './azdo/userManager';
import { getPositionFromThread } from './azdo/utils';
import { AzdoWorkItem } from './azdo/workItem';
import { CommentReply, resolveCommentHandler } from './commentHandlerResolver';
import { buildPullRequestDeepLink, deepLinkParamsFromPullRequest } from './common/deepLink';
import { DiffChangeType } from './common/diffHunk';
import { getZeroBased } from './common/diffPositionMapping';
import { GitChangeType } from './common/file';
import Logger from './common/logger';
import { ITelemetry } from './common/telemetry';
import { asImageDataURI, fromPRUri, fromReviewUri, ReviewUriParams } from './common/uri';
import { formatError, gitErrorCode } from './common/utils';
import { SETTINGS_NAMESPACE, URI_SCHEME_PR, URI_SCHEME_REVIEW } from './constants';
import { PullRequestsTreeDataProvider } from './view/prsTreeDataProvider';
import { ReviewManager } from './view/reviewManager';
import { CommitNode } from './view/treeNodes/commitNode';
import { DescriptionNode } from './view/treeNodes/descriptionNode';
import { GitFileChangeNode, InMemFileChangeNode, RemoteFileChangeNode } from './view/treeNodes/fileChangeNode';
import { PRNode } from './view/treeNodes/pullRequestNode';

const _onDidUpdatePR = new vscode.EventEmitter<PullRequest | void>();
export const onDidUpdatePR: vscode.Event<PullRequest | void> = _onDidUpdatePR.event;

function ensurePR(folderRepoManager: FolderRepositoryManager, pr?: PRNode | PullRequestModel): PullRequestModel {
	// If the command is called from the command palette, no arguments are passed.
	if (!pr) {
		if (!folderRepoManager.activePullRequest) {
			vscode.window.showErrorMessage('Unable to find current pull request.');
			throw new Error('Unable to find current pull request.');
		}

		return folderRepoManager.activePullRequest;
	} else {
		return pr instanceof PRNode ? pr.pullRequestModel : pr;
	}
}

async function chooseItem<T>(
	activePullRequests: T[],
	propertyGetter: (itemValue: T) => string,
	placeHolder?: string,
): Promise<T | undefined> {
	if (activePullRequests.length === 1) {
		return activePullRequests[0];
	}
	interface Item extends vscode.QuickPickItem {
		itemValue: T;
	}
	const items: Item[] = activePullRequests.map(currentItem => {
		return {
			label: propertyGetter(currentItem),
			itemValue: currentItem,
		};
	});
	return (await vscode.window.showQuickPick(items, { placeHolder }))?.itemValue;
}

/**
 * Resolve the target pull request for a command that may be invoked from the tree (PRNode or
 * DescriptionNode arg), directly (PullRequestModel arg), or from the command palette with no arg
 * (falls back to the checked-out PR across all folder managers).
 */
async function resolveTargetPullRequest(
	reposManager: RepositoriesManager,
	pr?: PRNode | DescriptionNode | PullRequestModel,
): Promise<PullRequestModel | undefined> {
	if (pr) {
		return pr instanceof PRNode || pr instanceof DescriptionNode ? pr.pullRequestModel : pr;
	}
	const activePullRequests: PullRequestModel[] = reposManager.folderManagers
		.map(folderManager => folderManager.activePullRequest!)
		.filter(activePR => !!activePR);
	return chooseItem<PullRequestModel>(
		activePullRequests,
		itemValue => `${itemValue.getPullRequestId()}: ${itemValue.item.title}`,
		'Pull request',
	);
}

interface PullRequestFileTarget {
	pullRequest: PullRequestModel;
	fileName: string;
}

/**
 * Resolve the {pull request, file} pair a file-scoped command targets: a PR tree file node when
 * invoked from a context menu, otherwise the active editor (a pr_azdo diff editor, a review_azdo
 * editor, or a plain file inside a repo with a checked-out PR).
 */
async function resolvePullRequestFileTarget(
	reposManager: RepositoriesManager,
	node?: RemoteFileChangeNode | GitFileChangeNode | InMemFileChangeNode,
): Promise<PullRequestFileTarget | undefined> {
	if (node) {
		return { pullRequest: node.pullRequest, fileName: node.fileName };
	}

	const editorUri = vscode.window.activeTextEditor?.document.uri;
	if (!editorUri) {
		return undefined;
	}

	if (editorUri.scheme === URI_SCHEME_PR) {
		const params = fromPRUri(editorUri);
		if (!params) {
			return undefined;
		}
		for (const folderManager of reposManager.folderManagers) {
			const azdoRepo = folderManager.azdoRepositories.find(repo => repo.remote.remoteName === params.remoteName);
			if (!azdoRepo) {
				continue;
			}
			const active = folderManager.activePullRequest;
			const pullRequest =
				active?.getPullRequestId() === params.prNumber
					? active
					: await folderManager.resolvePullRequest(
							azdoRepo.remote.owner,
							azdoRepo.remote.repositoryName,
							params.prNumber,
					  );
			if (pullRequest) {
				return { pullRequest, fileName: params.fileName };
			}
		}
		return undefined;
	}

	if (editorUri.scheme === URI_SCHEME_REVIEW) {
		const pullRequest = reposManager.getManagerForFile(editorUri)?.activePullRequest;
		return pullRequest ? { pullRequest, fileName: fromReviewUri(editorUri).path } : undefined;
	}

	if (editorUri.scheme === 'file') {
		const folderManager = reposManager.getManagerForFile(editorUri);
		const pullRequest = folderManager?.activePullRequest;
		if (!pullRequest) {
			return undefined;
		}
		const relative = pathLib.relative(folderManager!.repository.rootUri.fsPath, editorUri.fsPath);
		return { pullRequest, fileName: `/${relative.split(pathLib.sep).join('/')}` };
	}

	return undefined;
}

/**
 * Cast an ADO reviewer vote on the resolved target PR. All plumbing (submitVote + refresh) already
 * exists; the vote commands are thin wrappers so approving is a single palette/tree action.
 */
async function submitVoteToPullRequest(
	reposManager: RepositoriesManager,
	pr: PRNode | PullRequestModel | undefined,
	vote: PullRequestVote,
): Promise<void> {
	const pullRequestModel = await resolveTargetPullRequest(reposManager, pr);
	if (!pullRequestModel) {
		return;
	}
	try {
		await pullRequestModel.submitVote(vote);
		vscode.commands.executeCommand('azdopr.refreshList');
		PullRequestOverviewPanel.refresh();
		_onDidUpdatePR.fire();
	} catch (e) {
		vscode.window.showErrorMessage(`Voting on pull request failed. ${formatError(e)}`);
	}
}

export function registerCommands(
	context: vscode.ExtensionContext,
	reposManager: RepositoriesManager,
	reviewManagers: ReviewManager[],
	workItem: AzdoWorkItem,
	azdoUserManager: AzdoUserManager,
	telemetry: ITelemetry,
	credentialStore: CredentialStore,
	tree: PullRequestsTreeDataProvider,
) {
	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.signout', async () => {
			credentialStore.logout();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'azdopr.openPullRequestInAzdo',
			async (e: PRNode | DescriptionNode | PullRequestModel) => {
				if (!e) {
					const activePullRequests: PullRequestModel[] = reposManager.folderManagers
						.map(folderManager => folderManager.activePullRequest!)
						.filter(activePR => !!activePR);

					if (activePullRequests.length >= 1) {
						const result = await chooseItem<PullRequestModel>(activePullRequests, itemValue => itemValue.url);
						if (result) {
							vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(result.url));
						}
					}
				} else if (e instanceof PRNode || e instanceof DescriptionNode) {
					vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(e.pullRequestModel.url));
				} else {
					vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(e.url));
				}

				/* __GDPR__
			"pr.openInAzdo" : {}
		*/
				telemetry.sendTelemetryEvent('azdopr.openInAzdo');
			},
		),
	);

	const createPullRequestForActiveFolder = async (draft: boolean) => {
		if (reposManager.folderManagers.length === 0) {
			vscode.window.showErrorMessage('No repository with an Azure DevOps remote is open.');
			return;
		}
		const folderManager = await chooseItem<FolderRepositoryManager>(
			reposManager.folderManagers,
			itemValue => pathLib.basename(itemValue.repository.rootUri.fsPath),
			'Select the repository to create the pull request from',
		);
		if (!folderManager) {
			return;
		}
		const reviewManager = ReviewManager.getReviewManagerForFolderManager(reviewManagers, folderManager);
		if (!reviewManager) {
			vscode.window.showErrorMessage('No review manager was found for the selected repository.');
			return;
		}
		await reviewManager.createPullRequest(draft);
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.createPullRequest', async () => {
			await createPullRequestForActiveFolder(false);

			/* __GDPR__
			"azdopr.createPullRequest" : {}
		*/
			telemetry.sendTelemetryEvent('azdopr.createPullRequest');
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.createDraftPullRequest', async () => {
			await createPullRequestForActiveFolder(true);

			/* __GDPR__
			"azdopr.createDraftPullRequest" : {}
		*/
			telemetry.sendTelemetryEvent('azdopr.createDraftPullRequest');
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'azdopr.copyPullRequestUrl',
			async (e?: PRNode | DescriptionNode | PullRequestModel) => {
				const pullRequestModel = await resolveTargetPullRequest(reposManager, e);
				if (!pullRequestModel) {
					return;
				}
				await vscode.env.clipboard.writeText(pullRequestModel.url);
				vscode.window.showInformationMessage('Pull request URL copied to clipboard.');

				/* __GDPR__
			"azdopr.copyPullRequestUrl" : {}
		*/
				telemetry.sendTelemetryEvent('azdopr.copyPullRequestUrl');
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'azdopr.copyVscodeDeepLink',
			async (e?: PRNode | DescriptionNode | PullRequestModel) => {
				const pullRequestModel = await resolveTargetPullRequest(reposManager, e);
				if (!pullRequestModel) {
					return;
				}
				const params = deepLinkParamsFromPullRequest(pullRequestModel);
				if (!params) {
					vscode.window.showErrorMessage(
						'Unable to build a deep link: the organization or project of this pull request could not be determined.',
					);
					return;
				}
				await vscode.env.clipboard.writeText(buildPullRequestDeepLink(params));
				vscode.window.showInformationMessage('VS Code deep link copied to clipboard.');

				/* __GDPR__
			"azdopr.copyVscodeDeepLink" : {}
		*/
				telemetry.sendTelemetryEvent('azdopr.copyVscodeDeepLink');
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'azdopr.copyFileLinkInPullRequest',
			async (e?: RemoteFileChangeNode | GitFileChangeNode | InMemFileChangeNode) => {
				const target = await resolvePullRequestFileTarget(reposManager, e);
				if (!target) {
					vscode.window.showErrorMessage(
						'Copy File Link needs a pull request diff editor or a pull request file node to work on.',
					);
					return;
				}
				const filePath = target.fileName.startsWith('/') ? target.fileName : `/${target.fileName}`;
				await vscode.env.clipboard.writeText(`${target.pullRequest.url}?_a=files&path=${encodeURIComponent(filePath)}`);
				// The ADO PR files view has no verified line-anchor URL params (couldn't be confirmed against
				// the live org, 2026-07-18), so the link targets the file's diff rather than a selected line.
				const hasSelection = !e && vscode.window.activeTextEditor?.selection.isEmpty === false;
				vscode.window.showInformationMessage(
					hasSelection
						? 'File diff link copied. The AzDO pull request files view has no line anchors, so the link opens the file, not the selected line.'
						: 'File diff link copied to clipboard.',
				);

				/* __GDPR__
			"azdopr.copyFileLinkInPullRequest" : {}
		*/
				telemetry.sendTelemetryEvent('azdopr.copyFileLinkInPullRequest');
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdoreview.suggestDiff', async e => {
			try {
				const folderManager = await chooseItem<FolderRepositoryManager>(reposManager.folderManagers, itemValue =>
					pathLib.basename(itemValue.repository.rootUri.fsPath),
				);
				if (!folderManager || !folderManager.activePullRequest) {
					return;
				}

				const { indexChanges, workingTreeChanges } = folderManager.repository.state;

				if (!indexChanges.length) {
					if (workingTreeChanges.length) {
						const stageAll = await vscode.window.showWarningMessage(
							'There are no staged changes to suggest.\n\nWould you like to automatically stage all your of changes and suggest them?',
							{ modal: true },
							'Yes',
						);
						if (stageAll === 'Yes') {
							await vscode.commands.executeCommand('git.stageAll');
						} else {
							return;
						}
					} else {
						vscode.window.showInformationMessage('There are no changes to suggest.');
						return;
					}
				}

				const diff = await folderManager.repository.diff(true);

				let suggestEditMessage = '';
				if (e && e.inputBox && e.inputBox.value) {
					suggestEditMessage = `${e.inputBox.value}\n`;
					e.inputBox.value = '';
				}

				const suggestEditText = `${suggestEditMessage}\`\`\`diff\n${diff}\n\`\`\``;
				await folderManager.activePullRequest.createThread(suggestEditText);

				// Reset HEAD and then apply reverse diff
				await vscode.commands.executeCommand('git.unstageAll');

				const tempFilePath = pathLib.join(
					folderManager.repository.rootUri.path,
					'.git',
					`${folderManager.activePullRequest.getPullRequestId()}.diff`,
				);
				const encoder = new TextEncoder();
				const tempUri = vscode.Uri.file(tempFilePath);

				await vscode.workspace.fs.writeFile(tempUri, encoder.encode(diff));
				await folderManager.repository.apply(tempUri.fsPath, true);
				await vscode.workspace.fs.delete(tempUri);
			} catch (err) {
				Logger.appendLine(`Applying patch failed: ${err}`);
				vscode.window.showErrorMessage(`Applying patch failed: ${formatError(err)}`);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.openFileInAzdo', (e: GitFileChangeNode) => {
			vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(e.blobUrl!));
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.copyCommitHash', (e: CommitNode) => {
			vscode.env.clipboard.writeText(e.sha);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.openOriginalFile', async (e: GitFileChangeNode) => {
			// if this is an image, encode it as a base64 data URI
			const folderManager = reposManager.getManagerForPullRequestModel(e.pullRequest);
			if (folderManager) {
				const imageDataURI = await asImageDataURI(e.parentFilePath, folderManager.repository);
				vscode.commands.executeCommand('vscode.open', imageDataURI || e.parentFilePath);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.openModifiedFile', (e: GitFileChangeNode) => {
			vscode.commands.executeCommand('vscode.open', e.filePath);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'azdopr.openDiffView',
			async (fileChangeNode: GitFileChangeNode | InMemFileChangeNode) => {
				const folderManager = reposManager.getManagerForPullRequestModel(fileChangeNode.pullRequest);
				if (!folderManager) {
					return;
				}
				await fileChangeNode.openDiff(folderManager);
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.deleteLocalBranch', async (e: PRNode) => {
			const folderManager = reposManager.getManagerForPullRequestModel(e.pullRequestModel);
			if (!folderManager) {
				return;
			}
			const pullRequestModel = ensurePR(folderManager, e);
			const DELETE_BRANCH_FORCE = 'delete branch (even if not merged)';
			let error = null;

			try {
				await folderManager.deleteLocalPullRequest(pullRequestModel);
			} catch (e) {
				if (gitErrorCode(e) === GitErrorCodes.BranchNotFullyMerged) {
					const action = await vscode.window.showErrorMessage(
						`The branch '${pullRequestModel.localBranchName}' is not fully merged, are you sure you want to delete it? `,
						DELETE_BRANCH_FORCE,
					);

					if (action !== DELETE_BRANCH_FORCE) {
						return;
					}

					try {
						await folderManager.deleteLocalPullRequest(pullRequestModel, true);
					} catch (e) {
						error = e;
					}
				} else {
					error = e;
				}
			}

			if (error) {
				/* __GDPR__
				"pr.deleteLocalPullRequest.failure" : {
					"message" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" }
				}
			*/
				telemetry.sendTelemetryErrorEvent('azdopr.deleteLocalPullRequest.failure', {
					message: formatError(error),
				});
				await vscode.window.showErrorMessage(`Deleting local pull request branch failed: ${formatError(error)}`);
			} else {
				/* __GDPR__
				"pr.deleteLocalPullRequest.success" : {}
			*/
				telemetry.sendTelemetryEvent('azdopr.deleteLocalPullRequest.success');
				// fire and forget
				vscode.commands.executeCommand('azdopr.refreshList');
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.checkoutById', async () => {
			const input = await vscode.window.showInputBox({
				prompt: vscode.l10n.t('Pull request ID to checkout'),
				placeHolder: vscode.l10n.t('e.g. 5994'),
				validateInput: (v: string) =>
					/^\d+$/.test(v.trim()) ? undefined : vscode.l10n.t('Enter a numeric pull request ID'),
			});
			if (!input) {
				return;
			}
			const id = Number(input.trim());
			for (const folderManager of reposManager.folderManagers) {
				for (const azdoRepo of folderManager.azdoRepositories) {
					const pullRequestModel = await azdoRepo.getPullRequest(id);
					if (pullRequestModel) {
						return vscode.commands.executeCommand('azdopr.pick', pullRequestModel);
					}
				}
			}
			vscode.window.showErrorMessage(
				vscode.l10n.t('Pull request {0} was not found in any repository in this workspace.', id),
			);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.pick', async (pr: PRNode | DescriptionNode | PullRequestModel) => {
			let pullRequestModel: PullRequestModel;

			pullRequestModel = pr instanceof PRNode || pr instanceof DescriptionNode ? pr.pullRequestModel : pr;

			const fromDescriptionPage = pr instanceof PullRequestModel;
			/* __GDPR__
			"pr.checkout" : {
				"fromDescriptionPage" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
			telemetry.sendTelemetryEvent('azdopr.checkout', { fromDescription: fromDescriptionPage.toString() });

			return vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.SourceControl,
					title: `Switching to Pull Request #${pullRequestModel.getPullRequestId()}`,
				},
				async (_progress, _token) => {
					await ReviewManager.getReviewManagerForRepository(reviewManagers, pullRequestModel.azdoRepository)?.switch(
						pullRequestModel,
					);
				},
			);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.exit', async (pr: PRNode | DescriptionNode | PullRequestModel) => {
			let pullRequestModel: PullRequestModel;

			pullRequestModel = pr instanceof PRNode || pr instanceof DescriptionNode ? pr.pullRequestModel : pr;

			const fromDescriptionPage = pr instanceof PullRequestModel;
			/* __GDPR__
			"azdopr.exit" : {
				"fromDescriptionPage" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
			telemetry.sendTelemetryEvent('azdopr.exit', { fromDescription: fromDescriptionPage.toString() });

			return vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.SourceControl,
					title: `Exiting Pull Request`,
				},
				async (_progress, _token) => {
					const branch = await pullRequestModel.azdoRepository.getDefaultBranch();
					const manager = reposManager.getManagerForPullRequestModel(pullRequestModel);
					if (manager) {
						manager.checkoutDefaultBranch(branch);
					}
				},
			);
		}),
	);

	context.subscriptions.push(
		// AC-03: FolderRepositoryManager.mergePullRequest is a commented-out stub. Complete the PR via
		// the working PullRequestModel.completePullRequest path; the strategy quick-pick doubles as the
		// confirmation step.
		vscode.commands.registerCommand('azdopr.merge', async (pr?: PRNode | PullRequestModel) => {
			const pullRequestModel = await resolveTargetPullRequest(reposManager, pr);
			if (!pullRequestModel) {
				return;
			}
			const strategyItems: (vscode.QuickPickItem & { strategy: GitPullRequestMergeStrategy })[] = [
				{ label: 'Create Merge Commit', strategy: GitPullRequestMergeStrategy.NoFastForward },
				{ label: 'Squash Commit', strategy: GitPullRequestMergeStrategy.Squash },
				{ label: 'Rebase and Fast Forward', strategy: GitPullRequestMergeStrategy.Rebase },
				{ label: 'Semi-Linear Merge', strategy: GitPullRequestMergeStrategy.RebaseMerge },
			];
			const picked = await vscode.window.showQuickPick(strategyItems, {
				placeHolder: `Select a merge strategy to complete pull request #${pullRequestModel.getPullRequestId()}`,
			});
			if (!picked) {
				return;
			}
			// item 4: the strategy quick-pick above mentions only the merge method, but completing also
			// deletes the source branch and completes linked work items. Disclose both before doing it.
			const confirmation = await vscode.window.showInformationMessage(
				`Complete pull request #${pullRequestModel.getPullRequestId()} using ${
					picked.label
				}? This will delete the source branch and complete any linked work items.`,
				{ modal: true },
				'Complete',
			);
			if (confirmation !== 'Complete') {
				return;
			}
			try {
				const result = await pullRequestModel.completePullRequest({
					deleteSourceBranch: true,
					transitionWorkItems: true,
					mergeStrategy: picked.strategy,
				});
				if (result.closedBy === undefined) {
					vscode.window.showErrorMessage(`Completing pull request failed. ${result.mergeFailureMessage ?? ''}`);
					return;
				}
				vscode.commands.executeCommand('azdopr.refreshList');
				PullRequestOverviewPanel.refresh();
				_onDidUpdatePR.fire();
			} catch (e) {
				vscode.window.showErrorMessage(`Unable to complete pull request. ${formatError(e)}`);
			}
		}),
	);

	// VOTE-01: vote on the checked-out PR or a selected PR tree node without opening the description webview.
	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.approve', (pr?: PRNode | PullRequestModel) =>
			submitVoteToPullRequest(reposManager, pr, PullRequestVote.APPROVED),
		),
		vscode.commands.registerCommand('azdopr.approveWithSuggestions', (pr?: PRNode | PullRequestModel) =>
			submitVoteToPullRequest(reposManager, pr, PullRequestVote.APPROVED_WITH_SUGGESTION),
		),
		vscode.commands.registerCommand('azdopr.waitForAuthor', (pr?: PRNode | PullRequestModel) =>
			submitVoteToPullRequest(reposManager, pr, PullRequestVote.WAITING_FOR_AUTHOR),
		),
		vscode.commands.registerCommand('azdopr.reject', (pr?: PRNode | PullRequestModel) =>
			submitVoteToPullRequest(reposManager, pr, PullRequestVote.REJECTED),
		),
		vscode.commands.registerCommand('azdopr.resetVote', (pr?: PRNode | PullRequestModel) =>
			submitVoteToPullRequest(reposManager, pr, PullRequestVote.NO_VOTE),
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.vote', async (pr?: PRNode | PullRequestModel) => {
			const pullRequestModel = await resolveTargetPullRequest(reposManager, pr);
			if (!pullRequestModel) {
				return;
			}
			const currentUserId = reposManager.getManagerForPullRequestModel(pullRequestModel)?.getCurrentUser().id;
			const currentVote =
				pullRequestModel.item.reviewers?.find(r => r.id === currentUserId)?.vote ?? PullRequestVote.NO_VOTE;
			const options: { label: string; vote: PullRequestVote }[] = [
				{ label: 'Approve', vote: PullRequestVote.APPROVED },
				{ label: 'Approve with Suggestions', vote: PullRequestVote.APPROVED_WITH_SUGGESTION },
				{ label: 'Wait for Author', vote: PullRequestVote.WAITING_FOR_AUTHOR },
				{ label: 'Reject', vote: PullRequestVote.REJECTED },
				{ label: 'Reset Vote', vote: PullRequestVote.NO_VOTE },
			];
			const items: (vscode.QuickPickItem & { vote: PullRequestVote })[] = options.map(o =>
				o.vote === currentVote ? { ...o, description: '(current vote)' } : o,
			);
			const picked = await vscode.window.showQuickPick(items, {
				placeHolder: `Vote on pull request #${pullRequestModel.getPullRequestId()}`,
			});
			if (!picked) {
				return;
			}
			await submitVoteToPullRequest(reposManager, pullRequestModel, picked.vote);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.readyForReview', async (pr?: PRNode | PullRequestModel) => {
			const pullRequestModel = await resolveTargetPullRequest(reposManager, pr);
			if (!pullRequestModel) {
				return;
			}
			try {
				await pullRequestModel.setReadyForReview(false);
				vscode.commands.executeCommand('azdopr.refreshList');
				PullRequestOverviewPanel.refresh();
				_onDidUpdatePR.fire();
			} catch (e) {
				vscode.window.showErrorMessage(`Marking pull request ready for review failed. ${formatError(e)}`);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.convertToDraft', async (pr?: PRNode | PullRequestModel) => {
			const pullRequestModel = await resolveTargetPullRequest(reposManager, pr);
			if (!pullRequestModel) {
				return;
			}
			const confirmation = await vscode.window.showWarningMessage(
				'Convert this pull request to a draft? Azure DevOps resets all reviewer votes when a PR is marked as draft.',
				{ modal: true },
				'Convert to draft',
			);
			if (confirmation !== 'Convert to draft') {
				return;
			}
			try {
				await pullRequestModel.setReadyForReview(true);
				vscode.commands.executeCommand('azdopr.refreshList');
				PullRequestOverviewPanel.refresh();
				_onDidUpdatePR.fire();
			} catch (e) {
				vscode.window.showErrorMessage(`Converting pull request to draft failed. ${formatError(e)}`);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.close', async (pr?: PRNode | PullRequestModel, message?: string) => {
			let pullRequestModel: PullRequestModel | undefined;
			if (pr) {
				pullRequestModel = pr instanceof PullRequestModel ? pr : pr.pullRequestModel;
			} else {
				const activePullRequests: PullRequestModel[] = reposManager.folderManagers
					.map(folderManager => folderManager.activePullRequest!)
					.filter(activePR => !!activePR);
				pullRequestModel = await chooseItem<PullRequestModel>(
					activePullRequests,
					itemValue => `${itemValue.getPullRequestId()}: ${itemValue.item.title}`,
					'Pull request to close',
				);
			}
			if (!pullRequestModel) {
				return;
			}
			const pullRequest: PullRequestModel = pullRequestModel;
			return vscode.window
				.showWarningMessage(
					`Are you sure you want to abondon this pull request? This will close the pull request without merging.`,
					{ modal: true },
					'Yes',
					'No',
				)
				.then(async value => {
					if (value === 'Yes') {
						try {
							let newComment: GitPullRequestCommentThread | undefined;
							if (message) {
								newComment = await pullRequest.createThread(message);
							}

							const newPR = await pullRequest.abandon();
							vscode.commands.executeCommand('azdopr.refreshList');
							_onDidUpdatePR.fire(newPR);
							return newComment;
						} catch (e) {
							vscode.window.showErrorMessage(`Unable to close pull request. ${formatError(e)}`);
							_onDidUpdatePR.fire();
						}
					}

					_onDidUpdatePR.fire();
				});
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.openDescription', async (argument: DescriptionNode | PullRequestModel) => {
			const pullRequestModel = argument instanceof DescriptionNode ? argument.pullRequestModel : argument;
			const folderManager = reposManager.getManagerForPullRequestModel(pullRequestModel);
			if (!folderManager) {
				return;
			}
			let descriptionNode: DescriptionNode | undefined;
			if (!(argument instanceof DescriptionNode)) {
				// The command came from the palette, status bar, or the create-PR flow. The changes tree
				// may not have produced its DescriptionNode yet (e.g. right after creating a PR), so
				// revealing it is best-effort - the overview panel below opens either way.
				const rootNodes = await ReviewManager.getReviewManagerForFolderManager(
					reviewManagers,
					folderManager,
				)?.changesInPrDataProvider.getChildren();
				const first = rootNodes && rootNodes[0];
				descriptionNode = first instanceof DescriptionNode ? first : undefined;
			} else {
				descriptionNode = argument;
			}
			const pullRequest = ensurePR(folderManager, pullRequestModel);
			descriptionNode?.reveal(descriptionNode, { select: true, focus: true });
			// Create and show a new webview
			PullRequestOverviewPanel.createOrShow(context.extensionPath, folderManager, pullRequest, workItem, azdoUserManager);

			/* __GDPR__
			"azdopr.openDescription" : {}
		*/
			telemetry.sendTelemetryEvent('azdopr.openDescription');
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.refreshDescription', async () => {
			if (PullRequestOverviewPanel.panels.size > 0) {
				PullRequestOverviewPanel.refresh();
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.openDescriptionToTheSide', async (descriptionNode: DescriptionNode) => {
			const folderManager = reposManager.getManagerForPullRequestModel(descriptionNode.pullRequestModel);
			if (!folderManager) {
				return;
			}
			const pr = descriptionNode.pullRequestModel;
			const pullRequest = ensurePR(folderManager, pr);
			descriptionNode.reveal(descriptionNode, { select: true, focus: true });
			// Create and show a new webview
			PullRequestOverviewPanel.createOrShow(
				context.extensionPath,
				folderManager,
				pullRequest,
				workItem,
				azdoUserManager,
				true,
			);

			/* __GDPR__
			"azdopr.openDescriptionToTheSide" : {}
		*/
			telemetry.sendTelemetryEvent('azdopr.openDescriptionToTheSide');
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.viewChanges', async (fileChange: GitFileChangeNode) => {
			if (fileChange.status === GitChangeType.DELETE || fileChange.status === GitChangeType.ADD) {
				// create an empty `review` uri without any path/commit info.
				const emptyFileUri = fileChange.parentFilePath.with({
					query: JSON.stringify({
						path: null,
						commit: null,
					}),
				});

				return fileChange.status === GitChangeType.DELETE
					? vscode.commands.executeCommand(
							'vscode.diff',
							fileChange.parentFilePath,
							emptyFileUri,
							`${fileChange.fileName}`,
							{ preserveFocus: true },
					  )
					: vscode.commands.executeCommand(
							'vscode.diff',
							emptyFileUri,
							fileChange.parentFilePath,
							`${fileChange.fileName}`,
							{ preserveFocus: true },
					  );
			}

			// Show the file change in a diff view.
			const { path, ref, commit, rootPath } = fromReviewUri(fileChange.parentFilePath);
			const previousCommit = `${commit}^`;
			const query: ReviewUriParams = {
				path: path,
				ref: ref,
				commit: previousCommit,
				base: true,
				isOutdated: true,
				rootPath,
			};
			const previousFileUri = fileChange.filePath.with({ query: JSON.stringify(query) });

			const options: vscode.TextDocumentShowOptions = {
				preserveFocus: true,
			};

			if (fileChange.comments && fileChange.comments.length) {
				const sortedOutdatedComments = fileChange.comments
					.filter(comment => getPositionFromThread(comment) === undefined)
					.sort((a, b) => {
						return getPositionFromThread(a)! - getPositionFromThread(b)!;
					});

				if (sortedOutdatedComments.length) {
					const lastHunk = fileChange.diffHunks[fileChange.diffHunks.length - 1];
					// const diffLine =  getDiffLineByPosition(fileChange.diffHunks, sortedOutdatedComments[0].originalPosition!);
					const diffLine = lastHunk.diffLines.at(-1);

					if (diffLine) {
						const lineNumber = Math.max(
							getZeroBased(
								diffLine.type === DiffChangeType.Delete ? diffLine.oldLineNumber : diffLine.newLineNumber,
							),
							0,
						);
						options.selection = new vscode.Range(lineNumber, 0, lineNumber, 0);
					}
				}
			}

			return vscode.commands.executeCommand(
				'vscode.diff',
				previousFileUri,
				fileChange.filePath,
				`${fileChange.fileName} from ${(commit || '').slice(0, 8)}`,
				options,
			);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.signin', async () => {
			await reposManager.authenticate();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.deleteLocalBranchesNRemotes', async () => {
			for (const folderManager of reposManager.folderManagers) {
				await folderManager.deleteLocalBranchesNRemotes();
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.signinAndRefreshList', async () => {
			await vscode.commands.executeCommand('azdopr.signin');
			vscode.commands.executeCommand('azdopr.refreshList');
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.configureRemotes', async () => {
			const { name, publisher } = require('../package.json') as { name: string; publisher: string };
			const extensionId = `${publisher}.${name}`;

			return vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${extensionId} remotes`);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.createComment', async (reply: CommentReply) => {
			/* __GDPR__
			"azdopr.createComment" : {}
		*/
			telemetry.sendTelemetryEvent('azdopr.createComment');
			const handler = resolveCommentHandler(reply.thread);

			if (handler) {
				handler.createOrReplyComment(reply.thread, reply.text);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.changeThreadStatus', async (thread: GHPRCommentThread) => {
			/* __GDPR__
			"azdopr.createComment" : {}
		*/
			telemetry.sendTelemetryEvent('azdopr.changeThreadStatus');
			const handler = resolveCommentHandler(thread);

			if (handler) {
				await handler.changeThreadStatus(thread);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.editComment', async (comment: GHPRComment | TemporaryComment) => {
			/* __GDPR__
			"azdopr.editComment" : {}
		*/
			telemetry.sendTelemetryEvent('azdopr.editComment');
			comment.startEdit();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.cancelEditComment', async (comment: GHPRComment | TemporaryComment) => {
			/* __GDPR__
			"azdopr.cancelEditComment" : {}
		*/
			telemetry.sendTelemetryEvent('azdopr.cancelEditComment');
			comment.cancelEdit();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.saveComment', async (comment: GHPRComment | TemporaryComment) => {
			/* __GDPR__
			"azdopr.saveComment" : {}
		*/
			telemetry.sendTelemetryEvent('azdopr.saveComment');
			const handler = resolveCommentHandler(comment.parent);

			if (handler) {
				await handler.editComment(comment.parent, comment);
			}
		}),
	);

	// context.subscriptions.push(vscode.commands.registerCommand('azdopr.deleteComment', async (comment: GHPRComment | TemporaryComment) => {
	// 	/* __GDPR__
	// 		"azdopr.deleteComment" : {}
	// 	*/
	// 	telemetry.sendTelemetryEvent('azdopr.deleteComment');

	// 	const shouldDelete = await vscode.window.showWarningMessage('Delete comment?', { modal: true }, 'Delete');

	// 	if (shouldDelete === 'Delete') {
	// 		const handler = resolveCommentHandler(comment.parent);

	// 		if (handler) {
	// 			await handler.deleteComment(comment.parent, comment);
	// 		}
	// 	}
	// }));

	context.subscriptions.push(
		vscode.commands.registerCommand('azdoreview.openFile', (value: GitFileChangeNode | vscode.Uri) => {
			const uri = value instanceof GitFileChangeNode ? value.filePath : value;

			const activeTextEditor = vscode.window.activeTextEditor;
			const opts: vscode.TextDocumentShowOptions = {
				preserveFocus: true,
				viewColumn: vscode.ViewColumn.Active,
			};

			// Check if active text editor has same path as other editor. we cannot compare via
			// URI.toString() here because the schemas can be different. Instead we just go by path.
			if (activeTextEditor && activeTextEditor.document.uri.path === uri.path) {
				opts.selection = activeTextEditor.selection;
			}

			vscode.commands.executeCommand('vscode.open', uri, opts);
		}),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.openChangedFile', (value: GitFileChangeNode) => {
			const openDiff = vscode.workspace.getConfiguration().get('git.openDiffOnClick');
			return openDiff
				? vscode.commands.executeCommand('azdopr.openDiffView', value)
				: vscode.commands.executeCommand('azdoreview.openFile', value);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.refreshChanges', _ => {
			reviewManagers.forEach(reviewManager => {
				reviewManager.updateComments();
				PullRequestOverviewPanel.refresh();
				reviewManager.changesInPrDataProvider.refresh();
			});
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.setFileListLayoutAsTree', _ => {
			vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).update('fileListLayout', 'tree', true);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.setFileListLayoutAsFlat', _ => {
			vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).update('fileListLayout', 'flat', true);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.refreshPullRequest', (prNode: PRNode) => {
			const folderManager = reposManager.getManagerForPullRequestModel(prNode.pullRequestModel);
			if (folderManager && prNode.pullRequestModel.equals(folderManager?.activePullRequest)) {
				ReviewManager.getReviewManagerForFolderManager(reviewManagers, folderManager)?.updateComments();
			}

			PullRequestOverviewPanel.refresh();
			tree.refresh(prNode);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.markFileAsViewed', async (treeNode: GitFileChangeNode) => {
			try {
				await treeNode.pullRequest.markFileAsViewed(treeNode.fileName);
			} catch (e) {
				vscode.window.showErrorMessage(`Marked file as viewed failed: ${e}`);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.unmarkFileAsViewed', async (treeNode: GitFileChangeNode) => {
			try {
				await treeNode.pullRequest.unmarkFileAsViewed(treeNode.fileName);
			} catch (e) {
				vscode.window.showErrorMessage(`Marked file as not viewed failed: ${e}`);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('azdopr.applySuggestionWithCopilot', async (commentThread: GHPRCommentThread) => {
			/* __GDPR__
				"pr.applySuggestionWithCopilot" : {}
			*/
			telemetry.sendTelemetryEvent('azdopr.applySuggestionWithCopilot');

			commentThread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
			const messages = commentThread.comments
				.map(comment => {
					const body = comment.body instanceof vscode.MarkdownString ? comment.body.value : comment.body;
					return `- ${comment.author.name}: ${body}`;
				})
				.join('\n');

			await vscode.commands.executeCommand('vscode.editorChat.start', {
				initialRange: commentThread.range,
				message: messages,
				autoSend: true,
			});
		}),
	);
}
