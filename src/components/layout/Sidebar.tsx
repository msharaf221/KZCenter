import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getVisibleNavigation } from '../../app/routes';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { DebtAlert, refreshDebtAlert, subscribeDebtAlert } from '../../lib/debtAlerts';
import { ROLE_LABEL } from '../../lib/permissions';
import { getContrastColor } from '../../lib/utils';

const SIDEBAR_SCROLL_KEY = 'educenter_sidebar_scroll_top';

// In-memory cache for synchronous scroll position restoration across route transitions
let cachedSidebarScrollTop = (() => {
  try {
    const val = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    const num = Number(val);
    return Number.isFinite(num) && num > 0 ? num : 0;
  } catch {
    return 0;
  }
})();

function saveScrollPosition(value: number) {
  if (value > 0) {
    cachedSidebarScrollTop = value;
    try {
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(value));
    } catch {
      // ignore storage errors
    }
  } else if (value === 0 && cachedSidebarScrollTop === 0) {
    try {
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, '0');
    } catch {
      // ignore storage errors
    }
  }
}

export default function Sidebar() {
  const { user, logout, can } = useAuth();
  const { sidebarOpen, setSidebarOpen, settings } = useApp();
  const [debtAlert, setDebtAlert] = useState<DebtAlert | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const isRestoringRef = useRef(cachedSidebarScrollTop > 0);

  const restoreScroll = useCallback(() => {
    const el = navRef.current;
    if (!el || cachedSidebarScrollTop <= 0) return true;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return false;
    const target = Math.min(cachedSidebarScrollTop, maxScroll);
    el.scrollTop = target;
    return Math.abs(el.scrollTop - target) <= 1;
  }, []);

  // Restore scroll position synchronously before browser paint
  useLayoutEffect(() => {
    if (cachedSidebarScrollTop > 0) {
      isRestoringRef.current = true;
      restoreScroll();
    }
  }, [restoreScroll]);

  // Multi-phase restoration: handles double rAF, font loading, layout settling, and resizing
  useEffect(() => {
    if (cachedSidebarScrollTop <= 0) {
      isRestoringRef.current = false;
      return;
    }

    isRestoringRef.current = true;
    let cancelled = false;

    const raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      restoreScroll();
      const raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        restoreScroll();
      });
      rafIds.push(raf2);
    });

    const rafIds = [raf1];
    const timers = [
      setTimeout(() => {
        if (!cancelled) restoreScroll();
      }, 30),
      setTimeout(() => {
        if (!cancelled) restoreScroll();
      }, 100),
      setTimeout(() => {
        if (!cancelled) restoreScroll();
      }, 250),
      setTimeout(() => {
        if (!cancelled) {
          restoreScroll();
          isRestoringRef.current = false;
        }
      }, 500),
    ];

    let ro: ResizeObserver | null = null;
    if (navRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        if (!cancelled && cachedSidebarScrollTop > 0) {
          restoreScroll();
        }
      });
      ro.observe(navRef.current);
    }

    return () => {
      cancelled = true;
      rafIds.forEach(id => cancelAnimationFrame(id));
      timers.forEach(id => clearTimeout(id));
      ro?.disconnect();
    };
  }, [restoreScroll]);

  const captureScroll = useCallback(() => {
    const el = navRef.current;
    if (el && el.scrollTop > 0) {
      saveScrollPosition(el.scrollTop);
    }
  }, []);

  const handleNavScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const top = e.currentTarget.scrollTop;
    // Discard false 0-scroll events emitted by layout clamping during initial mounting
    if (isRestoringRef.current && top === 0 && cachedSidebarScrollTop > 0) {
      return;
    }
    if (isRestoringRef.current && Math.abs(top - cachedSidebarScrollTop) <= 2) {
      isRestoringRef.current = false;
    }
    saveScrollPosition(top);
  }, []);

  const handleUserInteraction = useCallback(() => {
    isRestoringRef.current = false;
    captureScroll();
  }, [captureScroll]);

  // Safe unmount: only record positive scroll; never overwrite valid cache with 0 from detached element
  useEffect(() => {
    const el = navRef.current;
    return () => {
      if (el && el.scrollTop > 0) {
        saveScrollPosition(el.scrollTop);
      }
    };
  }, []);

  // تنبيه المديونيات (لمن يقدر يشوف المديونيات) — الحساب بيتعمل مرة كل دقيقة على الأكثر
  const canSeeDebtors = can('debtors', 'view');
  useEffect(() => {
    if (!canSeeDebtors) return;
    const unsubscribe = subscribeDebtAlert(setDebtAlert);
    void refreshDebtAlert();
    return unsubscribe;
  }, [canSeeDebtors]);

  const visibleItems = getVisibleNavigation(user?.role);

  return (
    <aside
      dir="rtl"
      className={`
        fixed top-0 right-0 h-full z-40 flex flex-col
        bg-white border-l border-gray-200 shadow-lg
        sidebar-transition select-none
        ${sidebarOpen ? 'w-64' : 'w-16'}
      `}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 min-h-[64px]">
        {sidebarOpen && (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{
                backgroundColor: settings?.primaryColor || '#6366f1',
                color: getContrastColor(settings?.primaryColor || '#6366f1'),
              }}
            >
              E
            </div>
            <span className="font-bold text-gray-900 text-sm whitespace-nowrap overflow-visible flex-1 min-w-max px-2 text-right leading-relaxed">
              {settings?.centerName || 'EduCenter Pro'}
            </span>
          </div>
        )}
        {!sidebarOpen && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm mx-auto shrink-0"
            style={{
              backgroundColor: settings?.primaryColor || '#6366f1',
              color: getContrastColor(settings?.primaryColor || '#6366f1'),
            }}
          >
            E
          </div>
        )}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors shrink-0"
          aria-label={sidebarOpen ? 'تصغير القائمة الجانبية' : 'توسيع القائمة الجانبية'}
        >
          {sidebarOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav
        ref={navRef}
        onScroll={handleNavScroll}
        onPointerDownCapture={handleUserInteraction}
        onClickCapture={captureScroll}
        onWheel={handleUserInteraction}
        onTouchStart={handleUserInteraction}
        className="flex-1 overflow-y-auto py-4 px-2"
      >
        {visibleItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={captureScroll}
            className={({ isActive }) => `
              flex items-center gap-3 px-3.5 py-2.5 rounded-xl mb-1
              transition-all duration-200 group relative
              ${isActive ? 'text-white shadow-md' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
              ${!sidebarOpen ? 'justify-center px-0' : ''}
            `}
            style={({ isActive }) =>
              isActive
                ? {
                    backgroundColor: settings?.primaryColor || '#6366f1',
                    color: getContrastColor(settings?.primaryColor || '#6366f1'),
                  }
                : {}
            }
          >
            <span className="w-5 h-5 flex items-center justify-center shrink-0">
              <item.icon size={20} />
            </span>
            {sidebarOpen && (
              <span className="font-medium text-sm whitespace-nowrap overflow-visible flex-1 min-w-max px-2 text-right leading-relaxed">
                {item.label}
              </span>
            )}
            {item.debtBadge &&
              debtAlert &&
              debtAlert.debtorsCount > 0 &&
              (sidebarOpen ? (
                <span className="ms-auto shrink-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {debtAlert.debtorsCount}
                </span>
              ) : (
                <span className="absolute top-1 left-1 w-2 h-2 bg-red-500 rounded-full" />
              ))}
            {!sidebarOpen && (
              <div
                className="absolute right-full mr-2 bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg
                opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-lg leading-normal"
              >
                {item.label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User info & Logout */}
      <div className="border-t border-gray-200 p-3">
        {sidebarOpen ? (
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{
                backgroundColor: settings?.primaryColor || '#6366f1',
                color: getContrastColor(settings?.primaryColor || '#6366f1'),
              }}
            >
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-max px-2 overflow-visible">
              <p className="text-sm font-semibold text-gray-900 whitespace-nowrap overflow-visible text-right leading-relaxed">
                {user?.username}
              </p>
              <p className="text-xs text-gray-500 whitespace-nowrap overflow-visible text-right leading-relaxed">
                {user?.role ? ROLE_LABEL[user.role] : ''}
              </p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors shrink-0"
              title="تسجيل الخروج"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={logout}
            className="w-full flex justify-center p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors shrink-0"
            title="تسجيل الخروج"
          >
            <LogOut size={18} />
          </button>
        )}
      </div>
    </aside>
  );
}
