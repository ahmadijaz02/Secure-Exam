import React from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

function TeacherDashboard() {
  const navigate = useNavigate();
  
  const stats = [
    { label: 'Active Sessions', value: '3', icon: '🔴' },
    { label: 'Students Monitored', value: '87', icon: '👥' },
    { label: 'Alerts Today', value: '12', icon: '🚨' },
    { label: 'Incidents Logged', value: '8', icon: '📝' },
  ];

  const handleStartMonitoring = () => {
    // Navigate to monitoring page with a test session ID
    navigate('/teacher/monitoring/test-session');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Teacher Dashboard</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Monitor exam sessions and manage alerts in real-time</p>
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

      {/* Live Monitoring */}
      <Card>
        <Card.Header>
          <Card.Title>Live Monitoring</Card.Title>
        </Card.Header>
        <Card.Content className="p-6">
          <div className="flex items-center justify-center h-64 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <div className="text-center">
              <p className="text-gray-500 dark:text-gray-400 text-lg">Live camera feed will be displayed here</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">Start an exam session to begin monitoring</p>
              <Button 
                variant="primary" 
                className="mt-4"
                onClick={handleStartMonitoring}
              >
                Start Monitoring
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Recent Alerts */}
      <Card>
        <Card.Header>
          <div className="flex items-center justify-between">
            <Card.Title>Recent Alerts</Card.Title>
            <Button variant="secondary" size="sm">View All</Button>
          </div>
        </Card.Header>
        <Card.Content className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div>
                <p className="font-semibold text-red-900 dark:text-red-200">Level 2 Alert - Mobile Phone Detected</p>
                <p className="text-sm text-red-700 dark:text-red-300">Student: Ahmad Ijaz | Time: 14:32:45</p>
              </div>
              <span className="text-2xl">📱</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div>
                <p className="font-semibold text-yellow-900 dark:text-yellow-200">Level 1 Alert - Unusual Head Turn</p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">Student: Fatima Khan | Time: 14:28:12</p>
              </div>
              <span className="text-2xl">👀</span>
            </div>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}

export default TeacherDashboard;
