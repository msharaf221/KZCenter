import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import PageLoader from '../components/ui/PageLoader';
import { APP_ROUTES } from './routes';

// Stable component identities: never recreate lazy wrappers during a render.
const routes = APP_ROUTES.map(route => ({ ...route, Component: lazy(route.load) }));

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {routes.map(({ path, public: isPublic, entity, Component }) => (
          <Route
            key={path}
            path={path}
            element={
              isPublic ? (
                <Component />
              ) : (
                <ProtectedRoute entity={entity}>
                  <Component />
                </ProtectedRoute>
              )
            }
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
