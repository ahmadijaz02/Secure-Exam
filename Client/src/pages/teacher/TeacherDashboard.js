import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import examService from '../../api/services/examService';
import apiService from '../../api/services/apiService';
import socketService from '../../utils/socket';
import incidentService from '../../api/services/incidentService';

function TeacherDashboard() {
  const navigate = useNavigate();
  const [scheduledSessions, setScheduledSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [sessionsError, setSessionsError] = useState('');
  const [stats, setStats] = useState({
    active_sessions: 0,
    total_sessions: 0,
    alerts_today: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [activeSession, setActiveSession] = useState(null);
  const [isLoadingActiveSession, setIsLoadingActiveSession] = useState(true);
  const [activeSessionError, setActiveSessionError] = useState('');
  const [hasFrame, setHasFrame] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [streamFps, setStreamFps] = useState(0);
  const [streamLatencyMs, setStreamLatencyMs] = useState(null);
  const [lastFrameAt, setLastFrameAt] = useState(null);
  const videoImgRef = useRef(null);
  const latestFrameRef = useRef(null);
  const latestFrameTsRef = useRef(null);
  const renderScheduledRef = useRef(false);
  const framesThisSecondRef = useRef(0);
  const fpsWindowStartRef = useRef(Date.now());
  const [recentIncidents, setRecentIncidents] = useState([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [recentError, setRecentError] = useState('');

  const REFRESH_MS = 10000;
  const initialLoadRef = useRef({
    scheduled: true,
    active: true,
    stats: true,
    recent: true
  });
  
  const statCards = [
    { label: 'Active Sessions', value: stats.active_sessions, icon: '🔴' },
    { label: 'Total Sessions', value: stats.total_sessions, icon: '📋' },
    { label: 'Alerts Today', value: stats.alerts_today, icon: '🚨' },
  ];


  const fetchScheduledSessions = useCallback(async () => {
    try {
      if (initialLoadRef.current.scheduled) {
        setIsLoadingSessions(true);
      }
      const data = await examService.getTeacherSessions({ status: 'scheduled' });
      setScheduledSessions(data.sessions || []);
      setSessionsError('');
    } catch (error) {
      if (initialLoadRef.current.scheduled) {
        setScheduledSessions([]);
      }
      setSessionsError(error.message || 'Failed to load scheduled sessions');
    } finally {
      if (initialLoadRef.current.scheduled) {
        setIsLoadingSessions(false);
        initialLoadRef.current.scheduled = false;
      }
    }
  }, []);

  useEffect(() => {
    fetchScheduledSessions();
    const intervalId = setInterval(fetchScheduledSessions, REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [fetchScheduledSessions]);

  const fetchActiveSessions = useCallback(async () => {
    try {
      if (initialLoadRef.current.active) {
        setIsLoadingActiveSession(true);
      }
      const data = await examService.getTeacherSessions({ status: 'active' });
      const sessions = Array.isArray(data.sessions) ? data.sessions : [];
      setActiveSession(sessions[0] || null);
      setActiveSessionError('');
    } catch (error) {
      if (initialLoadRef.current.active) {
        setActiveSession(null);
      }
      setActiveSessionError(error.message || 'Failed to load active session');
    } finally {
      if (initialLoadRef.current.active) {
        setIsLoadingActiveSession(false);
        initialLoadRef.current.active = false;
      }
    }
  }, []);

  useEffect(() => {
    fetchActiveSessions();
    const intervalId = setInterval(fetchActiveSessions, REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [fetchActiveSessions]);

  const fetchDashboardStats = useCallback(async () => {
    try {
      if (initialLoadRef.current.stats) {
        setIsLoadingStats(true);
      }
      const data = await apiService.get('/dashboard');
      setStats(data.stats || { active_sessions: 0, total_sessions: 0, alerts_today: 0 });
      setStatsError('');
    } catch (error) {
      if (initialLoadRef.current.stats) {
        setStats({ active_sessions: 0, total_sessions: 0, alerts_today: 0 });
      }
      setStatsError(error.message || 'Failed to load stats');
    } finally {
      if (initialLoadRef.current.stats) {
        setIsLoadingStats(false);
        initialLoadRef.current.stats = false;
      }
    }
  }, []);

  useEffect(() => {
    fetchDashboardStats();
    const intervalId = setInterval(fetchDashboardStats, REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [fetchDashboardStats]);

  const fetchRecentIncidents = useCallback(async () => {
    try {
      if (initialLoadRef.current.recent) {
        setIsLoadingRecent(true);
      }
      const data = await incidentService.getIncidents({ limit: 5 });
      setRecentIncidents(Array.isArray(data.incidents) ? data.incidents : []);
      setRecentError('');
    } catch (error) {
      if (initialLoadRef.current.recent) {
        setRecentIncidents([]);
      }
      setRecentError(error.message || 'Failed to load recent alerts');
    } finally {
      if (initialLoadRef.current.recent) {
        setIsLoadingRecent(false);
        initialLoadRef.current.recent = false;
      }
    }
  }, []);

  useEffect(() => {
    fetchRecentIncidents();
    const intervalId = setInterval(fetchRecentIncidents, REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [fetchRecentIncidents]);

  useEffect(() => {
    if (!activeSession) {
      setHasFrame(false);
      setStreamFps(0);
      setStreamLatencyMs(null);
      setLastFrameAt(null);
      latestFrameRef.current = null;
      latestFrameTsRef.current = null;
      framesThisSecondRef.current = 0;
      fpsWindowStartRef.current = Date.now();
      return undefined;
    }

    const socket = socketService.joinMonitoring();
    const onConnect = () => setIsSocketConnected(true);
    const onDisconnect = () => setIsSocketConnected(false);
    const onFrame = (data) => {
      const frameData = typeof data === 'string' ? data : data?.frame;
      const frameTs = typeof data === 'object' ? data?.ts : null;
      if (frameData && typeof frameData === 'string' && frameData.length > 100) {
        latestFrameRef.current = frameData;
        latestFrameTsRef.current = Number.isFinite(frameTs) ? frameTs : null;
        framesThisSecondRef.current += 1;

        const now = Date.now();
        const elapsed = now - fpsWindowStartRef.current;
        if (elapsed >= 1000) {
          setStreamFps(Math.round((framesThisSecondRef.current * 1000) / elapsed));
          framesThisSecondRef.current = 0;
          fpsWindowStartRef.current = now;
        }

        if (!renderScheduledRef.current) {
          renderScheduledRef.current = true;
          requestAnimationFrame(() => {
            const latestFrame = latestFrameRef.current;
            if (videoImgRef.current && latestFrame) {
              videoImgRef.current.src = `data:image/jpeg;base64,${latestFrame}`;
            }
            const renderedAt = Date.now();
            setLastFrameAt(new Date(renderedAt));
            if (latestFrameTsRef.current) {
              setStreamLatencyMs(Math.max(0, renderedAt - latestFrameTsRef.current));
            }
            renderScheduledRef.current = false;
          });
        }
        setHasFrame(true);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('frame', onFrame);
    if (socket.connected) setIsSocketConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('frame', onFrame);
    };
  }, [activeSession]);

  useEffect(() => {
    const socket = socketService.joinMonitoring();
    const onAlert = (payload) => {
      if (!payload) return;
      const newIncident = {
        id: `${payload.alert_time || Date.now()}-${Math.random()}`,
        incident_type: payload.reason,
        created_at: payload.alert_time,
        description: `Auto-detected: ${payload.reason}`
      };
      setRecentIncidents((prev) => [newIncident, ...prev].slice(0, 5));
      setStats((prev) => ({
        ...prev,
        alerts_today: (prev.alerts_today || 0) + 1
      }));
      fetchDashboardStats();
      fetchRecentIncidents();
    };

    socket.on('monitoring_alert', onAlert);

    return () => {
      socket.off('monitoring_alert', onAlert);
      socketService.leaveMonitoring();
    };
  }, [fetchDashboardStats, fetchRecentIncidents]);

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  };

  const formatAlertReason = (reason) => {
    const map = {
      PHONE_DETECTED: 'Phone Detected',
      WATCH_DETECTED: 'Watch Detected',
      HAND_MOUTH: 'Hand Near Mouth',
      HEAD_LEFT: 'Head Looking Left',
      HEAD_RIGHT: 'Head Looking Right',
      PAPER_PASSING: 'Paper Passing'
    };
    return map[reason] || reason;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Teacher Dashboard</h1>
        <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Monitor exam sessions and manage alerts in real-time</p>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <Card.Content className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                    {isLoadingStats ? '...' : stat.value}
                  </p>
                </div>
                <span className="text-4xl">{stat.icon}</span>
              </div>
              {statsError ? (
                <p className="text-xs text-red-600 dark:text-red-400 mt-2">{statsError}</p>
              ) : null}
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
          {isLoadingActiveSession ? (
            <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              <span>Loading active session...</span>
            </div>
          ) : activeSession ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{activeSession.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{activeSession.description || 'No description'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {isSocketConnected ? 'Live feed connected' : 'Connecting to live feed...'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/teacher/monitoring/${activeSession.id}`)}
                >
                  Open Monitoring
                </Button>
              </div>
              <div className="relative w-full max-w-full bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center min-h-[240px]">
                {hasFrame ? (
                  <>
                    <img
                      ref={videoImgRef}
                      src=""
                      alt="Live feed"
                      className="block w-full h-full max-w-full object-cover"
                    />
                    <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/60 text-white text-xs">
                      FPS: {streamFps}
                      {streamLatencyMs !== null ? ` • Latency: ${streamLatencyMs}ms` : ' • Latency: --'}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-400">
                    <p className="text-sm">Waiting for live feed...</p>
                  </div>
                )}
              </div>
              {hasFrame ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {lastFrameAt ? `Last frame: ${lastFrameAt.toLocaleTimeString()}` : 'Last frame: --'}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <div className="text-center">
                <p className="text-gray-500 dark:text-gray-400 text-lg">Live camera feed will be displayed here</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">Start an exam session to begin monitoring</p>
                {activeSessionError ? (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">{activeSessionError}</p>
                ) : null}
                <Button 
                  variant="primary" 
                  className="mt-4"
                  onClick={() => navigate('/teacher/sessions')}
                >
                  Go to Active Sessions
                </Button>
              </div>
            </div>
          )}
        </Card.Content>
      </Card>

      {/* Scheduled Sessions */}
      <Card>
        <Card.Header>
          <Card.Title>Scheduled Sessions</Card.Title>
        </Card.Header>
        <Card.Content className="p-6">
          {isLoadingSessions ? (
            <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              <span>Loading scheduled sessions...</span>
            </div>
          ) : sessionsError ? (
            <p className="text-red-600 dark:text-red-400">{sessionsError}</p>
          ) : scheduledSessions.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">No scheduled sessions assigned to you yet.</p>
          ) : (
            <div className="space-y-4">
              {scheduledSessions.map((session) => (
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
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => navigate('/teacher/sessions')}
                    >
                      View in Active Sessions
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card.Content>
      </Card>

      {/* Recent Alerts */}
      <Card>
        <Card.Header>
          <div className="flex items-center justify-between">
            <Card.Title>Recent Alerts</Card.Title>
            <Button variant="secondary" size="sm" onClick={() => navigate('/teacher/alerts')}>View All</Button>
          </div>
        </Card.Header>
        <Card.Content className="p-6">
          {recentError ? <p className="text-red-600 dark:text-red-400">{recentError}</p> : null}
          {isLoadingRecent ? (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              <span>Loading alerts...</span>
            </div>
          ) : recentIncidents.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">No alerts recorded.</p>
          ) : (
            <div className="space-y-3">
              {recentIncidents.map((incident) => (
                <div
                  key={incident.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {formatAlertReason(incident.incident_type)}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDateTime(incident.created_at)}
                    </p>
                  </div>
                  <span className="text-xl">🚨</span>
                </div>
              ))}
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}

export default TeacherDashboard;
