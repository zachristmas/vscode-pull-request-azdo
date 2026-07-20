import { JsonPatchDocument, JsonPatchOperation, Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import {
	AccountRecentActivityWorkItemModel2,
	WorkItem,
	WorkItemExpand,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import * as vscode from 'vscode';
import { Azdo, CredentialStore } from './credentials';
import { PullRequestModel } from '../azdo/pullRequestModel';
import Logger from '../common/logger';
import { ITelemetry } from '../common/telemetry';
import { errorMessage } from '../common/utils';

// A lightweight work-item shape for autocomplete suggestions - just what the picker renders and inserts,
// not the full WorkItem (which carries every field and relation).
export interface WorkItemSuggestion {
	id: number;
	title: string;
	workItemType: string;
	state: string;
}

// WIQL string literals are single-quoted; a quote inside the user's query is escaped by doubling it.
function escapeWiql(value: string): string {
	return value.replaceAll("'", "''");
}

export class AzdoWorkItem implements vscode.Disposable {
	static readonly ID = 'WorkItem';
	private _toDispose: vscode.Disposable[] = [];
	private _hub: Azdo | undefined;
	private _workTracking?: IWorkItemTrackingApi;

	constructor(private readonly _credentialStore: CredentialStore, private readonly _telemetry: ITelemetry) {}

	async ensure(): Promise<AzdoWorkItem> {
		if (!this._credentialStore.isAuthenticated()) {
			await this._credentialStore.initialize();
		}
		this._hub = this._credentialStore.getHub();
		this._workTracking = await this._hub?.connection.getWorkItemTrackingApi();

		return this;
	}
	public async getWorkItemById(id: number): Promise<WorkItem | undefined> {
		try {
			Logger.appendLine(`Fetching workitem for id: ${id} - started`, AzdoWorkItem.ID);
			const res = await this._workTracking?.getWorkItem(id, undefined, undefined, WorkItemExpand.All);
			Logger.appendLine(`Fetching workitem for id: ${id} - finished`, AzdoWorkItem.ID);
			return res;
		} catch (error) {
			Logger.appendLine(`Fetching workitem for id: ${id} - failed. Error: ${errorMessage(error)}`, AzdoWorkItem.ID);
		}
	}

	public async getRecentWorkItems(): Promise<AccountRecentActivityWorkItemModel2[]> {
		try {
			Logger.appendLine(`Fetching recent workitem - started`, AzdoWorkItem.ID);
			const result = (await this._workTracking?.getRecentActivityData()) ?? [];
			Logger.appendLine(`Fetching recent workitem - finished`, AzdoWorkItem.ID);
			return result;
		} catch (error) {
			Logger.appendLine(`Fetching recent workitem - failed. Error: ${errorMessage(error)}`, AzdoWorkItem.ID);
			return [];
		}
	}

	// Type-ahead search backing the `#`/`AB#` composer picker. A numeric query matches the id directly
	// (and any title containing those digits); text searches titles. An empty query (just typed `#`)
	// offers the project's most recently changed items. Never throws - returns [] so the picker degrades
	// to "no suggestions" rather than leaving the awaited request pending.
	public async searchWorkItems(query: string, project?: string, top = 10): Promise<WorkItemSuggestion[]> {
		try {
			const trimmed = (query ?? '').trim();
			const projectFilter = project ? ` AND [System.TeamProject] = '${escapeWiql(project)}'` : '';
			let where: string;
			if (/^\d+$/.test(trimmed)) {
				where = `([System.Id] = ${Number(trimmed)} OR [System.Title] CONTAINS '${escapeWiql(
					trimmed,
				)}')${projectFilter}`;
			} else if (trimmed.length > 0) {
				where = `[System.Title] CONTAINS '${escapeWiql(trimmed)}'${projectFilter}`;
			} else {
				where = `[System.WorkItemType] <> ''${projectFilter}`;
			}
			const wiql = `SELECT [System.Id] FROM WorkItems WHERE ${where} ORDER BY [System.ChangedDate] DESC`;

			const result = await this._workTracking?.queryByWiql({ query: wiql }, undefined, false, top);
			const ids = (result?.workItems ?? []).map(w => w.id).filter((id): id is number => id !== undefined);
			if (ids.length === 0) {
				return [];
			}

			const items = await this._workTracking?.getWorkItems(ids, [
				'System.Id',
				'System.Title',
				'System.WorkItemType',
				'System.State',
			]);
			const byId = new Map((items ?? []).map(w => [w.id, w]));
			// Preserve the WIQL recency order; the batch fetch does not guarantee it.
			return ids
				.map(id => byId.get(id))
				.filter((w): w is WorkItem => !!w)
				.map(w => ({
					id: w.id!,
					title: (w.fields?.['System.Title'] as string) ?? '',
					workItemType: (w.fields?.['System.WorkItemType'] as string) ?? '',
					state: (w.fields?.['System.State'] as string) ?? '',
				}));
		} catch (error) {
			Logger.appendLine(`Searching work items for '${query}' - failed. Error: ${errorMessage(error)}`, AzdoWorkItem.ID);
			return [];
		}
	}

	public async associateWorkItemWithPR(workItemId: number, pr: PullRequestModel): Promise<WorkItem | undefined> {
		try {
			Logger.appendLine(
				`Associating work item: ${workItemId} with PR ${pr.getPullRequestId()} - started`,
				AzdoWorkItem.ID,
			);
			this._telemetry.sendTelemetryEvent('wt.associate');

			const po: JsonPatchOperation = {
				op: Operation.Add,
				path: '/relations/-',
				value: {
					rel: 'ArtifactLink',
					url: pr.item.artifactId,
					attributes: {
						name: 'pull request',
					},
				},
			};

			const doc: JsonPatchDocument = [po];

			const res = await this._workTracking?.updateWorkItem({}, doc, workItemId);

			Logger.appendLine(
				`Associating work item: ${workItemId} with PR ${pr.getPullRequestId()} - finished`,
				AzdoWorkItem.ID,
			);
			return res;
		} catch (error) {
			Logger.appendLine(
				`Associating work item: ${workItemId} with PR ${pr.getPullRequestId()} - failed. Error: ${errorMessage(error)}`,
				AzdoWorkItem.ID,
			);
			vscode.window.showWarningMessage(`Unable to associate workitem. Error: ${errorMessage(error)}`);
		}
	}

	public async disassociateWorkItemWithPR(workItem: WorkItem, pr: PullRequestModel): Promise<WorkItem | undefined> {
		try {
			Logger.appendLine(
				`Removing work item: ${workItem.id} link with PR ${pr.getPullRequestId()} - started`,
				AzdoWorkItem.ID,
			);
			this._telemetry.sendTelemetryEvent('wt.disassociate');

			// Get relation index
			const idx = workItem.relations?.findIndex(
				w => w.rel === 'ArtifactLink' && w.url?.toUpperCase() === pr.item.artifactId?.toUpperCase(),
			);

			// WI-05: getPullRequestWorkItemRefs also returns items linked through source-branch commits,
			// which carry no PR ArtifactLink relation. Patching '/relations/-1' produces a raw server error;
			// guard and explain instead.
			if (idx === undefined || idx < 0) {
				throw new Error(
					'This work item is linked via a commit or branch, not directly to the pull request. Remove the commit/branch link from the work item to detach it.',
				);
			}

			const po: JsonPatchOperation = {
				op: Operation.Remove,
				path: `/relations/${idx}`,
			};

			const doc: JsonPatchDocument = [po];

			const res = await this._workTracking?.updateWorkItem({}, doc, workItem.id!);
			Logger.appendLine(
				`Removing work item: ${workItem.id} link with PR ${pr.getPullRequestId()} - finished`,
				AzdoWorkItem.ID,
			);
			return res;
		} catch (error) {
			Logger.appendLine(
				`Removing work item: ${workItem.id} with PR ${pr.getPullRequestId()} - failed. Error: ${errorMessage(error)}`,
				AzdoWorkItem.ID,
			);
			throw error;
		}
	}

	dispose() {
		this._toDispose.forEach(d => d.dispose());
	}
}
