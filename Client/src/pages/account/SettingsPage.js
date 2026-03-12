import React, { useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { useTheme } from '../../context/theme/ThemeContext';
import { useAuth } from '../../context/auth/AuthContext';
import { useNotification } from '../../context/notification/NotificationContext';
import authService from '../../api/services/authService';

const themeOptions = [
  { value: 'light', label: 'Light', description: 'Always use the light interface.' },
  { value: 'dark', label: 'Dark', description: 'Always use the dark interface.' },
  { value: 'system', label: 'System', description: 'Match your device preference automatically.' },
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
    success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200',
    error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage appearance, account security, and your current session.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <Card.Header>
            <Card.Title>Appearance</Card.Title>
          </Card.Header>
          <Card.Content className="space-y-3">
            {appearanceStatus ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                {appearanceStatus}
              </div>
            ) : null}
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleThemeChange(option.value)}
                className={`w-full rounded-lg border p-4 text-left transition ${
                  theme === option.value
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                    : 'border-gray-200 hover:border-gray-300 dark:border-slate-700 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{option.label}</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{option.description}</p>
                  </div>
                  <div className={`mt-1 h-4 w-4 rounded-full border ${theme === option.value ? 'border-blue-600 bg-blue-600' : 'border-gray-400 bg-transparent'}`} />
                </div>
              </button>
            ))}
          </Card.Content>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Account Security</Card.Title>
          </Card.Header>
          <Card.Content>
            {passwordStatus.message ? (
              <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${statusClasses[passwordStatus.type] || statusClasses.error}`}>
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
              <Button type="submit" loading={isSavingPassword}>Update Password</Button>
            </form>
          </Card.Content>
        </Card>

        <Card className="xl:col-span-2">
          <Card.Header>
            <Card.Title>Session</Card.Title>
          </Card.Header>
          <Card.Content className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Signed in as</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{user?.name || 'User'}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{user?.email || 'No email available'}</p>
            </div>
            <Button variant="danger" onClick={handleLogout}>Sign Out</Button>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}

export default SettingsPage;