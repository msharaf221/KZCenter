import { Toaster } from 'react-hot-toast';
import { HashRouter } from 'react-router-dom';
import AppRoutes from './app/AppRoutes';
import ErrorBoundary from './components/ErrorBoundary';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider } from './contexts/AuthContext';

export default function App() {
  return (
    <ErrorBoundary>
      {/* HashRouter: يعمل مع بناء الملف الواحد على أي استضافة بدون إعدادات rewrite */}
      <HashRouter>
        <AuthProvider>
          <AppProvider>
            <Toaster
              position="top-center"
              toastOptions={{
                duration: 3000,
                style: {
                  fontFamily: 'Cairo, sans-serif',
                  direction: 'rtl',
                  fontSize: '14px',
                  borderRadius: '12px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                },
                success: {
                  iconTheme: { primary: '#22c55e', secondary: 'white' },
                },
                error: {
                  iconTheme: { primary: '#ef4444', secondary: 'white' },
                },
              }}
            />

            <AppRoutes />
          </AppProvider>
        </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
