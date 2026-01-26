import React from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

function AdminDashboard() {
  const stats = [
    { label: 'Total Exam Sessions', value: '24', icon: '📋' },
    { label: 'Active Invigilators', value: '12', icon: '👥' },
    { label: 'Classrooms', value: '8', icon: '🏫' },
    { label: 'Total Incidents', value: '156', icon: '⚠️' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Manage exam sessions, invigilators, and system configuration</p>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
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
            <Button variant="primary" className="w-full">
              Create Exam Session
            </Button>
            <Button variant="secondary" className="w-full">
              Add Invigilator
            </Button>
            <Button variant="secondary" className="w-full">
              Configure Seating Plan
            </Button>
            <Button variant="secondary" className="w-full">
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
