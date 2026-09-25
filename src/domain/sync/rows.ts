/** حقول حساسة بتتشال من أي صف قبل الرفع (دفاع في العمق) */
export const SENSITIVE_FIELDS = ['passwordHash', 'password_hash', 'password', 'token', 'secret', 'apiKey', 'api_key'];

/**
 * حقول داخلية لقاعدة السحابة فقط (tenant_id يُفرض من trigger، ممنوع تعيينه من
 * العميل). تُزال من أي صف وارد حتى لا تُكتب في IndexedDB.
 */
export const INTERNAL_CLOUD_FIELDS = ['tenant_id', 'tenantId'];

// ==================== KEY TRANSFORMS ====================

export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function transformKeys(
  obj: Record<string, unknown>,
  transformer: (key: string) => string,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [transformer(key), value]));
}

/** يشيل الحقول الحساسة من صف قبل رفعه */
export function stripSensitive(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !SENSITIVE_FIELDS.includes(key)));
}

/** يشيل الحقول الداخلية للسحابة (مثل tenant_id) قبل الكتابة محلياً */
export function stripInternalCloud(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !INTERNAL_CLOUD_FIELDS.includes(key)));
}

// ==================== ROW MERGE (pure) ====================

export type MergeDecision = 'insert' | 'update' | 'skip';

/**
 * قرار دمج صف سحابي مع المحلي:
 *  - مفيش محلي → insert
 *  - السحابي أحدث (updatedAt/created_at) → update
 *  - المحلي أحدث أو مساوي → skip (ما ندمّرش شغل الجهاز ده)
 *
 * ملاحظة: صفوف من غير updatedAt (زي `settings` و`counters`) بتعتبر السحابة
 * مرجّحة لو المحلي فاضي، وإلا بنسيب المحلي (أأمن).
 */
export function decideMerge(
  local: Record<string, unknown> | undefined,
  remote: Record<string, unknown>,
): MergeDecision {
  if (!local) return 'insert';

  const localAt = String(local.updatedAt || local.createdAt || '');
  const remoteAt = String(remote.updatedAt || remote.createdAt || '');

  if (!localAt && !remoteAt) return 'skip';
  if (!remoteAt) return 'skip';
  if (!localAt) return 'update';

  return remoteAt > localAt ? 'update' : 'skip';
}
