/** Shared full-page loading state for authentication and lazy routes. */
export default function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" role="status" aria-live="polite">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 font-medium">جاري التحميل...</p>
      </div>
    </div>
  );
}
