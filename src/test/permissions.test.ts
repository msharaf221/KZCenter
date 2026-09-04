/**
 * اختبارات مصفوفة الصلاحيات — دوال نقية في src/lib/permissions.ts
 *
 * أهم نقطة أمان: المدرس ما يشوفش غير مجموعاته، ومفيش دور يشوف فلوس من غير ما يكون مفروض.
 */
import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS, can, allowedActions, visiblePages, visibleGroupIds, filterByGroups,
  ROLE_LABEL, ROLE_SHORT, isScoped, type Entity, type Action, type PageKey,
} from '../lib/permissions';
import type { UserRole, Group } from '../lib/db';

const ROLES: UserRole[] = ['admin', 'secretary', 'accountant', 'supervisor', 'teacher'];

function group(id: string, teacherId?: string): Pick<Group, 'id' | 'teacherId'> {
  return { id, teacherId } as Pick<Group, 'id' | 'teacherId'>;
}

describe('can() — المصفوفة', () => {
  it('المسؤول مسموح له كل حاجة', () => {
    const entities = Object.keys(PERMISSIONS.admin) as Entity[];
    const actions: Action[] = ['view', 'create', 'edit', 'delete', 'export', 'money'];
    for (const e of entities) for (const a of actions) expect(can('admin', e, a)).toBe(true);
  });

  it('دور غير معروف / فاضي = مفيش صلاحية', () => {
    expect(can(undefined, 'students', 'view')).toBe(false);
    expect(can(null, 'students', 'view')).toBe(false);
    expect(can('' as UserRole, 'students', 'view')).toBe(false);
    expect(can('ghost' as UserRole, 'students', 'view')).toBe(false);
  });

  it('كيان مش موجود في قائمة الدور = مفيش وصول', () => {
    expect(can('teacher', 'payroll', 'view')).toBe(false);
    expect(can('teacher', 'expenses', 'view')).toBe(false);
    expect(can('secretary', 'users', 'view')).toBe(false);
    expect(can('supervisor', 'treasury', 'view')).toBe(false);
  });
});

describe('فصل المهام بين الأدوار', () => {
  it('الاستقبال: تسجيل وتحصيل — من غير مصروفات ولا رواتب ولا خزينة', () => {
    expect(can('secretary', 'students', 'create')).toBe(true);
    expect(can('secretary', 'students', 'edit')).toBe(true);
    expect(can('secretary', 'payments', 'create')).toBe(true);
    expect(can('secretary', 'expenses', 'view')).toBe(false);
    expect(can('secretary', 'payroll', 'view')).toBe(false);
    expect(can('secretary', 'treasury', 'view')).toBe(false);
  });

  it('الاستقبال ما يقدرش يحذف (الحذف للمسؤول)', () => {
    expect(can('secretary', 'students', 'delete')).toBe(false);
    expect(can('secretary', 'payments', 'delete')).toBe(false);
  });

  it('المحاسب: الفلوس كلها', () => {
    for (const e of ['payments', 'refunds', 'expenses', 'payroll', 'treasury', 'reports'] as Entity[]) {
      expect(can('accountant', e, 'view')).toBe(true);
      expect(can('accountant', e, 'money')).toBe(true);
    }
  });

  it('المحاسب ما يعدلش بيانات الطلاب الأكاديمية', () => {
    expect(can('accountant', 'students', 'view')).toBe(true);
    expect(can('accountant', 'students', 'create')).toBe(false);
    expect(can('accountant', 'students', 'edit')).toBe(false);
    expect(can('accountant', 'groups', 'create')).toBe(false);
  });

  it('المشرف: أكاديمي من غير فلوس', () => {
    expect(can('supervisor', 'groups', 'create')).toBe(true);
    expect(can('supervisor', 'attendance', 'edit')).toBe(true);
    expect(can('supervisor', 'exams', 'create')).toBe(true);
    expect(can('supervisor', 'payments', 'view')).toBe(false);
    expect(can('supervisor', 'payroll', 'view')).toBe(false);
    expect(can('supervisor', 'expenses', 'view')).toBe(false);
  });

  it('المشرف ما يحذفش وما يشوفش المستخدمين وسجل المراجعة', () => {
    expect(can('supervisor', 'groups', 'delete')).toBe(false);
    expect(can('supervisor', 'users', 'view')).toBe(false);
    expect(can('supervisor', 'auditLog', 'view')).toBe(false);
    expect(can('supervisor', 'settings', 'edit')).toBe(false);
  });

  it('المدرس: حضور ودرجات بس — مفيش أي أرقام مالية', () => {
    expect(can('teacher', 'attendance', 'create')).toBe(true);
    expect(can('teacher', 'exams', 'edit')).toBe(true);
    expect(can('teacher', 'students', 'view')).toBe(true);
    expect(can('teacher', 'payments', 'view')).toBe(false);
    expect(can('teacher', 'debtors', 'view')).toBe(false);
    expect(can('teacher', 'reports', 'view')).toBe(false);
    expect(can('teacher', 'expenses', 'view')).toBe(false);
    expect(can('teacher', 'treasury', 'view')).toBe(false);
    expect(can('teacher', 'payroll', 'view')).toBe(false);
  });

  it('المدرس ما يعدلش الطلاب ولا المجموعات', () => {
    expect(can('teacher', 'students', 'edit')).toBe(false);
    expect(can('teacher', 'students', 'create')).toBe(false);
    expect(can('teacher', 'groups', 'edit')).toBe(false);
    expect(can('teacher', 'attendance', 'delete')).toBe(false);
  });

  it('الإدارة والمستخدمون وسجل المراجعة للمسؤول فقط', () => {
    for (const r of ['secretary', 'accountant', 'supervisor', 'teacher'] as UserRole[]) {
      expect(can(r, 'users', 'view')).toBe(false);
      expect(can(r, 'settings', 'edit')).toBe(false);
    }
    expect(can('admin', 'users', 'create')).toBe(true);
    expect(can('admin', 'settings', 'edit')).toBe(true);
    // المحاسب يشوف سجل المراجعة للتدقيق لكن ما يعدلش
    expect(can('accountant', 'auditLog', 'view')).toBe(true);
    expect(can('accountant', 'auditLog', 'delete')).toBe(false);
  });

  it('الحذف النهائي (سلة المحذوفات) ما يتاحش لغير المسؤول', () => {
    expect(can('admin', 'trash', 'delete')).toBe(true);
    for (const r of ['secretary', 'accountant', 'supervisor', 'teacher'] as UserRole[]) {
      expect(can(r, 'trash', 'delete')).toBe(false);
    }
  });
});

describe('allowedActions()', () => {
  it('بيرجع الإجراءات المسموحة للكيان', () => {
    expect(allowedActions('admin', 'students').sort()).toEqual(
      ['create', 'delete', 'edit', 'export', 'money', 'view']);
    expect(allowedActions('teacher', 'attendance').sort()).toEqual(['create', 'edit', 'view']);
  });

  it('كيان مش مسموح = قائمة فاضية', () => {
    expect(allowedActions('teacher', 'payroll')).toEqual([]);
    expect(allowedActions('secretary', 'expenses')).toEqual([]);
  });

  it('دور غير معروف = قائمة فاضية', () => {
    expect(allowedActions(undefined, 'students')).toEqual([]);
    expect(allowedActions(null, 'students')).toEqual([]);
  });

  it('قائمة فاضية في المصفوفة = مفيش وصول (مش «كل حاجة»)', () => {
    expect(allowedActions('secretary', 'reports')).toEqual([]);
    expect(can('secretary', 'reports', 'view')).toBe(false);
  });
});

describe('visiblePages() — السايدبار', () => {
  it('المسؤول يشوف كل الصفحات اللي عندها view', () => {
    const pages = visiblePages('admin');
    expect(pages).toContain('students');
    expect(pages).toContain('payroll');
    expect(pages).toContain('treasury');
    expect(pages).toContain('users');
    expect(pages).toContain('settings');
    expect(pages).toContain('trash');
  });

  it('المدرس: صفحات أكاديمية بس', () => {
    const pages = visiblePages('teacher');
    expect(pages).toContain('students');
    expect(pages).toContain('attendance');
    expect(pages).toContain('timetable');
    expect(pages).not.toContain('payroll');
    expect(pages).not.toContain('treasury');
    expect(pages).not.toContain('expenses');
    expect(pages).not.toContain('reports');
    expect(pages).not.toContain('users');
    expect(pages).not.toContain('settings');
  });

  it('الاستقبال: مفيش خزينة ولا رواتب ولا مصروفات', () => {
    const pages = visiblePages('secretary');
    expect(pages).toContain('students');
    expect(pages).toContain('payments');
    expect(pages).not.toContain('treasury');
    expect(pages).not.toContain('payroll');
    expect(pages).not.toContain('expenses');
    expect(pages).not.toContain('reports');
  });

  it('المحاسب: الفلوس والتقارير ظاهرة', () => {
    const pages = visiblePages('accountant');
    expect(pages).toContain('treasury');
    expect(pages).toContain('payroll');
    expect(pages).toContain('expenses');
    expect(pages).toContain('reports');
    expect(pages).not.toContain('users');
    expect(pages).not.toContain('settings');
  });

  it('المشرف: أكاديمي + تقارير عرض فقط', () => {
    const pages = visiblePages('supervisor');
    expect(pages).toContain('groups');
    expect(pages).toContain('timetable');
    expect(pages).toContain('reports');
    expect(pages).not.toContain('treasury');
    expect(pages).not.toContain('payroll');
  });

  it('دور غير معروف = مفيش صفحات', () => {
    expect(visiblePages(undefined)).toEqual([]);
    expect(visiblePages(null)).toEqual([]);
  });

  it('كل صفحة ظاهرة فعلاً عندها view', () => {
    for (const r of ROLES) {
      for (const p of visiblePages(r) as PageKey[]) {
        expect(can(r, p, 'view')).toBe(true);
      }
    }
  });
});

describe('visibleGroupIds() — عزل بيانات المدرس', () => {
  const groups = [
    group('g1', 't1'), group('g2', 't1'), group('g3', 't2'), group('g4', undefined),
  ];

  it('الأدوار الإدارية: null (مفيش تقييد)', () => {
    for (const r of ['admin', 'secretary', 'accountant', 'supervisor'] as UserRole[]) {
      expect(visibleGroupIds({ role: r, teacherId: 't1', groups })).toBeNull();
    }
  });

  it('المدرس: مجموعاته هو بس', () => {
    const allowed = visibleGroupIds({ role: 'teacher', teacherId: 't1', groups });
    expect(allowed).toBeInstanceOf(Set);
    expect([...allowed!].sort()).toEqual(['g1', 'g2']);
  });

  it('مدرس تاني بيشوف مجموعاته هو', () => {
    const allowed = visibleGroupIds({ role: 'teacher', teacherId: 't2', groups });
    expect([...allowed!]).toEqual(['g3']);
  });

  it('مدرس من غير مجموعات = Set فاضي (مفيش وصول خالص)', () => {
    const allowed = visibleGroupIds({ role: 'teacher', teacherId: 't9', groups });
    expect(allowed!.size).toBe(0);
  });

  it('مدرس من غير teacherId مرتبط = Set فاضي (مش كل المجموعات)', () => {
    const allowed = visibleGroupIds({ role: 'teacher', groups });
    expect(allowed).toBeInstanceOf(Set);
    expect(allowed!.size).toBe(0);
  });

  it('دور غير معروف = null (ما يكسرش الصفحات العامة)', () => {
    expect(visibleGroupIds({ role: undefined, teacherId: 't1', groups })).toBeNull();
  });

  it('المجموعة من غير مدرس ما تدخلش في نطاق أي مدرس', () => {
    const allowed = visibleGroupIds({ role: 'teacher', teacherId: 't1', groups });
    expect(allowed!.has('g4')).toBe(false);
  });
});

describe('isScoped()', () => {
  it('المدرس بس مقيد', () => {
    expect(isScoped('teacher')).toBe(true);
    for (const r of ['admin', 'secretary', 'accountant', 'supervisor'] as UserRole[]) {
      expect(isScoped(r)).toBe(false);
    }
  });

  it('دور غير معروف = مش مقيد', () => {
    expect(isScoped(undefined)).toBe(false);
    expect(isScoped(null)).toBe(false);
  });
});

describe('filterByGroups() — تطبيق العزل على الصفوف', () => {
  const rows = [
    { id: '1', groupId: 'g1' },
    { id: '2', groupId: 'g2' },
    { id: '3', groupId: 'g3' },
    { id: '4' },                      // من غير مجموعة
  ];

  it('null = مفيش فلترة (الأدوار الإدارية)', () => {
    expect(filterByGroups(rows, null)).toHaveLength(4);
  });

  it('Set = الصفوف المسموحة بس', () => {
    expect(filterByGroups(rows, new Set(['g1', 'g2'])).map(r => r.id)).toEqual(['1', '2']);
  });

  it('Set فاضي = مفيش صفوف', () => {
    expect(filterByGroups(rows, new Set())).toHaveLength(0);
  });

  it('الصف من غير groupId ما يعديش للمدرس', () => {
    expect(filterByGroups(rows, new Set(['g1', 'g2', 'g3', 'g4'])).map(r => r.id))
      .toEqual(['1', '2', '3']);
  });

  it('قائمة فاضية = قائمة فاضية', () => {
    expect(filterByGroups([], new Set(['g1']))).toEqual([]);
    expect(filterByGroups([], null)).toEqual([]);
  });
});

describe('تسميات الأدوار', () => {
  it('كل دور له تسمية كاملة ومختصرة', () => {
    for (const r of ROLES) {
      expect(ROLE_LABEL[r]).toBeTruthy();
      expect(ROLE_SHORT[r]).toBeTruthy();
      // التسمية المختصرة ما تكونش أطول من الكاملة («مدرس» = «مدرس» مقبولة)
      expect(ROLE_SHORT[r].length).toBeLessThanOrEqual(ROLE_LABEL[r].length);
    }
  });

  it('مفيش دور في المصفوفة من غير تسمية', () => {
    for (const r of Object.keys(PERMISSIONS) as UserRole[]) {
      expect(ROLE_LABEL[r]).toBeTruthy();
    }
  });
});

describe('سلامة المصفوفة', () => {
  it('كل الأدوار الخمسة موجودة', () => {
    for (const r of ROLES) expect(PERMISSIONS[r]).toBeDefined();
  });

  it('كل دور غير المسؤول محدود في صفحة واحدة على الأقل', () => {
    for (const r of ['secretary', 'accountant', 'supervisor', 'teacher'] as UserRole[]) {
      const entities = Object.keys(PERMISSIONS[r]) as Entity[];
      expect(entities.length).toBeGreaterThan(0);
      expect(entities.length).toBeLessThan(Object.keys(PERMISSIONS.admin).length);
    }
  });

  it('مفيش دور (غير المسؤول) عنده صلاحية على المستخدمين أو الإعدادات', () => {
    for (const r of ['secretary', 'accountant', 'supervisor', 'teacher'] as UserRole[]) {
      expect(PERMISSIONS[r].users).toBeUndefined();
      expect(PERMISSIONS[r].settings).toBeUndefined();
    }
  });

  it('كل الإجراءات المخزنة معروفة', () => {
    const valid: Action[] = ['view', 'create', 'edit', 'delete', 'export', 'money'];
    for (const r of ROLES) {
      for (const actions of Object.values(PERMISSIONS[r])) {
        for (const a of actions || []) expect(valid).toContain(a);
      }
    }
  });
});
