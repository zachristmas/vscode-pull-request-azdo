/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { v4 as uuid } from 'uuid';
import { chevronIcon } from './icon';

const { useState } = React;

// Keyboard-navigation helpers for Dropdown: move focus between the rendered option buttons
// (ids `${dropdownId}option{index}`) based on which element currently has focus.
function focusNextDropdownOption(
	dropdownId: string,
	expandOptionsButtonId: string,
	options: { [key: string]: string },
	currentElement: Element,
): void {
	if (!currentElement.id || currentElement.id === expandOptionsButtonId) {
		const firstOptionId = `${dropdownId}option0`;
		const firstOptionButton = document.querySelector<HTMLElement>(`#${CSS.escape(firstOptionId)}`);
		firstOptionButton?.focus();
	} else {
		const regex = new RegExp(`${dropdownId}option([0-9])`);
		const result = currentElement.id.match(regex);
		if (result?.length) {
			const index = parseInt(result[1]);
			if (index < Object.entries(options).length - 1) {
				const nextOptionId = `${dropdownId}option${index + 1}`;
				const nextOption = document.querySelector<HTMLElement>(`#${CSS.escape(nextOptionId)}`);
				nextOption?.focus();
			}
		}
	}
}

function focusPreviousDropdownOption(
	dropdownId: string,
	expandOptionsButtonId: string,
	options: { [key: string]: string },
	currentElement: Element,
): void {
	if (!currentElement.id || currentElement.id === expandOptionsButtonId) {
		const lastIndex = Object.entries(options).length - 1;
		const lastOptionId = `${dropdownId}option${lastIndex}`;
		const lastOptionButton = document.querySelector<HTMLElement>(`#${CSS.escape(lastOptionId)}`);
		lastOptionButton?.focus();
	} else {
		const regex = new RegExp(`${dropdownId}option([0-9])`);
		const result = currentElement.id.match(regex);
		if (result?.length) {
			const index = parseInt(result[1]);
			if (index > 0) {
				const nextOptionId = `${dropdownId}option${index - 1}`;
				const nextOption = document.querySelector<HTMLElement>(`#${CSS.escape(nextOptionId)}`);
				nextOption?.focus();
			}
		}
	}
}

// Generic so callers can use a narrower key type (e.g. MergeMethod) for submitAction.
export const Dropdown = <T extends string>({
	options,
	defaultOption,
	submitAction,
}: {
	options: { [key: string]: string };
	defaultOption: T;
	submitAction: (selected: T) => Promise<void>;
}) => {
	const [selectedMethod, selectMethod] = useState<T>(defaultOption);
	const [areOptionsVisible, setOptionsVisible] = useState<boolean>(false);

	const dropdownId = uuid();
	const EXPAND_OPTIONS_BUTTON = `expandOptions${dropdownId}`;

	const onClick = () => {
		setOptionsVisible(!areOptionsVisible);
	};

	const onMethodChange = (e: React.MouseEvent<HTMLButtonElement>) => {
		selectMethod((e.target as HTMLButtonElement).value as T);
		setOptionsVisible(false);
		const primaryButtonId = `confirm-button${dropdownId}`;
		const primaryButton = document.querySelector<HTMLElement>(`#${CSS.escape(primaryButtonId)}`);
		primaryButton?.focus();
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (!areOptionsVisible) {
			return;
		}

		// a keydown reaching this handler means something inside the dropdown has focus
		const currentElement = document.activeElement!;

		switch (e.key) {
			case 'Escape':
				setOptionsVisible(false);
				const expandOptionsButton = document.querySelector<HTMLElement>(`#${CSS.escape(EXPAND_OPTIONS_BUTTON)}`);
				expandOptionsButton?.focus();
				break;

			case 'ArrowDown':
				focusNextDropdownOption(dropdownId, EXPAND_OPTIONS_BUTTON, options, currentElement);
				break;

			case 'ArrowUp':
				focusPreviousDropdownOption(dropdownId, EXPAND_OPTIONS_BUTTON, options, currentElement);
				break;
		}
	};

	let expandButtonClass = '';
	if (Object.entries(options).length === 1) {
		expandButtonClass = 'hidden';
	} else if (areOptionsVisible) {
		expandButtonClass = 'open';
	}

	return (
		<div className="select-container" onKeyDown={onKeyDown}>
			<div className="select-control">
				<Confirm dropdownId={dropdownId} options={options} selected={selectedMethod} submitAction={submitAction} />
				<button id={EXPAND_OPTIONS_BUTTON} className={expandButtonClass} onClick={onClick}>
					{chevronIcon}
				</button>
			</div>
			<div className={areOptionsVisible ? 'options-select' : 'hidden'}>
				{Object.entries(options).map(([method, text], index) => (
					<button id={`${dropdownId}option${index}`} key={method} value={method} onClick={onMethodChange}>
						{text}
					</button>
				))}
			</div>
		</div>
	);
};

function Confirm<T extends string>({
	dropdownId,
	options,
	selected,
	submitAction,
}: {
	readonly dropdownId: string;
	readonly options: { [key: string]: string };
	readonly selected: T;
	readonly submitAction: (selected: T) => Promise<void>;
}) {
	const [isBusy, setBusy] = useState(false);

	const onSubmit = async (event: React.FormEvent) => {
		event.preventDefault();

		try {
			setBusy(true);
			await submitAction(selected);
		} finally {
			setBusy(false);
		}
	};

	return (
		<form onSubmit={onSubmit}>
			<input disabled={isBusy} type="submit" id={`confirm-button${dropdownId}`} value={options[selected]} />
		</form>
	);
}
