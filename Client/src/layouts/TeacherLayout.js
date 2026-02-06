import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth/AuthContext';
import Header from '../components/navigation/Header';

function TeacherLayout({ children }) {
  const { logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname.startsWith(path);

  const teacherMenuItems = [
    { label: 'Dashboard', path: '/teacher/dashboard', icon: '📊' },
    { label: 'Active Sessions', path: '/teacher/sessions', icon: '📋' },
    { label: 'Alerts', path: '/teacher/alerts', icon: '🚨' },
    { label: 'Reports', path: '/teacher/reports', icon: '📈' },
    { label: 'Profile', path: '/teacher/profile', icon: '👤' },
  ];

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900">
      <Header />
      
      {/* Sidebar - Fixed Position */}
      <aside className="fixed left-0 top-16 w-64 h-[calc(100vh-64px)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto z-30">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Teacher Panel</h2>
        </div>
        
        <nav className="space-y-1 px-4 pb-20">
          {teacherMenuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-4 py-3 rounded-lg transition ${
                isActive(item.path)
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
              }`}
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-gray-200 dark:border-gray-700 p-4 fixed bottom-0 left-0 w-64 bg-white dark:bg-gray-800">
          <button
            onClick={logout}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8 pt-24 min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  );
}

export default TeacherLayout;
