// The webapp's lint rules: Next's own config, plus the house rules
// backend/eslint.config.mjs sets, so one repo does not have two opinions about
// braces or import order. Next's half is what the backend cannot have -- the
// react-hooks rules, and the checks for the framework's own footguns.
//
// FlatCompat because eslint-config-next is still an eslintrc-style shareable
// config; this is the shape create-next-app emits for eslint 9.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

// Named rather than exported anonymously, which Next's own
// `import/no-anonymous-default-export` warns about -- including here.
const eslintConfig = [
  {
    // Build output and the generated api types. `types/openapi.d.ts` is
    // written by openapi-typescript on every install, dev, build and
    // typecheck, so linting it would only ever report on a generator.
    ignores: ['.next/**', 'out/**', 'next-env.d.ts', 'types/openapi.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // --- the same rules the backend enforces -----------------------------
      'arrow-body-style': ['error', 'as-needed'],
      // Note this is the opposite of the usual default: a single-statement
      // if/else body must have NO braces.
      curly: ['error', 'multi'],
      'newline-before-return': 'error',
      // Everything outside the current directory goes through the `@/*`
      // alias, as `src/*` does on the backend.
      'no-restricted-imports': ['error', { patterns: ['../*'] }],
      'import/order': [
        'error',
        {
          pathGroups: [{ pattern: '@/**', group: 'parent' }],
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'sort-imports': [
        'error',
        { ignoreCase: true, ignoreDeclarationSort: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { varsIgnorePattern: '[iI]gnored', argsIgnorePattern: '^_' },
      ],
    },
  },
];

export default eslintConfig;
