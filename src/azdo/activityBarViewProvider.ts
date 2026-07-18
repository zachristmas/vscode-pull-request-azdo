/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	GitPullRequestCommentThread,
	GitPullRequestMergeStrategy,
	IdentityRefWithVote,
	PullRequestStatus,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import * as vscode from 'vscode';
import Logger from '../common/logger';
import { formatError } from '../common/utils';
import { getNonce, IRequestMessage, WebviewBase } from '../common/webview';
import { AUTO_COMPLETE_CLEAR_ID, SETTINGS_NAMESPACE } from '../constants';
import { FolderRepositoryManager } from './folderRepositoryManager';
import { MergeMethod, PullRequestCompletion, PullRequestVote, ReviewState } from './interface';
import { PullRequestModel } from './pullRequestModel';
import { getDefaultMergeMethod } from './pullRequestOverview';
import {
	buildCompletionSummary,
	convertBranchRefToBranchName,
	convertIdentityRefWithVoteToReviewer,
	convertRESTUserToAccount,
} from './utils';

export class PullRequestViewProvider extends WebviewBase implements vscode.WebviewViewProvider {
	public static readonly viewType = 'azdo:activePullRequest';

	private _view?: vscode.WebviewView;

	private _existingReviewers!: ReviewState[];

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _folderRepositoryManager: FolderRepositoryManager,
		private _item: PullRequestModel,
	) {
		super();
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;
		this._webview = webviewView.webview;
		super.initialize();

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [this._extensionUri],
		};

		webviewView.webview.html = this._getHtmlForWebview();

		this.updatePullRequest(this._item);
	}

	protected async _onDidReceiveMessage(message: IRequestMessage<any>) {
		const result = await super._onDidReceiveMessage(message);
		if (result !== this.MESSAGE_UNHANDLED) {
			return;
		}

		switch (message.command) {
			case 'alert':
				vscode.window.showErrorMessage(message.args);
				return;
			case 'azdopr.close':
				return this.close(message);
			// case 'pr.comment':
			// 	return this.createComment(message);
			case 'azdopr.merge':
				return this.mergePullRequest(message);
			case 'azdopr.readyForReview':
				return this.setReadyForReview(message, false);
			case 'azdopr.convertToDraft':
				return this.setReadyForReview(message, true);
			case 'pr.deleteBranch':
				return this.deleteBranch(message);
			case 'pr.approve':
				return this.approvePullRequest(message);
			case 'pr.vote':
				return this.votePullRequest(message);
			case 'pr.set-autocomplete':
				return this.setAutoComplete(message);
			case 'pr.submit':
				return this.submitReview(message);
			case 'pr.checkMergeability':
				return this._replyMessage(message, await this._item.getMergability());
			// See pullRequestOverview.ts: guard the throwing fetches so a failure rejects the webview
			// promise instead of leaving it (and the requeue button) hung forever. (item 1b)
			case 'pr.checkStatus':
				try {
					return await this._replyMessage(message, await this._item.getStatusChecks());
				} catch (e) {
					return this._throwError(message, formatError(e));
				}
			case 'pr.checkPolicies':
				// Exempt: getPolicyEvaluations swallows its own failures and returns undefined.
				return this._replyMessage(message, await this._item.getPolicyEvaluations());
			case 'pr.requeue-policy':
				try {
					return await this._replyMessage(
						message,
						await this._item.requeuePolicyEvaluation(message.args.evaluationId),
					);
				} catch (e) {
					return this._throwError(message, formatError(e));
				}
			// The sidebar webview posts pr.debug on every mount (activityBarView/app.tsx). Without a case
			// it hit the throwing default below and rejected an uncaught promise per activation; mirror
			// the overview host and just log it. (item 1a)
			case 'pr.debug':
				return this.webviewDebug(message);
			default:
				// Never drop a message silently: an unhandled command leaves the webview's awaited
				// postMessage promise pending forever (how the v1.4 sidebar bugs shipped).
				return this._throwError(message, `Unhandled message: ${message.command}`);
		}
	}

	public async updatePullRequest(pullRequestModel: PullRequestModel): Promise<void> {
		return Promise.all([
			this._folderRepositoryManager.resolvePullRequest(
				pullRequestModel.remote.owner,
				pullRequestModel.remote.repositoryName,
				pullRequestModel.getPullRequestId(),
			),
			this._folderRepositoryManager.getPullRequestRepositoryAccessAndMergeMethods(pullRequestModel),
			// POL-05: pre-stage the sidebar compact policy summary here; POL-01's fetch failure must not
			// sink the whole sidebar the way the other members here fail loudly.
			pullRequestModel.getPolicyEvaluations().catch(() => {}),
			// POL-05: the checked-out-PR sidebar previously hardcoded status: { statuses: [] }, so the
			// shared StatusChecks/PolicySection components (isSimple=true) never showed anything even
			// though the overview side already renders both.
			pullRequestModel.getStatusChecks(),
		])
			.then(result => {
				const [pullRequest, repositoryAccess, policies, status] = result;
				if (!pullRequest) {
					throw new Error(
						`Fail to resolve Pull Request #${pullRequestModel.getPullRequestId()} in ${
							pullRequestModel.remote.owner
						}/${pullRequestModel.remote.repositoryName}`,
					);
				}

				if (!this._view) {
					// If the there is no PR webview, then there is nothing else to update.
					return;
				}

				this._item = pullRequest;
				this._view.title = `${pullRequest.item.title} #${pullRequestModel.getPullRequestId().toString()}`;

				const isCurrentlyCheckedOut = pullRequestModel.equals(this._folderRepositoryManager.activePullRequest);
				const hasWritePermission = repositoryAccess!.hasWritePermission;
				const mergeMethodsAvailability = repositoryAccess!.mergeMethodsAvailability;
				const canEdit = hasWritePermission || this._item.canEdit();
				const preferredMergeMethod = vscode.workspace
					.getConfiguration(SETTINGS_NAMESPACE)
					.get<MergeMethod>('defaultMergeMethod');
				const defaultMergeMethod = getDefaultMergeMethod(mergeMethodsAvailability, preferredMergeMethod);
				const currentUser = this._folderRepositoryManager.getCurrentUser();
				this._existingReviewers = (pullRequest.item.reviewers ?? []).map(convertIdentityRefWithVoteToReviewer);

				this._postMessage({
					command: 'pr.initialize',
					pullrequest: {
						number: pullRequest.getPullRequestId(),
						title: pullRequest.item.title,
						url: pullRequest.url,
						createdAt: pullRequest.item.createdBy,
						body: pullRequest.item.description,
						bodyHTML: pullRequest.item.description,
						labels: pullRequest.item.labels,
						author: {
							login: pullRequest.item.createdBy!.uniqueName!,
							name: pullRequest.item.createdBy?.displayName,
							avatarUrl: pullRequest.item.createdBy?.imageUrl,
							url: pullRequest.item.createdBy?.url,
						},
						state: pullRequest.state,
						isCurrentlyCheckedOut: isCurrentlyCheckedOut,
						// AC-08: fall back to the parsed branch name (still known even once the branch
						// itself is deleted) rather than the literal string "UNKNOWN" - see
						// pullRequestOverview.ts.
						base:
							pullRequest.base?.ref ??
							convertBranchRefToBranchName(pullRequest.item.targetRefName || '') ??
							'UNKNOWN',
						head:
							pullRequest.head?.ref ??
							convertBranchRefToBranchName(pullRequest.item.sourceRefName || '') ??
							'UNKNOWN',
						canEdit: canEdit,
						hasWritePermission,
						mergeable: pullRequest.item.mergeStatus,
						isDraft: pullRequest.isDraft,
						status: !!status ? status : { statuses: [] },
						events: [],
						mergeMethodsAvailability,
						defaultMergeMethod,
						isIssue: false,
						isAuthor: currentUser.id === pullRequest.item.createdBy?.id,
						reviewers: this._existingReviewers,
						policies,
						autoCompleteSetBy: pullRequest.item.autoCompleteSetBy
							? convertRESTUserToAccount(pullRequest.item.autoCompleteSetBy)
							: undefined,
						autoCompleteOptions: pullRequest.item.autoCompleteSetBy
							? buildCompletionSummary(pullRequest.item.completionOptions)
							: undefined,
					},
				});
			})
			.catch(e => {
				vscode.window.showErrorMessage(formatError(e));
			});
	}

	private close(message: IRequestMessage<string>): void {
		vscode.commands.executeCommand<GitPullRequestCommentThread>('azdopr.close', this._item, message.args).then(comment => {
			if (comment) {
				this._replyMessage(message, {
					value: comment,
				});
			}
		});
	}

	// private createComment(message: IRequestMessage<string>) {
	// 	this._item.createCommentOnThread(message.args).then(comment => {
	// 		this._replyMessage(message, {
	// 			value: comment
	// 		});
	// 	});
	// }

	private updateReviewers(review?: IdentityRefWithVote): void {
		if (!review) {
			return;
		}

		const existingReviewer = this._existingReviewers.find(reviewer => review.id === reviewer.reviewer.id);
		if (existingReviewer) {
			existingReviewer.state = review.vote ?? 0;
			existingReviewer.isRequired = review.isRequired ?? false;
		} else {
			this._existingReviewers.push(convertIdentityRefWithVoteToReviewer(review));
		}
	}

	private votePullRequest(message: IRequestMessage<number>): void {
		this._item.submitVote(message.args).then(
			review => {
				this.updateReviewers(review);
				this._replyMessage(message, {
					review: review,
					reviewers: this._existingReviewers,
				});
				//refresh the pr list as the vote changed
				vscode.commands.executeCommand('azdopr.refreshList');
			},
			e => {
				vscode.window.showErrorMessage(`Voting on pull request failed. ${formatError(e)}`);
				this._throwError(message, formatError(e));
			},
		);
	}

	private approvePullRequest(message: IRequestMessage<string>): void {
		this._item.submitVote(PullRequestVote.APPROVED).then(
			review => {
				this.updateReviewers(review);
				this._replyMessage(message, {
					review: review,
					reviewers: this._existingReviewers,
				});
				//refresh the pr list as this one is approved
				vscode.commands.executeCommand('azdopr.refreshList');
			},
			e => {
				vscode.window.showErrorMessage(`Approving pull request failed. ${formatError(e)}`);

				this._throwError(message, formatError(e));
			},
		);
	}

	private submitReview(message: IRequestMessage<string>): void {
		this._item.createThread(message.args).then(
			review => {
				// TODO Do I need to update reviewer?
				// this.updateReviewers(review);
				this._replyMessage(message, {
					review: review,
					reviewers: this._existingReviewers,
				});
			},
			e => {
				vscode.window.showErrorMessage(`Submitting review failed. ${formatError(e)}`);
				this._throwError(message, formatError(e));
			},
		);
	}

	private async deleteBranch(message: IRequestMessage<any>) {
		const branchInfo = await this._folderRepositoryManager.getBranchNameForPullRequest(this._item);
		const actions: (vscode.QuickPickItem & { type: 'upstream' | 'local' | 'remote' })[] = [];

		if (this._item.isResolved()) {
			const branchHeadRef = this._item.head.ref;

			const defaultBranch = await this._folderRepositoryManager.getPullRequestRepositoryDefaultBranch(this._item);
			const isDefaultBranch = defaultBranch === this._item.head.ref;
			if (!isDefaultBranch) {
				actions.push({
					label: `Delete remote branch ${this._item.remote.remoteName}/${branchHeadRef}`,
					description: `${this._item.remote.normalizedHost}/${this._item.remote.owner}/${this._item.remote.repositoryName}`,
					type: 'upstream',
					picked: true,
				});
			}
		}

		if (branchInfo) {
			const preferredLocalBranchDeletionMethod = vscode.workspace
				.getConfiguration(SETTINGS_NAMESPACE)
				.get<boolean>('defaultDeletionMethod.selectLocalBranch');
			actions.push({
				label: `Delete local branch ${branchInfo.branch}`,
				type: 'local',
				picked: !!preferredLocalBranchDeletionMethod,
			});

			const preferredRemoteDeletionMethod = vscode.workspace
				.getConfiguration(SETTINGS_NAMESPACE)
				.get<boolean>('defaultDeletionMethod.selectRemote');

			if (branchInfo.remote && branchInfo.createdForPullRequest && !branchInfo.remoteInUse) {
				actions.push({
					label: `Delete remote ${branchInfo.remote}, which is no longer used by any other branch`,
					type: 'remote',
					picked: !!preferredRemoteDeletionMethod,
				});
			}
		}

		if (!actions.length) {
			vscode.window.showWarningMessage(
				`There is no longer an upstream or local branch for Pull Request #${this._item.getPullRequestId()}`,
			);
			this._replyMessage(message, {
				cancelled: true,
			});

			return;
		}

		const selectedActions = await vscode.window.showQuickPick(actions, {
			canPickMany: true,
			ignoreFocusOut: true,
		});

		if (selectedActions) {
			const isBranchActive = this._item.equals(this._folderRepositoryManager.activePullRequest);

			const promises = selectedActions.map(async action => {
				switch (action.type) {
					case 'local':
						if (isBranchActive) {
							if (this._folderRepositoryManager.repository.state.workingTreeChanges.length) {
								const response = await vscode.window.showWarningMessage(
									`Your local changes will be lost, do you want to continue?`,
									{ modal: true },
									'Yes',
								);
								if (response === 'Yes') {
									await vscode.commands.executeCommand('git.cleanAll');
								} else {
									return;
								}
							}
							const defaultBranch = await this._folderRepositoryManager.getPullRequestRepositoryDefaultBranch(
								this._item,
							);
							await this._folderRepositoryManager.repository.checkout(defaultBranch);
						}
						return await this._folderRepositoryManager.repository.deleteBranch(branchInfo!.branch, true);
					case 'remote':
						return this._folderRepositoryManager.repository.removeRemote(branchInfo!.remote!);
				}
			});

			await Promise.all(promises);

			vscode.commands.executeCommand('azdopr.refreshList');

			// See pullRequestOverview.ts: broadcast drives the head->'UNKNOWN' commandHandler, seq reply
			// resolves the awaited deleteBranch() promise so the button recovers. (item 1c)
			this._postMessage({
				command: 'pr.deleteBranch',
			});
			this._replyMessage(message, {
				cancelled: false,
			});
		} else {
			this._replyMessage(message, {
				cancelled: true,
			});
		}
	}

	private async setReadyForReview(message: IRequestMessage<any>, isDraft: boolean): Promise<void> {
		if (isDraft) {
			const confirmation = await vscode.window.showWarningMessage(
				'Convert this pull request to a draft? Azure DevOps resets all reviewer votes when a PR is marked as draft.',
				{ modal: true },
				'Convert to draft',
			);
			if (confirmation !== 'Convert to draft') {
				this._replyMessage(message, { isDraft: this._item.isDraft });
				return;
			}
		}

		try {
			const result = await this._item.setReadyForReview(isDraft);
			vscode.commands.executeCommand('azdopr.refreshList');
			this._replyMessage(message, { isDraft: result.isDraft });
		} catch (e) {
			vscode.window.showErrorMessage(
				`${
					isDraft ? 'Converting pull request to draft' : 'Marking pull request ready for review'
				} failed. ${formatError(e)}`,
			);
			this._throwError(message, formatError(e));
		}
	}

	// AC-03: complete the PR from the checked-out-PR sidebar instead of calling the commented-out
	// FolderRepositoryManager.mergePullRequest stub. The MergeSimple dropdown supplies the strategy.
	private async mergePullRequest(
		message: IRequestMessage<{ title: string; description: string; method: MergeMethod }>,
	): Promise<void> {
		// item 4: this path hardcodes deleteSourceBranch + transitionWorkItems; disclose both in the
		// confirmation instead of the bare "Complete this pull request?".
		const confirmation = await vscode.window.showInformationMessage(
			'Complete this pull request? This will delete the source branch and complete any linked work items.',
			{ modal: true },
			'Complete',
		);
		if (confirmation !== 'Complete') {
			this._replyMessage(message, { state: PullRequestStatus.Active });
			return;
		}

		const mergeStrategy = GitPullRequestMergeStrategy[message.args.method] ?? GitPullRequestMergeStrategy.NoFastForward;
		this._item
			.completePullRequest({ deleteSourceBranch: true, transitionWorkItems: true, mergeStrategy })
			.then(result => {
				vscode.commands.executeCommand('azdopr.refreshList');

				if (result.closedBy === undefined) {
					vscode.window.showErrorMessage(`Completing PR failed: ${result.mergeFailureMessage}`);
					this._replyMessage(message, { state: PullRequestStatus.Active });
					return;
				}

				this._replyMessage(message, { state: PullRequestStatus.Completed });
			})
			.catch(e => {
				vscode.window.showErrorMessage(`Unable to complete pull request. ${formatError(e)}`);
				this._throwError(message, {});
			});
	}

	// AC-02: same set/cancel-auto-complete plumbing as the overview host - see pullRequestOverview.ts
	// for the race-handling rationale (cancel-vs-complete).
	private async setAutoComplete(
		message: IRequestMessage<{ enable: boolean; options?: PullRequestCompletion }>,
	): Promise<void> {
		try {
			const result = await this._item.setAutoComplete(message.args.enable ? message.args.options : undefined);
			vscode.commands.executeCommand('azdopr.refreshList');

			// webview.postMessage() serializes through JSON.stringify, which drops keys whose value is
			// `undefined` entirely - the webview's shallow-merge updatePR() then never overwrites the
			// stale cached value, so canceling looked like it did nothing. Send `null` for "cleared"
			// instead: it survives serialization and every consumer already treats it as falsy.
			this._replyMessage(message, {
				autoCompleteSetBy:
					result.autoCompleteSetBy && result.autoCompleteSetBy.id !== AUTO_COMPLETE_CLEAR_ID
						? convertRESTUserToAccount(result.autoCompleteSetBy)
						: null,
				autoCompleteOptions: buildCompletionSummary(result.completionOptions) ?? null,
				state: result.status ?? this._item.item.status,
				mergeable: result.mergeStatus,
				mergeFailureMessage: result.mergeFailureMessage,
			});
		} catch (e) {
			// See pullRequestOverview.ts: guard the recovery fetch so a second failure still routes to
			// the error toast + _throwError instead of leaving the webview promise pending. (item 1d)
			if (!message.args.enable) {
				try {
					const fresh = await this._folderRepositoryManager.resolvePullRequest(
						this._item.remote.owner,
						this._item.remote.repositoryName,
						this._item.getPullRequestId(),
					);
					if (fresh?.state === PullRequestStatus.Completed) {
						vscode.window.showInformationMessage('Pull request was already completed by auto-complete.');
						this._replyMessage(message, {
							autoCompleteSetBy: null,
							autoCompleteOptions: null,
							state: fresh.state,
							mergeable: fresh.item.mergeStatus,
						});
						return;
					}
				} catch {
					// Recovery fetch failed too; fall through to the error path below.
				}
			}
			vscode.window.showErrorMessage(`Unable to update auto-complete. ${formatError(e)}`);
			this._throwError(message, {});
		}
	}

	private webviewDebug(message: IRequestMessage<string>): void {
		Logger.debug(message.args, PullRequestViewProvider.viewType);
	}

	private _getHtmlForWebview() {
		const nonce = getNonce();

		const uri = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview-open-pr-view.js');

		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https: data:; script-src 'nonce-${nonce}'; style-src vscode-resource: 'unsafe-inline' http: https: data:;">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">

			<title>Active Pull Request</title>
		</head>
		<body>
			<div id="app"></div>
			<script nonce="${nonce}"src="${this._webview!.asWebviewUri(uri).toString()}"></script>
		</body>
		</html>`;
	}
}
