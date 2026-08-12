import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notifications';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) {
      notify.error('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }
    setLoading(true);
    try {
      console.log('📝 Submitting login form...');
      const success = await login(username, password);
      console.log('📝 Login result:', success);
      if (success) {
        notify.success('مرحباً بك! تم تسجيل الدخول بنجاح');
        navigate('/');
      } else {
        notify.error('اسم المستخدم أو كلمة المرور غير صحيحة');
      }
    } catch (err) {
      console.error('Login error:', err);
      notify.error('حدث خطأ أثناء تسجيل الدخول');
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
      // Delete the IndexedDB database
      const deleteRequest = indexedDB.deleteDatabase('EduCenterProDB');
      deleteRequest.onsuccess = () => {
        console.log('✅ Database deleted');
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

            <button
              type="submit"
              disabled={loading}
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

          <div className="mt-6 p-4 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500 font-medium mb-1">بيانات الدخول الافتراضية:</p>
            <p className="text-xs text-gray-600">المستخدم: <strong>admin</strong></p>
            <p className="text-xs text-gray-600">كلمة المرور: <strong>admin123</strong></p>
          </div>

          {/* Reset Database Button */}
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
        </div>
      </div>
    </div>
  );
}
