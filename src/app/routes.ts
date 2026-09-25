import {
  AlertTriangle,
  Archive,
  Banknote,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Shield,
  UserCog,
  Users,
  Users2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { UserRole } from '../domain/models';
import { can, type Entity } from '../lib/permissions';

export interface NavigationItem {
  label: string;
  icon: LucideIcon;
  debtBadge?: boolean;
}

export interface AppRoute {
  path: string;
  load: () => Promise<{ default: ComponentType }>;
  /** Only login is public; a missing entity still requires authentication. */
  public?: boolean;
  entity?: Entity;
  navigation?: NavigationItem;
}

/** One source of truth for URLs, route guards and sidebar order/labels. */
export const APP_ROUTES: readonly AppRoute[] = [
  {
    path: '/',
    load: () => import('../pages/DashboardPage'),
    navigation: { label: 'لوحة التحكم', icon: LayoutDashboard },
  },
  {
    path: '/students',
    entity: 'students',
    load: () => import('../pages/StudentsPage'),
    navigation: { label: 'الطلاب', icon: GraduationCap },
  },
  {
    path: '/teachers',
    entity: 'teachers',
    load: () => import('../pages/TeachersPage'),
    navigation: { label: 'المدرسون', icon: Users },
  },
  {
    path: '/courses',
    entity: 'courses',
    load: () => import('../pages/CoursesPage'),
    navigation: { label: 'الكورسات', icon: BookOpen },
  },
  {
    path: '/inventory',
    entity: 'inventory',
    load: () => import('../pages/InventoryPage'),
    navigation: { label: 'الملازم والمخزن', icon: Archive },
  },
  {
    path: '/groups',
    entity: 'groups',
    load: () => import('../pages/GroupsPage'),
    navigation: { label: 'المجموعات', icon: Users2 },
  },
  {
    path: '/payments',
    entity: 'payments',
    load: () => import('../pages/PaymentsPage'),
    navigation: { label: 'المدفوعات', icon: CreditCard },
  },
  {
    path: '/debtors',
    entity: 'debtors',
    load: () => import('../pages/DebtorsPage'),
    navigation: { label: 'المديونيات', icon: AlertTriangle, debtBadge: true },
  },
  {
    path: '/payroll',
    entity: 'payroll',
    load: () => import('../pages/PayrollPage'),
    navigation: { label: 'مرتبات المدرسين', icon: Banknote },
  },
  {
    path: '/expenses',
    entity: 'expenses',
    load: () => import('../pages/ExpensesPage'),
    navigation: { label: 'المصروفات', icon: Wallet },
  },
  {
    path: '/attendance',
    entity: 'attendance',
    load: () => import('../pages/AttendancePage'),
    navigation: { label: 'الحضور', icon: ClipboardCheck },
  },
  {
    path: '/exams',
    entity: 'exams',
    load: () => import('../pages/ExamsPage'),
    navigation: { label: 'الاختبارات', icon: FileText },
  },
  {
    path: '/daily-reports',
    entity: 'dailyReports',
    load: () => import('../pages/DailyReportsPage'),
    navigation: { label: 'التقرير اليومي', icon: CalendarDays },
  },
  {
    path: '/reports',
    entity: 'reports',
    load: () => import('../pages/ReportsPage'),
    navigation: { label: 'التقارير', icon: BarChart3 },
  },
  {
    path: '/users',
    entity: 'users',
    load: () => import('../pages/UsersPage'),
    navigation: { label: 'المستخدمون', icon: UserCog },
  },
  {
    path: '/audit-log',
    entity: 'auditLog',
    load: () => import('../pages/AuditLogPage'),
    navigation: { label: 'سجل المراجعة', icon: Shield },
  },
  {
    path: '/settings',
    entity: 'settings',
    load: () => import('../pages/SettingsPage'),
    navigation: { label: 'الإعدادات', icon: Settings },
  },
  // Detail screens use exactly the same permission as their parent, without extra menu entries.
  { path: '/students/:id', entity: 'students', load: () => import('../pages/StudentProfilePage') },
  { path: '/teachers/:id', entity: 'teachers', load: () => import('../pages/TeacherProfilePage') },
  { path: '/login', public: true, load: () => import('../pages/LoginPage') },
];

export function getVisibleNavigation(role: UserRole | undefined | null): (NavigationItem & { path: string })[] {
  return APP_ROUTES.flatMap(route => {
    if (!route.navigation || (route.entity && !can(role, route.entity, 'view'))) return [];
    return [{ ...route.navigation, path: route.path }];
  });
}
