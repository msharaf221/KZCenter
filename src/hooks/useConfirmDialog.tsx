/**
 * useConfirmDialog — بديل نافذة `confirm()` الأصلية للمتصفح.
 *
 * ليه؟ النوافذ الأصلية (`window.confirm` / `window.alert`) في تطبيق سطح
 * المكتب (Electron على ويندوز) بتكسر حالة الفوكس للنافذة الرئيسية بعد ما
 * بتتقفل، والنتيجة إن كل قوائم `<select>` المنسدلة بتفتح وتقفل فوراً لوحدها
 * والحقول ممكن تبطل تستجيب (باغ معروف: electron/electron#31917 و#41603).
 *
 * الهوك ده بيدي نفس أسلوب الاستخدام (وعد بيرجّع `true`/`false`) بس بنافذة
 * مرسومة بـ React (مكوّن ConfirmDialog الموجود بالفعل) — يعني مفيش أي نافذة
 * نظام أصلية، فمش ممكن تكسر الفوكس.
 *
 * الاستخدام:
 * ```tsx
 * const { confirm, dialog } = useConfirmDialog();
 * ...
 * const ok = await confirm({ title: '...', message: '...' });
 * if (!ok) return;
 * ...
 * return (<> ... {dialog} </>);
 * ```
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../components/ui/ConfirmDialog';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  // مرجع لدالة الحسم (resolve) الخاصة بالوعد الحالي
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const mounted = useRef(false);
  const cancelPending = useCallback(() => {
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelPending();
    };
  }, [cancelPending]);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> => {
      if (!mounted.current) return Promise.resolve(false);
      // Replacing a confirmation must settle the previous caller rather than orphan its promise.
      cancelPending();
      return new Promise<boolean>(resolve => {
        resolverRef.current = resolve;
        setOptions(opts);
      });
    },
    [cancelPending],
  );

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    if (mounted.current) setOptions(null);
  }, []);

  const dialog = (
    <ConfirmDialog
      isOpen={options !== null}
      title={options?.title ?? ''}
      message={options?.message ?? ''}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      danger={options?.danger}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, dialog };
}
