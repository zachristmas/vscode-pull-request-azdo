/// <reference types="webpack-env" />
// This file is providing the test runner to use when running extension tests.
import * as vscode from 'vscode';

require('mocha/mocha');

import { EXTENSION_ID } from '../../constants';
import { mockWebviewEnvironment } from '../mocks/mockWebviewEnvironment';

async function runAllExtensionTests(testsRoot: string, clb: (error: Error | null, failures?: number) => void): Promise<any> {
	// Ensure the dev-mode extension is activated
	await vscode.extensions.getExtension(EXTENSION_ID)!.activate();

	mockWebviewEnvironment.install(global);

	mocha.setup({
		ui: 'bdd',
		reporter: undefined,
	});

	try {
		const importAll = (r: __WebpackModuleApi.RequireContext) => r.keys().forEach(r);
		// require.context is a webpack-only extension; @types/node's require wins in this tsconfig.
		importAll((require as NodeRequire & __WebpackModuleApi.RequireFunction).context('../', true, /\.test$/));
	} catch (e) {
		console.log(e);
	}

	if (process.env.TEST_JUNIT_XML_PATH) {
		mocha.reporter('mocha-multi-reporters', {
			reporterEnabled: 'mocha-junit-reporter, spec',
			mochaJunitReporterReporterOptions: {
				mochaFile: process.env.TEST_JUNIT_XML_PATH,
				suiteTitleSeparatedBy: ' / ',
				outputs: true,
			},
		});
	}

	return mocha.run(failures => clb(null, failures));
}

export function run(testsRoot: string, clb: (error: Error | null, failures?: number) => void): void {
	runAllExtensionTests(testsRoot, clb);
}
