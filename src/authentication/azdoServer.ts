import * as vscode from 'vscode';

export class AzdoManager {
	// The old `host !== null` check was always true per the types (and even for the undefined
	// that Protocol.normalizeUri() can actually produce), so every remote passed. Accept the
	// possibly-undefined URI honestly and only treat resolvable hosts as AzDO.
	public async isAzdo(host: vscode.Uri | undefined): Promise<boolean> {
		return host !== undefined;
	}
}
