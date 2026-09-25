import dayjs from 'dayjs';
import type { Course, Expense, Group, Student, Teacher } from '../models';
import { monthlyFinance, type FinancialData } from './finance';

export function genderDistribution(students: readonly Student[]) {
  return [
    { name: 'أولاد', value: students.filter(row => row.gender === 'male').length },
    { name: 'بنات', value: students.filter(row => row.gender === 'female').length },
  ];
}

interface ReportData extends FinancialData {
  students: readonly Student[];
  teachers: readonly Teacher[];
  courses: readonly Course[];
  groups: readonly Group[];
  expenses: readonly Expense[];
}
const expenseLabels: Record<string, string> = {
  salaries: 'رواتب', bills: 'فواتير', maintenance: 'صيانة', purchases: 'مشتريات', rent: 'إيجار', other: 'أخرى',
};
const shorten = (name: string, max: number) => name.length > max ? name.substring(0, max - 2) + '…' : name;

/** Non-financial charts count memberships as before (not distinct pupils across groups). */
export function reportCharts(data: ReportData, referenceDate: string) {
  const { students, teachers, courses, groups, expenses } = data;
  const expenseCategories: Record<string, number> = {};
  for (const row of expenses) if (!row.deleted) expenseCategories[row.category] = (expenseCategories[row.category] || 0) + row.amount;
  return {
    genderData: genderDistribution(students),
    statusData: [
      { name: 'نشط', value: students.filter(row => row.status === 'active').length, color: '#22c55e' },
      { name: 'متوقف', value: students.filter(row => row.status === 'suspended').length, color: '#f97316' },
      { name: 'منتهي', value: students.filter(row => row.status === 'ended').length, color: '#94a3b8' },
    ],
    ageGroups: [[3, 6], [7, 9], [10, 12], [13, 15], [16, 18]].map(([min, max]) => ({
      name: `${min}-${max}`, value: students.filter(row => row.age >= min && row.age <= max).length,
    })),
    courseData: courses.map(course => ({
      name: shorten(course.name, 20),
      students: groups.filter(group => group.courseId === course.id).reduce((sum, group) => sum + group.studentIds.length, 0),
    })).sort((a, b) => b.students - a.students),
    groupFillData: groups.map(group => ({
      name: shorten(group.name, 18),
      fill: group.maxStudents > 0 ? Math.round(group.studentIds.length / group.maxStudents * 100) : 0,
      course: courses.find(course => course.id === group.courseId)?.name || '',
    })),
    teacherData: teachers.map(teacher => {
      const owned = groups.filter(group => group.teacherId === teacher.id);
      return { name: shorten(teacher.name, 18), groups: owned.length, students: owned.reduce((sum, group) => sum + group.studentIds.length, 0) };
    }).filter(teacher => teacher.groups > 0),
    expensePieData: Object.entries(expenseCategories).map(([category, value]) => ({ name: expenseLabels[category] || category, value })),
    monthlyData: monthlyFinance(data, referenceDate).map(row => ({ month: dayjs(row.period).format('MMM'), revenue: row.revenue, expense: row.expense, profit: row.profit })),
  };
}
