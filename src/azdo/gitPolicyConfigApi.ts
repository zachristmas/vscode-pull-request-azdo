/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebApi } from 'azure-devops-node-api';
import * as basem from 'azure-devops-node-api/ClientApiBases';
import { GitApi } from 'azure-devops-node-api/GitApi';
import * as VsoBaseInterfaces from 'azure-devops-node-api/interfaces/common/VsoBaseInterfaces';
import { PolicyConfiguration } from 'azure-devops-node-api/interfaces/PolicyInterfaces';

/**
 * AC-04: `GET {org}/{project}/_apis/git/policy/configurations?repositoryId=...&refName=...` -
 * server-side branch-scoped policy configurations (matches Exact/Prefix/DefaultBranch scopes the way
 * the ADO web UI does). Verified absent from azure-devops-node-api 10.2.2's GitApi.d.ts (v1.5 design
 * doc Section 0/5) - raw REST client following the entitlementApi.ts precedent: extends ClientApiBase,
 * resolves the Git resource area URL, builds the request manually since this route has no registered
 * vsoClient location ID in the local package.
 */
export interface IGitPolicyConfigApi extends basem.ClientApiBase {
	getPolicyConfigurationsForRef(project: string, repositoryId: string, refName: string): Promise<PolicyConfiguration[]>;
}

interface WrappedCollection<T> {
	count: number;
	value: T[];
}

class GitPolicyConfigApi extends basem.ClientApiBase implements IGitPolicyConfigApi {
	constructor(baseUrl: string, handlers: VsoBaseInterfaces.IRequestHandler[], options?: VsoBaseInterfaces.IRequestOptions) {
		super(baseUrl, handlers, 'node-GitPolicyConfig-api', options);
	}

	public async getPolicyConfigurationsForRef(
		project: string,
		repositoryId: string,
		refName: string,
	): Promise<PolicyConfiguration[]> {
		const url =
			`${this.baseUrl}/${encodeURIComponent(project)}/_apis/git/policy/configurations` +
			`?repositoryId=${encodeURIComponent(repositoryId)}&refName=${encodeURIComponent(refName)}&api-version=7.1`;
		const options = this.createRequestOptions('application/json');
		const res = await this.rest.get<WrappedCollection<PolicyConfiguration>>(url, options);
		return (this.formatResponse(res.result, null, true) as unknown) as PolicyConfiguration[];
	}
}

export const getGitPolicyConfigApi = async (webApi: WebApi): Promise<IGitPolicyConfigApi | undefined> => {
	if (!webApi) {
		return undefined;
	}
	const serverUrl = await (webApi as any)._getResourceAreaUrl(webApi.serverUrl, GitApi.RESOURCE_AREA_ID);
	const handlers = [webApi.authHandler];
	return new GitPolicyConfigApi(serverUrl!, handlers, webApi.options);
};
