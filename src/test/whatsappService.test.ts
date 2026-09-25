import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../domain/models';
import { cleanPhoneForWhatsApp, sendWhatsAppMessage } from '../services/whatsappService';

describe('WhatsApp Service & Gateway Integration', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats Egyptian mobile numbers correctly for WhatsApp', () => {
    expect(cleanPhoneForWhatsApp('01012345678')).toBe('201012345678');
    expect(cleanPhoneForWhatsApp('01123456789')).toBe('201123456789');
    expect(cleanPhoneForWhatsApp('+201234567890')).toBe('201234567890');
    expect(cleanPhoneForWhatsApp('015 999 888 77')).toBe('201599988877');
    expect(cleanPhoneForWhatsApp('')).toBe('');
  });

  it('opens fallback wa.me URL when gateway is disabled', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const res = await sendWhatsAppMessage('01012345678', 'رسالة تذكير', {
      id: 'settings',
      centerName: 'المركز',
      currency: 'EGP',
      primaryColor: '#000',
      fontSize: 'md',
      darkMode: false,
      notifyNewStudent: true,
      notifyAbsence: true,
      notifyLatePayment: true,
      whatsappGateway: { enabled: false },
    } as unknown as Settings);

    expect(res.success).toBe(true);
    expect(res.mode).toBe('fallback');
    expect(windowOpenSpy).toHaveBeenCalled();
  });

  it('sends direct message via UltraMsg API when configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sent: 'true', id: 'msg-999' }),
    } as unknown as Response);

    const res = await sendWhatsAppMessage('01012345678', 'رسالة تذكير', {
      id: 'settings',
      centerName: 'المركز',
      currency: 'EGP',
      primaryColor: '#000',
      fontSize: 'md',
      darkMode: false,
      notifyNewStudent: true,
      notifyAbsence: true,
      notifyLatePayment: true,
      whatsappGateway: {
        enabled: true,
        provider: 'ultramsg',
        instanceId: 'inst-123',
        token: 'token-xyz',
      },
    } as unknown as Settings);

    expect(fetchSpy).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.mode).toBe('api');
    expect(res.messageId).toBe('msg-999');
  });

  it('falls back gracefully to wa.me if the API call encounters a failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'));
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const res = await sendWhatsAppMessage('01012345678', 'تنبيه غياب', {
      id: 'settings',
      centerName: 'المركز',
      currency: 'EGP',
      primaryColor: '#000',
      fontSize: 'md',
      darkMode: false,
      notifyNewStudent: true,
      notifyAbsence: true,
      notifyLatePayment: true,
      whatsappGateway: {
        enabled: true,
        provider: 'ultramsg',
        instanceId: 'inst-123',
        token: 'token-xyz',
      },
    } as unknown as Settings);

    expect(res.success).toBe(false);
    expect(res.mode).toBe('fallback');
    expect(windowOpenSpy).toHaveBeenCalled();
  });
});
