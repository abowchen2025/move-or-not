import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.browser },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
      // NFR-S6：使用者輸入一律以 textContent 輸出
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]',
          message: '請改用 textContent（NFR-S6）。',
        },
        {
          selector: 'CallExpression[callee.property.name=/^(insertAdjacentHTML|write|writeln)$/]',
          message: '請改用 textContent 或 DOM API（NFR-S6）。',
        },
      ],
      // D-16：產圖腳本不得被前端打包引用
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/tools/**'], message: 'tools/ 只供一次性產圖，不可被前端引用（D-16）。' },
          ],
        },
      ],
    },
  },
  {
    files: ['vite.config.ts', 'build/**', 'scripts/**', '**/*.test.ts'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
