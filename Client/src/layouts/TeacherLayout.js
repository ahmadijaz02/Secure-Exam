import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth/AuthContext';
import Header from '../components/navigation/Header';

/* ─── SVG Icons for sidebar ─── */
const DashboardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 12a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z" />
  </svg>
);

const SessionsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const AlertsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const ReportsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const ProfileIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

/* ─── Icon color configs for active and inactive states ─── */
const iconColors = {
  dashboard: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-600 dark:text-indigo-400', activeBg: 'bg-indigo-500', activeText: 'text-white' },
  sessions:  { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400', activeBg: 'bg-violet-500', activeText: 'text-white' },
  alerts:    { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400', activeBg: 'bg-rose-500', activeText: 'text-white' },
  reports:   { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', activeBg: 'bg-emerald-500', activeText: 'text-white' },
  profile:   { bg: 'bg-sky-100 dark:bg-sky-900/30', text: 'text-sky-600 dark:text-sky-400', activeBg: 'bg-sky-500', activeText: 'text-white' },
  settings:  { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', activeBg: 'bg-gray-500', activeText: 'text-white' },
};

function TeacherLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (path) => location.pathname.startsWith(path);

  const teacherMenuItems = [
    { label: 'Dashboard', path: '/teacher/dashboard', icon: <DashboardIcon />, colorKey: 'dashboard' },
    { label: 'Active Sessions', path: '/teacher/sessions', icon: <SessionsIcon />, colorKey: 'sessions' },
    { label: 'Alerts', path: '/teacher/alerts', icon: <AlertsIcon />, colorKey: 'alerts' },
    { label: 'Reports', path: '/teacher/reports', icon: <ReportsIcon />, colorKey: 'reports' },
    { label: 'Profile', path: '/teacher/profile', icon: <ProfileIcon />, colorKey: 'profile' },
    { label: 'Settings', path: '/teacher/settings', icon: <SettingsIcon />, colorKey: 'settings' },
  ];

  return (
    <div className="min-h-screen w-full gradient-bg-page">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`fixed left-0 top-16 w-[min(84vw,272px)] h-[calc(100vh-64px)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-r border-gray-200/60 dark:border-slate-700/40 overflow-y-auto overflow-x-hidden z-30 transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        
        {/* Sidebar Header */}
        <div className="p-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/25">
              <span className="text-sm font-bold text-white">
                {user?.name?.charAt(0)?.toUpperCase() || 'T'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {user?.name || 'Teacher'}
              </p>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                Teacher
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 border-t border-gray-200/60 dark:border-slate-700/40"></div>

        {/* Navigation */}
        <nav className="p-3 pb-20 space-y-1 mt-2">
          {teacherMenuItems.map((item) => {
            const active = isActive(item.path);
            const colors = iconColors[item.colorKey];
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`sidebar-item ${active ? 'active' : ''}`}
              >
                <div className={`sidebar-icon ${active ? `${colors.activeBg} ${colors.activeText}` : `${colors.bg} ${colors.text}`}`}>
                  {item.icon}
                </div>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="absolute bottom-0 left-0 w-full p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-gray-200/60 dark:border-slate-700/40">
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 border border-red-200/60 dark:border-red-800/40 transition-all duration-200 active:scale-[0.97]"
          >
            <LogoutIcon />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="p-3 pt-20 min-h-screen overflow-auto sm:p-6 sm:pt-20 lg:ml-[272px] lg:p-8 lg:pt-24">
        {children}
      </main>
    </div>
  );
}

export default TeacherLayout;
