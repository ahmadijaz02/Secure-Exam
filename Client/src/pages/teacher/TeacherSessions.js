import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import examService from '../../api/services/examService';
import monitoringService from '../../api/services/monitoringService';
import { useNotification } from '../../context/notification/NotificationContext';


function TeacherSessions() {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [startingSessionId, setStartingSessionId] = useState(null);
  const [stoppingSessionId, setStoppingSessionId] = useState(null);
  const [cameraMode, setCameraMode] = useState('laptop');
  const cameraModeOptions = [
    {
      value: 'external',
      label: 'External Camera Rig',
      helper: 'Use HDMI capture cards or dedicated classroom cameras',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      value: 'laptop',
      label: 'Laptop Webcam',
      helper: 'Use the built-in webcam (configure LAPTOP_* overrides)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  const fetchSessions = async () => {
    try {
      setIsLoading(true);
      const data = await examService.getTeacherSessions();
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setError('');
    } catch (err) {
      setSessions([]);
      setError(err.message || 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  };

  const getSessionStatus = (session) => {
    if (session.is_active) return 'active';
    const startTime = new Date(session.start_time);
    const endTime = new Date(session.end_time);
    if (!Number.isNaN(endTime.getTime()) && endTime < new Date()) return 'completed';
    if (!Number.isNaN(startTime.getTime()) && startTime > new Date()) return 'scheduled';
    return 'scheduled';
  };

  const getStatusBadge = (status) => {
    const config = {
      active: {
        classes: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20',
        dot: 'bg-emerald-500',
        pulse: true,
        label: 'Active',
      },
      scheduled: {
        classes: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 ring-blue-500/20',
        dot: 'bg-blue-500',
        pulse: false,
        label: 'Scheduled',
      },
      completed: {
        classes: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 ring-gray-500/20',
        dot: 'bg-gray-400',
        pulse: false,
        label: 'Completed',
      },
    };
    const c = config[status] || config.scheduled;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 ${c.classes}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${c.pulse ? 'animate-pulse' : ''}`}></span>
        {c.label}
      </span>
    );
  };

  const handleStartSession = async (sessionId) => {
    try {
      setStartingSessionId(sessionId);
      await monitoringService.startMonitoring(sessionId, null, cameraMode);
      const selectedMode = cameraModeOptions.find((option) => option.value === cameraMode);
      addNotification('success', `Monitoring started (${selectedMode?.label || cameraMode})`);
      navigate(`/teacher/monitoring/${sessionId}`);
    } catch (err) {
      addNotification('error', err.message || 'Failed to start monitoring');
    } finally {
      setStartingSessionId(null);
    }
  };

  const handleStopSession = async (sessionId) => {
    try {
      setStoppingSessionId(sessionId);
      await monitoringService.stopMonitoring(sessionId);
      addNotification('success', 'Monitoring stopped');
      await fetchSessions();
    } catch (err) {
      addNotification('error', err.message || 'Failed to stop monitoring');
    } finally {
      setStoppingSessionId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Active Sessions</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-500 dark:text-gray-400">Start monitoring for sessions assigned to you</p>
      </div>

      {/* Camera Mode Selector */}
      <Card glass hover={false} padding="none" animate>
        <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Camera Input Mode</h3>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cameraModeOptions.map((option) => {
              const isSelected = cameraMode === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setCameraMode(option.value)}
                  className={`relative flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                    isSelected
                      ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-sm shadow-indigo-500/10'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50/50 dark:hover:bg-gray-800/30'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isSelected
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}>
                    {option.icon}
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>
                      {option.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{option.helper}</p>
                  </div>
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Sessions List */}
      <Card glass hover={false} padding="none" animate>
        <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Your Sessions</h3>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              <span className="text-sm">Loading sessions...</span>
            </div>
          ) : error ? (
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          ) : sessions.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No sessions assigned yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Sessions will appear here once they're assigned to you</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session, index) => {
                const status = getSessionStatus(session);
                const isStarting = startingSessionId === session.id;
                const isStopping = stoppingSessionId === session.id;
                const isCompleted = status === 'completed';

                return (
                  <div
                    key={session.id}
                    className={`border border-gray-200/60 dark:border-gray-700/40 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white/50 dark:bg-gray-800/30 hover:bg-white/80 dark:hover:bg-gray-800/50 transition-all duration-200 animate-fade-in-up stagger-${Math.min(index + 1, 5)}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <p className="text-base font-bold text-gray-900 dark:text-white">{session.name}</p>
                        {getStatusBadge(status)}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{session.description || 'No description'}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Start: {formatDateTime(session.start_time)}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          End: {formatDateTime(session.end_time)}
                        </span>
                        {session.classroom && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {session.classroom}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 flex-shrink-0">
                      {status === 'active' ? (
                        <>
                          <Button
                            variant="gradient-primary"
                            size="sm"
                            disabled={isStopping}
                            onClick={() => navigate(`/teacher/monitoring/${session.id}`)}
                          >
                            Open Monitoring
                          </Button>
                          <Button
                            variant="gradient-danger"
                            size="sm"
                            disabled={isStopping}
                            onClick={() => handleStopSession(session.id)}
                          >
                            {isStopping ? <LoadingSpinner size="sm" color="white" /> : 'Stop'}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="gradient-primary"
                          size="sm"
                          disabled={isCompleted || isStarting}
                          onClick={() => handleStartSession(session.id)}
                        >
                          {isStarting ? <LoadingSpinner size="sm" color="white" /> : 'Start Monitoring'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default TeacherSessions;
