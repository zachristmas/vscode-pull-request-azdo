/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dispatch, SetStateAction, useEffect, useState } from 'react';

/**
 * useState, but track the value of a prop.
 *
 * When the prop value changes, the tracked state will be updated to match.
 *
 * @param prop S the prop to track
 */
export function useStateProp<S>(prop: S): [S, Dispatch<SetStateAction<S>>] {
	const [state, setState] = useState(prop);
	useEffect(() => {
		if (state !== prop) {
			setState(prop);
		}
		// state is intentionally NOT a dependency: local edits may diverge until the prop changes;
		// adding it would revert them on every keystroke.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [prop]);
	return [state, setState];
}
