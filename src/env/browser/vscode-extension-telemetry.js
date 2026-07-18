/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
Object.defineProperty(exports, '__esModule', { value: true });

let TelemetryReporter = (function () {
	function TelemetryReporter(_extensionId, _extensionVersion, _key) {}
	TelemetryReporter.prototype.updateUserOptIn = function (_key) {};
	TelemetryReporter.prototype.createAppInsightsClient = function (_key) {};
	TelemetryReporter.prototype.getCommonProperties = function () {};
	TelemetryReporter.prototype.sendTelemetryEvent = function (_eventName, _properties, _measurements) {};
	TelemetryReporter.prototype.dispose = function () {};
	TelemetryReporter.TELEMETRY_CONFIG_ID = 'telemetry';
	TelemetryReporter.TELEMETRY_CONFIG_ENABLED_ID = 'enableTelemetry';
	return TelemetryReporter;
})();
exports.default = TelemetryReporter;
