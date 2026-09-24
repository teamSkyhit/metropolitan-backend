// @ts-check
import { readdirSync } from 'node:fs';
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Architecture rules (see docs/MODULE_STANDARD.md):
 *  1. Only repositories may import the Prisma client (src/config/database).
 *  2. A module may import another module only through its public index.ts.
 */
const modules = readdirSync(new URL('./src/modules', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const prismaRestriction = {
  group: ['**/config/database', '**/config/database.*'],
  message: 'Only *.repository.ts files may use the Prisma client. Go through the module repository.',
};

function moduleBoundaryConfigs(moduleName) {
  const others = modules.filter((name) => name !== moduleName);
  const crossModule = others.map((other) => ({
    regex: `^(\\.\\./)+(modules/)?${escape(other)}/.+`,
    message: `Import "${other}" through its public index ("../${other}") only.`,
  }));
  const files = [`src/modules/${moduleName}/**/*.ts`];
  return [
    {
      files,
      ignores: ['**/*.repository.ts'],
      rules: { 'no-restricted-imports': ['error', { patterns: [prismaRestriction, ...crossModule] }] },
    },
    {
      files: [`src/modules/${moduleName}/**/*.repository.ts`],
      rules: { 'no-restricted-imports': ['error', { patterns: crossModule }] },
    },
  ];
}

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'scripts/templates/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/shared/**/*.ts', 'src/middleware/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            prismaRestriction,
            { group: ['**/modules/**'], message: 'Shared code must not depend on feature modules.' },
          ],
        },
      ],
    },
  },
  ...modules.flatMap(moduleBoundaryConfigs),
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts', 'prisma/**/*.ts'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-non-null-assertion': 'off' },
  }
);
