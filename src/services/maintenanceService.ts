/** Stable service API; separate owners handle planning, link repair and installment maintenance. */
export type { InstallmentMigrationReport } from '../domain/maintenance/installments';
export type { IntegrityReport } from '../domain/maintenance/integrity';
export { markOverdueInstallments, migrateInstallments } from './maintenance/installments';
export { runIntegrityFix } from './maintenance/integrity';
