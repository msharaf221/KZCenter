/** Legacy public entry points; keep exports stable, never import them from production modules. */
export const compatibilityModules = [
  'lib/db.ts',
  'lib/dataQuality.ts',
  'lib/receipts.ts',
  'lib/dailyBackup.ts',
  'lib/payroll.ts',
  'lib/sheetImport.ts',
  'lib/tableImport.ts',
  'lib/tableImportDb.ts',
  'lib/storage.ts',
  'lib/supabase.ts',
];

/** Interactive financial writes must use permission/audit/single-flight application commands. */
export const commandOnlyServices = {
  'services/paymentService.ts': ['recordInstallmentPayment', 'recordPaymentInUnit', 'voidPayment', 'recordRefund', 'payStudentRemaining', 'rebuildInstallmentsFromPayments'],
  'services/enrollmentService.ts': ['enrollStudent', 'unenrollStudent'],
  'services/renewalService.ts': ['renewEnrollment'],
  'services/transferService.ts': ['transferStudent'],
  'services/debtWriteOffService.ts': ['writeOffDebts'],
  'services/balanceService.ts': ['recalculateStudentTotalPaid'],
  'services/membership/enrollment.ts': ['enrollInUnit', 'detachInUnit'],
  'services/membership/removal.ts': ['removeStudentInUnit', 'removeGroupInUnit'],
  'services/maintenanceService.ts': ['runIntegrityFix', 'migrateInstallments', 'markOverdueInstallments'],
  'services/maintenance/integrity.ts': ['runIntegrityFix'],
  'services/maintenance/installments.ts': ['migrateInstallments', 'markOverdueInstallments'],
  'services/maintenance/quality.ts': ['autoFix', 'repairQuality'],
  'services/receiptService.ts': ['nextReceiptNo', 'setReceiptCounter', 'backfillReceiptNumbers'],
};
