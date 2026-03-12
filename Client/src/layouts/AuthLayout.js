import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../context/auth/AuthContext';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import NotificationContainer from '../components/notifications/NotificationContainer';

function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Redirect to dashboard if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm"></div>
      </div>

      {/* Content */}
      <div className="relative min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {/* Logo/Brand */}
          <div className="text-center">
            <div className="mx-auto h-12 w-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="mt-4 text-3xl font-bold text-gray-900">
              Secure Exam
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Secure Exam - AI-powered proctoring platform
            </p>
          </div>

          {/* Auth form container */}
          <div className="bg-white py-8 px-6 shadow-lg rounded-lg border border-gray-200">
            <Outlet />
          </div>

          {/* Footer */}
          <div className="text-center text-sm text-gray-500">
            <p>&copy; 2026 Secure Exam. All rights reserved.</p>
          </div>
        </div>
      </div>

      {/* Notification container */}
      <NotificationContainer />
    </div>
  );
}

export default AuthLayout;
