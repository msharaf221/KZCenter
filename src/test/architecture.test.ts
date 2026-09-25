import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function check(root = 'src') {
  const result = spawnSync(process.execPath, ['scripts/check-architecture.mjs', '--root', root, '--json'], {
    encoding: 'utf8',
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  return { status: result.status, ...(JSON.parse(result.stdout) as { modules: number; issues: string[] }) };
}

function fixture(files: Record<string, string>) {
  const directory = mkdtempSync(path.join(tmpdir(), 'kz-architecture-'));
  try {
    for (const [file, source] of Object.entries(files)) {
      const destination = path.join(directory, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, source);
    }
    return check(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('architecture guardrails', () => {
  it('checks the complete production source tree without runtime cycles or inverted dependencies', () => {
    const result = check();
    expect(result.modules).toBeGreaterThan(100);
    expect(result.issues).toEqual([]);
    expect(result.status).toBe(0);
  });

  it('rejects static runtime cycles', () => {
    const result = fixture({
      'lib/a.ts': "import { b } from './b'; export const a = () => b();",
      'lib/b.ts': "import { a } from './a'; export const b = () => a();",
    });
    expect(result.status).toBe(1);
    expect(result.issues.some(issue => issue.startsWith('Runtime cycle:'))).toBe(true);
  });

  it('allows erased type-only references without confusing them with runtime cycles', () => {
    const result = fixture({
      'lib/a.ts': "import type { B } from './b'; export interface A { b?: B }",
      'lib/b.ts': "import { type A } from './a'; export interface B { a?: A }",
    });
    expect(result.issues).toEqual([]);
    expect(result.status).toBe(0);
  });

  it('rejects indirect storage dependencies in domain calculations', () => {
    const result = fixture({
      'domain/calculation.ts': "import { read } from '../lib/helper'; export const calculate = () => read();",
      'lib/helper.ts': "import { row } from '../data/records'; export const read = () => row;",
      'data/records.ts': 'export const row = 1;',
    });
    expect(result.status).toBe(1);
    expect(result.issues).toContain('domain/calculation.ts: transitive runtime dependency on data/records.ts');
  });

  it('rejects backwards infrastructure imports, unsafe any, and compatibility-facade usage', () => {
    const result = fixture({
      'data/records.ts':
        "import { calculate } from '../services/business'; export const read = (): any => calculate();",
      'services/business.ts': 'export const calculate = () => 1;',
      'lib/db.ts': "export { read } from '../data/records';",
      'pages/Page.ts': "import { read } from '../lib/db'; export const page = read;",
    });
    expect(result.status).toBe(1);
    expect(result.issues.some(issue => issue.includes('data infrastructure must not depend'))).toBe(true);
    expect(result.issues.some(issue => issue.includes('not any'))).toBe(true);
    expect(result.issues.some(issue => issue.includes('compatibility facade'))).toBe(true);
  });

  it('blocks reintroducing the removed reporting helper, including dynamic imports', () => {
    const result = fixture({
      'pages/ReportsPage.tsx': "export const report = () => import('../services/payroll/profitability');",
      'services/queries/reports.ts': "import { calculate } from '../payroll/profitability'; export const query = calculate;",
      'services/payroll/profitability.ts': 'export const calculate = () => [];',
    });
    expect(result.status).toBe(1);
    expect(result.issues.filter(issue => issue.includes('removed group-profitability'))).toHaveLength(2);
  });
});


it('rejects UI storage mutations including aliases, namespaces and direct transactions', () => {
  const result = fixture({
    'data/records.ts': 'export const dbPut = () => {};',
    'data/database.ts': 'export const getDB = () => {};',
    'pages/Page.tsx': "import { dbPut as save } from '../data/records'; export const page = save;",
    'features/feature.ts': "import * as records from '../data/records'; export const feature = records;",
    'hooks/hook.ts': "import { getDB } from '../data/database'; export const hook = getDB;",
    'pages/raw.tsx': 'export const remove = () => indexedDB.deleteDatabase("test");',
  });
  expect(result.status).toBe(1);
  expect(result.issues.filter(issue => issue.includes('UI mutations'))).toHaveLength(3);
  expect(result.issues.some(issue => issue.includes('raw IndexedDB'))).toBe(true);
});

it('detects source files that Git would omit from a clean checkout', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'kz-ignored-source-'));
  try {
    mkdirSync(path.join(directory, 'src/services/backups'), { recursive: true });
    writeFileSync(path.join(directory, '.gitignore'), 'backups/\n');
    writeFileSync(path.join(directory, 'src/services/backups/cloud.ts'), 'export const test = 1;');
    // Read the existing index with a synthetic work tree; no branches or repositories are created.
    const result = spawnSync(process.execPath, [path.resolve('scripts/check-architecture.mjs'), '--json'], {
      cwd: directory, encoding: 'utf8', env: { ...process.env, GIT_DIR: path.resolve('.git'), GIT_WORK_TREE: directory },
    });
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout) as { issues: string[] };
    expect(report.issues.some(issue => issue.includes('source file is ignored by Git'))).toBe(true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it('rejects silent fallback reads and UI write re-exports without crashing the checker', () => {
  const result = fixture({
    'data/records.ts': 'export const dbGetAll = () => []; export const dbPut = () => {};',
    'data/readers.ts': 'export const readAll = () => [];',
    'lib/db.ts': "export { dbGetAll, dbPut } from '../data/records';",
    'services/old.ts': "import { dbGetAll as read } from '../data/records'; export const rows = read;",
    'services/new.ts': "import { readAll } from '../data/readers'; export const rows = readAll;",
    'pages/Page.ts': "export { dbPut as save } from '../data/records';",
    'pages/Dynamic.ts': "export const read = () => import('../data/records');",
  });
  expect(result.status).toBe(1);
  expect(result.issues.some(issue => issue.includes('services/old.ts: production reads'))).toBe(true);
  expect(result.issues.some(issue => issue.includes('pages/Page.ts: UI mutations'))).toBe(true);
  expect(result.issues.some(issue => issue.includes('pages/Dynamic.ts: UI mutations'))).toBe(true);
  expect(result.issues.some(issue => issue.includes('services/new.ts'))).toBe(false);
  expect(result.issues.some(issue => issue.includes('lib/db.ts:'))).toBe(false);
});


it('routes financial UI writes through application commands while permitting read-only queries', () => {
  const result = fixture({
    'services/paymentService.ts': 'export const recordRefund = () => {}; export const getRefunds = () => [];',
    'services/billing/unitOfWork.ts': 'export const withBillingTransaction = () => {};',
    'services/commands/studentFinance.ts': 'export const refundStudentPayment = () => {};',
    'components/Unsafe.ts': "import { recordRefund as save } from '../services/paymentService'; export const unsafe = save;",
    'pages/Read.ts': "import { getRefunds } from '../services/paymentService'; export const read = getRefunds;",
    'pages/Command.ts': "import { refundStudentPayment } from '../services/commands/studentFinance'; export const command = refundStudentPayment;",
    'pages/Transaction.ts': "import { withBillingTransaction } from '../services/billing/unitOfWork'; export const direct = withBillingTransaction;",
  });
  expect(result.status).toBe(1);
  expect(result.issues.some(issue => issue.includes('components/Unsafe.ts: financial UI writes'))).toBe(true);
  expect(result.issues.some(issue => issue.includes('pages/Transaction.ts: UI mutations'))).toBe(true);
  expect(result.issues.some(issue => issue.includes('pages/Read.ts:'))).toBe(false);
  expect(result.issues.some(issue => issue.includes('pages/Command.ts:'))).toBe(false);
});

it('blocks UI access to composable membership work and maintenance mutations, but not audits', () => {
  const result = fixture({
    'services/membership/enrollment.ts': 'export const detachInUnit = () => {};',
    'services/maintenance/quality.ts': 'export const repairQuality = () => {}; export const auditData = () => {};',
    'services/receiptService.ts': 'export const backfillReceiptNumbers = () => {}; export const peekReceiptNo = () => {};',
    'components/Bad.ts': "export { detachInUnit } from '../services/membership/enrollment';",
    'pages/Bad.ts': "import { repairQuality as repair } from '../services/maintenance/quality'; export const call = repair;",
    'features/Receipt.ts': "import * as receipts from '../services/receiptService'; export const call = receipts.backfillReceiptNumbers;",
    'pages/Read.ts': "import { auditData } from '../services/maintenance/quality'; import { peekReceiptNo } from '../services/receiptService'; export const read = [auditData, peekReceiptNo];",
  });
  expect(result.status).toBe(1);
  expect(result.issues.filter(issue => issue.includes('financial UI writes'))).toHaveLength(3);
  expect(result.issues.some(issue => issue.includes('pages/Read.ts:'))).toBe(false);
});
