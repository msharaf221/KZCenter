import dayjs from 'dayjs';
import { readSnapshot } from '../../data/readers';
import type { Group, Student, UserRole } from '../../domain/models';
import { genderDistribution } from '../../domain/reporting/charts';
import { dashboardFinance } from '../../domain/reporting/finance';
import { getRepeatedAbsenceAlerts, type AbsenceAlert } from '../../lib/absenceAlerts';
import { upcomingDues } from '../../lib/billing';
import { visibleGroupIds } from '../../lib/permissions';
import { findScheduleConflicts, type ScheduleConflict } from '../../lib/schedule';
import { getGroupAttendanceForDate } from '../groupService';
import type { RenewalCandidate } from '../renewalService';
import { getRenewalCandidates } from '../renewalService';

/** Empty view data is created afresh so query calls never mutate a shared singleton. */
export function emptyDashboardData() {
  return {
    todayKey: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()],
    stats: {
      activeStudents: 0,
      teachers: 0,
      courses: 0,
      groups: 0,
      totalRevenue: 0,
      pendingPayments: 0,
      pendingAmount: 0,
      growthRate: 0,
    },
    revenueData: [] as { month: string; revenue: number }[],
    genderData: [] as { name: string; value: number }[],
    todayGroups: [] as (Group & { courseName: string; teacherName: string })[],
    recentStudents: [] as Student[],
    upcoming: null as ReturnType<typeof upcomingDues> | null,
    conflicts: [] as ScheduleConflict[],
    renewals: [] as RenewalCandidate[],
    absenceAlerts: [] as AbsenceAlert[],
    todayAttendance: { present: 0, absent: 0, late: 0, excused: 0, recordedGroups: 0 },
  };
}

export async function loadDashboardData({
  role,
  teacherId,
  upcomingDueDays,
}: {
  role?: UserRole;
  teacherId?: string;
  upcomingDueDays?: number;
}) {
  const data = emptyDashboardData();
  const TODAY_KEY = data.todayKey;

  const { students: allStudents, teachers, courses, groups: allGroups, payments, installments: allInstallments, enrollments: allEnrollments, refunds } = await readSnapshot([
    'students', 'teachers', 'courses', 'groups', 'payments', 'installments', 'enrollments', 'refunds',
  ]);

  // عزل بيانات المدرس: مجموعاته وطلابه وأقساطهم بس
  const allowed = visibleGroupIds({ role, teacherId, groups: allGroups });
  const groups = allowed ? allGroups.filter(g => allowed.has(g.id)) : allGroups;
  const students = allowed
    ? allStudents.filter(st => (st.enrolledGroups || []).some(gid => allowed.has(gid)))
    : allStudents;
  const installments = allowed ? allInstallments.filter(i => allowed.has(i.groupId)) : allInstallments;
  const enrollments = allowed ? allEnrollments.filter(e => allowed.has(e.groupId)) : allEnrollments;

  const { revenueData, ...financialStats } = dashboardFinance({ payments, refunds }, dayjs().format('YYYY-MM-DD'));
  data.stats = {
    activeStudents: students.filter(student => student.status === 'active').length,
    teachers: teachers.filter(teacher => teacher.status === 'active').length,
    courses: courses.length,
    groups: groups.filter(group => group.status === 'open').length,
    ...financialStats,
  };
  data.revenueData = revenueData;
  data.genderData = genderDistribution(students);

  // Today's groups
  const todayG = groups
    .filter(g => g.schedule.some(s => s.days.includes(TODAY_KEY)))
    .map(g => ({
      ...g,
      courseName: courses.find(c => c.id === g.courseId)?.name || 'غير محدد',
      teacherName: teachers.find(t => t.id === g.teacherId)?.name || 'غير محدد',
    }));
  data.todayGroups = todayG.slice(0, 8);

  // Recent students
  const sorted = [...students]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
  data.recentStudents = sorted;

  // الأقساط اللي استحقاقها قريب — التنبيه قبل التأخر بيرفع التحصيل
  data.upcoming = upcomingDues(installments, upcomingDueDays ?? 3);

  // اشتراكات قربت تنتهي / انتهت — عشان نجدد قبل ما الطالب يقطع
  const cands = await getRenewalCandidates(upcomingDueDays ?? 7);
  data.renewals = allowed ? cands.filter(c => allowed.has(c.groupId)) : cands;


  // تعارضات الجدول (مدرس/قاعة في مكانين، أو طالب في مجموعتين متعارضتين)
  const teacherNames: Record<string, string> = {};
  for (const t of teachers) teacherNames[t.id] = t.name;
  const studentNames: Record<string, string> = {};
  for (const st of students) studentNames[st.id] = st.name;
  data.conflicts = findScheduleConflicts({
    groups,
    enrollments: enrollments.filter(e => e.status === 'active'),
    teacherNames,
    studentNames,
  });

  // ملخص حضور النهاردة + تنبيهات الغياب المتكرر
  const today = dayjs().format('YYYY-MM-DD');
  let present = 0,
    absent = 0,
    late = 0,
    excused = 0;
  const groupsWithRecords = new Set<string>();
  for (const g of groups) {
    const recs = await getGroupAttendanceForDate(g.id, today);
    if (recs.length > 0) groupsWithRecords.add(g.id);
    for (const r of recs) {
      if (r.status === 'present') present++;
      else if (r.status === 'absent') absent++;
      else if (r.status === 'late') late++;
      else if (r.status === 'excused') excused++;
    }
  }
  data.todayAttendance = { present, absent, late, excused, recordedGroups: groupsWithRecords.size };

  const alerts = await getRepeatedAbsenceAlerts();
  data.absenceAlerts = allowed ? alerts.filter(a => allowed.has(a.groupId)) : alerts;


  return data;
}
