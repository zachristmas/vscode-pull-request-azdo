import * as vscode from 'vscode';

export class AzdoManager {
	public async isAzdo(host: vscode.Uri): Promise<boolean> {
		return host !== null;
	}
}
