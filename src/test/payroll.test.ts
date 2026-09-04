/**
 * اختبارات حساب مستحقات المدرسين — الدوال النقية في src/lib/payroll.ts
 *
 * 4 طرق حساب: راتب ثابت · جنيه/حصة · نسبة من المحصّل · جنيه/مجموعة
 * + السلف والخصومات وتسوياتها.
 */
import { describe, it, expect } from 'vitest';
import {
  calcTeacherPayroll,
  countDeliveredSessions,
  sumGroupCollected,
  type PayrollContext,
} from '../lib/payroll';
import type { Teacher, Group, Attendance, Payment, Enrollment, TeacherAdvance } from '../lib/db';

const PERIOD = '2026-03';

function teacher(o: Partial<Teacher> = {}): Teacher {
  return {
    id: o.id || 't1',
    name: o.name || 'أستاذ أحمد',
    specialization: 'رياضيات',
    phone: '01000000000',
    salary: o.salary ?? 3000,
    status: 'active',
    payModel: o.payModel,
    payRate: o.payRate,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function group(o: Partial<Group> = {}): Group {
  return {
    id: o.id || 'g1',
    name: o.name || 'س.ر 1',
    courseId: o.courseId || 'c1',
    teacherId: o.teacherId || 't1',
    schedule: o.schedule || [{ days: ['saturday'], startTime: '16:00', endTime: '18:00' }],
    maxStudents: o.maxStudents ?? 20,
    status: o.status || 'open',
    studentIds: o.studentIds || ['s1'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deleted: o.deleted,
  };
}

function attendance(groupId: string, date: string, o: Partial<Attendance> = {}): Attendance {
  return {
    id: `a-${groupId}-${date}`,
    studentId: o.studentId || 's1',
    groupId,
    date,
    status: o.status || 'present',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  };
}

function payment(o: Partial<Payment> = {}): Payment {
  return {
    id: o.id || `p-${Math.random().toString(36).slice(2)}`,
    studentId: o.studentId || 's1',
    groupId: o.groupId || 'g1',
    amount: o.amount ?? 800,
    type: o.type || 'subscription',
    status: o.status || 'paid',
    date: o.date || '2026-03-05',
    createdAt: '2026-03-05T00:00:00.000Z',
    updatedAt: '2026-03-05T00:00:00.000Z',
    voided: o.voided,
    deleted: o.deleted,
  };
}

function enrollment(o: Partial<Enrollment> = {}): Enrollment {
  return {
    id: o.id || `e-${Math.random().toString(36).slice(2)}`,
    studentId: o.studentId || 's1',
    groupId: o.groupId || 'g1',
    status: o.status || 'active',
    enrolledAt: o.enrolledAt || '2026-01-01T00:00:00.000Z',
    droppedAt: o.droppedAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: o.updatedAt || '2026-01-01T00:00:00.000Z',
    deleted: o.deleted,
  };
}

function advance(o: Partial<TeacherAdvance> = {}): TeacherAdvance {
  return {
    id: o.id || `adv-${Math.random().toString(36).slice(2)}`,
    teacherId: o.teacherId || 't1',
    amount: o.amount ?? 500,
    date: o.date || '2026-03-02',
    settledInPeriod: o.settledInPeriod,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    deleted: o.deleted,
  };
}

function ctx(o: Partial<PayrollContext> = {}): PayrollContext {
  return {
    teachers: o.teachers || [teacher()],
    groups: o.groups || [group()],
    enrollments: o.enrollments || [enrollment()],
    attendance: o.attendance || [],
    payments: o.payments || [],
    advances: o.advances || [],
  };
}

describe('countDeliveredSessions', () => {
  it('بيعد الأيام المميزة في الشهر للمجموعة', () => {
    const rows = [
      attendance('g1', '2026-03-02'),
      attendance('g1', '2026-03-02', { studentId: 's2' }), // نفس اليوم → حصة واحدة
      attendance('g1', '2026-03-09'),
      attendance('g2', '2026-03-09'),                      // مجموعة تانية
      attendance('g1', '2026-02-23'),                      // شهر تاني
    ];
    expect(countDeliveredSessions(rows, 'g1', PERIOD)).toBe(2);
    expect(countDeliveredSessions(rows, 'g2', PERIOD)).toBe(1);
    expect(countDeliveredSessions(rows, 'g3', PERIOD)).toBe(0);
  });
});

describe('sumGroupCollected', () => {
  it('بيجمع المدفوع المحسوب بس للمجموعة في الشهر', () => {
    const rows = [
      payment({ groupId: 'g1', amount: 800 }),
      payment({ groupId: 'g1', amount: 200 }),
      payment({ groupId: 'g1', amount: 999, voided: true }),   // ملغاة
      payment({ groupId: 'g1', amount: 999, deleted: true }),  // محذوفة
      payment({ groupId: 'g1', amount: 999, status: 'pending' }), // مش مسددة
      payment({ groupId: 'g2', amount: 500 }),                 // مجموعة تانية
      payment({ groupId: 'g1', amount: 500, date: '2026-02-20' }), // شهر تاني
    ];
    expect(sumGroupCollected(rows, 'g1', PERIOD)).toBe(1000);
    expect(sumGroupCollected(rows, 'g2', PERIOD)).toBe(500);
  });
});

describe('calcTeacherPayroll — راتب ثابت (fixed)', () => {
  it('بيستخدم الراتب الشهري', () => {
    const r = calcTeacherPayroll(teacher({ salary: 3000 }), PERIOD, ctx());
    expect(r.model).toBe('fixed');
    expect(r.gross).toBe(3000);
    expect(r.net).toBe(3000);
    expect(r.baseLabel).toBe('راتب ثابت');
  });

  it('من غير payModel = fixed (سلوك قديم)', () => {
    const r = calcTeacherPayroll(teacher({ payModel: undefined, salary: 2500 }), PERIOD, ctx());
    expect(r.model).toBe('fixed');
    expect(r.gross).toBe(2500);
  });

  it('بيوزع الراتب على المجموعات بعدد الحصص (تفصيل استرشادي)', () => {
    const r = calcTeacherPayroll(teacher({ salary: 3000 }), PERIOD, ctx({
      groups: [group({ id: 'g1', name: 'أ' }), group({ id: 'g2', name: 'ب' })],
      attendance: [
        attendance('g1', '2026-03-02'), attendance('g1', '2026-03-09'),  // 2 حصة
        attendance('g2', '2026-03-03'),                                    // 1 حصة
      ],
    }));
    expect(r.gross).toBe(3000);
    expect(r.lines).toHaveLength(2);
    const g1 = r.lines.find(l => l.groupId === 'g1')!;
    const g2 = r.lines.find(l => l.groupId === 'g2')!;
    expect(g1.sessions).toBe(2);
    expect(g2.sessions).toBe(1);
    expect(g1.amount).toBe(2000);   // 3000 × 2/3
    expect(g2.amount).toBe(1000);   // 3000 × 1/3
    expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBe(3000);
  });

  it('مفيش حصص = التفصيل أصفار لكن الإجمالي هو الراتب', () => {
    const r = calcTeacherPayroll(teacher({ salary: 3000 }), PERIOD, ctx({ attendance: [] }));
    expect(r.gross).toBe(3000);
    expect(r.lines.every(l => l.amount === 0)).toBe(true);
  });
});

describe('calcTeacherPayroll — جنيه/حصة (per_session)', () => {
  it('عدد الحصص × سعر الحصة', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'per_session', payRate: 150 }), PERIOD, ctx({
      attendance: [attendance('g1', '2026-03-02'), attendance('g1', '2026-03-09')],
    }));
    expect(r.model).toBe('per_session');
    expect(r.base).toBe(2);
    expect(r.gross).toBe(300);
    expect(r.net).toBe(300);
  });

  it('مفيش حصص = صفر', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'per_session', payRate: 150 }), PERIOD, ctx({ attendance: [] }));
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
  });

  it('بيجمع حصص كل مجموعات المدرس', () => {
    const r = calcTeacherPayroll(teacher({ id: 't1', payModel: 'per_session', payRate: 100 }), PERIOD, ctx({
      groups: [group({ id: 'g1' }), group({ id: 'g2' })],
      attendance: [
        attendance('g1', '2026-03-02'), attendance('g1', '2026-03-09'),
        attendance('g2', '2026-03-04'),
      ],
    }));
    expect(r.base).toBe(3);
    expect(r.gross).toBe(300);
  });

  it('حصص مجموعة مدرس تاني ما تدخلش', () => {
    const r = calcTeacherPayroll(teacher({ id: 't1', payModel: 'per_session', payRate: 100 }), PERIOD, ctx({
      groups: [group({ id: 'g1', teacherId: 't1' }), group({ id: 'g2', teacherId: 't2' })],
      attendance: [attendance('g1', '2026-03-02'), attendance('g2', '2026-03-02')],
    }));
    expect(r.base).toBe(1);
  });
});

describe('calcTeacherPayroll — نسبة من المحصّل (percentage)', () => {
  it('نسبة من المحصّل فعلياً لمجموعاته', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'percentage', payRate: 40 }), PERIOD, ctx({
      payments: [payment({ groupId: 'g1', amount: 1000 }), payment({ groupId: 'g1', amount: 500 })],
    }));
    expect(r.model).toBe('percentage');
    expect(r.base).toBe(1500);
    expect(r.gross).toBe(600);   // 40% من 1500
  });

  it('الدفعات الملغاة وغير المسددة ما تدخلش في النسبة', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'percentage', payRate: 50 }), PERIOD, ctx({
      payments: [
        payment({ groupId: 'g1', amount: 1000 }),
        payment({ groupId: 'g1', amount: 1000, voided: true }),
        payment({ groupId: 'g1', amount: 1000, status: 'pending' }),
      ],
    }));
    expect(r.base).toBe(1000);
    expect(r.gross).toBe(500);
  });

  it('مفيش تحصيل = صفر', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'percentage', payRate: 40 }), PERIOD, ctx({ payments: [] }));
    expect(r.gross).toBe(0);
  });

  it('تحصيل شهر تاني ما يتحسبش', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'percentage', payRate: 40 }), PERIOD, ctx({
      payments: [payment({ groupId: 'g1', amount: 1000, date: '2026-02-15' })],
    }));
    expect(r.base).toBe(0);
  });
});

describe('calcTeacherPayroll — جنيه/مجموعة (per_group)', () => {
  it('عدد المجموعات الشغالة × مبلغ المجموعة', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'per_group', payRate: 800 }), PERIOD, ctx({
      groups: [group({ id: 'g1' }), group({ id: 'g2' })],
      enrollments: [enrollment({ groupId: 'g1' }), enrollment({ groupId: 'g2' })],
    }));
    expect(r.model).toBe('per_group');
    expect(r.base).toBe(2);
    expect(r.gross).toBe(1600);
  });

  it('مجموعة من غير تسجيلات نشطة ما تتحسبش', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'per_group', payRate: 800 }), PERIOD, ctx({
      groups: [group({ id: 'g1' }), group({ id: 'g2' })],
      enrollments: [enrollment({ groupId: 'g1' }), enrollment({ groupId: 'g2', status: 'dropped', droppedAt: '2026-01-15T00:00:00.000Z' })],
    }));
    expect(r.base).toBe(1);
    expect(r.gross).toBe(800);
  });

  it('تسجيل انتهى بعد بداية الشهر → المجموعة كانت شغالة', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'per_group', payRate: 800 }), PERIOD, ctx({
      groups: [group({ id: 'g1' })],
      enrollments: [enrollment({ groupId: 'g1', status: 'dropped', droppedAt: '2026-03-10T00:00:00.000Z' })],
    }));
    expect(r.base).toBe(1);
  });

  it('المجموعة المنتهية/المحذوفة ما تدخلش', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'per_group', payRate: 800 }), PERIOD, ctx({
      groups: [group({ id: 'g1' }), group({ id: 'g2', status: 'ended' }), group({ id: 'g3', deleted: true })],
      enrollments: [enrollment({ groupId: 'g1' }), enrollment({ groupId: 'g2' }), enrollment({ groupId: 'g3' })],
    }));
    expect(r.base).toBe(1);
  });
});

describe('calcTeacherPayroll — الخصومات والسلف', () => {
  it('الخصم بيقلل الصافي', () => {
    const r = calcTeacherPayroll(teacher({ salary: 3000 }), PERIOD, ctx(), { deductions: 300 });
    expect(r.deductions).toBe(300);
    expect(r.net).toBe(2700);
  });

  it('السلفة بتتخصم تلقائياً', () => {
    const r = calcTeacherPayroll(teacher({ salary: 3000 }), PERIOD, ctx({
      advances: [advance({ amount: 500, date: '2026-03-02' })],
    }));
    expect(r.advances).toBe(500);
    expect(r.net).toBe(2500);
  });

  it('السلفة المسوّاة في شهر سابق ما تتخصمش تاني', () => {
    const r = calcTeacherPayroll(teacher({ salary: 3000 }), PERIOD, ctx({
      advances: [advance({ amount: 500, settledInPeriod: '2026-02' })],
    }));
    expect(r.advances).toBe(0);
    expect(r.net).toBe(3000);
  });

  it('سلفة تاريخها بعد الشهر ما تدخلش', () => {
    const r = calcTeacherPayroll(teacher({ salary: 3000 }), PERIOD, ctx({
      advances: [advance({ amount: 500, date: '2026-04-02' })],
    }));
    expect(r.advances).toBe(0);
  });

  it('سلفة مدرس تاني ما تخصمش', () => {
    const r = calcTeacherPayroll(teacher({ id: 't1', salary: 3000 }), PERIOD, ctx({
      advances: [advance({ teacherId: 't2', amount: 500 })],
    }));
    expect(r.advances).toBe(0);
  });

  it('countAdvances=false بيتجاهل السلف (للعرض قبل التسوية)', () => {
    const r = calcTeacherPayroll(teacher({ salary: 3000 }), PERIOD, ctx({
      advances: [advance({ amount: 500 })],
    }), { countAdvances: false });
    expect(r.advances).toBe(0);
    expect(r.net).toBe(3000);
  });

  it('الصافي ما ينزلش تحت الصفر', () => {
    const r = calcTeacherPayroll(teacher({ salary: 300 }), PERIOD, ctx({
      advances: [advance({ amount: 1000 })],
    }), { deductions: 500 });
    expect(r.net).toBe(0);
  });

  it('خصم سالب بيتعامل معاه كصفر', () => {
    const r = calcTeacherPayroll(teacher({ salary: 3000 }), PERIOD, ctx(), { deductions: -500 });
    expect(r.deductions).toBe(0);
    expect(r.net).toBe(3000);
  });
});

describe('calcTeacherPayroll — حالات حدّية', () => {
  it('مدرس من غير مجموعات', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'per_session', payRate: 100 }), PERIOD, ctx({ groups: [] }));
    expect(r.gross).toBe(0);
    expect(r.lines).toHaveLength(0);
  });

  it('payRate ناقص = صفر', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'per_session' }), PERIOD, ctx({
      attendance: [attendance('g1', '2026-03-02')],
    }));
    expect(r.rate).toBe(0);
    expect(r.gross).toBe(0);
  });

  it('قيمة غير رقمية في payRate ما تكسرش الحساب', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'percentage', payRate: Number('x') }), PERIOD, ctx({
      payments: [payment({ amount: 1000 })],
    }));
    expect(r.rate).toBe(0);
    expect(r.gross).toBe(0);
  });

  it('الأسطر بتوضح اسم المجموعة والمحصّل', () => {
    const r = calcTeacherPayroll(teacher({ payModel: 'per_session', payRate: 100 }), PERIOD, ctx({
      groups: [group({ id: 'g1', name: 'الأولى' })],
      attendance: [attendance('g1', '2026-03-02')],
      payments: [payment({ groupId: 'g1', amount: 800 })],
    }));
    expect(r.lines[0].groupName).toBe('الأولى');
    expect(r.lines[0].collected).toBe(800);
    expect(r.lines[0].sessions).toBe(1);
    expect(r.lines[0].amount).toBe(100);
  });
});
