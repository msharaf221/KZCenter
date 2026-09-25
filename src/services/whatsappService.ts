/**
 * خدمة إرسال رسائل واتساب المباشرة عبر الـ API (WhatsApp Gateway)
 * مع التراجع التلقائي الآمن (Safe Fallback to wa.me)
 */

import type { Settings } from '../domain/models';
import { getWhatsAppLink } from '../lib/utils';

export interface WhatsAppSendResult {
  success: boolean;
  mode: 'api' | 'fallback';
  messageId?: string;
  error?: string;
}

/**
 * تنظيف وتنسيق رقم الهاتف لـ WhatsApp (بإضافة كود الدولة الافتراضي لمصر 20 عند الحاجة)
 */
export function cleanPhoneForWhatsApp(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';

  // أرقام الموبايل المصرية (010, 011, 012, 015) المكونة من 11 خانة
  if (digits.length === 11 && digits.startsWith('01')) {
    return `2${digits}`;
  }
  return digits;
}

/**
 * إرسال رسالة واتساب عبر البوابة الآلية أو فتح رابط المحادثة المباشر كخيار بديل
 */
export async function sendWhatsAppMessage(
  toPhone: string,
  message: string,
  settings?: Settings | null,
): Promise<WhatsAppSendResult> {
  const cleaned = cleanPhoneForWhatsApp(toPhone);
  if (!cleaned) {
    return { success: false, mode: 'fallback', error: 'رقم الهاتف غير صالح' };
  }

  const gateway = settings?.whatsappGateway;

  // إذا كانت البوابة الآلية مفعلة
  if (gateway?.enabled) {
    try {
      const provider = gateway.provider || 'ultramsg';

      if (provider === 'ultramsg') {
        const instanceId = gateway.instanceId?.trim();
        const token = gateway.token?.trim();
        if (!instanceId || !token) {
          throw new Error('بيانات UltraMsg غير مكتملة (Instance ID أو Token مفقود)');
        }

        const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
        const body = new URLSearchParams({
          token,
          to: cleaned,
          body: message,
        });

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        if (!res.ok) {
          throw new Error(`فشل الإرسال عبر UltraMsg: كود الحالة ${res.status}`);
        }

        const data = (await res.json().catch(() => ({}))) as { sent?: string; id?: string };
        return { success: true, mode: 'api', messageId: data.id || data.sent };
      }

      if (provider === 'greenapi') {
        const instanceId = gateway.instanceId?.trim();
        const token = gateway.token?.trim();
        if (!instanceId || !token) {
          throw new Error('بيانات Green API غير مكتملة (Instance ID أو Token مفقود)');
        }

        const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: `${cleaned}@c.us`,
            message,
          }),
        });

        if (!res.ok) {
          throw new Error(`فشل الإرسال عبر Green API: كود الحالة ${res.status}`);
        }

        const data = (await res.json().catch(() => ({}))) as { idMessage?: string };
        return { success: true, mode: 'api', messageId: data.idMessage };
      }

      if (provider === 'custom') {
        const apiUrl = gateway.apiUrl?.trim();
        if (!apiUrl) {
          throw new Error('رابط الـ API المخصص غير محدد');
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (gateway.token?.trim()) {
          headers.Authorization = `Bearer ${gateway.token.trim()}`;
        }

        const res = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone: cleaned,
            to: cleaned,
            message,
          }),
        });

        if (!res.ok) {
          throw new Error(`فشل الإرسال عبر البوابة المخصصة: كود الحالة ${res.status}`);
        }

        const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
        return { success: true, mode: 'api', messageId: data.id || data.messageId };
      }
    } catch (err) {
      console.warn('WhatsApp API Gateway failed, falling back to wa.me link:', err);
      // التراجع الآمن: فتح تطبيق / ويب واتساب
      const fallbackUrl = getWhatsAppLink(toPhone, message);
      if (typeof window !== 'undefined' && fallbackUrl !== '#') {
        window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
      }
      return {
        success: false,
        mode: 'fallback',
        error: err instanceof Error ? err.message : 'فشل الإرسال عبر الـ API، تم فتح واتساب يدوياً',
      };
    }
  }

  // إذا لم تكن البوابة الآلية مفعلة: الفتح المباشر كالمعتاد
  const link = getWhatsAppLink(toPhone, message);
  if (typeof window !== 'undefined' && link !== '#') {
    window.open(link, '_blank', 'noopener,noreferrer');
  }
  return { success: true, mode: 'fallback' };
}
