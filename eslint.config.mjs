import globals from 'globals';
import { jsdoc } from 'eslint-plugin-jsdoc';
import smNoSaccadeStyle from 'sm-no-saccade-style';

export default [
	...smNoSaccadeStyle.configs.recommended.map(
		config => ({
			...config
			, files: ['source/**/*.mjs']
		})
	)
	, {
		files: ['source/**/*.mjs']
		, languageOptions: {
			sourceType: 'module'
			, ecmaVersion: 'latest'
			, globals: {
				...globals.browser
			}
		}
		, rules: {
			'jsdoc/require-jsdoc': ['warn', {
				contexts: [
					'PropertyDefinition'
					, 'ClassProperty'
					, 'FunctionDeclaration'
					, 'MethodDefinition'
					, 'ClassDeclaration'
				]
			}]
		}
	}
	, {
		...jsdoc({ config: 'flat/recommended' })
		, files: ['source/**/*.mjs']
	}
];
