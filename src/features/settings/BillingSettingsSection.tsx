import { Image as ImageIcon, Receipt, Save, Trash2, Upload } from 'lucide-react';
import { notify } from '../../lib/notifications';
import { getContrastColor } from '../../lib/utils';
import type { SettingsSectionProps } from './types';

export default function BillingSettingsSection({
  form,
  setForm,
  handleSaveGeneral,
  primaryColor,
}: SettingsSectionProps) {
  /** رفع شعار المركز (data URL) — بيتصغر قبل الحفظ عشان ما ينفخش القاعدة */
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify.error('الملف لازم يكون صورة');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      notify.error('حجم الصورة كبير (الحد 2 ميجا)');
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const max = 320;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('read failed'));
      img.src = URL.createObjectURL(file);
    }).catch(() => '');
    if (!dataUrl) {
      notify.error('تعذّر قراءة الصورة');
      return;
    }
    setForm(f => ({ ...f, logo: dataUrl }));
    notify.success('تم تحميل الشعار — اضغط حفظ لتفعيله');
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
        <Receipt size={20} /> الإيصالات والتنبيهات
      </h2>
      <p className="text-xs text-gray-400 mb-5">أرقام الإيصالات والمطبوعات وتنبيهات الشهر</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">بادئة رقم الإيصال</label>
          <input
            type="text"
            value={form.receiptPrefix}
            maxLength={8}
            onChange={e => setForm({ ...form, receiptPrefix: e.target.value.toUpperCase() })}
            placeholder="KZ (افتراضي = السنة)"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none font-mono"
          />
          <p className="text-[11px] text-gray-400 mt-1">الأرقام بتكمل تسلسلياً: KZ-202609-0001</p>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1">تذييل الإيصال</label>
          <input
            type="text"
            value={form.receiptFooter}
            onChange={e => setForm({ ...form, receiptFooter: e.target.value })}
            placeholder="مثال: الاشتراك غير قابل للاسترداد بعد أول حصة"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
          />
        </div>

        {/* الشعار */}
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <ImageIcon size={14} /> شعار المركز (يظهر في الإيصالات والتقارير المطبوعة)
          </label>
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50">
              {form.logo ? (
                <img src={form.logo} alt="الشعار" className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs text-gray-400">مفيش شعار</span>
              )}
            </div>
            <div className="space-y-2">
              <label className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                <Upload size={14} /> اختيار صورة
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </label>
              {form.logo && (
                <button
                  onClick={() => setForm(f => ({ ...f, logo: '' }))}
                  className="flex items-center gap-1.5 px-3 py-2 border border-red-200 rounded-xl text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={13} /> إزالة الشعار
                </button>
              )}
              <p className="text-[11px] text-gray-400">PNG/JPG — بيتصغر تلقائياً لأقصى 320px</p>
            </div>
          </div>
        </div>

        {/* التنبيهات الجديدة */}
        <div className="sm:col-span-2 border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <span className="text-sm font-medium text-gray-700">🔔 تنبيه قبل ميعاد التجديد</span>
              <p className="text-[11px] text-gray-400 mt-0.5">يظهر في لوحة التحكم قبل ما اشتراك الطالب يخلص</p>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, notifyUpcomingDue: !f.notifyUpcomingDue }))}
              className={`relative w-12 h-6 rounded-full transition-colors ${form.notifyUpcomingDue ? '' : 'bg-gray-300'}`}
              style={form.notifyUpcomingDue ? { backgroundColor: primaryColor } : {}}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full shadow transition-transform bg-white ${form.notifyUpcomingDue ? 'translate-x-1' : 'translate-x-7'}`}
              />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">التنبيه قبل التجديد بـ (يوم)</label>
              <input
                type="number"
                min={1}
                max={15}
                value={form.upcomingDueDays}
                onChange={e => setForm({ ...form, upcomingDueDays: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">عدد الحصص في الشهر (افتراضي)</label>
              <input
                type="number"
                min={1}
                max={40}
                value={form.sessionsPerMonth}
                onChange={e => setForm({ ...form, sessionsPerMonth: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">
                لحساب اللي بييجي في نص الشهر — لو الكورس مش محدد له عدد
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">حد المخزون المنخفض</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.lowStockThreshold}
                onChange={e => setForm({ ...form, lowStockThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSaveGeneral}
        className="mt-5 flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium"
        style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
      >
        <Save size={16} /> حفظ
      </button>
    </div>
  );
}
