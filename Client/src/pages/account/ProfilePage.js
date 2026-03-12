import React, { useEffect, useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { useAuth } from '../../context/auth/AuthContext';
import { useNotification } from '../../context/notification/NotificationContext';
import authService from '../../api/services/authService';

function ProfilePage() {
  const { user, updateUser } = useAuth();
  const { showError, showSuccess } = useNotification();
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  useEffect(() => {
    setFormData({
      name: user?.name || '',
      email: user?.email || '',
    });
  }, [user]);

  const roleLabel = useMemo(() => {
    if (!user?.role) return 'User';
    return user.role.charAt(0).toUpperCase() + user.role.slice(1);
  }, [user]);

  const formatDate = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (status.message) {
      setStatus({ type: '', message: '' });
    }
  };

  const handleReset = () => {
    setFormData({
      name: user?.name || '',
      email: user?.email || '',
    });
    setStatus({ type: '', message: '' });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim();

    if (!trimmedName || !trimmedEmail) {
      const message = 'Name and email are required.';
      setStatus({ type: 'error', message });
      showError(message);
      return;
    }

    if (trimmedName === (user?.name || '') && trimmedEmail === (user?.email || '')) {
      setStatus({ type: 'info', message: 'No profile changes to save.' });
      return;
    }

    try {
      setIsSaving(true);
      const response = await authService.updateProfile({
        name: trimmedName,
        email: trimmedEmail,
      });
      updateUser(response.user);
      const message = response.message || 'Profile updated successfully.';
      setStatus({ type: 'success', message });
      showSuccess(message);
    } catch (error) {
      const message = error.message || 'Failed to update profile.';
      setStatus({ type: 'error', message });
      showError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const statusClasses = {
    success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200',
    error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200',
    info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your account identity and review your role details.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card>
          <Card.Header>
            <Card.Title>Edit Profile</Card.Title>
          </Card.Header>
          <Card.Content className="space-y-4">
            {status.message ? (
              <div className={`rounded-lg border px-4 py-3 text-sm ${statusClasses[status.type] || statusClasses.info}`}>
                {status.message}
              </div>
            ) : null}
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Input
                label="Full Name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="Enter your full name"
              />
              <Input
                label="Email Address"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="Enter your email"
              />
              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="submit" loading={isSaving}>Save Changes</Button>
                <Button type="button" variant="outline" onClick={handleReset} disabled={isSaving}>Reset</Button>
              </div>
            </form>
          </Card.Content>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Account Summary</Card.Title>
          </Card.Header>
          <Card.Content className="space-y-4 text-sm">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4">
              <p className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300">Current Role</p>
              <p className="mt-1 text-lg font-semibold text-blue-900 dark:text-white">{roleLabel}</p>
            </div>
            <div className="grid gap-3">
              <div>
                <p className="text-gray-500 dark:text-gray-400">Account Status</p>
                <p className="font-medium text-gray-900 dark:text-white">{user?.is_active === false ? 'Inactive' : 'Active'}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Member Since</p>
                <p className="font-medium text-gray-900 dark:text-white">{formatDate(user?.created_at)}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Last Updated</p>
                <p className="font-medium text-gray-900 dark:text-white">{formatDate(user?.updated_at)}</p>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}

export default ProfilePage;