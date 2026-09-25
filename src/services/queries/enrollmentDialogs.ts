import dayjs from 'dayjs';
import { readSnapshot } from '../../data/readers';
import { requireLive } from '../../domain/validation';
import { effectiveMonthlyPrice, renewalInfo } from '../../lib/billing';
import { orderedInstallments } from '../../domain/ledger/balance';

export async function loadRenewalDialog(studentId: string, groupId: string, upcomingDueDays = 7) {
  const data = await readSnapshot(['students', 'groups', 'courses', 'enrollments', 'installments']);
  requireLive(data.students.find(row => row.id === studentId), 'الطالب غير موجود');
  const group = requireLive(data.groups.find(row => row.id === groupId), 'المجموعة غير موجودة');
  const course = data.courses.find(row => row.id === group.courseId) || null;
  const enrollments = data.enrollments.filter(row => row.studentId === studentId && row.groupId === groupId).sort((a, b) => (b.enrolledAt || '').localeCompare(a.enrolledAt || ''));
  const enrollment = enrollments.find(row => row.status === 'active') || enrollments[0] || null;
  const installments = orderedInstallments(data.installments.filter(row => row.studentId === studentId && row.groupId === groupId), dayjs().format('YYYY-MM-DD'));
  const info = renewalInfo(installments, dayjs().format('YYYY-MM-DD'), upcomingDueDays);
  const oldRemaining = Math.round(installments.filter(row => row.status !== 'cancelled').reduce((sum, row) => sum + Math.max(0, row.amount - row.paidAmount), 0) * 100) / 100;
  const monthlyPrice = effectiveMonthlyPrice({ coursePrice: course?.price || 0, priceOverride: enrollment?.priceOverride, discountAmount: enrollment?.discountAmount, discountPercent: enrollment?.discountPercent });
  return { group, course, enrollment, info, oldRemaining, monthlyPrice, startDate: info.nextStartDate };
}
