import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import { DEFAULT_SETTINGS_VALUES } from '../lib/settings';

const mockAuth = {
  user: { id: 'admin-1', username: 'مدير النظام', role: 'admin' as const },
  logout: vi.fn(),
  can: vi.fn(() => true),
};

const mockApp = {
  sidebarOpen: true,
  setSidebarOpen: vi.fn(),
  settings: DEFAULT_SETTINGS_VALUES,
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../contexts/AppContext', () => ({
  useApp: () => mockApp,
}));

vi.mock('../lib/debtAlerts', () => ({
  refreshDebtAlert: vi.fn(),
  subscribeDebtAlert: vi.fn(() => () => {}),
}));

describe('Sidebar Component', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('renders sidebar with RTL direction and proper typography classes preventing text clipping', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    const aside = screen.getByRole('complementary');
    expect(aside).toHaveAttribute('dir', 'rtl');

    // Verify navigation labels exist and have generous padding + overflow-visible
    const studentsLabel = screen.getByText('الطلاب');
    expect(studentsLabel).toBeInTheDocument();
    expect(studentsLabel.className).toContain('overflow-visible');
    expect(studentsLabel.className).toContain('px-2');
    expect(studentsLabel.className).toContain('min-w-max');
    expect(studentsLabel.className).toContain('leading-relaxed');
    expect(studentsLabel.className).not.toContain('truncate');

    const teachersLabel = screen.getByText('المدرسون');
    expect(teachersLabel.className).toContain('min-w-max');
    expect(teachersLabel.className).toContain('px-2');
  });

  it('persists and restores scroll position across mount and unmount', () => {
    // 1. Simulate initial mount
    const { unmount, container } = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    const nav = container.querySelector('nav');
    expect(nav).toBeInTheDocument();

    // Mock scrollHeight and clientHeight
    Object.defineProperty(nav, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(nav, 'clientHeight', { value: 400, configurable: true });

    // Simulate user scroll to 250px
    Object.defineProperty(nav, 'scrollTop', { value: 250, configurable: true, writable: true });
    fireEvent.scroll(nav!);

    // Should be saved in sessionStorage
    expect(sessionStorage.getItem('educenter_sidebar_scroll_top')).toBe('250');

    // Simulate clicking an item to capture scroll
    const link = screen.getByText('الطلاب').closest('a');
    fireEvent.click(link!);
    expect(sessionStorage.getItem('educenter_sidebar_scroll_top')).toBe('250');

    // 2. Unmount (simulating page navigation)
    // Even if scrollTop evaluates to 0 during detachment, it must NOT overwrite the 250px!
    Object.defineProperty(nav, 'scrollTop', { value: 0, configurable: true });
    unmount();

    // Verify sessionStorage still has 250
    expect(sessionStorage.getItem('educenter_sidebar_scroll_top')).toBe('250');

    // 3. Remount (new page loaded)
    const remount = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    const newNav = remount.container.querySelector('nav');
    expect(newNav).toBeInTheDocument();
    expect(sessionStorage.getItem('educenter_sidebar_scroll_top')).toBe('250');
  });

  it('ignores false 0 scroll events during restoration phase', () => {
    sessionStorage.setItem('educenter_sidebar_scroll_top', '300');

    const { container } = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    const nav = container.querySelector('nav');
    expect(nav).toBeInTheDocument();

    // Browser prematurely fires scroll event with 0 before layout finishes
    Object.defineProperty(nav, 'scrollTop', { value: 0, configurable: true });
    fireEvent.scroll(nav!);

    // Storage must still retain 300, not wiped to 0!
    expect(sessionStorage.getItem('educenter_sidebar_scroll_top')).toBe('300');
  });
});
