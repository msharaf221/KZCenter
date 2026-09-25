import { useEffect, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { createSettingsDraft, validateSettingsDraft } from '../../domain/settings';
import { notify } from '../../lib/notifications';

/** All editor sections deliberately share one draft and one save/validation path. */
export function useSettingsDraft() {
  const { settings, updateSettings } = useApp();
  const [form, setForm] = useState(() => createSettingsDraft(settings));
  useEffect(() => {
    if (settings) setForm(createSettingsDraft(settings));
  }, [settings]);

  async function handleSaveGeneral() {
    const error = validateSettingsDraft(form);
    if (error) {
      notify.error(error);
      return;
    }
    try {
      await updateSettings(form);
      notify.success('تم حفظ الإعدادات');
    } catch {
      notify.error('حدث خطأ');
    }
  }

  return { form, setForm, handleSaveGeneral, primaryColor: settings?.primaryColor || '#6366f1' };
}
