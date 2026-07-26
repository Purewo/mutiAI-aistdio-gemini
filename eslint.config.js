import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/api/schema.d.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Product resources are typed from the OpenAPI snapshot. `any` here means a hand-written
      // shape has crept in, which the contract rules forbid.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Views must go through the typed client layer in `src/api/`.
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Use the typed client in src/api instead of calling fetch directly.' },
      ],
    },
  },
  {
    // The transport boundary is the one place allowed to call fetch.
    files: ['src/api/**/*.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
);
