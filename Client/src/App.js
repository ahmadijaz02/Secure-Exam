import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/auth/AuthContext';
import { ThemeProvider } from './context/theme/ThemeContext';
import { NotificationProvider } from './context/notification/NotificationContext';
import NotificationContainer from './components/notifications/NotificationContainer';

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
import AdminLiveSessions from './pages/admin/AdminLiveSessions';
import AdminExamSessions from './pages/admin/AdminExamSessions';
import AdminSeatingPlans from './pages/admin/AdminSeatingPlans';
import AdminUsers from './pages/admin/AdminUsers';
import AdminReports from './pages/admin/AdminReports';
import ProfilePage from './pages/account/ProfilePage';
import SettingsPage from './pages/account/SettingsPage';

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
            <NotificationContainer />
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
              <Route path="/admin/live-sessions" element={
                <AdminRoute>
                  <AdminLayout><AdminLiveSessions /></AdminLayout>
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
              <Route path="/admin/profile" element={
                <AdminRoute>
                  <AdminLayout><ProfilePage /></AdminLayout>
                </AdminRoute>
              } />
              <Route path="/admin/settings" element={
                <AdminRoute>
                  <AdminLayout><SettingsPage /></AdminLayout>
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
                  <TeacherLayout><ProfilePage /></TeacherLayout>
                </TeacherRoute>
              } />
              <Route path="/teacher/settings" element={
                <TeacherRoute>
                  <TeacherLayout><SettingsPage /></TeacherLayout>
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
