import * as vscode from 'vscode';
import { IAccount } from '../azdo/interface';
import { RepositoriesManager } from '../azdo/repositoriesManager';

/**
 * The liveshare contact service contract
 */
interface ContactServiceProvider {
	requestAsync(type: string, parameters: object, cancellationToken?: vscode.CancellationToken): Promise<object>;

	readonly onNotified: vscode.Event<NotifyContactServiceEventArgs>;
}

interface NotifyContactServiceEventArgs {
	type: string;
	body?: any;
}

/**
 * The liveshare public contact contract
 */
interface Contact {
	id: string;
	displayName?: string;
	email?: string;
}

/**
 * A contact service provider for liveshare that would suggest contacts based on the pull request manager
 */
export class GitHubContactServiceProvider implements ContactServiceProvider {
	private readonly onNotifiedEmitter = new vscode.EventEmitter<NotifyContactServiceEventArgs>();

	public onNotified: vscode.Event<NotifyContactServiceEventArgs> = this.onNotifiedEmitter.event;

	constructor(private readonly pullRequestManager: RepositoriesManager) {
		pullRequestManager.folderManagers.forEach(folderManager => {
			folderManager.onDidChangeAssignableUsers(e => {
				this.notifySuggestedAccounts(e);
			});
		});
	}

	public async requestAsync(
		type: string,
		_parameters: object,
		_cancellationToken?: vscode.CancellationToken,
	): Promise<object> {
		let result: object;

		switch (type) {
			case 'initialize':
				result = {
					description: 'Pullrequest',
					capabilities: {
						supportsDispose: false,
						supportsInviteLink: false,
						supportsPresence: false,
						supportsContactPresenceRequest: false,
						supportsPublishPresence: false,
					},
				};

				// if we get initialized and users are available on the pr manager
				const allAssignableUsers: Map<string, IAccount> = new Map();
				for (const pullRequestManager of this.pullRequestManager.folderManagers) {
					const batch = pullRequestManager.getAllAssignableUsers();
					if (!batch) {
						continue;
					}
					for (const user of batch) {
						if (user.id && !allAssignableUsers.has(user.id)) {
							allAssignableUsers.set(user.id, user);
						}
					}
				}
				if (allAssignableUsers.size > 0) {
					this.notifySuggestedAccounts([...allAssignableUsers.values()]);
				}

				break;
			default:
				throw new Error(`type:${type} not supported`);
		}

		return result;
	}

	private async notifySuggestedAccounts(accounts: IAccount[]) {
		let currentLoginUser: string | undefined;
		try {
			currentLoginUser = await this.getCurrentUserLogin();
		} catch {
			// If there are no GitHub repositories at the time of the above call, then we can get an error here.
			// Since we don't care about the error and are just trying to nofity accounts and not responding to user action,
			// it is safe to ignore and leave currentLoginUser undefined.
		}
		// Note: only suggest if the current user is part of the aggregated mentionable users
		if (currentLoginUser && accounts.some(u => u.id === currentLoginUser)) {
			this.notifySuggestedUsers(
				accounts
					.filter(u => u.email && u.id)
					.map(u => {
						return {
							id: u.id!,
							displayName: u.name || u.email,
							email: u.email,
						};
					}),
				true,
			);
		}
	}

	private async getCurrentUserLogin(): Promise<string | undefined> {
		if (this.pullRequestManager.folderManagers.length === 0) {
			return undefined;
		}
		const origin = await this.pullRequestManager.folderManagers[0]?.getOrigin();
		if (origin) {
			const currentUser = origin.azdo?.authenticatedUser;
			if (currentUser) {
				return currentUser.id;
			}
		}
	}

	private notify(type: string, body: any) {
		this.onNotifiedEmitter.fire({
			type,
			body,
		});
	}

	private notifySuggestedUsers(contacts: Contact[], exclusive?: boolean) {
		this.notify('suggestedUsers', {
			contacts,
			exclusive,
		});
	}
}
