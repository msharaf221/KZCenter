export interface PageResult<T> {
  items: T[];
  total: number;
}

/** Shared pagination; never mutates the caller's array. */
export function paginate<T>(rows: readonly T[], page: number, pageSize: number): PageResult<T> {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const safeSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 20;
  const start = (safePage - 1) * safeSize;
  return { items: rows.slice(start, start + safeSize), total: rows.length };
}

/** Existing list order: date, then creation time, newest first. */
export function newestFirst<T extends { date?: string; createdAt?: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ka = `${a.date || ''}|${a.createdAt || ''}`;
    const kb = `${b.date || ''}|${b.createdAt || ''}`;
    return kb.localeCompare(ka);
  });
}
