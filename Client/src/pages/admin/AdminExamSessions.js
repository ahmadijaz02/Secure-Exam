import React, { useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

function AdminExamSessions() {
  const [sessions, setSessions] = useState([
    { id: 1, name: 'Mathematics Final Exam', classroom: 'Room 101', invigilator: 'Mr. Ahmed', date: '2026-01-27', status: 'Scheduled' },
    { id: 2, name: 'Physics Mid-term', classroom: 'Room 102', invigilator: 'Ms. Fatima', date: '2026-01-28', status: 'Active' },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Exam Sessions</h1>
          <p className="text-gray-600 dark:text-gray-400">Create and manage exam sessions</p>
        </div>
        <Button variant="primary">Create New Session</Button>
      </div>

      {/* Filters */}
      <Card>
        <Card.Content className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input placeholder="Search sessions..." />
            <select className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              <option>All Status</option>
              <option>Scheduled</option>
              <option>Active</option>
              <option>Completed</option>
            </select>
            <Button variant="secondary">Filter</Button>
          </div>
        </Card.Content>
      </Card>

      {/* Sessions Table */}
      <Card>
        <Card.Header>
          <Card.Title>All Exam Sessions</Card.Title>
        </Card.Header>
        <Card.Content className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Session Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Classroom</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Invigilator</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">{session.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{session.classroom}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{session.invigilator}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{session.date}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        session.status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                        session.status === 'Scheduled' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {session.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">Edit</button>
                        <button className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}

export default AdminExamSessions;
