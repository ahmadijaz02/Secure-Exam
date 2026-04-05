import React from 'react';
import { Outlet, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/auth/AuthContext';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import BrandLogo from '../components/branding/BrandLogo';

function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg-page">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex items-center justify-center p-4 sm:p-6 lg:p-8 gradient-bg-page">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/20 blur-[100px] pointer-events-none animate-float" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-violet-600/20 blur-[100px] pointer-events-none animate-float" style={{ animationDelay: '2s' }} />

      <div className="max-w-md w-full space-y-8 relative z-10 animate-scale-in">
        <div className="text-center animate-fade-in-up stagger-1">
          <Link to="/" className="inline-flex flex-col items-center group">
            <div className="transform transition-all duration-300 group-hover:scale-105 group-hover:rotate-1 group-hover:shadow-indigo-500/50">
              <BrandLogo size="lg" />
            </div>
          </Link>
          <p className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            AI-powered remote proctoring platform
          </p>
        </div>

        <div className="glass-card p-6 sm:p-8 animate-fade-in-up stagger-2 shadow-2xl">
          <Outlet />
        </div>

        <div className="text-center animate-fade-in-up stagger-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            &copy; {new Date().getFullYear()} Secure Exam. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
