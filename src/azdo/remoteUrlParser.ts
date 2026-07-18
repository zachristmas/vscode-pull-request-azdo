export interface ParsedAzdoRemote {
	orgUrl: string;
	projectName: string;
	repositoryName: string;
}

// Remote URL shapes Azure DevOps hands out:
//   HTTPS:      https://(user@)?dev.azure.com/<org>/<project>/_git/<repo>
//   SSH:        (ssh://)?git@ssh.dev.azure.com(:22)?[:/]v3/<org>/<project>/<repo>
//   Legacy:     https://(user@)?<org>.visualstudio.com/(DefaultCollection/)?<project>/_git/<repo>
//   Legacy SSH: <user>@vs-ssh.visualstudio.com(:22)?[:/]v3/<org>/<project>/<repo>
// When the project and repository share a name ADO omits the project segment
// (.../_git/<repo> directly under the org); for those shapes project := repo.
// Project and repo segments may be percent-encoded (e.g. spaces as %20).
const PATTERNS: { pattern: RegExp; org: number; project: number; repo: number }[] = [
	{
		pattern: /^https:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?\/?$/i,
		org: 1,
		project: 2,
		repo: 3,
	},
	{
		pattern: /^https:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/_git\/([^/]+?)(?:\.git)?\/?$/i,
		org: 1,
		project: 2,
		repo: 2,
	},
	{
		pattern: /^(?:ssh:\/\/)?git@ssh\.dev\.azure\.com(?::22)?[:/]v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/i,
		org: 1,
		project: 2,
		repo: 3,
	},
	{
		// Must precede the generic legacy pattern: for .../DefaultCollection/_git/<repo> that
		// pattern backtracks and mis-parses "DefaultCollection" as the project name.
		pattern: /^https:\/\/(?:[^@/]+@)?([^./]+)\.visualstudio\.com\/(?:DefaultCollection\/)?_git\/([^/]+?)(?:\.git)?\/?$/i,
		org: 1,
		project: 2,
		repo: 2,
	},
	{
		pattern: /^https:\/\/(?:[^@/]+@)?([^./]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/]+?)(?:\.git)?\/?$/i,
		org: 1,
		project: 2,
		repo: 3,
	},
	{
		pattern: /^(?:ssh:\/\/)?[^@]+@vs-ssh\.visualstudio\.com(?::22)?[:/]v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/i,
		org: 1,
		project: 2,
		repo: 3,
	},
];

function safeDecode(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

export function parseAzdoRemoteUrl(url: string | undefined): ParsedAzdoRemote | undefined {
	if (!url) {
		return undefined;
	}
	for (const { pattern, org, project, repo } of PATTERNS) {
		const m = url.match(pattern);
		if (m) {
			return {
				orgUrl: `https://dev.azure.com/${m[org]}`,
				projectName: safeDecode(m[project]),
				repositoryName: safeDecode(m[repo]),
			};
		}
	}
	return undefined;
}
