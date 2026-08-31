import { useState } from 'react';
import { Plus, Trash2, Key } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import { useAuth } from '../contexts/AuthContext';
import { User, UserRole } from '../lib/db';
import { formatDate, getContrastColor } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { notify } from '../lib/notifications';

export default function UsersPage() {
  const { allUsers, addUser, deleteUser, resetPassword, user: currentUser } = useAuth();
  const { settings } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '', role: 'teacher' as UserRole });
  const [resetPassword_, setResetPassword_] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAddUser() {
    if (!form.username.trim()) { notify.error('اسم المستخدم مطلوب'); return; }
    if (form.password.length < 6) { notify.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (form.password !== form.confirmPassword) { notify.error('كلمتا المرور غير متطابقتين'); return; }
    setLoading(true);
    try {
      await addUser(form.username, form.password, form.role);
      setShowModal(false);
      setForm({ username: '', password: '', confirmPassword: '', role: 'teacher' });
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : 'حدث خطأ');
    } finally { setLoading(false); }
  }

  async function handleResetPassword() {
    if (resetPassword_.length < 6) { notify.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (resetPassword_ !== resetConfirm) { notify.error('كلمتا المرور غير متطابقتين'); return; }
    if (!selectedUser) return;
    setLoading(true);
    try {
      await resetPassword(selectedUser.id, resetPassword_);
      setShowResetModal(false);
      setResetPassword_('');
      setResetConfirm('');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : 'حدث خطأ');
    } finally { setLoading(false); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteUser(id);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : 'لا يمكن حذف هذا المستخدم');
    }
  }

  const visibleUsers = allUsers.filter(u => !u.deleted);

  return (
    <Layout title="إدارة المستخدمين">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
            <Plus size={16} /> إضافة مستخدم
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-4 text-right text-xs font-semibold text-gray-600">#</th>
                <th className="p-4 text-right text-xs font-semibold text-gray-600">اسم المستخدم</th>
                <th className="p-4 text-right text-xs font-semibold text-gray-600">الدور</th>
                <th className="p-4 text-right text-xs font-semibold text-gray-600">تاريخ الإنشاء</th>
                <th className="p-4 text-center text-xs font-semibold text-gray-600">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleUsers.map((u, idx) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 text-sm text-gray-500">{idx + 1}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
                        {u.username[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{u.username}</p>
                        {u.id === currentUser?.id && <p className="text-xs text-indigo-500">(أنت)</p>}
                      </div>
                    </div>
                  </td>
                  <td className="p-4"><Badge status={u.role} /></td>
                  <td className="p-4 text-sm text-gray-500">{formatDate(u.createdAt)}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => { setSelectedUser(u); setShowResetModal(true); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        title="إعادة تعيين كلمة المرور">
                        <Key size={14} /> تغيير المرور
                      </button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => setDeleteId(u.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                          <Trash2 size={14} /> حذف
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="إضافة مستخدم جديد">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">اسم المستخدم *</label>
            <input type="text" value={form.username} onChange={e => setForm({...form, username: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="مثال: teacher1" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الدور</label>
            <select value={form.role} onChange={e => setForm({...form, role: e.target.value as UserRole})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
              <option value="admin">مسؤول</option>
              <option value="teacher">مدرس</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">كلمة المرور *</label>
            <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="6 أحرف على الأقل" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">تأكيد كلمة المرور *</label>
            <input type="password" value={form.confirmPassword} onChange={e => setForm({...form, confirmPassword: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleAddUser} disabled={loading}
            className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm disabled:opacity-60"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
            {loading ? 'جاري الإضافة...' : 'إضافة'}
          </button>
          <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">إلغاء</button>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={showResetModal} onClose={() => setShowResetModal(false)} title={`تغيير كلمة مرور: ${selectedUser?.username}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">كلمة المرور الجديدة</label>
            <input type="password" value={resetPassword_} onChange={e => setResetPassword_(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="6 أحرف على الأقل" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">تأكيد كلمة المرور</label>
            <input type="password" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleResetPassword} disabled={loading}
            className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm disabled:opacity-60"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
            {loading ? 'جاري الحفظ...' : 'حفظ'}
          </button>
          <button onClick={() => setShowResetModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">إلغاء</button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="حذف المستخدم" message="هل أنت متأكد من حذف هذا المستخدم؟"
        onConfirm={() => { if (deleteId) handleDelete(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)} danger />
    </Layout>
  );
}
