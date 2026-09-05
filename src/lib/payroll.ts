/**
 * رواتب ومستحقات المدرسين
 *
 * المشكلة القديمة: `salary` رقم ثابت في بطاقة المدرس، والمصروفات فيها فئة
 * «رواتب» بتتدخل يدوياً — يعني مفيش أي حساب فعلي لمستحقات المدرسين، ومفيش
 * طريقة تعرف بيها المجموعة دي كسبت ولا خسرت.
 *
 * النظام ده بيحسب مستحقات كل مدرس عن شهر بأربع طرق:
 *   fixed       → راتب شهري ثابت
 *   per_session → جنيه لكل حصة مسلَّمة (بتتحسب من أيام الحضور المسجلة فعلياً)
 *   percentage  → نسبة % من المحصّل فعلياً لمجموعاته في الشهر
 *   per_group   → جنيه لكل مجموعة نشطة في الشهر
 * وبيخصم السلف/العهدة والخصومات، وبيطلع تفصيل لكل مجموعة (شفافية مع المدرس).
 */
import dayjs from 'dayjs';
import {
  dbAdd, dbGetAll, dbGetByIndex, dbGetById, dbPut, generateId,
  Attendance, Enrollment, Expense, Group, Payment, PayrollLine, PayrollRecord,
  Teacher, TeacherAdvance, TeacherPayModel, isCountedPayment,
} from './db';

export const PAY_MODEL_LABEL: Record<TeacherPayModel, string> = {
  fixed: 'راتب شهري ثابت',
  per_session: 'بالحصص المسلَّمة',
  percentage: 'نسبة من المحصّل',
  per_group: 'مبلغ لكل مجموعة',
};

/** عدد الأيام المختلفة اللي فيها حضور مسجّل لمجموعة في شهر = عدد الحصص المسلَّمة */
export function countDeliveredSessions(attendance: Attendance[], groupId: string, period: string): number {
  const days = new Set<string>();
  for (const a of attendance) {
    if (a.groupId !== groupId) continue;
    if (!a.date || !a.date.startsWith(period)) continue;
    days.add(a.date);
  }
  return days.size;
}

/** المحصّل فعلياً لمجموعة في شهر (الدفعات المحسوبة بس) */
export function sumGroupCollected(payments: Payment[], groupId: string, period: string): number {
  return payments
    .filter(p => isCountedPayment(p) && p.groupId === groupId && (p.date || '').startsWith(period))
    .reduce((s, p) => s + (p.amount || 0), 0);
}

export interface PayrollContext {
  teachers: Teacher[];
  groups: Group[];
  enrollments: Enrollment[];
  attendance: Attendance[];
  payments: Payment[];
  advances: TeacherAdvance[];
}

export async function loadPayrollContext(period: string): Promise<PayrollContext> {
  const [teachers, groups, enrollments, attendance, payments, advances] = await Promise.all([
    dbGetAll<Teacher>('teachers'),
    dbGetAll<Group>('groups'),
    dbGetAll<Enrollment>('enrollments'),
    dbGetAll<Attendance>('attendance'),
    dbGetAll<Payment>('payments'),
    dbGetAll<TeacherAdvance>('teacher_advances'),
  ]);
  void period;
  return { teachers, groups, enrollments, attendance, payments, advances };
}

export interface TeacherPayrollCalc {
  teacherId: string;
  teacherName: string;
  model: TeacherPayModel;
  rate: number;
  base: number;
  baseLabel: string;
  gross: number;
  deductions: number;
  advances: number;
  net: number;
  lines: PayrollLine[];
}

/**
 * حساب مستحقات مدرس عن شهر — دالة نقية (بتاخد السياق جاهز) عشان تبقى قابلة للاختبار.
 */
export function calcTeacherPayroll(
  teacher: Teacher,
  period: string,
  ctx: PayrollContext,
  opts?: { deductions?: number; countAdvances?: boolean },
): TeacherPayrollCalc {
  const model: TeacherPayModel = teacher.payModel || 'fixed';
  const rate = Number(teacher.payRate ?? 0) || 0;
  const lines: PayrollLine[] = [];

  const teacherGroups = ctx.groups.filter(
    g => g.teacherId === teacher.id && !g.deleted && g.status !== 'ended',
  );

  // كل الفروع بتعيّن القيم دي، فبنعلنهم من غير قيمة ابتدائية
  let gross: number;
  let base: number;
  let baseLabel: string;

  if (model === 'fixed') {
    gross = Number(teacher.salary) || 0;
    base = 1;
    baseLabel = 'راتب ثابت';
    // تفصيل استرشادي: توزيع الراتب على المجموعات بعدد الحصص
    const sessions = teacherGroups.map(g => ({
      g,
      s: countDeliveredSessions(ctx.attendance, g.id, period),
    }));
    const totalSessions = sessions.reduce((sum, x) => sum + x.s, 0);
    for (const { g, s } of sessions) {
      lines.push({
        groupId: g.id,
        groupName: g.name,
        sessions: s,
        collected: round2(sumGroupCollected(ctx.payments, g.id, period)),
        amount: totalSessions > 0 ? round2((gross * s) / totalSessions) : 0,
      });
    }
  } else if (model === 'per_session') {
    let totalSessions = 0;
    for (const g of teacherGroups) {
      const s = countDeliveredSessions(ctx.attendance, g.id, period);
      totalSessions += s;
      lines.push({
        groupId: g.id,
        groupName: g.name,
        sessions: s,
        collected: round2(sumGroupCollected(ctx.payments, g.id, period)),
        amount: round2(s * rate),
      });
    }
    gross = round2(totalSessions * rate);
    base = totalSessions;
    baseLabel = `${totalSessions} حصة × ${rate}`;
  } else if (model === 'percentage') {
    let totalCollected = 0;
    for (const g of teacherGroups) {
      const collected = sumGroupCollected(ctx.payments, g.id, period);
      totalCollected += collected;
      lines.push({
        groupId: g.id,
        groupName: g.name,
        sessions: countDeliveredSessions(ctx.attendance, g.id, period),
        collected: round2(collected),
        amount: round2((collected * rate) / 100),
      });
    }
    gross = round2((totalCollected * rate) / 100);
    base = round2(totalCollected);
    baseLabel = `${rate}% من ${round2(totalCollected)}`;
  } else {
    // per_group
    const activeGroups = teacherGroups.filter(g => hasActiveEnrollmentInPeriod(ctx.enrollments, g.id, period));
    gross = round2(activeGroups.length * rate);
    base = activeGroups.length;
    baseLabel = `${activeGroups.length} مجموعة × ${rate}`;
    for (const g of activeGroups) {
      lines.push({
        groupId: g.id,
        groupName: g.name,
        sessions: countDeliveredSessions(ctx.attendance, g.id, period),
        collected: round2(sumGroupCollected(ctx.payments, g.id, period)),
        amount: round2(rate),
      });
    }
  }

  const deductions = Math.max(0, opts?.deductions ?? 0);
  // السلف المتاحة قبل الحد
  const advancesAvailable = (opts?.countAdvances === false)
    ? 0
    : round2(ctx.advances
        .filter(a => !a.deleted && a.teacherId === teacher.id && !a.settledInPeriod && (a.date || '').slice(0, 7) <= period)
        .reduce((s, a) => s + (a.amount || 0), 0));
  // السلف لا تُنزل الصافي تحت الصفر: يُخصم منها بقدر الراتب المتاح بعد الخصومات،
  // والباقي يفضل على المدرس ويترحّل للشهر التالي
  const advances = round2(Math.min(advancesAvailable, Math.max(0, gross - deductions)));

  return {
    teacherId: teacher.id,
    teacherName: teacher.name,
    model,
    rate,
    base: round2(base),
    baseLabel,
    gross: round2(gross),
    deductions: round2(deductions),
    advances,
    net: round2(Math.max(0, gross - deductions - advances)),
    lines,
  };
}

function hasActiveEnrollmentInPeriod(enrollments: Enrollment[], groupId: string, period: string): boolean {
  return enrollments.some(e => {
    if (e.groupId !== groupId || e.deleted) return false;
    if (e.status === 'active') return true;
    // تسجيل انتهى (تحويل/انسحاب) بعد بداية الشهر → المجموعة كانت شغالة الشهر ده
    const end = e.droppedAt || e.updatedAt;
    return !!end && end.slice(0, 7) >= period;
  });
}

/** حساب مستحقات كل المدرسين عن شهر */
export async function calcPayrollForPeriod(
  period: string,
  ctx?: PayrollContext,
): Promise<TeacherPayrollCalc[]> {
  const context = ctx || await loadPayrollContext(period);
  return context.teachers
    .filter(t => !t.deleted)
    .map(t => calcTeacherPayroll(t, period, context))
    .sort((a, b) => b.net - a.net);
}

// ==================== RECORDS ====================

/** حفظ/تحديث سجل راتب شهر لمدرس (من الحساب المحسوب) */
export async function savePayrollRecord(opts: {
  teacherId: string;
  period: string;
  calc: TeacherPayrollCalc;
  deductions?: number;
  notes?: string;
}): Promise<PayrollRecord> {
  const existing = await findPayrollRecord(opts.teacherId, opts.period);
  const now = new Date().toISOString();
  const gross = opts.calc.gross;
  const deductions = Math.max(0, opts.deductions ?? opts.calc.deductions);
  const net = round2(Math.max(0, gross - deductions - opts.calc.advances));
  const paidAmount = existing?.paidAmount ?? 0;

  const record: PayrollRecord = {
    id: existing?.id || generateId(),
    teacherId: opts.teacherId,
    teacherName: opts.calc.teacherName,
    period: opts.period,
    model: opts.calc.model,
    base: opts.calc.base,
    baseLabel: opts.calc.baseLabel,
    gross,
    deductions,
    advances: opts.calc.advances,
    net,
    paidAmount,
    // صافي صفر مع خصم سلف = الراتب استُهلك بالسلف بالكامل → مدفوع تلقائياً
    status: (paidAmount >= net && (net > 0 || opts.calc.advances > 0))
      ? 'paid'
      : paidAmount <= 0 ? 'pending' : paidAmount >= net ? 'paid' : 'partial',
    lines: opts.calc.lines,
    notes: opts.notes ?? existing?.notes,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await dbPut('payroll', record);

  // لو الراتب اتغطى بالكامل بالسلف (صافي صفر)، السلف بتتسوّى عند الاستحقاق
  // (مفيش صرف نقدي يحرّك payPayroll فنسوّي هنا)
  if (net <= 0 && opts.calc.advances > 0) {
    await settleAdvancesAgainst(opts.teacherId, opts.period, round2(opts.calc.advances));
  }

  return record;
}

export async function findPayrollRecord(teacherId: string, period: string): Promise<PayrollRecord | null> {
  try {
    const rows = await dbGetByIndex<PayrollRecord>('payroll', 'by-teacherPeriod', [teacherId, period]);
    return rows.find(r => !r.deleted) || null;
  } catch {
    const all = await dbGetAll<PayrollRecord>('payroll');
    return all.find(r => !r.deleted && r.teacherId === teacherId && r.period === period) || null;
  }
}

export async function getPayrollForPeriod(period: string): Promise<PayrollRecord[]> {
  const rows = await dbGetByIndex<PayrollRecord>('payroll', 'by-period', period);
  return rows.filter(r => !r.deleted).sort((a, b) => b.net - a.net);
}

/**
 * صرف راتب (كلي أو جزئي) — بيسجّل سند صرف في المصروفات تلقائياً
 * عشان الأرباح والخسائر تبقى صحيحة من غير إدخال يدوي.
 */
export async function payPayroll(opts: {
  payrollId: string;
  amount?: number;
  date?: string;
  userId?: string;
  username?: string;
  autoExpense?: boolean;
}): Promise<{ success: boolean; error?: string; record?: PayrollRecord; expenseId?: string }> {
  const record = await dbGetById<PayrollRecord>('payroll', opts.payrollId);
  if (!record) return { success: false, error: 'سجل الراتب غير موجود' };

  const remaining = round2(record.net - record.paidAmount);
  if (remaining <= 0) return { success: false, error: 'الراتب مدفوع بالكامل بالفعل' };

  const amount = opts.amount && opts.amount > 0 ? Math.min(round2(opts.amount), remaining) : remaining;
  const date = opts.date || dayjs().format('YYYY-MM-DD');
  const now = new Date().toISOString();

  const paidAmount = round2(record.paidAmount + amount);
  const updated: PayrollRecord = {
    ...record,
    paidAmount,
    status: paidAmount >= record.net ? 'paid' : 'partial',
    updatedAt: now,
  };
  await dbPut('payroll', updated);

  // سند صرف في المصروفات (فئة رواتب) — مرتبط بالمدرس والشهر
  let expenseId: string | undefined;
  if (opts.autoExpense !== false) {
    expenseId = generateId();
    const expense: Expense = {
      id: expenseId,
      category: 'salaries',
      amount,
      description: `راتب ${record.teacherName} — ${record.period}`,
      date,
      teacherId: record.teacherId,
      userId: opts.userId,
      username: opts.username,
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('expenses', expense);
  }

  // تسوية سلف المدرس مقابل راتب الشهر — تتم عند تأكيد استحقاق الراتب
  // (السلفة اتخصمت من الراتب المستحق، سواء صُرف الصافي نقداً أو كان صفراً).
  if (updated.status === 'paid') {
    await settleAdvancesAgainst(record.teacherId, record.period, round2(record.advances));
  }

  return { success: true, record: updated, expenseId };
}

// ==================== ADVANCES ====================

/**
 * تسوية سلف المدرس مقابل راتب شهر، بقدر المبلغ المخصوم فعلاً (cappedAmount).
 *
 * - السلفة بتُستهلك باستحقاق الراتب (أقدمها أولاً) — مش بالصرف النقدي،
 *   لأن السلفة نفسها اتدفعت نقدية سلفاً وبتقلل المستحق.
 * - السلفة الأكبر من المغطى: نخفّض قيمتها بالمغطى ونسيب الباقي مفتوحاً للترحيل.
 * - لو مجموع السلف أكبر من الراتب، الراتب كان متحدّاً عند صفر وبيتهلّك
 *   بقيمة الراتب فقط، والباقي يفضل على المدرس للشهر الجاي.
 *
 * الدالة آمنة للتكرار: بتعالج السلف المفتوحة فقط (ليها settledInPeriod = لا شيء)
 * والمتبقي بعد خصم سابق يفضل بنفس السجل المفتوح.
 */
export async function settleAdvancesAgainst(
  teacherId: string,
  period: string,
  cappedAmount: number,
): Promise<{ settled: number; carried: number }> {
  const now = new Date().toISOString();
  // حماية ضد التسوية المكررة لنفس الفترة (الحفظ المتكرر للرابط)
  const allAdvances = await dbGetAll<TeacherAdvance>('teacher_advances');
  if (allAdvances.some(a => a.teacherId === teacherId && a.settledInPeriod === period)) {
    const open = allAdvances.filter(a => a.teacherId === teacherId && !a.deleted && !a.settledInPeriod);
    return { settled: 0, carried: round2(open.reduce((s, a) => s + (a.amount || 0), 0)) };
  }

  const advances = allAdvances
    .filter(a => a.teacherId === teacherId && !a.deleted && !a.settledInPeriod
      && (a.date || '').slice(0, 7) <= period)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  let left = round2(Math.max(0, cappedAmount));
  for (const a of advances) {
    if (left <= 0.001) break;
    const aAmount = round2(a.amount || 0);
    if (aAmount <= left + 0.001) {
      await dbPut('teacher_advances', { ...a, settledInPeriod: period, updatedAt: now });
      left = round2(left - aAmount);
    } else {
      await dbPut('teacher_advances', {
        ...a,
        amount: round2(aAmount - left),
        notes: a.notes
          ? `${a.notes} — خُصم ${left} من راتب ${period}`
          : `خصم جزئي ${left} من راتب ${period}`,
        updatedAt: now,
      });
      left = 0;
    }
  }

  const carried = round2(advances
    .filter(a => !a.settledInPeriod)
    .reduce((s, a) => s + (a.amount || 0), 0));
  return { settled: round2(Math.max(0, cappedAmount - left)), carried };
}

export async function addTeacherAdvance(opts: {
  teacherId: string;
  amount: number;
  date?: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!(opts.amount > 0)) return { success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };
  const teacher = await dbGetById<Teacher>('teachers', opts.teacherId);
  if (!teacher) return { success: false, error: 'المدرس غير موجود' };

  const now = new Date().toISOString();
  await dbAdd('teacher_advances', {
    id: generateId(),
    teacherId: opts.teacherId,
    amount: round2(opts.amount),
    date: opts.date || dayjs().format('YYYY-MM-DD'),
    reason: opts.reason,
    createdAt: now,
    updatedAt: now,
  } satisfies TeacherAdvance);

  return { success: true };
}

export async function getTeacherAdvances(teacherId: string): Promise<TeacherAdvance[]> {
  const rows = await dbGetByIndex<TeacherAdvance>('teacher_advances', 'by-teacherId', teacherId);
  return rows.filter(a => !a.deleted).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// ==================== PROFITABILITY ====================

export interface GroupProfit {
  groupId: string;
  groupName: string;
  teacherName: string;
  courseName: string;
  students: number;
  /** المحصّل فعلياً في الفترة */
  collected: number;
  /** المستحق في الفترة (من الأقساط) */
  owed: number;
  /** تكلفة المدرس */
  teacherCost: number;
  /** تكلفة الملازم/الكتب المباعة للمجموعة */
  materialCost: number;
  profit: number;
  marginPct: number;
}

/**
 * ربحية كل مجموعة في فترة — أهم تقرير لصاحب المركز:
 * يقول له أنهي مجموعة بتكسب وأنهي بتاكل فلوس.
 */
export async function calcGroupProfitability(opts: {
  from: string;
  to: string;
}): Promise<GroupProfit[]> {
  const { from, to } = opts;
  const period = from.slice(0, 7);

  const [groups, teachers, courses, payments, attendance, enrollments, advances, expenses] =
    await Promise.all([
      dbGetAll<Group>('groups'),
      dbGetAll<Teacher>('teachers'),
      dbGetAll<import('./db').Course>('courses'),
      dbGetAll<Payment>('payments'),
      dbGetAll<Attendance>('attendance'),
      dbGetAll<Enrollment>('enrollments'),
      dbGetAll<TeacherAdvance>('teacher_advances'),
      dbGetAll<Expense>('expenses'),
    ]);

  const inRange = (date?: string) => !!date && date >= from && date <= to;

  // تكلفة المدرسين المحسوبة (من سجلات الرواتب لو موجودة، وإلا من الحساب)
  const ctx: PayrollContext = { teachers, groups, enrollments, attendance, payments, advances };

  const rows: GroupProfit[] = [];

  for (const g of groups) {
    if (g.deleted) continue;
    const teacher = teachers.find(t => t.id === g.teacherId);
    const course = courses.find(c => c.id === g.courseId);

    const collected = round2(payments
      .filter(p => isCountedPayment(p) && p.groupId === g.id && inRange(p.date))
      .reduce((s, p) => s + p.amount, 0));

    const activeStudents = enrollments.filter(
      e => e.groupId === g.id && !e.deleted && e.status === 'active',
    ).length || g.studentIds.length;

    // تكلفة المدرس على المجموعة دي
    let teacherCost = 0;
    if (teacher) {
      const calc = calcTeacherPayroll(teacher, period, ctx);
      const line = calc.lines.find(l => l.groupId === g.id);
      teacherCost = line ? line.amount : 0;
      // لو الراتب ثابت ومفيش حضور مسجّل، وزّع على عدد المجموعات
      if (teacherCost === 0 && calc.gross > 0 && calc.lines.length === 0) {
        const n = groups.filter(x => x.teacherId === teacher.id && !x.deleted && x.status !== 'ended').length;
        teacherCost = n > 0 ? round2(calc.gross / n) : 0;
      }
    }

    // مصروفات مباشرة مرتبطة بالمجموعة (لو اتسجلت بـ groupId)
    const materialCost = round2(expenses
      .filter(e => !e.deleted && e.groupId === g.id && inRange(e.date))
      .reduce((s, e) => s + e.amount, 0));

    const profit = round2(collected - teacherCost - materialCost);

    rows.push({
      groupId: g.id,
      groupName: g.name,
      teacherName: teacher?.name || '—',
      courseName: course?.name || '—',
      students: activeStudents,
      collected,
      owed: 0,
      teacherCost,
      materialCost,
      profit,
      marginPct: collected > 0 ? Math.round((profit / collected) * 100) : 0,
    });
  }

  return rows.sort((a, b) => b.profit - a.profit);
}

function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}
