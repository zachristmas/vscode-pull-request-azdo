// Minimal typings for the react-syntax-highlighter surface used by the webviews (no @types package installed).
declare module 'react-syntax-highlighter' {
	import * as React from 'react';

	export interface SyntaxHighlighterProps {
		language?: string;
		style?: { [selector: string]: React.CSSProperties };
		showLineNumbers?: boolean;
		wrapLongLines?: boolean;
		children?: React.ReactNode;
	}

	export const Prism: React.ComponentType<SyntaxHighlighterProps>;
	export const Light: React.ComponentType<SyntaxHighlighterProps>;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
	import { CSSProperties } from 'react';

	type SyntaxTheme = { [selector: string]: CSSProperties };
	export const prism: SyntaxTheme;
	export const vscDarkPlus: SyntaxTheme;
}
