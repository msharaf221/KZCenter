import { deleteDB } from 'idb';
import { closeDatabase, DB_NAME } from '../data/database';
import { requireRule } from '../domain/errors';
import { setSettingsCache } from '../lib/settings';
import { authenticateUser } from './auth/authentication';
import { clearLocalSession } from './auth/session';

/** Explicit local-only destructive recovery. Never deletes cloud data or bypasses admin credentials. */
export async function resetLocalDatabase(
  username: string,
  password: string,
  confirmed: boolean,
  onBlocked?: () => void,
): Promise<void> {
  requireRule(confirmed, 'يجب تأكيد حذف البيانات أولاً');
  requireRule(username.trim() && password, 'أدخل بيانات حساب مسؤول لإعادة تعيين القاعدة');
  const result = await authenticateUser(username, password);
  requireRule(result.success && result.user?.role === 'admin', 'إعادة التعيين تتطلب بيانات حساب مسؤول صحيحة');
  await closeDatabase();
  await deleteDB(DB_NAME, { blocked: onBlocked });
  clearLocalSession();
  setSettingsCache(null);
}
