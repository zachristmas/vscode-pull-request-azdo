/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { resolveAvatarsDeep } from '../azdo/avatarCache';
import { formatError } from './utils';

export interface IRequestMessage<T> {
	req: string;
	command: string;
	args: T;
}

export interface IReplyMessage {
	seq?: string;
	err?: any;
	res?: any;
}

export function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export class WebviewBase {
	protected _webview?: vscode.Webview;
	protected _disposables: vscode.Disposable[] = [];

	private _waitForReady: Promise<void>;
	private _onIsReady: vscode.EventEmitter<void> = new vscode.EventEmitter();

	protected readonly MESSAGE_UNHANDLED: string = 'message not handled';

	// Tracks which request ids a reply has already been sent for, so the guarantee-of-reply wrapper
	// never double-replies and _reply/_throw stay idempotent. Entries are per-message and cleared once
	// the message is fully handled (see _handleMessage). (item 1e)
	private _repliedReqs: Set<string> = new Set();

	constructor() {
		this._waitForReady = new Promise(resolve => {
			const disposable = this._onIsReady.event(() => {
				disposable.dispose();
				resolve();
			});
		});
	}

	public initialize(): void {
		this._webview?.onDidReceiveMessage(
			message => {
				return this._handleMessage(message);
			},
			null,
			this._disposables,
		);
	}

	// Guarantee-of-reply wrapper. Every webview postMessage attaches a req id and awaits a reply
	// (webviews/common/message.ts); a handler that throws before replying would leave that promise
	// pending forever (the whole class of v1.4 sidebar hangs). Route any such throw to _throwError so
	// the client promise rejects. The success path is intentionally NOT blanket-acked here: many handlers
	// reply asynchronously via .then() after returning void, so a synchronous ack would race and
	// double-reply them. The client-side timeout (message.ts) is the backstop that settles anything a
	// handler genuinely never replies to. (item 1e)
	private async _handleMessage(message: IRequestMessage<any>): Promise<void> {
		try {
			await this._onDidReceiveMessage(message);
		} catch (e) {
			// Only reply if the handler hadn't already: some handlers reply then do more work that throws.
			if (message?.req && !this._repliedReqs.has(message.req)) {
				await this._throwError(message, `${formatError(e)}`);
			}
		}
	}

	protected async _onDidReceiveMessage(message: IRequestMessage<any>): Promise<any> {
		switch (message.command) {
			case 'ready':
				this._onIsReady.fire();
				return;
			default:
				return this.MESSAGE_UNHANDLED;
		}
	}

	protected async _postMessage(message: any) {
		// Without the following ready check, we can end up in a state where the message handler in the webview
		// isn't ready for any of the messages we post.
		await this._waitForReady;
		await resolveAvatarsDeep(message);
		this._webview?.postMessage({
			res: message,
		});
	}

	protected async _replyMessage(originalMessage: IRequestMessage<any>, message: any) {
		// Idempotent: record the req synchronously (before the await) so a later _throwError from the
		// guarantee-of-reply wrapper is suppressed and we never send two replies for one request. The
		// marker is cleared once the reply is sent, so the set only ever holds in-flight reqs. (item 1e)
		if (originalMessage?.req) {
			if (this._repliedReqs.has(originalMessage.req)) {
				return;
			}
			this._repliedReqs.add(originalMessage.req);
		}
		try {
			await resolveAvatarsDeep(message);
			const reply: IReplyMessage = {
				seq: originalMessage.req,
				res: message,
			};
			this._webview?.postMessage(reply);
		} finally {
			if (originalMessage?.req) {
				this._repliedReqs.delete(originalMessage.req);
			}
		}
	}

	protected async _throwError(originalMessage: IRequestMessage<any>, error: any) {
		if (originalMessage?.req) {
			if (this._repliedReqs.has(originalMessage.req)) {
				return;
			}
			this._repliedReqs.add(originalMessage.req);
		}
		try {
			const reply: IReplyMessage = {
				seq: originalMessage.req,
				err: error,
			};
			this._webview?.postMessage(reply);
		} finally {
			if (originalMessage?.req) {
				this._repliedReqs.delete(originalMessage.req);
			}
		}
	}
}
