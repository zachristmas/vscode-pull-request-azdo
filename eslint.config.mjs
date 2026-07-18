import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

// Shadow mode (see repo convention): new rule sets enter as warnings only; individual rules get
// promoted to 'error' on evidence, not on a date.
function downgradeToWarn(rules) {
	return Object.fromEntries(
		Object.entries(rules).map(([id, conf]) => {
			if (Array.isArray(conf)) {
				return [id, conf[0] === 'off' ? conf : ['warn', ...conf.slice(1)]];
			}
			return [id, conf === 'off' ? 'off' : 'warn'];
		}),
	);
}

// Flat-config port of the old .eslintrc.base.json (ESLint 7 / typescript-eslint 4 era).
// Rule intent preserved 1:1, including the deliberate offs; import/* rules moved to
// eslint-plugin-import-x (eslint-plugin-import has no ESLint 10 support).
export default tseslint.config(
	{
		ignores: ['dist/**', 'out/**', 'node_modules/**', '.vscode-test/**', '**/*.d.ts', '*.js', 'scripts/**'],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	importX.flatConfigs.recommended,
	importX.flatConfigs.typescript,
	{
		languageOptions: {
			parserOptions: {
				// Not projectService: webviews/tests are separate tsconfig projects the service
				// won't discover from the root; tsconfig.eslint.json spans all linted files.
				project: './tsconfig.eslint.json',
				tsconfigRootDir: import.meta.dirname,
			},
		},
		linterOptions: {
			reportUnusedDisableDirectives: 'warn',
		},
		settings: {
			'import-x/resolver': {
				typescript: {
					project: './tsconfig.eslint.json',
				},
			},
		},
		rules: {
			'new-parens': 'error',
			'no-async-promise-executor': 'off',
			'no-console': 'off',
			'no-constant-condition': ['warn', { checkLoops: false }],
			'no-caller': 'error',
			'no-case-declarations': 'off',
			'no-debugger': 'warn',
			'no-dupe-class-members': 'off',
			'no-duplicate-imports': 'error',
			'no-else-return': 'off',
			'no-empty': 'off',
			'no-eval': 'error',
			'no-ex-assign': 'warn',
			'no-extend-native': 'error',
			'no-extra-bind': 'error',
			'no-extra-boolean-cast': 'off',
			'no-floating-decimal': 'error',
			'no-implicit-coercion': 'off',
			'no-implied-eval': 'error',
			'no-inner-declarations': 'off',
			'no-lone-blocks': 'error',
			'no-lonely-if': 'off',
			'no-loop-func': 'error',
			'no-multi-spaces': 'off',
			'no-prototype-builtins': 'off',
			'no-return-assign': 'error',
			'no-return-await': 'off',
			'no-self-compare': 'error',
			'no-sequences': 'error',
			'no-template-curly-in-string': 'warn',
			'no-throw-literal': 'error',
			'no-unmodified-loop-condition': 'warn',
			'no-unneeded-ternary': 'error',
			'no-use-before-define': 'off',
			'no-useless-call': 'error',
			'no-useless-catch': 'error',
			'no-useless-computed-key': 'error',
			'no-useless-concat': 'error',
			'no-useless-escape': 'off',
			'no-useless-rename': 'error',
			'no-useless-return': 'off',
			'no-var': 'error',
			'no-with': 'error',
			'object-shorthand': 'off',
			'one-var': 'off',
			'prefer-arrow-callback': 'off',
			'prefer-const': 'off',
			'prefer-numeric-literals': 'error',
			'prefer-object-spread': 'error',
			'prefer-rest-params': 'error',
			'prefer-spread': 'error',
			'prefer-template': 'off',
			quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
			'require-atomic-updates': 'off',
			semi: ['error', 'always'],
			'semi-style': ['error', 'last'],
			'sort-imports': [
				'error',
				{
					ignoreCase: true,
					ignoreDeclarationSort: true,
					ignoreMemberSort: false,
					memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
				},
			],
			yoda: 'error',
			'import-x/export': 'off',
			// json: require('../package.json') reads need their extension
			'import-x/extensions': ['error', 'never', { json: 'always' }],
			'import-x/named': 'off',
			'import-x/namespace': 'off',
			'import-x/newline-after-import': 'warn',
			'import-x/no-cycle': 'off',
			'import-x/no-dynamic-require': 'error',
			'import-x/no-default-export': 'off',
			'import-x/no-duplicates': 'error',
			'import-x/no-self-import': 'error',
			'import-x/no-unresolved': ['warn', { ignore: ['vscode', 'ghpr', 'git', 'extensionApi'] }],
			'import-x/order': [
				'warn',
				{
					groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
					'newlines-between': 'ignore',
					alphabetize: {
						order: 'asc',
						caseInsensitive: true,
					},
				},
			],
			'@typescript-eslint/await-thenable': 'error',
			'@typescript-eslint/consistent-type-assertions': [
				'warn',
				{
					assertionStyle: 'as',
					objectLiteralTypeAssertions: 'allow-as-parameter',
				},
			],
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-member-accessibility': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/no-empty-interface': 'error',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-floating-promises': 'off',
			'@typescript-eslint/no-implied-eval': 'error',
			'@typescript-eslint/no-inferrable-types': 'off',
			'@typescript-eslint/no-misused-promises': ['error', { checksConditionals: false, checksVoidReturn: false }],
			'@typescript-eslint/no-namespace': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',
			// require() is load-bearing here: node polyfills, dynamic vsls, package.json reads
			'@typescript-eslint/no-require-imports': 'off',
			// TODO: 21 pre-existing numeric-enum comparisons (ADO API enums vs literals); tighten separately
			'@typescript-eslint/no-unsafe-enum-comparison': 'off',
			'@typescript-eslint/no-this-alias': 'off',
			'@typescript-eslint/no-unnecessary-condition': 'off',
			'@typescript-eslint/no-unnecessary-type-assertion': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/no-unused-expressions': ['warn', { allowShortCircuit: true }],
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-use-before-define': 'off',
			'@typescript-eslint/prefer-regexp-exec': 'off',
			'@typescript-eslint/prefer-nullish-coalescing': 'off',
			'@typescript-eslint/prefer-optional-chain': 'off',
			'@typescript-eslint/require-await': 'off',
			'@typescript-eslint/restrict-plus-operands': 'error',
			'@typescript-eslint/restrict-template-expressions': 'off',
			'@typescript-eslint/strict-boolean-expressions': 'off',
			'@typescript-eslint/unbound-method': 'off',
		},
	},
	{
		name: 'sonarjs-shadow',
		plugins: { sonarjs },
		rules: {
			...downgradeToWarn(sonarjs.configs.recommended.rules),
			'sonarjs/cognitive-complexity': ['warn', 15],
			// A legacy codebase self-reports its TODOs; the tag rule adds no signal here.
			'sonarjs/todo-tag': 'off',
			// Promoted to error: cleared to zero during the lint burndown (evidence-based flip).
			'sonarjs/no-ignored-exceptions': 'error',
			'sonarjs/no-misleading-array-reverse': 'error',
			'sonarjs/no-nested-conditional': 'error',
			'sonarjs/no-redundant-jump': 'error',
			'sonarjs/no-redundant-optional': 'error',
			'sonarjs/public-static-readonly': 'error',
			'sonarjs/prefer-single-boolean-return': 'error',
			'sonarjs/unused-import': 'error',
		},
	},
	{
		name: 'unicorn-shadow',
		plugins: { unicorn },
		rules: {
			...downgradeToWarn(unicorn.configs.recommended.rules),
			// Demands ES2025 Iterator#toArray(): no types in the es2022 lib and no runtime
			// support on the Node 20 extension host. The flagged [...map.values()] spreads
			// are the correct idiom for this target.
			'unicorn/prefer-iterator-to-array': 'off',
			// This is a CJS extension host; module strategy changes with the TS 7 /
			// moduleResolution rework, not here. (The redundant 'use strict' directives the
			// rule flagged were deleted anyway - tsc alwaysStrict emits its own.)
			'unicorn/prefer-module': 'off',
			// The extension:webworker bundle resolves node builtins through resolve.fallback
			// keys in webpack.config.js that are keyed WITHOUT the node: scheme, and
			// @types/node@12 has no node:* module declarations. The node: prefix breaks both.
			// The sole webviews hit (common/events.ts) imports the npm `events` shim, not the
			// builtin, so the rule is off globally. Revisit with the TS 7 / moduleResolution rework.
			'unicorn/prefer-node-protocol': 'off',
			// Churn-heavy stylistic rules that would bury the useful signal in this codebase
			// (top offenders measured at 2283 warnings on first run; these are style-only):
			'unicorn/prevent-abbreviations': 'off',
			'unicorn/filename-case': 'off',
			'unicorn/no-null': 'off',
			'unicorn/name-replacements': 'off',
			'unicorn/switch-case-braces': 'off',
			'unicorn/catch-error-name': 'off',
			'unicorn/no-for-each': 'off',
			'unicorn/consistent-boolean-name': 'off',
			'unicorn/prefer-single-call': 'off',
			'unicorn/prefer-await': 'off',
			'unicorn/consistent-class-member-order': 'off',
			'unicorn/explicit-length-check': 'off',
			'unicorn/no-negated-condition': 'off',
			'unicorn/no-useless-else': 'off',
			// Promoted to error: cleared to zero during the lint burndown (evidence-based flip).
			'unicorn/class-reference-in-static-methods': 'error',
			'unicorn/consistent-assert': 'error',
			'unicorn/import-style': 'error',
			'unicorn/logical-assignment-operators': 'error',
			'unicorn/no-await-expression-member': 'error',
			'unicorn/no-confusing-array-splice': 'error',
			'unicorn/no-unreadable-for-of-expression': 'error',
			'unicorn/operator-assignment': 'error',
			'unicorn/prefer-array-find': 'error',
			'unicorn/prefer-array-from-map': 'error',
			'unicorn/prefer-array-some': 'error',
			'unicorn/prefer-at': 'error',
			'unicorn/prefer-code-point': 'error',
			'unicorn/prefer-else-if': 'error',
			'unicorn/prefer-includes-over-repeated-comparisons': 'error',
			'unicorn/prefer-logical-operator-over-ternary': 'error',
			'unicorn/prefer-minimal-ternary': 'error',
			'unicorn/prefer-number-is-safe-integer': 'error',
			'unicorn/prefer-query-selector': 'error',
			'unicorn/prefer-simple-condition-first': 'error',
			'unicorn/prefer-spread': 'error',
			'unicorn/prefer-string-slice': 'error',
			'unicorn/no-static-only-class': 'error',
			'unicorn/no-useless-template-literals': 'error',
			'unicorn/consistent-existence-index-check': 'error',
			'unicorn/no-for-loop': 'error',
			'unicorn/no-lonely-if': 'error',
			'unicorn/no-negated-array-predicate': 'error',
			'unicorn/no-unnecessary-boolean-comparison': 'error',
			'unicorn/no-unnecessary-slice-end': 'error',
			'unicorn/no-useless-coercion': 'error',
			'unicorn/no-useless-logical-operand': 'error',
			'unicorn/no-useless-promise-resolve-reject': 'error',
			'unicorn/no-useless-spread': 'error',
			'unicorn/no-useless-undefined': 'error',
			'unicorn/numeric-separators-style': 'error',
			'unicorn/prefer-boolean-return': 'error',
			'unicorn/prefer-class-fields': 'error',
			'unicorn/prefer-continue': 'error',
			'unicorn/prefer-date-now': 'error',
			'unicorn/prefer-early-return': 'error',
			'unicorn/prefer-global-this': 'error',
			'unicorn/prefer-includes': 'error',
			'unicorn/prefer-optional-catch-binding': 'error',
			'unicorn/prefer-private-class-fields': 'error',
			'unicorn/prefer-set-has': 'error',
			'unicorn/prefer-set-size': 'error',
			'unicorn/prefer-string-raw': 'error',
			'unicorn/prefer-string-replace-all': 'error',
			'unicorn/prefer-switch': 'error',
			'unicorn/prefer-type-error': 'error',
			'unicorn/prefer-type-literal-last': 'error',
		},
	},
	prettier,
);
