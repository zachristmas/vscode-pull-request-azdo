// Global Mocha test hooks.

import { format } from 'util';

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
		const formatted = format(...args);
		currentTest.consoleOutputs = [...(currentTest.consoleOutputs || []), formatted];
	};
	console.error = function captureError(...args: unknown[]) {
		original.error.apply(console, args);
		const formatted = format(...args);
		currentTest.consoleErrors = [...(currentTest.consoleErrors || []), formatted];
	};
});

afterEach(function () {
	console.log = original.log;
	console.error = original.error;
});
