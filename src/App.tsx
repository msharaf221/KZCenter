import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { AppProvider } from './contexts/AppContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StudentsPage from './pages/StudentsPage';
import TeachersPage from './pages/TeachersPage';
import CoursesPage from './pages/CoursesPage';
import GroupsPage from './pages/GroupsPage';
import PaymentsPage from './pages/PaymentsPage';
import AttendancePage from './pages/AttendancePage';
import ReportsPage from './pages/ReportsPage';
import DailyReportsPage from './pages/DailyReportsPage';
import SettingsPage from './pages/SettingsPage';
import UsersPage from './pages/UsersPage';
import ExpensesPage from './pages/ExpensesPage';
import ExamsPage from './pages/ExamsPage';
import InventoryPage from './pages/InventoryPage';
import StudentProfilePage from './pages/StudentProfilePage';
import TeacherProfilePage from './pages/TeacherProfilePage';

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

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppProvider>
      </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
