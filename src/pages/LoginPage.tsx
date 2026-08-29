import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, RefreshCw, Shield, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notifications';
import { checkPasswordStrength } from '../lib/security';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState<ReturnType<typeof checkPasswordStrength> | null>(null);
  const { login, changePassword, rateLimitInfo } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const flag = sessionStorage.getItem('educenter_must_change_pw');
    if (flag === 'true') {
      setMustChangePassword(true);
    }
  }, []);

  useEffect(() => {
    if (newPassword) {
      setPasswordStrength(checkPasswordStrength(newPassword));
    } else {
      setPasswordStrength(null);
    }
  }, [newPassword]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) {
      notify.error('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }
    setLoading(true);
    try {
      const result = await login(username, password);
      if (result.success) {
        if (result.mustChangePassword) {
          setMustChangePassword(true);
        } else {
          notify.success('مرحباً بك! تم تسجيل الدخول بنجاح');
          navigate('/');
        }
      } else {
        if (rateLimitInfo && !rateLimitInfo.remainingAttempts) {
          notify.error('تم حظر المحاولات مؤقتاً. حاول لاحقاً.');
        } else {
          notify.error('اسم المستخدم أو كلمة المرور غير صحيحة');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      notify.error('حدث خطأ أثناء تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      notify.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (newPassword === 'admin123') {
      notify.error('لا يمكن استخدام كلمة المرور الافتراضية');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify.error('كلمتا المرور غير متطابقتين');
      return;
    }
    if (passwordStrength && passwordStrength.score < 2) {
      notify.error('كلمة المرور ضعيفة. يرجى تحسينها.');
      return;
    }
    setLoading(true);
    try {
      const success = await changePassword(password, newPassword);
      if (success) {
        setMustChangePassword(false);
        notify.success('تم تغيير كلمة المرور بنجاح! مرحباً بك.');
        navigate('/');
      }
    } catch (err) {
      console.error('Change password error:', err);
      notify.error('حدث خطأ أثناء تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetDatabase() {
    if (!window.confirm('هل أنت متأكد من إعادة تعيين قاعدة البيانات؟ سيتم حذف جميع البيانات!')) {
      return;
    }
    setResetting(true);
    try {
      const deleteRequest = indexedDB.deleteDatabase('EduCenterProDB');
      deleteRequest.onsuccess = () => {
        notify.success('تم إعادة تعيين قاعدة البيانات. سيتم تحديث الصفحة...');
        setTimeout(() => window.location.reload(), 1500);
      };
      deleteRequest.onerror = () => {
        console.error('❌ Failed to delete database');
        notify.error('فشل في إعادة تعيين قاعدة البيانات');
        setResetting(false);
      };
      deleteRequest.onblocked = () => {
        console.warn('⚠️ Database deletion blocked');
        notify.warning('قاعدة البيانات مقفلة. أغلق جميع التبويبات الأخرى وحاول مرة أخرى.');
        setResetting(false);
      };
    } catch (err) {
      console.error('Reset error:', err);
      notify.error('حدث خطأ');
      setResetting(false);
    }
  }

  // Must change password screen
  if (mustChangePassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-200">
              <Shield size={40} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-gray-900">تغيير كلمة المرور</h1>
            <p className="text-gray-500 mt-2">يجب تغيير كلمة المرور الافتراضية قبل المتابعة</p>
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
            <div className="mb-6 p-4 bg-orange-50 rounded-xl border border-orange-100">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-orange-600" />
                <p className="text-sm font-bold text-orange-800">تنبيه أمني</p>
              </div>
              <p className="text-xs text-orange-700">
                أنت تستخدم كلمة المرور الافتراضية. يجب تغييرها فوراً لحماية حسابك.
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">كلمة المرور الجديدة</label>
                <div className="relative">
                  <Lock size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="أدخل كلمة مرور قوية"
                    className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    autoFocus
                  />
                </div>
                {/* Password strength indicator */}
                {passwordStrength && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[0, 1, 2, 3].map(i => (
                        <div
                          key={i}
                          className="h-1 flex-1 rounded-full transition-colors"
                          style={{
                            backgroundColor: i <= passwordStrength.score ? passwordStrength.color : '#e5e7eb',
                          }}
                        />
                      ))}
                    </div>
                    <p className="text-xs" style={{ color: passwordStrength.color }}>
                      {passwordStrength.label}
                    </p>
                    {passwordStrength.suggestions.length > 0 && (
                      <ul className="mt-1 text-xs text-gray-500">
                        {passwordStrength.suggestions.map((s, i) => (
                          <li key={i}>• {s}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">تأكيد كلمة المرور</label>
                <div className="relative">
                  <Lock size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="أعد إدخال كلمة المرور"
                    className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">كلمتا المرور غير متطابقتين</p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !newPassword || newPassword !== confirmPassword || (passwordStrength?.score ?? 0) < 2}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm transition-all
                  disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-orange-200"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    جاري التغيير...
                  </span>
                ) : 'تغيير كلمة المرور والمتابعة'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
            <span className="text-4xl">🎓</span>
          </div>
          <h1 className="text-3xl font-black text-gray-900">EduCenter Pro</h1>
          <p className="text-gray-500 mt-1">نظام إدارة المركز التعليمي</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-6">تسجيل الدخول</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">اسم المستخدم</label>
              <div className="relative">
                <User size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">كلمة المرور</label>
              <div className="relative">
                <Lock size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  className="w-full pr-10 pl-10 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Rate limit warning */}
            {rateLimitInfo && rateLimitInfo.remainingAttempts <= 2 && rateLimitInfo.remainingAttempts > 0 && (
              <div className="p-3 bg-yellow-50 rounded-xl border border-yellow-100">
                <p className="text-xs text-yellow-700 flex items-center gap-1">
                  <AlertTriangle size={14} />
                  متبقي {rateLimitInfo.remainingAttempts} محاولات قبل الحظر المؤقت
                </p>
              </div>
            )}

            {rateLimitInfo && rateLimitInfo.remainingAttempts === 0 && (
              <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                <p className="text-xs text-red-700 flex items-center gap-1">
                  <AlertTriangle size={14} />
                  تم حظر المحاولات. حاول مرة أخرى بعد بضع دقائق.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (rateLimitInfo?.remainingAttempts === 0)}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all
                disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-indigo-200"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  جاري تسجيل الدخول...
                </span>
              ) : 'تسجيل الدخول'}
            </button>
          </form>

          {import.meta.env.DEV && (
            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-500 font-medium mb-1">بيانات الدخول الافتراضية:</p>
              <p className="text-xs text-gray-600">المستخدم: <strong>admin</strong></p>
              <p className="text-xs text-gray-600">كلمة المرور: <strong>admin123</strong></p>
              <p className="text-xs text-orange-600 mt-1">⚠️ سيتم طلب تغييرها فور الدخول</p>
            </div>
          )}
          {/* Reset Database Button (dev only - dangerous) */}
          {import.meta.env.DEV && (
            <div className="mt-4 text-center">
              <button
                onClick={handleResetDatabase}
                disabled={resetting}
                className="text-xs text-gray-400 hover:text-red-500 flex items-center justify-center gap-1 mx-auto transition-colors"
              >
                <RefreshCw size={12} className={resetting ? 'animate-spin' : ''} />
                {resetting ? 'جاري إعادة التعيين...' : 'إعادة تعيين قاعدة البيانات'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
