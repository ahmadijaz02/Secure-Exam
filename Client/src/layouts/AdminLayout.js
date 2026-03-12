<<<<<<< HEAD
import React, { useState } from 'react';
=======
import React from 'react';
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth/AuthContext';
import Header from '../components/navigation/Header';

function AdminLayout({ children }) {
  const { logout } = useAuth();
  const location = useLocation();
<<<<<<< HEAD
  const [sidebarOpen, setSidebarOpen] = useState(false);
=======
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8

  const isActive = (path) => location.pathname.startsWith(path);

  const adminMenuItems = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: '📊' },
    { label: 'Exam Sessions', path: '/admin/exam-sessions', icon: '📋' },
    { label: 'Seating Plans', path: '/admin/seating-plans', icon: '🗺️' },
    { label: 'Users', path: '/admin/users', icon: '👤' },
    { label: 'Reports', path: '/admin/reports', icon: '📈' },
    { label: 'Settings', path: '/admin/settings', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900">
<<<<<<< HEAD
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`fixed left-0 top-16 w-64 h-[calc(100vh-64px)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto overflow-x-hidden z-30 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
=======
      <Header />
      
      {/* Sidebar - Fixed Position */}
      <aside className="fixed left-0 top-16 w-64 h-[calc(100vh-64px)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto z-30">
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Admin Panel</h2>
        </div>
        
        <nav className="space-y-1 px-4 pb-20">
          {adminMenuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
<<<<<<< HEAD
              onClick={() => setSidebarOpen(false)}
=======
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
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

<<<<<<< HEAD
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 absolute bottom-0 left-0 w-full bg-white dark:bg-gray-800">
=======
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 fixed bottom-0 left-0 w-64 bg-white dark:bg-gray-800">
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
          <button
            onClick={logout}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
<<<<<<< HEAD
      <main className="p-4 pt-20 min-h-screen overflow-auto sm:p-6 sm:pt-20 lg:ml-64 lg:p-8 lg:pt-24">
=======
      <main className="ml-64 p-8 pt-24 min-h-screen overflow-auto">
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
        {children}
      </main>
    </div>
  );
}

export default AdminLayout;
