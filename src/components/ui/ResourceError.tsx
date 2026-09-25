import { AlertTriangle, RefreshCw } from 'lucide-react';

/** Never show raw database errors (which may contain record data) or misleading empty totals. */
export default function ResourceError({ onRetry, message = 'تعذّر تحميل البيانات. جرّب تاني قبل المتابعة.' }: {
  onRetry: () => unknown;
  message?: string;
}) {
  return (
    <section role="alert" className="my-5 rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800" dir="rtl">
      <AlertTriangle className="mx-auto mb-3" size={28} aria-hidden="true" />
      <h2 className="font-bold">تعذّر تحميل البيانات</h2>
      <p className="mt-2 text-sm">{message}</p>
      <button type="button" onClick={() => { void onRetry(); }} className="mx-auto mt-4 flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-red-100">
        <RefreshCw size={16} aria-hidden="true" /> إعادة المحاولة
      </button>
    </section>
  );
}
