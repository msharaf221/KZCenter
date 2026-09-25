import { writeTransaction } from '../../data/transactions';
import { requireRule } from '../../domain/errors';
import type { Expense, ExpenseCategory } from '../../domain/models';
import { requireChoice, requireDate, requireLive, requireMoney, requireText } from '../../domain/validation';
import { generateId } from '../../lib/ids';
import { commandAudit, requirePermission, type Actor } from './access';

export type ExpenseDraft = Pick<Expense, 'category' | 'amount' | 'description' | 'date'>;
const categories: ExpenseCategory[] = ['salaries', 'bills', 'maintenance', 'purchases', 'rent', 'other'];
const LINKED_ERROR = 'سند صرف المرتب مرتبط بكشف معتمد ولا يُعدّل أو يُحذف يدوياً';

export async function saveExpense(actor: Actor, draft: ExpenseDraft, id?: string): Promise<Expense> {
  requirePermission(actor, 'expenses', id ? 'edit' : 'create');
  requireText(draft.description, 'الوصف مطلوب');
  requireMoney(draft.amount, true);
  requireDate(draft.date);
  requireChoice(draft.category, categories, 'فئة المصروف غير صحيحة');
  const saved = await writeTransaction(['expenses'], async tx => {
    const store = tx.objectStore('expenses');
    const current = id ? requireLive(await store.get(id), 'المصروف غير موجود') : undefined;
    requireRule(!current?.payrollId, LINKED_ERROR);
    const now = new Date().toISOString();
    const row: Expense = {
      ...current,
      id: current?.id || generateId(),
      category: draft.category,
      amount: draft.amount,
      description: draft.description,
      date: draft.date,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    await store.put(row);
    return row;
  });
  commandAudit(actor, {
    action: id ? 'update' : 'create',
    entity: 'expense',
    entityId: saved.id,
    details: `${id ? 'تعديل' : 'إضافة'} مصروف: ${saved.description} (${saved.amount})`,
  });
  return saved;
}

export async function deleteExpense(actor: Actor, id: string): Promise<void> {
  requirePermission(actor, 'expenses', 'delete');
  const deleted = await writeTransaction(['expenses'], async tx => {
    const store = tx.objectStore('expenses');
    const current = requireLive(await store.get(id), 'المصروف غير موجود');
    requireRule(!current.payrollId, LINKED_ERROR);
    const now = new Date().toISOString();
    const row = { ...current, deleted: true, deletedAt: now, deletedBy: actor.id, updatedAt: now };
    await store.put(row);
    return current;
  });
  commandAudit(actor, {
    action: 'delete',
    entity: 'expense',
    entityId: id,
    details: `حذف مصروف: ${deleted.description} (${deleted.amount})`,
  });
}
