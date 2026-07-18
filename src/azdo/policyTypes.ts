/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// POL-01: PolicyConfiguration.settings and PolicyEvaluationRecord.context are `any` in
// azure-devops-node-api 10.2.2 (PolicyInterfaces.d.ts:37,79). These raw wire shapes are host-only -
// never imported by webview code. Field names are docs-derived (Microsoft Learn branch-policy docs,
// `az repos policy` CLI flags), not typings-derived; verify once against a live evaluation payload
// (v1.5 design doc Section 1.1/6 step 2).

/** Branch/repo scope entry present on every policy's settings. */
export interface PolicyScopeEntry {
	repositoryId: string | null; // null = all repos in project
	refName?: string; // absent when matchKind is DefaultBranch
	matchKind?: 'Exact' | 'Prefix' | 'DefaultBranch';
}

interface PolicySettingsBase {
	scope: PolicyScopeEntry[];
}

/** "Minimum number of reviewers" */
export interface MinimumReviewersPolicySettings extends PolicySettingsBase {
	minimumApproverCount: number;
	creatorVoteCounts?: boolean;
	allowDownvotes?: boolean;
	resetOnSourcePush?: boolean;
	requireVoteOnLastIteration?: boolean;
	resetRejectionsOnSourcePush?: boolean;
	blockLastPusherVote?: boolean;
}

/** "Check for comment resolution" - no type-specific fields beyond scope. */
export type CommentRequirementsPolicySettings = PolicySettingsBase;

/** "Build" (build validation) */
export interface BuildValidationPolicySettings extends PolicySettingsBase {
	buildDefinitionId: number;
	displayName?: string; // the policy's own label, e.g. "PR build"
	queueOnSourceUpdateOnly?: boolean;
	manualQueueOnly?: boolean;
	validDuration?: number; // minutes; 0 = always valid
	filenamePatterns?: string[];
}

/** "Work item linking" - no type-specific fields beyond scope. */
export type WorkItemLinkingPolicySettings = PolicySettingsBase;

/** "Required reviewers" (automatically added reviewers) */
export interface RequiredReviewersPolicySettings extends PolicySettingsBase {
	requiredReviewerIds: string[];
	minimumApproverCount?: number;
	creatorVoteCounts?: boolean;
	filenamePatterns?: string[];
	message?: string;
}

/** "Require a merge strategy" (Limit merge types) */
export interface MergeStrategyPolicySettings extends PolicySettingsBase {
	allowNoFastForward?: boolean;
	allowSquash?: boolean;
	allowRebase?: boolean;
	allowRebaseMerge?: boolean;
	useSquashMerge?: boolean; // legacy single-flag form, pre-dates the allow* flags
}

/** PolicyEvaluationRecord.context for build policies (PolicyInterfaces.d.ts:79). ALL fields optional:
 *  context is documented as "internal" - treat every read as possibly undefined. */
export interface BuildPolicyEvaluationContext {
	buildId?: number;
	buildDefinitionId?: number;
	buildDefinitionName?: string;
	buildIsNotCurrent?: boolean;
	buildStartedUtc?: string;
	isExpired?: boolean;
	wasAutoRequeued?: boolean;
}

export type AnyPolicySettings =
	| MinimumReviewersPolicySettings
	| CommentRequirementsPolicySettings
	| BuildValidationPolicySettings
	| WorkItemLinkingPolicySettings
	| RequiredReviewersPolicySettings
	| MergeStrategyPolicySettings;

/**
 * Kind detection order (ROADMAP Section 4: resolve display names at runtime via getPolicyTypes,
 * never key behavior on hardcoded GUIDs):
 *  1. Settings-shape discrimination (primary, below).
 *  2. GUID tiebreaker (WellKnownPolicyTypeIds) - only for the two shape-less types (comment
 *     resolution vs work-item linking), which both carry only `scope`.
 *  3. Fallback to 'other' for anything unmatched - keeps unknown/custom policy types visible.
 */

export function isMinimumReviewersSettings(s: any): s is MinimumReviewersPolicySettings {
	return !!s && typeof s.minimumApproverCount === 'number' && !('requiredReviewerIds' in s);
}

export function isBuildValidationSettings(s: any): s is BuildValidationPolicySettings {
	return !!s && 'buildDefinitionId' in s;
}

export function isRequiredReviewersSettings(s: any): s is RequiredReviewersPolicySettings {
	return !!s && Array.isArray(s.requiredReviewerIds);
}

export function isMergeStrategySettings(s: any): s is MergeStrategyPolicySettings {
	return (
		!!s &&
		('allowSquash' in s ||
			'useSquashMerge' in s ||
			'allowNoFastForward' in s ||
			'allowRebase' in s ||
			'allowRebaseMerge' in s)
	);
}

/** Well-known cloud GUIDs. Confirmed 2026-07-17 against live Azure DevOps Services via getPolicyTypes
 *  (Minimum number of reviewers / Work item linking / Comment requirements); on-prem Server IDs may
 *  differ. Used ONLY to disambiguate the settings-shapeless policy types; display names always come
 *  from getPolicyTypes/type.displayName. */
export const WellKnownPolicyTypeIds = {
	minimumReviewers: 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd',
	workItemLinking: '40e92b44-2fe1-4dd6-b3d8-74a9c21d0c6e',
	commentRequirements: 'c6a1889d-b943-4856-b76f-9e46bb6b0df2',
} as const;
