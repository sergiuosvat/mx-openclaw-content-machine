import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
    js.configs.recommended,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
            },
            globals: {
                process: 'readonly',
                console: 'readonly',
                __dirname: 'readonly',
                require: 'readonly',
                module: 'readonly',
                fetch: 'readonly',
                AbortSignal: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                URL: 'readonly',
                Buffer: 'readonly',
                NodeJS: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            // TypeScript-aware rules
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],

            // Security
            'no-eval': 'error',
            'no-implied-eval': 'error',

            // Code quality
            'no-console': 'warn',
            'eqeqeq': ['error', 'always'],
            'no-var': 'error',
            'prefer-const': 'error',
            'no-useless-escape': 'warn',
            'preserve-caught-error': 'off',
        },
    },
    {
        // Ignore test files for stricter rules
        files: ['src/**/*.test.ts'],
        languageOptions: {
            globals: {
                describe: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                jest: 'readonly',
            },
        },
        rules: {
            'no-console': 'off',
        },
    },
];
