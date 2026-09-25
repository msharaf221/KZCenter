import dayjs from 'dayjs';
import { allocateReceiptNumber } from '../../data/receiptCounter';
import type { StoreRecords } from '../../data/schema';
import { writeTransaction } from '../../data/transactions';
import { allocateLedger } from '../../domain/ledger/allocation';
import { debtorRows, storedStudentTotals, studentBalance } from '../../domain/ledger/balance';
import { billingPolicy } from '../../domain/ledger/policy';
import type { StudentBalance, StudentLedger } from '../../domain/ledger/types';
import { isDeleted } from '../../domain/recordState';
import { DEFAULT_SETTINGS_VALUES, peekSettings, type BillingPolicy } from '../../lib/settings';

/** Shared scope serializes capacity checks, receipts and balances across financial workflows. */
export const BILLING_STORES = ['students', 'groups', 'courses', 'enrollments', 'installments', 'payments', 'refunds', 'counters', 'settings'] as const;
type BillingStore = typeof BILLING_STORES[number];
interface BillingReads {
  all<S extends BillingStore>(store: S, options?: { includeDeleted?: boolean }): Promise<StoreRecords[S][]>;
  get<S extends BillingStore>(store: S, id: string): Promise<StoreRecords[S] | undefined>;
  index<S extends BillingStore>(store: S, index: string, key: IDBValidKey): Promise<StoreRecords[S][]>;
}
export interface BillingUnit extends BillingReads {
  put<S extends BillingStore>(store: S, row: StoreRecords[S]): Promise<void>;
  add<S extends BillingStore>(store: S, row: StoreRecords[S]): Promise<void>;
  bulk<S extends BillingStore>(store: S, rows: StoreRecords[S][]): Promise<void>;
  policy(): Promise<BillingPolicy>;
  receipt(date: string, prefix?: string): Promise<string>;
  ledger(studentId: string): Promise<StudentLedger>;
  balance(studentId: string): Promise<StudentBalance | null>;
  rebuild(studentId: string): Promise<void>;
  recalculate(studentId: string): Promise<void>;
  syncGroup(groupId: string): Promise<void>;
  debtors(): ReturnType<typeof readDebtors>;
}

export async function readStudentLedger(read: BillingReads, studentId: string): Promise<StudentLedger> {
  const [installments, payments, refunds, enrollments] = await Promise.all([
    read.index('installments', 'by-studentId', studentId), read.index('payments', 'by-studentId', studentId),
    read.index('refunds', 'by-studentId', studentId), read.index('enrollments', 'by-studentId', studentId),
  ]);
  return { installments, payments, refunds, enrollments };
}
async function readDebtors(read: BillingReads) {
  const [students, payments, refunds, installments, groups, courses] = await Promise.all([
    read.all('students'), read.all('payments'), read.all('refunds'), read.all('installments'), read.all('groups'), read.all('courses'),
  ]);
  return debtorRows({ students, payments, refunds, installments, groups, courses }, new Date().toISOString());
}

/** Only IDB requests inside work. No network, UI, timers or nested database transactions. */
export function withBillingTransaction<T>(work: (unit: BillingUnit) => Promise<T>): Promise<T> {
  return writeTransaction([...BILLING_STORES], async tx => {
    const unit: BillingUnit = {
      async all<S extends BillingStore>(store: S, options: { includeDeleted?: boolean } = {}) { return (await tx.objectStore(store as BillingStore).getAll()).filter(row => options.includeDeleted || !isDeleted(row)) as StoreRecords[S][]; },
      async get(store, id) { const row = await tx.objectStore(store).get(id); return isDeleted(row) ? undefined : row; },
      async index<S extends BillingStore>(store: S, index: string, key: IDBValidKey) { return (await tx.objectStore(store as BillingStore).index(index).getAll(key)).filter(row => !isDeleted(row)) as StoreRecords[S][]; },
      async put(store, row) { await tx.objectStore(store).put(row); },
      async add(store, row) { await tx.objectStore(store).add(row); },
      async bulk(store, rows) { for (const row of rows) await tx.objectStore(store).put(row); },
      async policy() {
        const settings = { ...DEFAULT_SETTINGS_VALUES, ...(await unit.get('settings', 'main') || peekSettings()) };
        return billingPolicy(settings);
      },
      receipt: (date, prefix) => allocateReceiptNumber(tx.objectStore('counters'), date, prefix),
      ledger: id => readStudentLedger(unit, id),
      async balance(id) {
        const student = await unit.get('students', id);
        if (!student) return null;
        const [ledger, groups, courses] = await Promise.all([unit.ledger(id), unit.all('groups'), unit.all('courses')]);
        return studentBalance(student, ledger, groups, courses, dayjs().format('YYYY-MM-DD'));
      },
      async recalculate(id) {
        const student = await unit.get('students', id);
        if (!student) return;
        const [ledger, groups, courses] = await Promise.all([unit.ledger(id), unit.all('groups'), unit.all('courses')]);
        const totals = storedStudentTotals(student, ledger, groups, courses);
        await unit.put('students', { ...student, totalPaid: totals.paid, totalOwed: totals.owed, updatedAt: new Date().toISOString() });
      },
      async rebuild(id) {
        const { installments, payments } = await unit.ledger(id);
        if (installments.length) {
          const next = allocateLedger(installments, payments, dayjs().format('YYYY-MM-DD'));
          const oldInstallments = new Map(installments.map(row => [row.id, row]));
          const oldPayments = new Map(payments.map(row => [row.id, row]));
          const now = new Date().toISOString();
          for (const row of next.installments) {
            const before = oldInstallments.get(row.id);
            if (before?.paidAmount !== row.paidAmount || before.status !== row.status) await unit.put('installments', { ...row, updatedAt: now });
          }
          for (const row of next.payments) {
            if ((oldPayments.get(row.id)?.installmentIds || []).join(',') !== row.installmentIds?.join(',')) await unit.put('payments', { ...row, updatedAt: now });
          }
        }
        await unit.recalculate(id);
      },
      async syncGroup(id) {
        const group = await unit.get('groups', id);
        if (!group || group.status === 'ended') return;
        const status = group.studentIds.length >= group.maxStudents ? 'full' : 'open';
        if (group.status !== status) await unit.put('groups', { ...group, status, updatedAt: new Date().toISOString() });
      },
      debtors: () => readDebtors(unit),
    };
    return work(unit);
  });
}
