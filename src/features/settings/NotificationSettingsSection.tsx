import { Bell, MessageSquare, Save, Send } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import type { Settings } from '../../domain/models';
import { notify } from '../../lib/notifications';
import { getContrastColor } from '../../lib/utils';
import { sendWhatsAppMessage } from '../../services/whatsappService';
import type { SettingsSectionProps } from './types';

export default function NotificationSettingsSection({
  form,
  setForm,
  handleSaveGeneral,
  primaryColor,
}: SettingsSectionProps) {
  const { notificationsEnabled, enableNotifications } = useApp();
  const [testPhone, setTestPhone] = useState('');
  const [testingSend, setTestingSend] = useState(false);

  const gateway = form.whatsappGateway || { enabled: false, provider: 'ultramsg' };

  async function handleTestWhatsApp() {
    if (!testPhone.trim()) {
      notify.error('يرجى إدخال رقم هاتف لإرسال الرسالة التجريبية');
      return;
    }
    setTestingSend(true);
    try {
      const dummySettings = { id: 'settings', ...form, darkMode: false } as unknown as Settings;
      const res = await sendWhatsAppMessage(
        testPhone.trim(),
        'رسالة تجريبية من نظام EduCenter Pro: تم ربط بوابة واتساب بنجاح! ✓',
        dummySettings,
      );
      if (res.success && res.mode === 'api') {
        notify.success('تم إرسال الرسالة بنجاح عبر بوابة الـ API!');
      } else if (res.mode === 'fallback') {
        notify.success('تم فتح واتساب عبر الرابط المباشر (وضع المراسلة اليدوية)');
      } else {
        notify.error('فشل الإرسال: ' + (res.error || 'خطأ غير معروف'));
      }
    } catch (err) {
      notify.error('حدث خطأ أثناء الإرسال: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setTestingSend(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">إشعارات النظام</h2>
          {!notificationsEnabled && (
            <button
              onClick={enableNotifications}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-medium hover:bg-indigo-100"
            >
              <Bell size={16} /> تفعيل إشعارات المتصفح
            </button>
          )}
        </div>

        {notificationsEnabled && (
          <div className="mb-4 p-3 bg-green-50 border border-green-100 rounded-xl flex items-center gap-2">
            <span className="text-green-600">✓</span>
            <span className="text-sm text-green-700">إشعارات المتصفح مفعلة</span>
          </div>
        )}

        <div className="space-y-3">
          {[
            { key: 'notifyNewStudent', label: 'إشعار عند تسجيل طالب جديد', icon: '🎓' },
            { key: 'notifyAbsence', label: 'إشعار عند غياب الطالب', icon: '⚠️' },
            { key: 'notifyLatePayment', label: 'إشعار عند تأخر الدفعات', icon: '💰' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <span>{item.icon}</span> {item.label}
              </span>
              <button
                onClick={() => setForm({ ...form, [item.key]: !form[item.key as keyof typeof form] })}
                className={`relative w-12 h-6 rounded-full transition-colors ${form[item.key as keyof typeof form] ? 'bg-indigo-600' : 'bg-gray-300'}`}
                style={form[item.key as keyof typeof form] ? { backgroundColor: primaryColor } : {}}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full shadow transition-transform ${form[item.key as keyof typeof form] ? 'translate-x-1' : 'translate-x-7'}`}
                  style={{
                    backgroundColor: form[item.key as keyof typeof form] ? getContrastColor(primaryColor) : '#ffffff',
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* بوابة واتساب المباشرة */}
      <div className="border-t border-gray-100 pt-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <MessageSquare size={20} className="text-green-600" />
            <div>
              <h3 className="text-base font-bold text-gray-900">بوابة واتساب الآلية (WhatsApp Gateway API)</h3>
              <p className="text-xs text-gray-400">إرسال رسائل الغياب وتذكير الأقساط تلقائياً عبر API في الخلفية بدون فتح نوافذ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                whatsappGateway: {
                  ...gateway,
                  enabled: !gateway.enabled,
                },
              })
            }
            className={`relative w-12 h-6 rounded-full transition-colors ${gateway.enabled ? 'bg-green-600' : 'bg-gray-300'}`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full shadow transition-transform bg-white ${gateway.enabled ? 'translate-x-1' : 'translate-x-7'}`}
            />
          </button>
        </div>

        {gateway.enabled && (
          <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">مزود الخدمة (Provider)</label>
                <select
                  value={gateway.provider || 'ultramsg'}
                  onChange={e =>
                    setForm({
                      ...form,
                      whatsappGateway: {
                        ...gateway,
                        provider: e.target.value as 'ultramsg' | 'greenapi' | 'custom',
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white font-medium"
                >
                  <option value="ultramsg">UltraMsg (الأسهل والأكثر استقراراً بمصر)</option>
                  <option value="greenapi">Green API</option>
                  <option value="custom">بوابة مخصصة / Webhook API</option>
                </select>
              </div>

              {gateway.provider !== 'custom' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">معرف الخدمة (Instance ID)</label>
                    <input
                      type="text"
                      value={gateway.instanceId || ''}
                      onChange={e =>
                        setForm({
                          ...form,
                          whatsappGateway: { ...gateway, instanceId: e.target.value },
                        })
                      }
                      placeholder="instance12345"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">رمز المصادقة (Token / Secret)</label>
                    <input
                      type="password"
                      value={gateway.token || ''}
                      onChange={e =>
                        setForm({
                          ...form,
                          whatsappGateway: { ...gateway, token: e.target.value },
                        })
                      }
                      placeholder="رمز الـ API السري الخاص بالحساب"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none font-mono"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">رابط الـ API المخصص (Webhook URL)</label>
                    <input
                      type="url"
                      value={gateway.apiUrl || ''}
                      onChange={e =>
                        setForm({
                          ...form,
                          whatsappGateway: { ...gateway, apiUrl: e.target.value },
                        })
                      }
                      placeholder="https://api.mycenter.com/send-whatsapp"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Bearer Token (اختياري)</label>
                    <input
                      type="password"
                      value={gateway.token || ''}
                      onChange={e =>
                        setForm({
                          ...form,
                          whatsappGateway: { ...gateway, token: e.target.value },
                        })
                      }
                      placeholder="Authorization Token"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none font-mono"
                    />
                  </div>
                </>
              )}
            </div>

            {/* أداة فحص واختبار الاتصال */}
            <div className="pt-2 border-t border-gray-200">
              <label className="block text-xs font-semibold text-gray-700 mb-1">اختبار الإرسال المباشر</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="رقم الهاتف للاختبار (مثال: 01012345678)"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleTestWhatsApp}
                  disabled={testingSend}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Send size={13} /> {testingSend ? 'جاري الإرسال...' : 'إرسال رسالة تجريبية'}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">عند تفعيل البوابة، إذا تعثر الاتصال بالـ API سيتراجع النظام تلقائياً لفتح واتساب الآمن</p>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSaveGeneral}
        className="flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium transition-colors"
        style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
      >
        <Save size={16} /> حفظ إعدادات الإشعارات
      </button>
    </div>
  );
}
