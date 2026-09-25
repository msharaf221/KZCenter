import { X } from 'lucide-react';
import { ReactNode, useId } from 'react';
import DialogFrame from './DialogFrame';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const titleId = useId();
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <DialogFrame
      open={isOpen}
      onDismiss={onClose}
      labelledBy={titleId}
      className={`${sizeClasses[size]} max-h-[90vh] flex flex-col`}
    >
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <h2 id={titleId} className="text-lg font-bold text-gray-900">
          {title}
        </h2>
        <button
          onClick={onClose}
          aria-label="إغلاق النافذة"
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <X size={20} />
        </button>
      </div>
      <div className="overflow-y-auto flex-1 p-5">{children}</div>
    </DialogFrame>
  );
}
