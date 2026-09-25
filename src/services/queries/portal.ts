import { readSnapshot } from '../../data/readers';
import type { AttendanceStatus, Student } from '../../domain/models';
import type { InstallmentStatus } from '../../lib/billing';
import { getStudentCode } from '../../lib/barcode';

export interface StudentPortalExamResult {
  examId: string;
  examName: string;
  groupName?: string;
  date: string;
  grade: number;
  maxGrade: number;
  percentage: number;
  notes?: string;
}

export interface StudentPortalGroupInfo {
  groupId: string;
  groupName: string;
  courseName: string;
  teacherName?: string;
  schedule?: string;
}

export interface StudentPortalAttendanceRecord {
  date: string;
  groupName: string;
  status: AttendanceStatus;
  checkInTime?: string;
}

export interface StudentPortalData {
  student: Student;
  code: string;
  groups: StudentPortalGroupInfo[];
  attendance: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    rate: number;
    records: StudentPortalAttendanceRecord[];
  };
  exams: StudentPortalExamResult[];
  finance: {
    totalPaid: number;
    remaining: number;
    currency: string;
    recentPayments: Array<{
      id: string;
      receiptNo?: string;
      amount: number;
      date: string;
      type?: string;
      method?: string;
    }>;
    upcomingInstallments: Array<{
      id: string;
      amount: number;
      dueDate: string;
      status: InstallmentStatus;
      groupName?: string;
    }>;
  };
}

export interface PortalLookupResult {
  matches: Array<{ id: string; name: string; code: string; parentPhone: string }>;
  selectedData?: StudentPortalData;
}

/**
 * استعلام بوابة الطالب وولي الأمر برقم الهاتف أو الكود
 */
export async function lookupStudentPortal(rawQuery: string, selectedStudentId?: string): Promise<PortalLookupResult> {
  const query = (rawQuery || '').trim();
  if (!query && !selectedStudentId) {
    return { matches: [] };
  }

  const snapshot = await readSnapshot([
    'students',
    'enrollments',
    'groups',
    'courses',
    'teachers',
    'attendance',
    'exams',
    'grades',
    'payments',
    'installments',
    'settings',
  ]);

  const cleanQuery = query.toUpperCase().replace(/\s+/g, '');
  const digits = query.replace(/\D/g, '');

  // تصفية الطلاب المطابقين
  const allStudents = snapshot.students;
  let matchingStudents: Student[] = [];

  if (selectedStudentId) {
    const s = allStudents.find(st => st.id === selectedStudentId);
    if (s) matchingStudents = [s];
  } else {
    matchingStudents = allStudents.filter(s => {
      const code = getStudentCode(s).toUpperCase();
      const sId = s.id.toUpperCase();
      const sPhone = (s.phone || '').replace(/\D/g, '');
      const pPhone = (s.parentPhone || '').replace(/\D/g, '');

      return (
        code === cleanQuery ||
        sId === cleanQuery ||
        s.id === query ||
        (digits.length >= 7 && (sPhone.endsWith(digits) || pPhone.endsWith(digits))) ||
        (query.length >= 3 && s.name.toLowerCase().includes(query.toLowerCase()))
      );
    });
  }

  const matches = matchingStudents.map(s => ({
    id: s.id,
    name: s.name,
    code: getStudentCode(s),
    parentPhone: s.parentPhone,
  }));

  if (matchingStudents.length === 0) {
    return { matches: [] };
  }

  // إذا تم اختيار طالب محدد أو وجدنا طالب واحد فقط، نجمع تقريره الأكاديمي والمالي الشامل
  const targetStudent = matchingStudents.length === 1 ? matchingStudents[0] : (selectedStudentId ? matchingStudents.find(s => s.id === selectedStudentId) : undefined);

  if (!targetStudent) {
    return { matches };
  }

  const studentId = targetStudent.id;
  const currency = snapshot.settings[0]?.currency || 'EGP';

  // المجموعات والتسجيلات
  const activeEnrollments = snapshot.enrollments.filter(e => e.studentId === studentId && e.status === 'active');
  const enrolledGroupIds = new Set(activeEnrollments.map(e => e.groupId).concat(targetStudent.enrolledGroups || []));

  const groupsInfo: StudentPortalGroupInfo[] = snapshot.groups
    .filter(g => enrolledGroupIds.has(g.id))
    .map(g => {
      const course = snapshot.courses.find(c => c.id === g.courseId);
      const teacher = snapshot.teachers.find(t => t.id === g.teacherId);
      const schedule = g.schedule?.map(s => `${s.days.join('، ')} (${s.startTime} - ${s.endTime})`).join(' · ') || '';
      return {
        groupId: g.id,
        groupName: g.name,
        courseName: course?.name || '—',
        teacherName: teacher?.name,
        schedule,
      };
    });

  // الحضور والغياب
  const studentAttendance = snapshot.attendance
    .filter(a => a.studentId === studentId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const presentCount = studentAttendance.filter(a => a.status === 'present').length;
  const absentCount = studentAttendance.filter(a => a.status === 'absent').length;
  const lateCount = studentAttendance.filter(a => a.status === 'late').length;
  const excusedCount = studentAttendance.filter(a => a.status === 'excused').length;
  const totalSessions = studentAttendance.length;
  const rate = totalSessions > 0 ? Math.round(((presentCount + lateCount) / totalSessions) * 100) : 100;

  const attendanceRecords: StudentPortalAttendanceRecord[] = studentAttendance.slice(0, 30).map(a => {
    const grp = snapshot.groups.find(g => g.id === a.groupId);
    return {
      date: a.date,
      groupName: grp?.name || '—',
      status: a.status,
      checkInTime: a.checkInTime,
    };
  });

  // الامتحانات والدرجات
  const studentGrades = snapshot.grades.filter(g => g.studentId === studentId);
  const examsResults: StudentPortalExamResult[] = [];
  for (const g of studentGrades) {
    const exam = snapshot.exams.find(e => e.id === g.examId);
    if (!exam) continue;
    const grp = snapshot.groups.find(grp => grp.id === exam.groupId);
    const maxGrade = exam.maxGrade || 100;
    const percentage = Math.round((g.grade / maxGrade) * 100);
    examsResults.push({
      examId: exam.id,
      examName: exam.name,
      groupName: grp?.name,
      date: exam.date,
      grade: g.grade,
      maxGrade,
      percentage,
      notes: g.notes,
    });
  }
  examsResults.sort((a, b) => b.date.localeCompare(a.date));

  // المالية والمدفوعات
  const studentPayments = snapshot.payments
    .filter(p => p.studentId === studentId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalPaid = studentPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const studentInstallments = snapshot.installments
    .filter(ins => ins.studentId === studentId && (ins.status === 'pending' || ins.status === 'late'))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const remaining = studentInstallments.reduce((sum, ins) => sum + (Number(ins.amount) || 0), 0);

  const recentPayments = studentPayments.slice(0, 10).map(p => ({
    id: p.id,
    receiptNo: p.receiptNo,
    amount: p.amount,
    date: p.date,
    type: p.type,
    method: p.method,
  }));

  const upcomingInstallments = studentInstallments.map(ins => {
    const grp = snapshot.groups.find(g => g.id === ins.groupId);
    return {
      id: ins.id,
      amount: ins.amount,
      dueDate: ins.dueDate,
      status: ins.status,
      groupName: grp?.name,
    };
  });

  const selectedData: StudentPortalData = {
    student: targetStudent,
    code: getStudentCode(targetStudent),
    groups: groupsInfo,
    attendance: {
      total: totalSessions,
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      excused: excusedCount,
      rate,
      records: attendanceRecords,
    },
    exams: examsResults,
    finance: {
      totalPaid,
      remaining,
      currency,
      recentPayments,
      upcomingInstallments,
    },
  };

  return {
    matches,
    selectedData,
  };
}
