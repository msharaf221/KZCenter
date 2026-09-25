import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getVisibleNavigation } from '../../app/routes';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { DebtAlert, refreshDebtAlert, subscribeDebtAlert } from '../../lib/debtAlerts';
import { ROLE_LABEL } from '../../lib/permissions';
import { getContrastColor } from '../../lib/utils';

export default function Sidebar() {
  const { user, logout, can } = useAuth();
  const { sidebarOpen, setSidebarOpen, settings } = useApp();
  const [debtAlert, setDebtAlert] = useState<DebtAlert | null>(null);

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
      className={`
        fixed top-0 right-0 h-full z-40 flex flex-col
        bg-white border-l border-gray-200 shadow-lg
        sidebar-transition
        ${sidebarOpen ? 'w-64' : 'w-16'}
      `}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 min-h-[64px]">
        {sidebarOpen && (
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{
                backgroundColor: settings?.primaryColor || '#6366f1',
                color: getContrastColor(settings?.primaryColor || '#6366f1'),
              }}
            >
              E
            </div>
            <span className="font-bold text-gray-900 truncate text-sm">{settings?.centerName || 'EduCenter Pro'}</span>
          </div>
        )}
        {!sidebarOpen && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm mx-auto"
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
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          {sidebarOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {visibleItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1
              transition-all duration-200 group relative
              ${isActive ? 'text-white shadow-md' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
              ${!sidebarOpen ? 'justify-center' : ''}
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
            <span className="flex-shrink-0">
              <item.icon size={20} />
            </span>
            {sidebarOpen && <span className="font-medium text-sm truncate">{item.label}</span>}
            {item.debtBadge &&
              debtAlert &&
              debtAlert.debtorsCount > 0 &&
              (sidebarOpen ? (
                <span className="mr-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {debtAlert.debtorsCount}
                </span>
              ) : (
                <span className="absolute top-1 left-1 w-2 h-2 bg-red-500 rounded-full" />
              ))}
            {!sidebarOpen && (
              <div
                className="absolute right-full mr-2 bg-gray-900 text-white text-xs px-2 py-1 rounded
                opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50"
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
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{
                backgroundColor: settings?.primaryColor || '#6366f1',
                color: getContrastColor(settings?.primaryColor || '#6366f1'),
              }}
            >
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.username}</p>
              <p className="text-xs text-gray-500">{user?.role ? ROLE_LABEL[user.role] : ''}</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={logout}
            className="w-full flex justify-center p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
            title="تسجيل الخروج"
          >
            <LogOut size={18} />
          </button>
        )}
      </div>
    </aside>
  );
}
