import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { APP_ROUTES, getVisibleNavigation } from '../app/routes';
import AppRoutes from '../app/AppRoutes';
import { can } from '../lib/permissions';
import type { UserRole } from '../domain/models';

const auth = { user: null as { role: UserRole; mustChangePassword?: boolean } | null, loading: false };
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../pages/PayrollPage', () => ({ default: () => <h1>Payroll screen</h1> }));
vi.mock('../pages/LoginPage', () => ({ default: () => <h1>Login screen</h1> }));
vi.mock('../pages/DashboardPage', () => ({ default: () => <h1>Dashboard screen</h1> }));
vi.mock('../pages/StudentProfilePage', () => ({ default: () => <h1>Student profile</h1> }));

beforeEach(() => {
  auth.user = null;
  auth.loading = false;
});

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

const roles: UserRole[] = ['admin', 'accountant', 'secretary', 'supervisor', 'teacher'];

describe('route registry', () => {
  it('keeps all twenty URLs unique and makes only login public', () => {
    expect(APP_ROUTES).toHaveLength(20);
    expect(new Set(APP_ROUTES.map(r => r.path)).size).toBe(APP_ROUTES.length);
    expect(APP_ROUTES.filter(r => r.public).map(r => r.path)).toEqual(['/login']);
    for (const route of APP_ROUTES) {
      if (!['/login', '/'].includes(route.path)) expect(route.entity).toBeTruthy();
    }
  });

  it('preserves navigation order, the debt badge and hidden profile routes', () => {
    const items = getVisibleNavigation('admin');
    expect(items.map(i => i.path)).toEqual([
      '/',
      '/students',
      '/teachers',
      '/courses',
      '/inventory',
      '/groups',
      '/payments',
      '/debtors',
      '/payroll',
      '/expenses',
      '/attendance',
      '/exams',
      '/daily-reports',
      '/reports',
      '/users',
      '/audit-log',
      '/settings',
    ]);
    expect(items.find(i => i.debtBadge)?.path).toBe('/debtors');
    expect(items.find(i => i.path === '/payroll')?.label).toBe('مرتبات المدرسين');
    for (const parent of ['/students', '/teachers']) {
      expect(APP_ROUTES.find(r => r.path === `${parent}/:id`)?.entity).toBe(
        APP_ROUTES.find(r => r.path === parent)?.entity,
      );
    }
  });

  it.each(roles)('uses the same permissions for the menu and guarded routes: %s', role => {
    const paths = new Set(getVisibleNavigation(role).map(i => i.path));
    for (const route of APP_ROUTES.filter(r => r.navigation)) {
      expect(paths.has(route.path)).toBe(!route.entity || can(role, route.entity, 'view'));
    }
  });
});

describe('guarded lazy routes', () => {
  it('redirects an unauthenticated payroll visit to login', async () => {
    open('/payroll');
    expect(await screen.findByRole('heading', { name: 'Login screen' })).toBeInTheDocument();
    expect(screen.queryByText('Payroll screen')).not.toBeInTheDocument();
  });

  it.each(['admin', 'accountant'] as UserRole[])('allows payroll for %s', async role => {
    auth.user = { role };
    open('/payroll');
    expect(await screen.findByRole('heading', { name: 'Payroll screen' })).toBeInTheDocument();
  });

  it.each(['secretary', 'supervisor', 'teacher'] as UserRole[])('denies direct payroll access to %s', role => {
    auth.user = { role };
    open('/payroll');
    expect(screen.getByText('غير مصرح بالوصول')).toBeInTheDocument();
    expect(screen.queryByText('Payroll screen')).not.toBeInTheDocument();
  });

  it('shows the shared loader while authentication is initializing', () => {
    auth.loading = true;
    open('/payroll');
    expect(screen.getByRole('status')).toHaveTextContent('جاري التحميل');
  });

  it('retains parameterized profile routes', async () => {
    auth.user = { role: 'teacher' };
    open('/students/example-id');
    expect(await screen.findByText('Student profile')).toBeInTheDocument();
  });

  it('retains the catch-all dashboard redirect', async () => {
    auth.user = { role: 'admin' };
    open('/unknown');
    expect(await screen.findByText('Dashboard screen')).toBeInTheDocument();
  });
});


it('requires password rotation before any protected page, including direct URLs', async () => {
  auth.user = { role: 'admin', mustChangePassword: true };
  open('/payroll');
  expect(await screen.findByRole('heading', { name: 'Login screen' })).toBeInTheDocument();
  expect(screen.queryByText('Payroll screen')).not.toBeInTheDocument();
});
