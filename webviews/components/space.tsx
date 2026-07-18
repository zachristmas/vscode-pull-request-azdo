/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';

export const nbsp = String.fromCharCode(0xa0);

export const Spaced = ({ children }: { children: React.ReactNode }) => {
	const count = React.Children.count(children);
	return React.createElement(React.Fragment, {
		children: React.Children.map(children, (c, i) => {
			if (typeof c !== 'string') {
				return c;
			}
			const leading = i > 0 ? nbsp : '';
			const trailing = i < count - 1 ? nbsp : '';
			return `${leading}${c}${trailing}`;
		}),
	});
};
