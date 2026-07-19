import { PullRequestModel } from '../azdo/pullRequestModel';
import { EXTENSION_ID } from '../constants';

// VS Code normalizes vscode:// authorities to lowercase before they reach the extension,
// so the canonical link form uses the lowercased extension id.
export const DEEP_LINK_AUTHORITY = EXTENSION_ID.toLowerCase();
export const DEEP_LINK_OPEN_PR_PATH = '/open-pr';

export interface PullRequestDeepLinkParams {
	orgUrl: string;
	project: string;
	repo: string;
	prNumber: number;
	filePath?: string;
	line?: number;
}

export function buildPullRequestDeepLink(params: PullRequestDeepLinkParams): string {
	let query =
		`org=${encodeURIComponent(params.orgUrl)}` +
		`&project=${encodeURIComponent(params.project)}` +
		`&repo=${encodeURIComponent(params.repo)}` +
		`&pr=${params.prNumber}`;
	if (params.filePath) {
		query += `&path=${encodeURIComponent(params.filePath)}`;
		if (params.line !== undefined) {
			query += `&line=${params.line}`;
		}
	}
	return `vscode://${DEEP_LINK_AUTHORITY}${DEEP_LINK_OPEN_PR_PATH}?${query}`;
}

// Hand-rolled so the parser works in both the node and webworker extension builds
// (URLSearchParams is not part of the url polyfill webpack uses for the web build).
function parseQuery(query: string): Map<string, string> {
	const result = new Map<string, string>();
	for (const pair of query.split('&')) {
		if (!pair) {
			continue;
		}
		const eq = pair.indexOf('=');
		const rawKey = eq === -1 ? pair : pair.slice(0, eq);
		const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
		try {
			result.set(decodeURIComponent(rawKey), decodeURIComponent(rawValue.replaceAll('+', '%20')));
		} catch {
			// skip malformed pairs rather than failing the whole link
		}
	}
	return result;
}

export function parsePullRequestDeepLink(uri: { path: string; query: string }): PullRequestDeepLinkParams | undefined {
	if (uri.path !== DEEP_LINK_OPEN_PR_PATH) {
		return undefined;
	}
	const query = parseQuery(uri.query);
	const orgUrl = query.get('org');
	const project = query.get('project');
	const repo = query.get('repo');
	const prNumber = Number(query.get('pr'));
	if (!orgUrl || !project || !repo || !Number.isSafeInteger(prNumber) || prNumber <= 0) {
		return undefined;
	}
	const filePath = query.get('path') || undefined;
	const rawLine = query.get('line');
	const line = rawLine && /^\d+$/.test(rawLine) ? Number(rawLine) : undefined;
	return { orgUrl, project, repo, prNumber, filePath, line };
}

export function deepLinkParamsFromPullRequest(pr: PullRequestModel): PullRequestDeepLinkParams | undefined {
	const orgUrl = pr.azdoRepository.azdo?.orgUrl;
	const project = pr.item.repository?.project?.name ?? pr.azdoRepository.azdo?.projectName;
	const repo = pr.item.repository?.name ?? pr.azdoRepository.remote.repositoryName;
	if (!orgUrl || !project || !repo) {
		return undefined;
	}
	return { orgUrl, project, repo, prNumber: pr.getPullRequestId() };
}
