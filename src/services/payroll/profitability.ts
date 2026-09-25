import dayjs from 'dayjs';
import { readAll } from '../../data/readers';
import type {
  Attendance,
  Enrollment,
  Expense,
  Group,
  Payment,
  PayrollRecord,
  Teacher,
  TeacherAdvance,
} from '../../domain/models';
import { calcTeacherPayroll } from '../../domain/payroll/calculate';
import type { GroupProfit, PayrollContext, TeacherPayrollCalc } from '../../domain/payroll/types';
import type { Installment } from '../../lib/billing';
import { isCountedPayment } from '../../lib/billing';
import { round2 } from '../../lib/money';

/**
 * Compatibility-only calculation for existing callers and tests.
 * Reports deliberately does not import or invoke this helper.
 */
export async function calcGroupProfitability(opts: { from: string; to: string }): Promise<GroupProfit[]> {
  const { from, to } = opts;
  if (!dayjs(from).isValid() || !dayjs(to).isValid() || from > to) return [];
  const periods: string[] = [];
  for (let month = dayjs(from).startOf('month'); !month.isAfter(dayjs(to), 'month'); month = month.add(1, 'month')) {
    periods.push(month.format('YYYY-MM'));
  }

  const [groups, teachers, courses, payments, attendance, enrollments, advances, expenses, installments, payroll] =
    await Promise.all([
      readAll<Group>('groups'),
      readAll<Teacher>('teachers'),
      readAll<import('../../domain/models').Course>('courses'),
      readAll<Payment>('payments'),
      readAll<Attendance>('attendance'),
      readAll<Enrollment>('enrollments'),
      readAll<TeacherAdvance>('teacher_advances'),
      readAll<Expense>('expenses'),
      readAll<Installment>('installments'),
      readAll<PayrollRecord>('payroll'),
    ]);

  const inRange = (date?: string) => !!date && date >= from && date <= to;

  // تكلفة المدرسين المحسوبة (من سجلات الرواتب لو موجودة، وإلا من الحساب)
  const ctx: PayrollContext = { teachers, groups, enrollments, attendance, payments, advances, installments };
  const calculations = new Map<string, TeacherPayrollCalc>();

  const rows: GroupProfit[] = [];

  for (const g of groups) {
    if (g.deleted) continue;
    const teacher = teachers.find(t => t.id === g.teacherId);
    const course = courses.find(c => c.id === g.courseId);

    const collected = round2(
      payments
        .filter(p => isCountedPayment(p) && p.groupId === g.id && inRange(p.date))
        .reduce((s, p) => s + p.amount, 0),
    );

    const activeStudents =
      enrollments.filter(e => e.groupId === g.id && !e.deleted && e.status === 'active').length || g.studentIds.length;

    // تكلفة كل شهر في المدى، لا الشهر الأول فقط. الكشف المعتمد هو المرجع
    // حتى بعد تغيير النسبة أو مدرس المجموعة؛ الصرف نفسه ليس تكلفة ثانية.
    let teacherCost = 0;
    for (const period of periods) {
      const saved = payroll.filter(r => r.period === period && !r.deleted);
      const savedLines = saved.flatMap(r => r.lines || []).filter(l => l.groupId === g.id);
      if (savedLines.length > 0) {
        teacherCost += savedLines.reduce((sum, line) => sum + line.amount, 0);
        continue;
      }
      if (
        !teacher ||
        saved.some(r => r.teacherId === teacher.id) ||
        (teacher.createdAt || '').slice(0, 7) > period ||
        (g.createdAt || '').slice(0, 7) > period
      )
        continue;
      const key = `${teacher.id}:${period}`;
      let calc = calculations.get(key);
      if (!calc) {
        calc = calcTeacherPayroll(teacher, period, ctx, { countAdvances: false });
        calculations.set(key, calc);
      }
      const line = calc.lines.find(l => l.groupId === g.id);
      let amount = line?.amount || 0;
      // الراتب الثابت من غير حضور: توزيع استرشادي على المجموعات.
      if (calc.model === 'fixed' && !calc.lines.some(l => l.sessions > 0)) {
        const n = calc.lines.length;
        amount = n > 0 ? round2(calc.gross / n) : 0;
      }
      teacherCost += amount;
    }
    teacherCost = round2(teacherCost);

    // مصروفات مباشرة مرتبطة بالمجموعة (لو اتسجلت بـ groupId)
    const materialCost = round2(
      expenses
        .filter(e => !e.deleted && !e.payrollId && e.groupId === g.id && inRange(e.date))
        .reduce((s, e) => s + e.amount, 0),
    );

    const profit = round2(collected - teacherCost - materialCost);

    rows.push({
      groupId: g.id,
      groupName: g.name,
      teacherName: teacher?.name || '—',
      courseName: course?.name || '—',
      students: activeStudents,
      collected,
      owed: round2(
        installments
          .filter(i => !i.deleted && i.status !== 'cancelled' && i.groupId === g.id && inRange(i.dueDate))
          .reduce((sum, i) => sum + i.amount, 0),
      ),
      teacherCost,
      materialCost,
      profit,
      marginPct: collected > 0 ? Math.round((profit / collected) * 100) : 0,
    });
  }

  return rows.sort((a, b) => b.profit - a.profit);
}
