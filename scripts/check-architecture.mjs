#!/usr/bin/env node
/** Architectural guardrails, using the project's existing TypeScript dependency. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';
import { compatibilityModules, commandOnlyServices } from '../architecture.config.mjs';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const root = path.resolve(rootIndex === -1 ? 'src' : args[rootIndex + 1]);
const facades = new Set(compatibilityModules);

function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'test' || entry.name === 'node_modules') return [];
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return collect(file);
    return /\.tsx?$/.test(file) && !file.endsWith('.d.ts') ? [file] : [];
  });
}

const files = collect(root);
const fileSet = new Set(files);
const relative = file => path.relative(root, file).split(path.sep).join('/');
const graph = new Map(files.map(file => [file, new Set()]));
const issues = new Set();
// A local build must never rely on source files that disappear from a clean checkout/snapshot.
if (root === path.resolve('src')) {
  const ignored = execFileSync('git', ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', 'src'], { encoding: 'utf8' });
  for (const file of ignored.split('\0').filter(file => /\.tsx?$/.test(file))) {
    issues.add(`${file}: source file is ignored by Git and will not survive a clean checkout`);
  }
}

function resolve(from, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
  const clean = specifier.split('?')[0];
  const base = clean.startsWith('@/') ? path.join(root, clean.slice(2)) : path.resolve(path.dirname(from), clean);
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(file => fileSet.has(file)) || null;
}

for (const file of files) {
  const name = relative(file);
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  if (facades.has(name) && ast.statements.some(node => !ts.isExportDeclaration(node))) {
    issues.add(`${name}: compatibility facades must only re-export their owning modules`);
  }

  function dependency(specifier, runtime, dynamic = false) {
    const destination = resolve(file, specifier);
    if (!destination) return;
    const target = relative(destination);
    const view = /^(pages|components|features|contexts|hooks)\//.test(name);
    if (view && runtime && (/^(data\/(database|transactions|receiptCounter)|services\/billing\/unitOfWork)\.ts$/.test(target))) {
      issues.add(`${name}: UI mutations must go through application commands, not ${target}`);
    }
    if (facades.has(target)) issues.add(`${name}: import the owner instead of the compatibility facade ${target}`);
    if (name.startsWith('data/') && /^(services|features|pages|components|contexts|hooks|app)\//.test(target)) {
      issues.add(`${name}: data infrastructure must not depend on ${target}`);
    }
    if (name.startsWith('domain/') && /^(data|services|features|pages|components|contexts|hooks|app)\//.test(target)) {
      issues.add(`${name}: domain rules must not depend on ${target}`);
    }
    if ((name === 'pages/ReportsPage.tsx' || name === 'services/queries/reports.ts' || name.startsWith('domain/reporting/')) && target.includes('profitability')) {
      issues.add(`${name}: removed group-profitability reporting must not be reintroduced`);
    }
    if (runtime && !dynamic) graph.get(file).add(destination);
  }

  function recordAccess(specifier, runtime, names) {
    const owner = resolve(file, specifier);
    if (runtime && owner && /^(pages|components|features|contexts|hooks)\//.test(name)) {
      const commands = commandOnlyServices[relative(owner)];
      if (commands && (!names || names.some(item => commands.includes(item)))) {
        issues.add(`${name}: financial UI writes must go through application commands, not ${relative(owner)}`);
      }
    }
    const destination = resolve(file, specifier);
    if (!runtime || !destination || relative(destination) !== 'data/records.ts') return;
    const view = /^(pages|components|features|contexts|hooks)\//.test(name);
    const mutations = new Set(['dbAdd', 'dbPut', 'dbSoftDelete', 'dbBulkAdd', 'dbClearStore']);
    const legacyReads = new Set(['dbGetAll', 'dbGetById', 'dbGetByIndex', 'dbGetPaginated']);
    if (view && (!names || names.some(item => mutations.has(item)))) {
      issues.add(`${name}: UI mutations must go through application commands, not data/records.ts`);
    }
    if (!facades.has(name) && (!names || names.some(item => legacyReads.has(item)))) {
      issues.add(`${name}: production reads must use data/readers.ts; legacy fallback readers hide storage failures`);
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyTypes = clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings)
        && bindings.elements.length > 0 && bindings.elements.every(item => item.isTypeOnly));
      recordAccess(node.moduleSpecifier.text, !onlyTypes, bindings && ts.isNamedImports(bindings) ? bindings.elements.filter(item => !item.isTypeOnly).map(item => item.propertyName?.text || item.name.text) : null);
      dependency(node.moduleSpecifier.text, !onlyTypes);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const onlyTypes = node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause)
        && node.exportClause.elements.length > 0 && node.exportClause.elements.every(item => item.isTypeOnly));
      recordAccess(node.moduleSpecifier.text, !onlyTypes, node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements.filter(item => !item.isTypeOnly).map(item => item.propertyName?.text || item.name.text) : null);
      dependency(node.moduleSpecifier.text, !onlyTypes);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      // Lazy routes are intentionally not eager dependency edges, but still obey layer boundaries.
      recordAccess(node.arguments[0].text, true, null);
      dependency(node.arguments[0].text, true, true);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      dependency(node.argument.literal.text, false);
    }
    if (/^(pages|components|features|contexts|hooks)\//.test(name) && ts.isIdentifier(node) && node.text === 'indexedDB') {
      issues.add(`${name}: UI must not access raw IndexedDB; use an application service`);
    }
    if (name.startsWith('data/') && node.kind === ts.SyntaxKind.AnyKeyword) {
      issues.add(`${name}: use schema contracts or unknown at I/O boundaries, not any`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}

const visited = new Set();
const active = [];
function checkCycles(file) {
  if (active.includes(file)) {
    issues.add(`Runtime cycle: ${[...active.slice(active.indexOf(file)), file].map(relative).join(' → ')}`);
    return;
  }
  if (visited.has(file)) return;
  active.push(file);
  for (const next of graph.get(file)) checkCycles(next);
  active.pop();
  visited.add(file);
}
for (const file of files) checkCycles(file);

// Also prevent indirect coupling of pure domain logic through a convenience utility.
for (const file of files.filter(file => relative(file).startsWith('domain/'))) {
  const seen = new Set();
  function inspect(next) {
    if (seen.has(next)) return;
    seen.add(next);
    if (/^(data|services|features|pages|components|contexts|hooks|app)\//.test(relative(next))) {
      issues.add(`${relative(file)}: transitive runtime dependency on ${relative(next)}`);
    }
    for (const child of graph.get(next)) inspect(child);
  }
  inspect(file);
}

const report = { modules: files.length, issues: [...issues].sort() };
if (args.includes('--json')) console.log(JSON.stringify(report));
else if (issues.size) console.error(`Architecture check failed:\n${report.issues.map(issue => `- ${issue}`).join('\n')}`);
else console.log(`Architecture OK: ${files.length} production modules; boundaries respected, no static runtime cycles.`);
process.exitCode = issues.size ? 1 : 0;
