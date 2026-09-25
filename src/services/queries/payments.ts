import { readAll, readPage } from '../../data/readers';
import type { Course, Payment, Student } from '../../domain/models';
import { getRefunds } from '../paymentService';
import type { ListQuery } from './types';

export async function loadPaymentsList({ page, pageSize, search, statusFilter }: ListQuery & { statusFilter: string }) {
  const [allStudents, allCourses] = await Promise.all([readAll<Student>('students'), readAll<Course>('courses')]);

  // Build Map for O(1) lookups instead of O(n) find per row
  const studentMap = new Map(allStudents.map(s => [s.id, s]));

  const result = await readPage<Payment>('payments', page, pageSize, (p: Payment) => {
    const student = studentMap.get(p.studentId);
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      (student?.name || '').toLowerCase().includes(q) ||
      (p.receiptNo || '').toLowerCase().includes(q) ||
      (p.collectedByName || p.collectedBy || '').toLowerCase().includes(q) ||
      String(p.amount).includes(q);
    const matchStatus = !statusFilter || p.status === statusFilter;
    return matchSearch && matchStatus;
  });
  return {
    students: allStudents,
    courses: allCourses,
    payments: result.items,
    total: result.total,
    refunds: await getRefunds(),
  };
}
