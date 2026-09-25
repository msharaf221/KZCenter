import { isCountedPayment } from '../../lib/billing';
import { round2 } from '../../lib/money';
import type {
  Attendance,
  Enrollment,
  Payment,
  PayrollLine,
  PayrollStudentLine,
  Teacher,
  TeacherPayModel,
} from '../models';
import { isPayrollPeriod, isPercentageModel } from './settings';
import type { PayrollContext, TeacherPayrollCalc } from './types';

/**
 * المصدر هو قيمة قسط الاشتراك، لا المدفوع ولا سعر الكورس الحالي.
 * كل طالب يظهر مرة واحدة داخل المجموعة، ومجموع التفاصيل = المستحق بالقرش.
 * لا نعتمد على عضوية الطالب الحالية حتى لا يختفي اشتراك تاريخي بعد التحويل.
 */
export function groupSubscriptionLines(
  ctx: PayrollContext,
  groupId: string,
  period: string,
  rate: number,
): PayrollStudentLine[] {
  const names = new Map((ctx.students || []).map(s => [s.id, s.name]));
  const byStudent = new Map<string, PayrollStudentLine>();
  const seen = new Set<string>();
  for (const installment of ctx.installments || []) {
    if (
      installment.groupId !== groupId ||
      installment.deleted ||
      installment.status === 'cancelled' ||
      installment.dueDate?.slice(0, 7) !== period ||
      seen.has(installment.id) ||
      !Number.isFinite(installment.amount) ||
      installment.amount < 0
    )
      continue;
    seen.add(installment.id);
    const line = byStudent.get(installment.studentId) || {
      studentId: installment.studentId,
      studentName: names.get(installment.studentId) || 'طالب غير موجود',
      installmentIds: [],
      subscriptionAmount: 0,
      rate,
      amount: 0,
    };
    line.installmentIds.push(installment.id);
    line.subscriptionAmount = round2(line.subscriptionAmount + installment.amount);
    // جنيه → قروش، ونسبة → أجزاء من مئة؛ نتجنب 1.005 → 1.00 بسبب الكسور الثنائية.
    line.amount = Math.round((Math.round(line.subscriptionAmount * 100) * Math.round(rate * 100)) / 10_000) / 100;
    byStudent.set(installment.studentId, line);
  }
  return [...byStudent.values()].sort((a, b) => a.studentName.localeCompare(b.studentName, 'ar'));
}

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

/**
 * حساب مستحقات مدرس عن شهر — دالة نقية (بتاخد السياق جاهز) عشان تبقى قابلة للاختبار.
 */
export function calcTeacherPayroll(
  teacher: Teacher,
  period: string,
  ctx: PayrollContext,
  opts?: { deductions?: number; countAdvances?: boolean },
): TeacherPayrollCalc {
  if (!isPayrollPeriod(period)) throw new Error('اختر شهراً صحيحاً');
  const model: TeacherPayModel = teacher.payModel || 'fixed';
  const rawRate = Number(teacher.payRate ?? 0);
  const rate = Number.isFinite(rawRate) && rawRate >= 0 && (!isPercentageModel(model) || rawRate <= 100) ? rawRate : 0;
  const lines: PayrollLine[] = [];

  const teacherGroups = ctx.groups.filter(
    g => g.teacherId === teacher.id && !g.deleted && (model === 'subscription_percentage' || g.status !== 'ended'),
  );

  // كل الفروع بتعيّن القيم دي، فبنعلنهم من غير قيمة ابتدائية
  let gross: number;
  let base: number;
  let baseLabel: string;

  if (model === 'fixed') {
    gross = Number.isFinite(teacher.salary) ? Math.max(0, teacher.salary) : 0;
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
  } else if (model === 'subscription_percentage') {
    for (const g of teacherGroups) {
      const students = groupSubscriptionLines(ctx, g.id, period, rate);
      if (students.length === 0) continue;
      lines.push({
        groupId: g.id,
        groupName: g.name,
        sessions: countDeliveredSessions(ctx.attendance, g.id, period),
        collected: round2(sumGroupCollected(ctx.payments, g.id, period)),
        subscriptions: round2(students.reduce((sum, s) => sum + s.subscriptionAmount, 0)),
        amount: round2(students.reduce((sum, s) => sum + s.amount, 0)),
        students,
      });
    }
    base = round2(lines.reduce((sum, l) => sum + (l.subscriptions || 0), 0));
    gross = round2(lines.reduce((sum, l) => sum + l.amount, 0));
    baseLabel = `${rate}% من اشتراكات بقيمة ${base}`;
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

  const rawDeductions = opts?.deductions ?? 0;
  const deductions = Number.isFinite(rawDeductions) ? round2(Math.max(0, rawDeductions)) : 0;
  // السلف المتاحة قبل الحد
  const advancesAvailable =
    opts?.countAdvances === false
      ? 0
      : round2(
          ctx.advances
            .filter(
              a =>
                !a.deleted &&
                a.teacherId === teacher.id &&
                !a.settledInPeriod &&
                Number.isFinite(a.amount) &&
                a.amount > 0 &&
                (a.date || '').slice(0, 7) <= period,
            )
            .reduce((s, a) => s + (a.amount || 0), 0),
        );
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
