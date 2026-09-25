import { expect, it } from 'vitest';
import type { Payment, Enrollment } from '../domain/models';
import { allocateLedger } from '../domain/ledger/allocation';
import { debtorRows, storedStudentTotals, studentBalance } from '../domain/ledger/balance';
import { carriedEnrollmentPricing } from '../domain/ledger/pricing';
import { renewalCandidates } from '../domain/ledger/renewals';
import { billingPolicy } from '../domain/ledger/policy';
import { DEFAULT_SETTINGS_VALUES } from '../lib/settings';
import { payrollGroup, payrollInstallment, payrollStudent, PAYROLL_NOW } from './helpers/payroll';
const course = { id: 'course-1', name: 'Synthetic', price: 200, durationMonths: 2, category: 'test', levels: [], color: '#000000', icon: 'x', createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW };
const payment = (patch: Partial<Payment> = {}): Payment => ({ id: 'p', studentId: 'student-1', amount: 250, type: 'subscription', status: 'paid', date: '2026-09-01', createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW, ...patch });
it('replays scoped/unscoped collections in date order without mutating source snapshots', () => {
  const installments = [payrollInstallment(), payrollInstallment({ id: 'other', groupId: 'group-2' }), payrollInstallment({ id: 'cancelled', status: 'cancelled' })];
  const payments = [payment({ id: 'later', amount: 100, date: '2026-09-02' }), payment({ groupId: 'group-1' }), payment({ id: 'void', amount: 900, voided: true })];
  const before = structuredClone({ installments, payments });
  const result = allocateLedger(installments, payments, '2026-09-24');
  expect(result.installments.map(row => row.paidAmount)).toEqual([200, 100, 0]);
  expect(result.payments.map(row => row.id)).toEqual(['p', 'later']);
  expect(result.payments.map(row => row.installmentIds)).toEqual([['installment-1'], ['other']]);
  expect({ installments, payments }).toEqual(before);
});
it('keeps the intentional legacy-total fallback separate from installment-led view balances', () => {
  const student = payrollStudent();
  const ledger = { payments: [], refunds: [], installments: [], enrollments: [] };
  expect(storedStudentTotals(student, ledger, [payrollGroup()], [course]).owed).toBe(200);
  expect(studentBalance(student, ledger, [payrollGroup()], [course], '2026-09-24').owed).toBe(0);
});
it('retains timestamp-aware days since last collection for legacy timestamp dates', () => {
  const data = { students: [payrollStudent()], groups: [payrollGroup()], courses: [course], refunds: [], installments: [payrollInstallment()], payments: [payment({ amount: 10, date: '2026-09-23T10:00:00' })] };
  expect(debtorRows(data, '2026-09-24T17:00:00')[0].daysSinceLastPayment).toBe(1);
  expect(debtorRows(data, '2026-09-24T00:00:00')[0].daysSinceLastPayment).toBe(0);
});
it('carries absolute pricing only within the same course, but keeps both discount kinds', () => {
  const enrollment = { id: 'e', studentId: 's', groupId: 'g', status: 'active', enrolledAt: PAYROLL_NOW, initialPayment: 0, priceOverride: 100, discountAmount: 10, discountPercent: 10, discountReason: 'Synthetic', createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW } satisfies Enrollment;
  expect(carriedEnrollmentPricing(enrollment, true)).toMatchObject({ priceOverride: 100, discountAmount: 10, discountPercent: 10 });
  expect(carriedEnrollmentPricing(enrollment, false)).toMatchObject({ priceOverride: undefined, discountAmount: 10, discountPercent: 10 });
});
it('does not mix renewal candidates when identifiers contain the former pair separator', () => {
  const pair1 = { studentId: 'a|b', groupId: 'c' }, pair2 = { studentId: 'a', groupId: 'b|c' };
  const rows = [pair1, pair2];
  const data = { students: rows.map(row => payrollStudent({ id: row.studentId })), groups: rows.map(row => payrollGroup({ id: row.groupId })), courses: [course], teachers: [],
    enrollments: rows.map((row, index) => ({ ...row, id: 'enrollment-' + index, status: 'active' as const, initialPayment: 0, enrolledAt: PAYROLL_NOW, createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW })),
    installments: rows.map((row, index) => payrollInstallment({ ...row, id: 'installment-' + index, amount: index ? 400 : 200, dueDate: '2025-01-01' })) };
  const result = renewalCandidates(data, '2026-09-24', 7);
  expect(result.map(row => row.remaining)).toEqual([200, 400]);
});
it('shares billing defaults and normalization between cache and transaction consumers', () => {
  expect(billingPolicy({ ...DEFAULT_SETTINGS_VALUES, dueDayOfMonth: 31, graceDays: -1, sessionsPerMonth: 0, receiptPrefix: '  TEST  ' })).toEqual({ dueDayOfMonth: undefined, graceDays: 0, sessionsPerMonth: 8, receiptPrefix: 'TEST' });
});
