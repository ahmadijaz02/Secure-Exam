import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/auth/AuthContext';
import { ThemeProvider } from './context/theme/ThemeContext';
import { NotificationProvider } from './context/notification/NotificationContext';

// Layout Components
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';
import TeacherLayout from './layouts/TeacherLayout';

// Page Components
import HomePage from './pages/home/HomePage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import NotFoundPage from './pages/error/NotFoundPage';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminExamSessions from './pages/admin/AdminExamSessions';
import AdminSeatingPlans from './pages/admin/AdminSeatingPlans';
import AdminUsers from './pages/admin/AdminUsers';
import AdminReports from './pages/admin/AdminReports';

// Teacher Pages
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import TeacherSessions from './pages/teacher/TeacherSessions';
import ExamMonitoring from './pages/teacher/ExamMonitoring';
import TeacherAlerts from './pages/teacher/TeacherAlerts';
import TeacherReports from './pages/teacher/TeacherReports';

// Route Guards
import { AdminRoute, TeacherRoute } from './components/guards/RoleBasedRoute';

function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <AuthProvider>
          <Router>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<HomePage />} />
              
              {/* Legacy route - redirect to home */}
              <Route path="/app" element={<Navigate to="/" replace />} />
              
              {/* Auth Routes */}
              <Route path="/auth" element={<AuthLayout />}>
                <Route path="login" element={<LoginPage />} />
                <Route path="signup" element={<SignupPage />} />
              </Route>

              {/* Admin Routes */}
              <Route path="/admin/dashboard" element={
                <AdminRoute>
                  <AdminLayout><AdminDashboard /></AdminLayout>
                </AdminRoute>
              } />
              <Route path="/admin/exam-sessions" element={
                <AdminRoute>
                  <AdminLayout><AdminExamSessions /></AdminLayout>
                </AdminRoute>
              } />
              <Route path="/admin/seating-plans" element={
                <AdminRoute>
                  <AdminLayout><AdminSeatingPlans /></AdminLayout>
                </AdminRoute>
              } />
              <Route path="/admin/users" element={
                <AdminRoute>
                  <AdminLayout><AdminUsers /></AdminLayout>
                </AdminRoute>
              } />
              <Route path="/admin/reports" element={
                <AdminRoute>
                  <AdminLayout><AdminReports /></AdminLayout>
                </AdminRoute>
              } />
              <Route path="/admin/settings" element={
                <AdminRoute>
                  <AdminLayout>
                    <div className="space-y-6">
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
                      <p className="text-gray-600 dark:text-gray-400">Configure system settings</p>
                    </div>
                  </AdminLayout>
                </AdminRoute>
              } />

              {/* Teacher Routes */}
              <Route path="/teacher/dashboard" element={
                <TeacherRoute>
                  <TeacherLayout><TeacherDashboard /></TeacherLayout>
                </TeacherRoute>
              } />
              <Route path="/teacher/sessions" element={
                <TeacherRoute>
                  <TeacherLayout><TeacherSessions /></TeacherLayout>
                </TeacherRoute>
              } />
              <Route path="/teacher/monitoring/:examSessionId" element={
                <TeacherRoute>
                  <TeacherLayout><ExamMonitoring /></TeacherLayout>
                </TeacherRoute>
              } />
              <Route path="/teacher/alerts" element={
                <TeacherRoute>
                  <TeacherLayout><TeacherAlerts /></TeacherLayout>
                </TeacherRoute>
              } />
              <Route path="/teacher/reports" element={
                <TeacherRoute>
                  <TeacherLayout><TeacherReports /></TeacherLayout>
                </TeacherRoute>
              } />
              <Route path="/teacher/profile" element={
                <TeacherRoute>
                  <TeacherLayout>
                    <div className="space-y-6">
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h1>
                      <p className="text-gray-600 dark:text-gray-400">Manage your profile settings</p>
                    </div>
                  </TeacherLayout>
                </TeacherRoute>
              } />
              <Route path="/teacher/settings" element={
                <TeacherRoute>
                  <TeacherLayout>
                    <div className="space-y-6">
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
                      <p className="text-gray-600 dark:text-gray-400">Configure your preferences and account settings</p>
                    </div>
                  </TeacherLayout>
                </TeacherRoute>
              } />

              {/* 404 Page */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Router>
        </AuthProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;
