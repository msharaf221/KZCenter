/**
 * Cloud tenant isolation tests
 * اختبارات عزل المستأجرين في السحابة (S3)
 *
 * نغطّي الأجزاء القابلة للاختبار محلياً: إزالة الحقول الداخلية/الحساسة،
 * عدم تسريب tenant_id للقاعدة المحلية، وتخزين/استرجاع اعتماد الحساب.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  stripSensitive,
  stripInternalCloud,
  toSnakeCase,
  transformKeys,
} from '../lib/storage';
import {
  saveCloudCredentials,
  getCloudCredentials,
  clearCloudCredentials,
} from '../lib/supabase';

beforeEach(() => {
  localStorage.clear();
});

describe('stripInternalCloud — tenant_id لا يُكتب محلياً', () => {
  it('يزيل tenant_id من الصف الوارد من السحابة', () => {
    const row = { id: 's1', name: 'طالب', tenant_id: 'abc-123', updated_at: 1 };
    const out = stripInternalCloud(row) as Record<string, unknown>;
    expect(out.tenant_id).toBeUndefined();
    expect(out.id).toBe('s1');
    expect(out.name).toBe('طالب');
  });

  it('يمرّر الحقول العادية سليمة', () => {
    const row = { id: 'x', value: 42 };
    const out = stripInternalCloud(row) as Record<string, unknown>;
    expect(out).toEqual({ id: 'x', value: 42 });
  });

  it('يزيل الحقول الحساسة والداخلية معاً', () => {
    const row = { id: 'x', passwordHash: 'secret', tenant_id: 't', name: 'ok' };
    const out = stripInternalCloud(stripSensitive(row)) as Record<string, unknown>;
    expect(out.passwordHash).toBeUndefined();
    expect(out.tenant_id).toBeUndefined();
    expect(out.name).toBe('ok');
  });
});

describe('push transform — لا تُرسَل tenant_id من العميل', () => {
  it('تحويل المفاتيح للصيغة السحابية لا يضيف tenant_id', () => {
    const local = { id: 's1', fullName: 'طالب', createdAt: 5 } as Record<string, unknown>;
    const cloud = transformKeys(local, toSnakeCase);
    expect(cloud.full_name).toBe('طالب');
    expect(cloud.created_at).toBe(5);
    expect(Object.prototype.hasOwnProperty.call(cloud, 'tenant_id')).toBe(false);
  });
});

describe('cloud credentials storage', () => {
  it('يحفظ ويسترجع بريد وكلمة مرور الحساب', () => {
    saveCloudCredentials('  center@example.com ', 'pw123456');
    const creds = getCloudCredentials();
    expect(creds.email).toBe('center@example.com');
    expect(creds.password).toBe('pw123456');
  });

  it('يعيد قيماً فارغة قبل الحفظ', () => {
    const creds = getCloudCredentials();
    expect(creds.email).toBe('');
    expect(creds.password).toBe('');
  });

  it('يمسح الاعتماد عند الطلب', () => {
    saveCloudCredentials('a@b.com', 'pw');
    clearCloudCredentials();
    const creds = getCloudCredentials();
    expect(creds.email).toBe('');
    expect(creds.password).toBe('');
  });
});
