import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Skeleton from '../components/ui/Skeleton';
import { ROLES } from '../constants/roles';

/**
 * RoleRoute — Enforces role-based authorization for protected views.
 *
 * @param {object} props
 * @param {string[]} props.allowedRoles
 */
export default function RoleRoute({ allowedRoles = [] }) {
  const { user, role, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-8">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const hasAccess = allowedRoles.some((allowed) => {
    if (allowed === ROLES.ADMIN) {
      return role === ROLES.ADMIN || role === 'SUPER_ADMIN';
    }
    if (allowed === ROLES.STAFF) {
      return role === ROLES.STAFF || role === 'MAINTENANCE_STAFF' || role === 'DEPARTMENT_STAFF';
    }
    return role === allowed;
  });

  if (!hasAccess) {
    return <Navigate to="/access-denied" state={{ attemptedPath: location.pathname }} replace />;
  }

  return <Outlet />;
}
