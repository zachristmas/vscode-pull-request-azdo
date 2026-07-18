/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IRequestMessage<T> {
	req: string;
	command: string;
	args: T;
}

interface IReplyMessage {
	seq: string;
	err: any;
	res: any;
}

declare let acquireVsCodeApi: any;
export const vscode = acquireVsCodeApi();

// Backstop timeout for a request whose host reply never arrives (extension host crashed, webview
// retained but disconnected). The host now guarantees a reply on the failure path, so in practice this
// only fires when the host is truly unreachable; it must be generous enough not to reject a legitimately
// slow merge/complete round-trip. (item 1e)
const REPLY_TIMEOUT_MS = 60000;

export class MessageHandler {
	private _commandHandler: ((message: any) => void) | null;
	private lastSentReq: number;
	private pendingReplies: any;
	constructor(commandHandler: any) {
		this._commandHandler = commandHandler;
		this.lastSentReq = 0;
		this.pendingReplies = Object.create(null);
		window.addEventListener('message', this.handleMessage.bind(this));
	}

	public registerCommandHandler(commandHandler: (message: any) => void) {
		this._commandHandler = commandHandler;
	}

	public async postMessage(message: any): Promise<any> {
		const req = String(++this.lastSentReq);
		return new Promise<any>((resolve, reject) => {
			// Bound the wait: without this, a reply that never comes leaves the entry (and the awaiting
			// UI) pending forever, and the 3s status/policy polls grow pendingReplies unboundedly in
			// every retained tab during an outage.
			const timeout = setTimeout(() => {
				if (this.pendingReplies[req]) {
					delete this.pendingReplies[req];
					reject(new Error(`Timed out waiting for a reply to '${message.command}'.`));
				}
			}, REPLY_TIMEOUT_MS);
			this.pendingReplies[req] = {
				resolve: resolve,
				reject: reject,
				timeout: timeout,
			};
			message = Object.assign(message, {
				req: req,
			});
			vscode.postMessage(message as IRequestMessage<any>);
		});
	}

	// handle message should resolve promises
	private handleMessage(event: any) {
		const message: IReplyMessage = event.data; // The json data that the extension sent
		if (message.seq) {
			// this is a reply
			const pendingReply = this.pendingReplies[message.seq];
			if (pendingReply) {
				// Settle exactly once and drop the entry so pendingReplies never grows without bound - the
				// original never deleted, so even successful replies leaked one entry each.
				clearTimeout(pendingReply.timeout);
				delete this.pendingReplies[message.seq];
				if (message.err) {
					pendingReply.reject(message.err);
				} else {
					pendingReply.resolve(message.res);
				}
				return;
			}
		}

		if (this._commandHandler) {
			this._commandHandler(message.res);
		}
	}
}

export function getMessageHandler(handler: ((message: any) => void) | null) {
	return new MessageHandler(handler);
}
