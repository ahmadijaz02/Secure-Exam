import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/auth/AuthContext';

/**
 * AdminRoute - Protects admin-only routes
 * Only allows users with 'admin' role to access
 * Teachers are redirected to teacher dashboard
 */
export function AdminRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/teacher/dashboard" replace />;
  }

  return children;
}

/**
 * TeacherRoute - Protects teacher-only routes
 * Only allows users with 'teacher' role to access
 * Admins are redirected to admin dashboard
 */
export function TeacherRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (user.role !== 'teacher') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
}

export default { AdminRoute, TeacherRoute };
