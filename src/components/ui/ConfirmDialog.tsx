import { AlertTriangle } from 'lucide-react';
import { useId } from 'react';
import DialogFrame from './DialogFrame';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();

  return (
    <DialogFrame
      open={isOpen}
      onDismiss={onCancel}
      labelledBy={titleId}
      describedBy={messageId}
      role="alertdialog"
      className="max-w-md"
    >
      <div className="p-6">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto
            ${danger ? 'bg-red-100' : 'bg-yellow-100'}`}
        >
          <AlertTriangle size={24} className={danger ? 'text-red-600' : 'text-yellow-600'} />
        </div>
        <h3 id={titleId} className="text-lg font-bold text-gray-900 text-center mb-2">
          {title}
        </h3>
        <p id={messageId} className="text-sm text-gray-600 text-center mb-6 whitespace-pre-line">
          {message}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-colors
                ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}
          >
            {confirmLabel}
          </button>
          <button
            data-dialog-autofocus
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}
