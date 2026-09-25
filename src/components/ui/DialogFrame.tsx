import type { ReactNode } from 'react';
import { useDialogLifecycle } from '../../hooks/useDialogLifecycle';

interface Props {
  open: boolean;
  onDismiss: () => void;
  labelledBy: string;
  describedBy?: string;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  children: ReactNode;
}

/** Single overlay/panel primitive; no native browser/Electron confirmation windows. */
export default function DialogFrame({
  open,
  onDismiss,
  labelledBy,
  describedBy,
  role = 'dialog',
  className = '',
  children,
}: Props) {
  const panelRef = useDialogLifecycle(open, onDismiss);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onDismiss} aria-hidden="true" />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`relative bg-white rounded-2xl shadow-2xl w-full fade-in ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
