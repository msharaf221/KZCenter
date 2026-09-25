import { readAll } from '../../data/readers';
import type { Expense } from '../../domain/models';
import { newestFirst, paginate } from '../../lib/pagination';
import type { ListQuery } from './types';

export async function loadExpensesList({
  page,
  pageSize,
  search,
  categoryFilter,
}: ListQuery & { categoryFilter: string }) {
  const all = await readAll<Expense>('expenses');

  const filtered = all.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.description.toLowerCase().includes(q);
    const matchCat = !categoryFilter || e.category === categoryFilter;
    return matchSearch && matchCat;
  });
  const result = paginate(newestFirst(filtered), page, pageSize);
  return {
    allExpenses: all,
    expenses: result.items,
    total: result.total,
  };
}
