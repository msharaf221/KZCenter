import { useEffect, useLayoutEffect, useRef } from 'react';

const dialogs: symbol[] = [];
let originalOverflow = '';
const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

/** Shared scroll lock and keyboard/focus lifecycle for both forms and confirmations. */
export function useDialogLifecycle(open: boolean, onDismiss: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  useLayoutEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = Symbol('dialog');
    if (dialogs.length === 0) originalOverflow = document.body.style.overflow;
    dialogs.push(id);
    document.body.style.overflow = 'hidden';

    const focusable = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => {
        const style = getComputedStyle(element);
        return element.tabIndex >= 0 && !element.hidden && style.display !== 'none' && style.visibility !== 'hidden';
      });
    const initialFocus = panel.querySelector<HTMLElement>('[data-dialog-autofocus]') || focusable()[0] || panel;
    initialFocus.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (dialogs[dialogs.length - 1] !== id || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        dismiss.current();
      } else if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0] || panel;
        const last = elements[elements.length - 1] || panel;
        const active = document.activeElement;
        if (!panel.contains(active) || active === panel || (event.shiftKey && active === first)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const wasTop = dialogs[dialogs.length - 1] === id;
      const index = dialogs.indexOf(id);
      if (index !== -1) dialogs.splice(index, 1);
      // Closing one dialog must never unlock scrolling while another is still open.
      if (dialogs.length === 0) document.body.style.overflow = originalOverflow;
      if (wasTop && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  return panelRef;
}
