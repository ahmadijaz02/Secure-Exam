import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import adminService from '../../api/services/adminService';
import { useNotification } from '../../context/notification/NotificationContext';

function AdminDashboard() {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      const data = await adminService.getDashboardStats();
      setStats(data.stats);
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  const dashboardStats = [
    { label: 'Total Exam Sessions', value: stats?.total_sessions || 0, icon: '📋' },
    { label: 'Active Teachers', value: stats?.total_teachers || 0, icon: '👨‍🏫' },
    { label: 'Classrooms', value: stats?.total_classrooms || 0, icon: '🏫' },
    { label: 'Total Incidents', value: stats?.total_incidents || 0, icon: '⚠️' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Manage exam sessions, teachers, and system configuration</p>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {dashboardStats.map((stat, index) => (
          <Card key={index}>
            <Card.Content className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stat.value}</p>
                </div>
                <span className="text-4xl">{stat.icon}</span>
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <Card.Header>
          <Card.Title>Quick Actions</Card.Title>
        </Card.Header>
        <Card.Content className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button variant="primary" className="w-full" onClick={() => navigate('/admin/exam-sessions')}>
              Create Exam Session
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => navigate('/admin/users')}>
              Manage Users
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => navigate('/admin/seating-plans')}>
              Configure Seating Plan
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => navigate('/admin/reports')}>
              Generate Report
            </Button>
          </div>
        </Card.Content>
      </Card>

      {/* Recent Activity */}
      <Card>
        <Card.Header>
          <Card.Title>Recent Activity</Card.Title>
        </Card.Header>
        <Card.Content className="p-6">
          <div className="space-y-4">
            <p className="text-gray-500 dark:text-gray-400">Recent activity will appear here</p>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}

export default AdminDashboard;
