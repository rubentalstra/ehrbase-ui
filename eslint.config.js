// @ts-check
//
// ESLint v10 flat config.
//
// Plugin selection rationale lives in docs/architecture.md §12.3. The short
// version:
//
// - `eslint-plugin-jsx-a11y-x` is the actively-maintained fork of
//   `eslint-plugin-jsx-a11y` (canonical not ESLint-10-compatible yet).
//   Its rules carry the prefix `jsx-a11y-x/*` — the plugin must be aliased
//   under that exact name in the config.
// - `@eslint-react/eslint-plugin` is the modern rewrite of
//   `eslint-plugin-react` (canonical broken on ESLint 10, PR #3979 stalled).
// - `eslint-plugin-react-hooks@7` is the first major with native ESLint 10
//   support.
// - `typescript-eslint@8` officially supports `eslint ^8.57 || ^9 || ^10`.

import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11yX from 'eslint-plugin-jsx-a11y-x'
import reactX from '@eslint-react/eslint-plugin'
import globals from 'globals'

export default defineConfig([
  globalIgnores([
    'node_modules/**',
    '.output/**',
    '.nitro/**',
    'dist/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'storybook-static/**',
    'src/paraglide/**',
    'src/routeTree.gen.ts',
    'src/lib/api/ehrbase-generated/**',
  ]),

  // ───────────────────────────────────────────────────────────────────────
  // Source code (src/, e2e/) — TS, with type information.
  // ───────────────────────────────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@eslint-react': reactX,
      'react-hooks': reactHooks,
      'jsx-a11y-x': jsxA11yX,
    },
    rules: {
      ...reactX.configs.recommended.rules,

      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      ...jsxA11yX.configs.strict.rules,
      'jsx-a11y-x/alt-text': 'error',
      'jsx-a11y-x/anchor-has-content': 'error',
      'jsx-a11y-x/anchor-is-valid': 'error',
      'jsx-a11y-x/aria-props': 'error',
      'jsx-a11y-x/aria-proptypes': 'error',
      'jsx-a11y-x/aria-role': 'error',
      'jsx-a11y-x/aria-unsupported-elements': 'error',
      'jsx-a11y-x/role-has-required-aria-props': 'error',
      'jsx-a11y-x/role-supports-aria-props': 'error',
      'jsx-a11y-x/label-has-associated-control': 'error',
      'jsx-a11y-x/no-redundant-roles': 'error',
      'jsx-a11y-x/click-events-have-key-events': 'error',
      'jsx-a11y-x/no-static-element-interactions': 'error',
      'jsx-a11y-x/no-noninteractive-element-interactions': 'error',
      'jsx-a11y-x/heading-has-content': 'error',
      'jsx-a11y-x/iframe-has-title': 'error',
      'jsx-a11y-x/img-redundant-alt': 'error',
      'jsx-a11y-x/no-autofocus': 'error',
      'jsx-a11y-x/no-distracting-elements': 'error',
      'jsx-a11y-x/scope': 'error',
      'jsx-a11y-x/tabindex-no-positive': 'error',
      'jsx-a11y-x/lang': 'error',
      'jsx-a11y-x/html-has-lang': 'error',
      'jsx-a11y-x/no-access-key': 'error',
      'jsx-a11y-x/media-has-caption': 'error',
      'jsx-a11y-x/no-aria-hidden-on-focusable': 'error',
      'jsx-a11y-x/prefer-tag-over-role': 'error',

      // No `as` casts — use Zod parse or type guards (docs/architecture.md §17).
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],

      // Allow Promise-returning event handlers (React 19 form-action patterns).
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
    settings: {
      'jsx-a11y-x': {
        polymorphicPropName: 'as',
        components: {
          Button: 'button',
          Link: 'a',
          Image: 'img',
          Input: 'input',
          Label: 'label',
          Textarea: 'textarea',
        },
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // Tests can use any-type assertions.
  // ───────────────────────────────────────────────────────────────────────
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // Vendored shadcn/ui primitives — copied into the repo via the shadcn
  // CLI per docs/architecture.md §6, so treated as our code, but the
  // upstream code uses `as` casts and pre-React-19 patterns by convention.
  // Linting policy:
  //   - Allow `as` assertions (we don't want to diverge on every shadcn add).
  //   - Allow `aria-hidden` on focusable elements (radix patterns rely on it).
  //   - Lower @eslint-react warnings to off (sidebar uses 18-era patterns).
  // ───────────────────────────────────────────────────────────────────────
  {
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/hooks/use-mobile.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@eslint-react/no-use-context': 'off',
      '@eslint-react/no-context-provider': 'off',
      '@eslint-react/use-state': 'off',
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/no-nested-component-definitions': 'off',
      '@eslint-react/no-array-index-key': 'off',
      '@eslint-react/dom-no-dangerously-set-innerhtml': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'jsx-a11y-x/no-aria-hidden-on-focusable': 'off',
      'jsx-a11y-x/prefer-tag-over-role': 'off',
      'jsx-a11y-x/click-events-have-key-events': 'off',
      'jsx-a11y-x/no-noninteractive-element-interactions': 'off',
      'jsx-a11y-x/anchor-has-content': 'off',
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // Root config / build scripts — JS, no type information available.
  // ───────────────────────────────────────────────────────────────────────
  {
    files: ['*.{ts,js,mjs,cjs}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.disableTypeChecked,
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Root TS configs (vite.config.ts, vitest.config.ts) are not inside the
      // project tsconfig — we skip type-aware rules here.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
