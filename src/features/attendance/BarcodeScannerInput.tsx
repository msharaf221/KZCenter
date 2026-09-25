import { CheckCircle2, Clock, QrCode, ScanBarcode } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AttendanceStatus, Student } from '../../domain/models';
import { getStudentCode, playScanSound } from '../../lib/barcode';
import { notify } from '../../lib/notifications';

export interface BarcodeScannerInputProps {
  students: Student[];
  currentStatuses: Record<string, AttendanceStatus>;
  lateJoiners?: Set<string>;
  onMarkAttendance: (studentId: string, status: AttendanceStatus) => void;
  disabled?: boolean;
}

export default function BarcodeScannerInput({
  students,
  currentStatuses,
  lateJoiners,
  onMarkAttendance,
  disabled = false,
}: BarcodeScannerInputProps) {
  const [query, setQuery] = useState('');
  const [scanMode, setScanMode] = useState<AttendanceStatus>('present');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = query.trim();
    if (!raw || disabled) return;

    const normalized = raw.toUpperCase().replace(/\s+/g, '');
    const cleanDigits = raw.replace(/\D/g, '');

    // البحث عن الطالب بالكود أو المعرف أو رقم الهاتف أو هاتف ولي الأمر
    const found = students.find(s => {
      const code = getStudentCode(s).toUpperCase();
      const sId = s.id.toUpperCase();
      const sPhone = (s.phone || '').replace(/\D/g, '');
      const pPhone = (s.parentPhone || '').replace(/\D/g, '');

      return (
        code === normalized ||
        sId === normalized ||
        s.id === raw ||
        (cleanDigits && (sPhone.endsWith(cleanDigits) || pPhone.endsWith(cleanDigits))) ||
        s.name.trim() === raw
      );
    });

    if (!found) {
      playScanSound('error');
      notify.error(`لم يتم العثور على طالب يطابق "${raw}" في هذه المجموعة`);
      setQuery('');
      inputRef.current?.focus();
      return;
    }

    if (lateJoiners?.has(found.id)) {
      playScanSound('error');
      notify.error(`الطالب ${found.name} التحق بالمجموعة بعد تاريخ هذا الكشف`);
      setQuery('');
      inputRef.current?.focus();
      return;
    }

    const currentStatus = currentStatuses[found.id];
    if (currentStatus === scanMode) {
      playScanSound('already');
      notify.success(`الطالب ${found.name} مسجل (${scanMode === 'present' ? 'حاضر' : 'متأخر'}) بالفعل`);
      setQuery('');
      inputRef.current?.focus();
      return;
    }

    // تسجيل الحضور وتشغيل الصوت
    onMarkAttendance(found.id, scanMode);
    playScanSound('success');
    notify.success(`✓ تم تسجيل ${scanMode === 'present' ? 'حضور' : 'تأخير'}: ${found.name}`);
    setQuery('');
    inputRef.current?.focus();
  }

  return (
    <div className="bg-gradient-to-r from-indigo-50/70 via-white to-purple-50/70 p-4 rounded-2xl border border-indigo-100/80 shadow-xs mb-4">
      <form onSubmit={handleScanSubmit} className="flex flex-col sm:flex-row items-center gap-3">
        <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm shrink-0">
          <ScanBarcode size={22} className="animate-pulse" />
          <span>المسح السريع (باركود / QR / هاتف):</span>
        </div>

        <div className="relative flex-1 w-full">
          <input
            ref={inputRef}
            type="text"
            value={query}
            disabled={disabled}
            onChange={e => setQuery(e.target.value)}
            placeholder="امسح الباركود بجهاز المسح أو اكتب كود الطالب/الهاتف واضغط Enter..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-indigo-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium placeholder:text-gray-400"
          />
          <QrCode size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" />
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          <div className="flex bg-white rounded-xl border border-gray-200 p-1">
            <button
              type="button"
              onClick={() => setScanMode('present')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                scanMode === 'present' ? 'bg-green-100 text-green-800' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <CheckCircle2 size={13} /> حاضر
            </button>
            <button
              type="button"
              onClick={() => setScanMode('late')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                scanMode === 'late' ? 'bg-amber-100 text-amber-800' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Clock size={13} /> متأخر
            </button>
          </div>

          <button
            type="submit"
            disabled={disabled || !query.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
          >
            تسجيل
          </button>
        </div>
      </form>
    </div>
  );
}
