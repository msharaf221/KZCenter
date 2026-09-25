import * as dataQuality from '../lib/dataQuality';
import * as receipts from '../lib/receipts';
import * as dailyBackup from '../lib/dailyBackup';
import * as sheetImport from '../lib/sheetImport';
import * as tableImport from '../lib/tableImport';
import * as tableImportDb from '../lib/tableImportDb';
import * as storage from '../lib/storage';
import * as supabase from '../lib/supabase';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as database from '../lib/db';
import * as payroll from '../lib/payroll';
import { getDB } from '../data/database';
import { calcTeacherPayroll } from '../domain/payroll/calculate';
import { enrollStudent } from '../services/enrollmentService';
import { recordInstallmentPayment } from '../services/paymentService';
import { payPayroll } from '../services/payroll/records';
import legacy from './fixtures/legacy-public-api.json';

function exportedTypeNames(file: string) {
  const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  return ast.statements
    .flatMap(node => {
      if (!ts.isExportDeclaration(node) || !node.exportClause || !ts.isNamedExports(node.exportClause)) return [];
      return node.exportClause.elements.filter(item => node.isTypeOnly || item.isTypeOnly).map(item => item.name.text);
    })
    .sort();
}

describe('legacy public entry points', () => {
  it('preserves every db runtime export, without leaking internal helpers', () => {
    expect(Object.keys(database).sort()).toEqual(legacy.db.values);
  });
  it('preserves every payroll runtime export, including the standalone legacy helper', () => {
    expect(Object.keys(payroll).sort()).toEqual(legacy.payroll.values);
  });
  it('preserves the named domain/type exports used by external callers', () => {
    expect(exportedTypeNames('src/lib/db.ts')).toEqual(legacy.db.types);
    expect(exportedTypeNames('src/lib/payroll.ts')).toEqual(legacy.payroll.types);
  });
  it('forwards to the same implementations rather than maintaining duplicate business logic', () => {
    expect(database.getDB).toBe(getDB);
    expect(database.enrollStudent).toBe(enrollStudent);
    expect(database.recordInstallmentPayment).toBe(recordInstallmentPayment);
    expect(payroll.calcTeacherPayroll).toBe(calcTeacherPayroll);
    expect(payroll.payPayroll).toBe(payPayroll);
  });
});

for (const [name, module] of Object.entries({ dataQuality, receipts, dailyBackup, sheetImport, tableImport, tableImportDb, storage, supabase })) {
  const expected = legacy[name as keyof typeof legacy];
  it(`preserves the ${name} public runtime/type contract`, () => {
    expect(Object.keys(module).sort()).toEqual(expected.values);
    expect(exportedTypeNames(`src/lib/${name}.ts`)).toEqual(expected.types);
  });
}
