import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { AppProvider } from './contexts/AppContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy-loaded pages - يحمل كل صفحة عند الحاجة فقط
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const StudentsPage = lazy(() => import('./pages/StudentsPage'));
const TeachersPage = lazy(() => import('./pages/TeachersPage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const GroupsPage = lazy(() => import('./pages/GroupsPage'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const DailyReportsPage = lazy(() => import('./pages/DailyReportsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const ExamsPage = lazy(() => import('./pages/ExamsPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const StudentProfilePage = lazy(() => import('./pages/StudentProfilePage'));
const TeacherProfilePage = lazy(() => import('./pages/TeacherProfilePage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 font-medium">جاري التحميل...</p>
      </div>
    </div>
  );
}

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

          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              <Route path="/" element={
                <ProtectedRoute><DashboardPage /></ProtectedRoute>
              } />

              <Route path="/students" element={
                <ProtectedRoute>
                  <StudentsPage />
                </ProtectedRoute>
              } />
              <Route path="/students/:id" element={
                <ProtectedRoute>
                  <StudentProfilePage />
                </ProtectedRoute>
              } />
              <Route path="/teachers" element={
                <ProtectedRoute adminOnly>
                  <TeachersPage />
                </ProtectedRoute>
              } />
              <Route path="/teachers/:id" element={
                <ProtectedRoute adminOnly>
                  <TeacherProfilePage />
                </ProtectedRoute>
              } />

              <Route path="/courses" element={
                <ProtectedRoute adminOnly><CoursesPage /></ProtectedRoute>
              } />

              <Route path="/groups" element={
                <ProtectedRoute adminOnly><GroupsPage /></ProtectedRoute>
              } />

              <Route path="/payments" element={
                <ProtectedRoute adminOnly><PaymentsPage /></ProtectedRoute>
              } />

              <Route path="/inventory" element={
                <ProtectedRoute adminOnly><InventoryPage /></ProtectedRoute>
              } />

              <Route path="/expenses" element={
                <ProtectedRoute adminOnly><ExpensesPage /></ProtectedRoute>
              } />

              <Route path="/attendance" element={
                <ProtectedRoute><AttendancePage /></ProtectedRoute>
              } />

              <Route path="/exams" element={
                <ProtectedRoute><ExamsPage /></ProtectedRoute>
              } />

              <Route path="/reports" element={
                <ProtectedRoute><ReportsPage /></ProtectedRoute>
              } />

              <Route path="/daily-reports" element={
                <ProtectedRoute adminOnly><DailyReportsPage /></ProtectedRoute>
              } />

              <Route path="/users" element={
                <ProtectedRoute adminOnly><UsersPage /></ProtectedRoute>
              } />

              <Route path="/settings" element={
                <ProtectedRoute adminOnly><SettingsPage /></ProtectedRoute>
              } />

              <Route path="/audit-log" element={
                <ProtectedRoute adminOnly><AuditLogPage /></ProtectedRoute>
              } />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AppProvider>
      </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
