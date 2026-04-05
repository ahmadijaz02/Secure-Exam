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
    success: 'border-emerald-200/60 bg-emerald-50/50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200',
    error: 'border-red-200/60 bg-red-50/50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200',
    info: 'border-blue-200/60 bg-blue-50/50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200',
  };

  const roleConfig = {
    admin: { gradient: 'from-rose-500 to-pink-600', bg: 'bg-rose-50 dark:bg-rose-900/20', text: 'text-rose-700 dark:text-rose-300', ringText: 'text-rose-900 dark:text-white' },
    teacher: { gradient: 'from-indigo-500 to-purple-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-700 dark:text-indigo-300', ringText: 'text-indigo-900 dark:text-white' },
  };
  const roleStyle = roleConfig[user?.role] || roleConfig.teacher;

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage your account identity and review your role details.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        {/* Edit Profile */}
        <Card glass hover={false} padding="none" animate>
          <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Edit Profile</h3>
          </div>
          <div className="p-5 space-y-4">
            {status.message ? (
              <div className={`rounded-xl border px-4 py-3 text-sm ${statusClasses[status.type] || statusClasses.info}`}>
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
                <Button type="submit" variant="gradient-primary" loading={isSaving}>Save Changes</Button>
                <Button type="button" variant="outline" onClick={handleReset} disabled={isSaving}>Reset</Button>
              </div>
            </form>
          </div>
        </Card>

        {/* Account Summary */}
        <Card glass hover={false} padding="none" animate>
          <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Account Summary</h3>
          </div>
          <div className="p-5 space-y-4 text-sm">
            {/* Avatar + Role Hero */}
            <div className={`rounded-xl ${roleStyle.bg} p-4 text-center`}>
              <div className={`w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br ${roleStyle.gradient} flex items-center justify-center shadow-lg mb-3`}>
                <span className="text-xl font-bold text-white">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</span>
              </div>
              <p className={`text-xs uppercase tracking-wider font-semibold ${roleStyle.text}`}>Current Role</p>
              <p className={`mt-0.5 text-lg font-extrabold ${roleStyle.ringText}`}>{roleLabel}</p>
            </div>

            <div className="grid gap-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200/40 dark:border-gray-700/30">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Account Status</p>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">{user?.is_active === false ? 'Inactive' : 'Active'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200/40 dark:border-gray-700/30">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Member Since</p>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">{formatDate(user?.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200/40 dark:border-gray-700/30">
                <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Last Updated</p>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">{formatDate(user?.updated_at)}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default ProfilePage;