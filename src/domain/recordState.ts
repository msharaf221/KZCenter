/** Older row contracts may not declare deletion metadata; all reads still honor tombstones. */
export function isDeleted(row: unknown): boolean {
  return !!row && typeof row === 'object' && 'deleted' in row && !!row.deleted;
}
