/**
 * اختبارات سجل المراجعة (IndexedDB) — src/lib/audit.ts
 *
 * السجل اتنقل من localStorage للقاعدة عشان:
 *  - ما يتمسحش بمسح بيانات المتصفح (أي حد كان يقدر يمحي أثره)
 *  - يدخل في النسخ الاحتياطي والمزامنة
 *  - يبقى سجل مركزي مش per-device
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addAuditEntry,
  getAuditEntries,
  getAuditEntry,
  clearAuditLog,
  auditStats,
  type AuditEntry,
} from '../lib/audit';
import { dbGetAll, dbClearStore, getDB } from '../lib/db';

/** addAuditEntry fire-and-forget — نستنى لما السجل يظهر فعلاً */
async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 25));
}

async function clearAll(): Promise<void> {
  const db = await getDB();
  await db.clear('audit_logs');
  localStorage.clear();
}

beforeEach(async () => {
  await clearAll();
});

describe('addAuditEntry + getAuditEntries', () => {
  it('السجل بيبدأ فاضي', async () => {
    expect(await getAuditEntries()).toEqual([]);
  });

  it('بيضيف سجل ويقرأه', async () => {
    addAuditEntry({
      userId: 'u1', username: 'أحمد',
      action: 'create', entity: 'student', entityId: 's1',
      details: 'إضافة طالب جديد',
    });
    await flush();

    const rows = await getAuditEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe('أحمد');
    expect(rows[0].action).toBe('create');
    expect(rows[0].entity).toBe('student');
    expect(rows[0].entityId).toBe('s1');
    expect(rows[0].details).toBe('إضافة طالب جديد');
  });

  it('بيولّد id و timestamp تلقائياً', async () => {
    addAuditEntry({ userId: 'u1', username: 'أحمد', action: 'login', entity: 'auth' });
    await flush();

    const [row] = await getAuditEntries();
    expect(row.id).toBeTruthy();
    expect(row.timestamp).toBeTruthy();
    expect(new Date(row.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('بيحفظ أكتر من سجل', async () => {
    for (const action of ['create', 'update', 'delete'] as const) {
      addAuditEntry({ userId: 'u1', username: 'أحمد', action, entity: 'student' });
    }
    await flush();

    expect(await getAuditEntries()).toHaveLength(3);
  });

  it('الترتيب من الأحدث للأقدم', async () => {
    const db = await getDB();
    const entries: AuditEntry[] = [
      { id: 'a', userId: 'u', username: 'u', action: 'create', entity: 'e', timestamp: '2026-01-01T00:00:00.000Z' },
      { id: 'b', userId: 'u', username: 'u', action: 'update', entity: 'e', timestamp: '2026-03-01T00:00:00.000Z' },
      { id: 'c', userId: 'u', username: 'u', action: 'delete', entity: 'e', timestamp: '2026-02-01T00:00:00.000Z' },
    ];
    for (const e of entries) await db.put('audit_logs', e);

    const rows = await getAuditEntries();
    expect(rows.map(r => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('limit بيحدد عدد النتائج', async () => {
    const db = await getDB();
    for (let i = 0; i < 5; i++) {
      await db.put('audit_logs', {
        id: `x${i}`, userId: 'u', username: 'u', action: 'update', entity: 'e',
        timestamp: `2026-01-0${i + 1}T00:00:00.000Z`,
      } satisfies AuditEntry);
    }

    expect(await getAuditEntries(2)).toHaveLength(2);
    expect(await getAuditEntries(100)).toHaveLength(5);
    expect((await getAuditEntries(2))[0].id).toBe('x4');   // الأحدث
  });

  it('limit = 0 أو سالب بيرجع الكل', async () => {
    addAuditEntry({ userId: 'u', username: 'u', action: 'create', entity: 'e' });
    await flush();
    expect(await getAuditEntries(0)).toHaveLength(1);
    expect(await getAuditEntries(-5)).toHaveLength(1);
  });

  it('getAuditEntry بيرجع سجل واحد بالـ id', async () => {
    addAuditEntry({ userId: 'u1', username: 'أحمد', action: 'create', entity: 'student' });
    await flush();
    const [row] = await getAuditEntries();

    const found = await getAuditEntry(row.id);
    expect(found?.id).toBe(row.id);
    expect(await getAuditEntry('مش-موجود')).toBeUndefined();
  });

  it('بيحفظ ip لو اتبعت', async () => {
    addAuditEntry({ userId: 'u1', username: 'أحمد', action: 'login', entity: 'auth', ip: '127.0.0.1' });
    await flush();
    expect((await getAuditEntries())[0].ip).toBe('127.0.0.1');
  });

  it('السجل بيتحفظ في IndexedDB (مش localStorage)', async () => {
    addAuditEntry({ userId: 'u1', username: 'أحمد', action: 'create', entity: 'student' });
    await flush();

    const inDb = await dbGetAll<AuditEntry>('audit_logs');
    expect(inDb).toHaveLength(1);
    expect(localStorage.getItem('educenter_audit_log')).toBeNull();
  });
});

describe('clearAuditLog', () => {
  it('بيمسح كل السجلات', async () => {
    addAuditEntry({ userId: 'u1', username: 'أحمد', action: 'create', entity: 'student' });
    addAuditEntry({ userId: 'u1', username: 'أحمد', action: 'delete', entity: 'student' });
    await flush();
    expect(await getAuditEntries()).toHaveLength(2);

    await clearAuditLog();
    expect(await getAuditEntries()).toHaveLength(0);
  });

  it('بيسجّل نفسه كحدث لو اتبعت المستخدم (مين مسح السجل)', async () => {
    addAuditEntry({ userId: 'u1', username: 'أحمد', action: 'create', entity: 'student' });
    await flush();

    await clearAuditLog({ userId: 'admin1', username: 'المسؤول' });
    const rows = await getAuditEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('delete');
    expect(rows[0].entity).toBe('audit_log');
    expect(rows[0].username).toBe('المسؤول');
    expect(rows[0].details).toContain('مسح سجل المراجعة');
  });

  it('من غير مستخدم = مسح صامت', async () => {
    addAuditEntry({ userId: 'u1', username: 'أحمد', action: 'create', entity: 'student' });
    await flush();
    await clearAuditLog();
    expect(await getAuditEntries()).toHaveLength(0);
  });

  it('المسح على سجل فاضي ما يكسرش', async () => {
    await expect(clearAuditLog()).resolves.toBeUndefined();
    expect(await getAuditEntries()).toHaveLength(0);
  });
});

describe('migrateAuditFromLocalStorage', () => {
  const LEGACY_KEY = 'educenter_audit_log';

  /**
   * النقل بيتعمل مرة واحدة في الجلسة (promise متذكر)،
   * فكل اختبار بيحتاج موديول جديد — وإلا الاختبارات هتعتمد على ترتيبها.
   */
  async function freshMigrate() {
    vi.resetModules();
    const mod = await import('../lib/audit');
    return mod.migrateAuditFromLocalStorage();
  }

  function seedLegacy(entries: unknown[]) {
    localStorage.removeItem('audit_migration_v1');
    localStorage.setItem(LEGACY_KEY, JSON.stringify(entries));
  }

  it('مفيش سجل قديم = صفر ومفيش خطأ', async () => {
    localStorage.removeItem('audit_migration_v1');
    localStorage.removeItem(LEGACY_KEY);
    expect(await freshMigrate()).toBe(0);
    expect(await getAuditEntries()).toHaveLength(0);
  });

  it('بينقل السجل القديم للقاعدة', async () => {
    seedLegacy([
      { id: 'old1', userId: 'u1', username: 'أحمد', action: 'create', entity: 'student', timestamp: '2025-12-01T00:00:00.000Z' },
      { id: 'old2', userId: 'u1', username: 'أحمد', action: 'login', entity: 'auth', timestamp: '2025-12-02T00:00:00.000Z' },
    ]);

    expect(await freshMigrate()).toBe(2);

    const rows = await getAuditEntries();
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.id).sort()).toEqual(['old1', 'old2']);
  });

  it('بيحط علم عشان ما يتنقلش مرتين', async () => {
    seedLegacy([{ id: 'old1', userId: 'u1', username: 'أحمد', action: 'create', entity: 'student' }]);

    expect(await freshMigrate()).toBe(1);
    expect(localStorage.getItem('audit_migration_v1')).toBeTruthy();
    expect(await getAuditEntries()).toHaveLength(1);

    // جلسة جديدة (مودول جديد) والعلم موجود → مفيش نقل تاني ولا تكرار
    expect(await freshMigrate()).toBe(0);
    expect(await getAuditEntries()).toHaveLength(1);
  });

  it('سجل قديم فاضي = صفر', async () => {
    seedLegacy([]);
    expect(await freshMigrate()).toBe(0);
  });

  it('سجل قديم مش JSON صالح ما يكسرش', async () => {
    localStorage.removeItem('audit_migration_v1');
    localStorage.setItem(LEGACY_KEY, '{مش json');
    await expect(freshMigrate()).resolves.toBe(0);
  });

  it('سجل قديم مش مصفوفة ما يكسرش', async () => {
    localStorage.removeItem('audit_migration_v1');
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ a: 1 }));
    await expect(freshMigrate()).resolves.toBe(0);
  });

  it('مدخلات قديمة ناقصة بتتعبّى بقيمة افتراضية', async () => {
    seedLegacy([{ action: 'update' }]);   // من غير userId/username/entity

    expect(await freshMigrate()).toBe(1);
    const [row] = await getAuditEntries();
    expect(row.userId).toBe('unknown');
    expect(row.username).toBe('غير معروف');
    expect(row.entity).toBe('unknown');
    expect(row.action).toBe('update');
    expect(row.id).toBeTruthy();
    expect(row.timestamp).toBeTruthy();
  });

  it('ما بيكررش المدخلات الموجودة بالفعل', async () => {
    const db = await getDB();
    await db.put('audit_logs', {
      id: 'dup1', userId: 'u', username: 'u', action: 'create', entity: 'e',
      timestamp: '2025-12-01T00:00:00.000Z',
    } satisfies AuditEntry);
    seedLegacy([
      { id: 'dup1', userId: 'u', username: 'u', action: 'create', entity: 'e' },
      { id: 'new1', userId: 'u', username: 'u', action: 'update', entity: 'e' },
    ]);

    expect(await freshMigrate()).toBe(1);
    expect(await getAuditEntries()).toHaveLength(2);
  });

  it('بيسيب النسخة القديمة في localStorage (أمان)', async () => {
    seedLegacy([{ id: 'old1', userId: 'u', username: 'u', action: 'create', entity: 'e' }]);
    await freshMigrate();
    expect(localStorage.getItem(LEGACY_KEY)).toBeTruthy();
  });
});

describe('auditStats', () => {
  it('إحصاءات فاضية', async () => {
    const s = await auditStats();
    expect(s.total).toBe(0);
    expect(s.today).toBe(0);
    expect(s.byAction).toEqual({});
    expect(s.byUser).toEqual({});
  });

  it('بيعد الإجمالي واليومي', async () => {
    const db = await getDB();
    const today = new Date().toISOString();
    await db.put('audit_logs', { id: '1', userId: 'u1', username: 'أحمد', action: 'create', entity: 'e', timestamp: today } satisfies AuditEntry);
    await db.put('audit_logs', { id: '2', userId: 'u1', username: 'أحمد', action: 'delete', entity: 'e', timestamp: '2020-01-01T00:00:00.000Z' } satisfies AuditEntry);

    const s = await auditStats();
    expect(s.total).toBe(2);
    expect(s.today).toBe(1);
  });

  it('byAction و byUser', async () => {
    const db = await getDB();
    const rows: AuditEntry[] = [
      { id: '1', userId: 'u1', username: 'أحمد', action: 'create', entity: 'e', timestamp: '2026-01-01T00:00:00.000Z' },
      { id: '2', userId: 'u1', username: 'أحمد', action: 'create', entity: 'e', timestamp: '2026-01-02T00:00:00.000Z' },
      { id: '3', userId: 'u2', username: 'منى', action: 'delete', entity: 'e', timestamp: '2026-01-03T00:00:00.000Z' },
    ];
    for (const r of rows) await db.put('audit_logs', r);

    const s = await auditStats();
    expect(s.byAction).toEqual({ create: 2, delete: 1 });
    expect(s.byUser).toEqual({ 'أحمد': 2, 'منى': 1 });
  });

  it('سجل من غير timestamp ما يكسرش العد', async () => {
    const db = await getDB();
    // سجل ناقص (زي ما ممكن يوصل من نسخة قديمة) — المفروض ما يكسرش العد
    await db.put('audit_logs', { id: '1', userId: 'u', username: 'u', action: 'create', entity: 'e' } as AuditEntry);
    const s = await auditStats();
    expect(s.total).toBe(1);
    expect(s.today).toBe(0);
  });
});

describe('تكامل السجل مع بقية النظام', () => {
  it('السجل بيتنضف مع بقية المتاجر', async () => {
    addAuditEntry({ userId: 'u1', username: 'أحمد', action: 'create', entity: 'student' });
    await flush();
    expect(await getAuditEntries()).toHaveLength(1);

    await dbClearStore('audit_logs');
    expect(await getAuditEntries()).toHaveLength(0);
  });

  it('addAuditEntry بترجّع void (fire-and-forget) — ما تكسرش الصفحات اللي ما بتستناش', async () => {
    const ret = addAuditEntry({ userId: 'u1', username: 'أحمد', action: 'login', entity: 'auth' });
    expect(ret).toBeUndefined();
    await flush();
    expect(await getAuditEntries()).toHaveLength(1);
  });

  it('سجلات كتير متتالية بتتحفظ كلها', async () => {
    for (let i = 0; i < 20; i++) {
      addAuditEntry({ userId: 'u1', username: 'أحمد', action: 'update', entity: 'student', entityId: `s${i}` });
    }
    await new Promise(r => setTimeout(r, 120));
    expect(await getAuditEntries()).toHaveLength(20);
  });
});
