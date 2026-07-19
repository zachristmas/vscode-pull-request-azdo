import { WebApi } from 'azure-devops-node-api';
import * as vscode from 'vscode';
import Logger from '../common/logger';

const ID = 'AvatarCache';

// ADO avatar endpoints require authentication, but VS Code's comment UI and
// webviews fetch image URLs without credentials. We fetch avatars through the
// authenticated connection and hand out data: URIs instead.

// Module singleton kept in an object so functions mutate a property, not a top-level binding.
const state: { connection: WebApi | undefined } = { connection: undefined };
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | undefined>>();

export function initAvatarCache(conn: WebApi): void {
	state.connection = conn;
	cache.clear();
	pending.clear();
}

export function getCachedAvatar(url: string | undefined): string | undefined {
	if (!url || url.startsWith('data:')) {
		return url;
	}
	const hit = cache.get(url);
	if (!hit) {
		void fetchAvatarAsDataUri(url);
	}
	return hit;
}

export async function fetchAvatarAsDataUri(url: string | undefined): Promise<string | undefined> {
	if (!url) {
		return undefined;
	}
	if (url.startsWith('data:')) {
		return url;
	}
	const hit = cache.get(url);
	if (hit) {
		return hit;
	}
	if (!state.connection) {
		return undefined;
	}
	let inflight = pending.get(url);
	if (!inflight) {
		inflight = (async () => {
			try {
				const res = await state.connection!.rest.client.get(url);
				if (res.message.statusCode !== 200) {
					Logger.debug(`Avatar fetch failed (${res.message.statusCode}): ${url}`, ID);
					return;
				}
				const chunks: Buffer[] = [];
				for await (const chunk of res.message) {
					chunks.push(chunk as Buffer);
				}
				const contentType = (res.message.headers['content-type'] as string | undefined) ?? 'image/png';
				const dataUri = `data:${contentType};base64,${Buffer.concat(chunks).toString('base64')}`;
				cache.set(url, dataUri);
				return dataUri;
			} catch (e) {
				Logger.debug(`Avatar fetch error for ${url}: ${e}`, ID);
				return;
			} finally {
				pending.delete(url);
			}
		})();
		pending.set(url, inflight);
	}
	return inflight;
}

export function getAvatarIconUri(url: string | undefined, appendQuery?: string): vscode.Uri | undefined {
	if (!url) {
		return undefined;
	}
	const resolved = getCachedAvatar(url) ?? url;
	if (resolved.startsWith('data:')) {
		return vscode.Uri.parse(resolved);
	}
	return vscode.Uri.parse(appendQuery ? `${resolved}${appendQuery}` : resolved);
}

const AVATAR_KEYS = new Set(['avatarUrl', 'imageUrl']);
const AVATAR_HREF_PATTERN = /GraphProfile|MemberAvatars|identityImage/i;

export async function resolveAvatarsDeep(value: any, depth: number = 12, seen?: Set<any>): Promise<void> {
	if (!value || typeof value !== 'object' || depth <= 0) {
		return;
	}
	seen ??= new Set();
	if (seen.has(value)) {
		return;
	}
	seen.add(value);
	if (Array.isArray(value)) {
		await Promise.all(value.map(v => resolveAvatarsDeep(v, depth - 1, seen)));
		return;
	}
	const tasks: Promise<void>[] = [];
	for (const [key, v] of Object.entries(value)) {
		if (typeof v === 'string') {
			const isAvatarKey = AVATAR_KEYS.has(key) || (key === 'href' && AVATAR_HREF_PATTERN.test(v));
			if (isAvatarKey && /^https?:/i.test(v)) {
				tasks.push(
					fetchAvatarAsDataUri(v).then(dataUri => {
						if (dataUri) {
							value[key] = dataUri;
						}
					}),
				);
			}
		} else if (v && typeof v === 'object') {
			tasks.push(resolveAvatarsDeep(v, depth - 1, seen));
		}
	}
	await Promise.all(tasks);
}
