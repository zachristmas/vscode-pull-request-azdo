// Global Mocha test hooks.

import * as util from 'util';

const original = {
	log: console.log,
	error: console.error,
};

beforeEach(function () {
	const currentTest = this.currentTest as {
		consoleOutputs?: string[];
		consoleErrors?: string[];
	};
	console.log = function captureLog(...args: unknown[]) {
		original.log.apply(console, args);
		const formatted = util.format(...args);
		currentTest.consoleOutputs = (currentTest.consoleOutputs || []).concat(formatted);
	};
	console.error = function captureError(...args: unknown[]) {
		original.error.apply(console, args);
		const formatted = util.format(...args);
		currentTest.consoleErrors = (currentTest.consoleErrors || []).concat(formatted);
	};
});

afterEach(function () {
	console.log = original.log;
	console.error = original.error;
});
