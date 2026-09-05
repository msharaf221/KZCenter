import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Moon, Sun, Search, Menu, Trash2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';
import { getAppNotifications, markAppNotificationsAsRead, clearAppNotifications, AppNotification } from '../../lib/notifications';
import { formatDateTime, getContrastColor } from '../../lib/utils';
import { globalSearch, kindLabel, type SearchResult } from '../../lib/search';
import { visibleGroupIds } from '../../lib/permissions';
import { dbGetAll, type Group } from '../../lib/db';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { darkMode, toggleDarkMode, setSidebarOpen, sidebarOpen, settings } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadNotifications = () => {
      setNotifications(getAppNotifications());
    };
    loadNotifications();
    window.addEventListener('app_notifications_updated', loadNotifications);
    return () => window.removeEventListener('app_notifications_updated', loadNotifications);
  }, []);

  // مجموعات المستخدم (لتقييد بحث المدرس على مجموعاته)
  const [myGroupIds, setMyGroupIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (user?.role !== 'teacher') { setMyGroupIds(null); return; }
    dbGetAll<Group>('groups')
      .then(gs => setMyGroupIds(visibleGroupIds({ role: user.role, teacherId: user.teacherId, groups: gs })))
      .catch(() => setMyGroupIds(null));
  }, [user?.role, user?.teacherId]);

  // بحث شامل مُ debounce
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearchOpen(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      globalSearch({ query: q, role: user?.role, allowedGroupIds: myGroupIds, currency: settings?.currency, limit: 10 })
        .then(r => { if (!cancelled) { setResults(r); setSearchOpen(true); } })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, myGroupIds, user?.role, settings?.currency]);

  // Ctrl+K / Cmd+K يركّز على البحث
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // إغلاق قائمة النتائج عند الضغط خارجها
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkRead = () => {
    markAppNotificationsAsRead();
  };

  const handleClear = () => {
    clearAppNotifications();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 h-16"
      style={{ right: sidebarOpen ? '256px' : '64px', transition: 'right 0.3s ease' }}>
      <div className="flex items-center justify-between h-full px-6">
        {/* Right side */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 md:hidden"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        </div>

        {/* Left side */}
        <div className="flex items-center gap-3">
          {/* بحث شامل (Ctrl+K) بنتائج فورية من كل الكيانات */}
          <div ref={searchBoxRef} className="relative hidden md:block">
            <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
              <Search size={16} className="text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="بحث شامل… (Ctrl+K)"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => { if (results.length) setSearchOpen(true); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const first = results[0];
                    if (first?.to) { navigate(first.to); setSearchOpen(false); setQuery(''); }
                    else { const q = query.trim(); navigate(q ? `/students?q=${encodeURIComponent(q)}` : '/students'); }
                  } else if (e.key === 'Escape') {
                    setSearchOpen(false);
                  }
                }}
                className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-48"
              />
              {searching && <span className="text-[10px] text-gray-400">…</span>}
            </div>

            {searchOpen && (
              <div className="absolute left-0 mt-2 w-96 max-h-96 overflow-y-auto bg-white rounded-2xl shadow-xl border border-gray-100 z-50">
                {results.length === 0 ? (
                  <p className="p-4 text-sm text-gray-400 text-center">مفيش نتائج لـ «{query}»</p>
                ) : (
                  results.map(r => (
                    <button
                      key={`${r.kind}-${r.id}`}
                      onClick={() => { if (r.to) navigate(r.to); setSearchOpen(false); setQuery(''); }}
                      className="w-full text-right px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center gap-3"
                    >
                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                        {kindLabel(r.kind)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-gray-900 truncate">{r.title}</span>
                        {r.subtitle && <span className="block text-xs text-gray-500 truncate">{r.subtitle}</span>}
                      </span>
                      {r.badge && <span className="shrink-0 text-[10px] text-gray-400">{r.badge}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
            title={darkMode ? 'الوضع النهاري' : 'الوضع المظلم'}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* Notifications */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                if (!showNotifications && unreadCount > 0) {
                  handleMarkRead();
                }
              }}
              className="relative p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1 right-1 w-2 h-2 rounded-full"
                  style={{ backgroundColor: '#ef4444' }}
                />
              )}
            </button>

            {/* Dropdown */}
            {showNotifications && (
              <div className="absolute left-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <h3 className="font-bold text-gray-900">الإشعارات</h3>
                  <div className="flex gap-2">
                    <button onClick={handleClear} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="مسح الكل">
                      <Trash2 size={16} />
                    </button>
                    <button onClick={() => setShowNotifications(false)} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-lg transition-colors md:hidden">
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                      <Bell size={32} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm">لا توجد إشعارات حالياً</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {notifications.map(notif => (
                        <div key={notif.id} className={`p-4 transition-colors hover:bg-gray-50 ${!notif.read ? 'bg-indigo-50/30' : ''}`}>
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-full shrink-0 ${!notif.read ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                              <Bell size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-900 mb-1">{notif.title}</p>
                              <p className="text-sm text-gray-600 mb-2 leading-relaxed">{notif.message}</p>
                              <p className="text-xs text-gray-400" dir="ltr">{formatDateTime(notif.date)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User avatar */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm cursor-pointer"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}
          >
            {user?.username?.[0]?.toUpperCase() || 'A'}
          </div>
        </div>
      </div>
    </header>
  );
}
