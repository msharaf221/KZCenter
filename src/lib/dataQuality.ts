/** Legacy public API; calculations and persistence have separate owners. */
export type { AutoFixReport, DataIssue, IssueCode, IssueSeverity, QualityReport } from '../domain/maintenance/qualityTypes';
export { auditData, autoFix } from '../services/maintenance/quality';
