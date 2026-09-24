/**
 * Scaffolds a new feature module that follows docs/MODULE_STANDARD.md.
 *
 *   npm run gen:module -- <module-name>
 *
 * <module-name> is the plural, kebab-case resource name used in the URL,
 * e.g. `customers`, `price-lists`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '..');
const templates = join(root, 'scripts/templates/module');

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
  console.error('Usage: npm run gen:module -- <module-name>   (plural kebab-case, e.g. price-lists)');
  process.exit(1);
}

const words = name.split('-');
const Pascal = words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join('');
const camel = Pascal[0]!.toLowerCase() + Pascal.slice(1);
const UPPER = words.map((word) => word.toUpperCase()).join('_');

const render = (template: string) =>
  template
    .replaceAll('__MODULE__', UPPER)
    .replaceAll('__Module__', Pascal)
    .replaceAll('__camel__', camel)
    .replaceAll('__module__', name);

const moduleDir = join(root, 'src/modules', name);
if (existsSync(moduleDir)) {
  console.error(`Module "${name}" already exists at src/modules/${name}`);
  process.exit(1);
}
mkdirSync(moduleDir, { recursive: true });

const files: [template: string, target: string][] = [
  ['index.ts.tpl', join(moduleDir, 'index.ts')],
  ['module.schema.ts.tpl', join(moduleDir, `${name}.schema.ts`)],
  ['module.repository.ts.tpl', join(moduleDir, `${name}.repository.ts`)],
  ['module.service.ts.tpl', join(moduleDir, `${name}.service.ts`)],
  ['module.controller.ts.tpl', join(moduleDir, `${name}.controller.ts`)],
  ['module.routes.ts.tpl', join(moduleDir, `${name}.routes.ts`)],
  ['module.docs.ts.tpl', join(moduleDir, `${name}.docs.ts`)],
  ['module.test.ts.tpl', join(root, 'tests', `${name}.test.ts`)],
];

for (const [template, target] of files) {
  writeFileSync(target, render(readFileSync(join(templates, template), 'utf8')));
  console.log(`  created ${target.replace(`${root}/`, '')}`);
}

function insertBefore(file: string, marker: string, text: string) {
  const path = join(root, file);
  const source = readFileSync(path, 'utf8');
  const index = source.indexOf(marker);
  if (index === -1) throw new Error(`Marker "${marker}" not found in ${file}`);
  const lineStart = source.lastIndexOf('\n', index) + 1;
  writeFileSync(path, source.slice(0, lineStart) + text + source.slice(lineStart));
  console.log(`  updated ${file}`);
}

insertBefore(
  'src/shared/security/permissions.ts',
  '// @generator:permissions',
  `  ${UPPER}_READ: '${name}:read',\n`
);

const routesFile = 'src/routes/index.ts';
insertBefore(routesFile, '// @generator:modules', `  ${camel}Module,\n`);
insertBefore(
  routesFile,
  'import type { AppModule }',
  `import { ${camel}Module } from '../modules/${name}';\n`
);

console.log(`
Module "${name}" created. Next steps:
  1. Add the Prisma model(s) to prisma/schema.prisma (with the audit + deletedAt columns)
     and run: npm run db:migrate -- --name add_${name.replaceAll('-', '_')}
  2. Implement ${name}.repository.ts, then the schemas, service and controller.
  3. Grant SALES_MANAGER the new permissions in src/shared/security/permissions.ts if needed
     (SUPER_ADMIN gets every permission automatically).
  4. Write the tests in tests/${name}.test.ts.
  5. npm run lint && npm run typecheck && npm test
`);
