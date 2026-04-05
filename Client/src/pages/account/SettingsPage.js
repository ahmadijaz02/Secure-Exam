import React, { useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { useTheme } from '../../context/theme/ThemeContext';
import { useAuth } from '../../context/auth/AuthContext';
import { useNotification } from '../../context/notification/NotificationContext';
import authService from '../../api/services/authService';

const themeOptions = [
  {
    value: 'light',
    label: 'Light',
    description: 'Always use the light interface.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    )
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Always use the dark interface.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    )
  },
  {
    value: 'system',
    label: 'System',
    description: 'Match your device preference automatically.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    )
  },
];

function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showError, showSuccess } = useNotification();
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState({ type: '', message: '' });
  const [appearanceStatus, setAppearanceStatus] = useState('');

  const handlePasswordChange = (event) => {
    const { name, value } = event.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
    if (passwordStatus.message) {
      setPasswordStatus({ type: '', message: '' });
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    if (!passwordData.current_password || !passwordData.new_password || !passwordData.confirm_password) {
      const message = 'Complete all password fields before saving.';
      setPasswordStatus({ type: 'error', message });
      showError(message);
      return;
    }

    if (passwordData.new_password.length < 6) {
      const message = 'New password must be at least 6 characters long.';
      setPasswordStatus({ type: 'error', message });
      showError(message);
      return;
    }

    if (passwordData.new_password !== passwordData.confirm_password) {
      const message = 'New password and confirmation do not match.';
      setPasswordStatus({ type: 'error', message });
      showError(message);
      return;
    }

    try {
      setIsSavingPassword(true);
      const response = await authService.changePassword(passwordData);
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
      const message = response.message || 'Password updated successfully.';
      setPasswordStatus({ type: 'success', message });
      showSuccess(message);
    } catch (error) {
      const message = error.message || 'Failed to update password.';
      setPasswordStatus({ type: 'error', message });
      showError(message);
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleThemeChange = (nextTheme) => {
    setTheme(nextTheme);
    const message = `Theme preference updated to ${nextTheme}.`;
    setAppearanceStatus(message);
    showSuccess(message, { duration: 2500 });
  };

  const handleLogout = async () => {
    await logout();
  };

  const statusClasses = {
    success: 'border-emerald-200/60 bg-emerald-50/50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200',
    error: 'border-red-200/60 bg-red-50/50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200',
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage appearance, account security, and your current session.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Appearance */}
        <Card glass hover={false} padding="none" animate>
          <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Appearance</h3>
          </div>
          <div className="p-5 space-y-3">
            {appearanceStatus ? (
              <div className="rounded-xl border border-indigo-200/60 bg-indigo-50/50 px-4 py-3 text-sm text-indigo-800 dark:border-indigo-900/40 dark:bg-indigo-900/20 dark:text-indigo-200">
                {appearanceStatus}
              </div>
            ) : null}
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleThemeChange(option.value)}
                className={`w-full rounded-xl border p-4 text-left transition-all duration-200 ${
                  theme === option.value
                    ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-sm ring-1 ring-indigo-400/30'
                    : 'border-gray-200/60 dark:border-gray-700/40 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      theme === option.value
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}>
                      {option.icon}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white text-sm">{option.label}</p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
                    </div>
                  </div>
                  <div className={`mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    theme === option.value
                      ? 'border-indigo-600 dark:border-indigo-400'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {theme === option.value && (
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Account Security */}
        <Card glass hover={false} padding="none" animate>
          <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Account Security</h3>
          </div>
          <div className="p-5">
            {passwordStatus.message ? (
              <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${statusClasses[passwordStatus.type] || statusClasses.error}`}>
                {passwordStatus.message}
              </div>
            ) : null}
            <form className="space-y-4" onSubmit={handlePasswordSubmit}>
              <Input
                label="Current Password"
                type="password"
                name="current_password"
                value={passwordData.current_password}
                onChange={handlePasswordChange}
                required
              />
              <Input
                label="New Password"
                type="password"
                name="new_password"
                value={passwordData.new_password}
                onChange={handlePasswordChange}
                helperText="Use at least 6 characters."
                required
              />
              <Input
                label="Confirm New Password"
                type="password"
                name="confirm_password"
                value={passwordData.confirm_password}
                onChange={handlePasswordChange}
                required
              />
              <Button type="submit" variant="gradient-primary" loading={isSavingPassword}>Update Password</Button>
            </form>
          </div>
        </Card>

        {/* Session */}
        <Card glass hover={false} padding="none" className="xl:col-span-2" animate>
          <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Session</h3>
          </div>
          <div className="p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-white">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</span>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{user?.name || 'User'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email || 'No email available'}</p>
              </div>
            </div>
            <Button variant="gradient-danger" onClick={handleLogout}>
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default SettingsPage;