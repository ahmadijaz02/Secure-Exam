import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth/AuthContext';
import Button from '../../components/ui/Button';

function NotFoundPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const handleGoBack = () => {
    if (isAuthenticated) {
      const dashboardPath = user?.role === 'admin' ? '/admin/dashboard' : '/teacher/dashboard';
      navigate(dashboardPath);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-9xl font-bold text-gray-300">404</h1>
          <h2 className="mt-4 text-3xl font-bold text-gray-900">Page not found</h2>
          <p className="mt-2 text-base text-gray-600">
            Sorry, we couldn't find the page you're looking for.
          </p>
          <div className="mt-6">
            <Button variant="primary" onClick={handleGoBack}>
              {isAuthenticated ? 'Go to Dashboard' : 'Go back home'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
