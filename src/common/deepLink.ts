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

export function deepLinkParamsFromPullRequest(pr: PullRequestModel): PullRequestDeepLinkParams | undefined {
	const orgUrl = pr.azdoRepository.azdo?.orgUrl;
	const project = pr.item.repository?.project?.name ?? pr.azdoRepository.azdo?.projectName;
	const repo = pr.item.repository?.name ?? pr.azdoRepository.remote.repositoryName;
	if (!orgUrl || !project || !repo) {
		return undefined;
	}
	return { orgUrl, project, repo, prNumber: pr.getPullRequestId() };
}
