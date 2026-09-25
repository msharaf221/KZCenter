import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../domain/models';
import { can, type Action, type Entity } from '../lib/permissions';
import PageLoader from './ui/PageLoader';

interface ProtectedRouteProps {
  children: ReactNode;
  /** @deprecated استخدم `entity` + `action` — بيشتغل بس للتوافق مع الكود القديم */
  adminOnly?: boolean;
  /** الكيان المطلوب عرضه */
  entity?: Entity;
  /** الإجراء المطلوب (افتراضي: view) */
  action?: Action;
  /** أدوار مسموحة صراحةً (يتجاوز المصفوفة) */
  roles?: UserRole[];
}

function Forbidden({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
      <div className="text-center">
        <div className="text-6xl mb-4">🚫</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">غير مصرح بالوصول</h2>
        <p className="text-gray-500">{message || 'ليس لديك صلاحية الوصول إلى هذه الصفحة'}</p>
      </div>
    </div>
  );
}

export default function ProtectedRoute({
  children,
  adminOnly = false,
  entity,
  action = 'view',
  roles,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.mustChangePassword && location.pathname !== '/login') return <Navigate to="/login" replace />;

  // 1) أدوار صريحة
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Forbidden />;
  }

  // 2) مصفوفة الصلاحيات (الطريقة المفضلة)
  if (entity && !can(user.role, entity, action)) {
    return <Forbidden />;
  }

  // 3) توافق قديم: adminOnly
  if (adminOnly && user.role !== 'admin') {
    return <Forbidden />;
  }

  return <>{children}</>;
}
