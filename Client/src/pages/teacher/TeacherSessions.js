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
      helper: 'Use HDMI capture cards or dedicated classroom cameras'
    },
    {
      value: 'laptop',
      label: 'Laptop Webcam',
      helper: 'Use the built-in webcam (configure LAPTOP_* overrides)'
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

    <div className="space-y-6">

      <div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Active Sessions</h1>

        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Start monitoring for sessions assigned to you</p>

      </div>



      <Card>

        <Card.Content className="p-4 space-y-6">



          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Camera Input Mode</p>
            <div className="flex flex-wrap gap-2">

              {cameraModeOptions.map((option) => {

                const isSelected = cameraMode === option.value;

                return (

                  <Button

                    key={option.value}

                    variant={isSelected ? 'primary' : 'outline'}

                    size="sm"

                    onClick={() => setCameraMode(option.value)}

                  >

                    {option.label}

                  </Button>

                );

              })}

            </div>

            <p className="text-xs text-gray-600 dark:text-gray-400">

              {cameraModeOptions.find((option) => option.value === cameraMode)?.helper}

            </p>

          </div>

        </Card.Content>

      </Card>



      <Card>

        <Card.Content className="p-6">

          {isLoading ? (

            <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">

              <LoadingSpinner size="sm" />

              <span>Loading sessions...</span>

            </div>

          ) : error ? (

            <p className="text-red-600 dark:text-red-400">{error}</p>

          ) : sessions.length === 0 ? (

            <p className="text-gray-600 dark:text-gray-400">No sessions assigned to you yet.</p>

          ) : (

            <div className="space-y-4">

              {sessions.map((session) => {

                const status = getSessionStatus(session);

                const isStarting = startingSessionId === session.id;

                const isStopping = stoppingSessionId === session.id;

                const isCompleted = status === 'completed';



                return (

                  <div

                    key={session.id}

                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"

                  >

                    <div>

                      <p className="text-lg font-semibold text-gray-900 dark:text-white">{session.name}</p>

                      <p className="text-sm text-gray-600 dark:text-gray-400">{session.description || 'No description'}</p>

                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 space-y-1">

                        <p>Start: {formatDateTime(session.start_time)}</p>

                        <p>End: {formatDateTime(session.end_time)}</p>

                        {session.classroom ? <p>Room: {session.classroom}</p> : null}

                        <p>Status: {status}</p>

                      </div>

                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">

                      {status === 'active' ? (

                        <>

                          <Button

                            variant="secondary"

                            disabled={isStopping}

                            onClick={() => navigate(`/teacher/monitoring/${session.id}`)}

                          >

                            Open Monitoring

                          </Button>

                          <Button

                            variant="danger"

                            disabled={isStopping}

                            onClick={() => handleStopSession(session.id)}

                          >

                            {isStopping ? <LoadingSpinner size="sm" /> : 'Stop Monitoring'}

                          </Button>

                        </>

                      ) : (

                        <Button

                          variant="primary"

                          disabled={isCompleted || isStarting}

                          onClick={() => handleStartSession(session.id)}

                        >

                          {isStarting ? <LoadingSpinner size="sm" /> : 'Start Monitoring'}

                        </Button>

                      )}

                    </div>

                  </div>

                );

              })}

            </div>

          )}

        </Card.Content>

      </Card>

    </div>

  );

}



export default TeacherSessions;


