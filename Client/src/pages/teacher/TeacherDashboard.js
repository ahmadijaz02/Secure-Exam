import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import examService from '../../api/services/examService';
import apiService from '../../api/services/apiService';
import socketService from '../../utils/socket';
import incidentService from '../../api/services/incidentService';

/* ─── SVG Icon Components ─── */
const ActiveSessionIcon = () => (
  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const TotalSessionsIcon = () => (
  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const AlertsIcon = () => (
  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LocationIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);


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
    {
      label: 'Active Sessions',
      value: stats.active_sessions,
      icon: <ActiveSessionIcon />,
      gradient: 'from-rose-500 to-pink-600',
      shadow: 'shadow-rose-500/20',
      bgLight: 'bg-rose-50 dark:bg-rose-950/20',
      textColor: 'text-rose-600 dark:text-rose-400',
    },
    {
      label: 'Total Sessions',
      value: stats.total_sessions,
      icon: <TotalSessionsIcon />,
      gradient: 'from-indigo-500 to-purple-600',
      shadow: 'shadow-indigo-500/20',
      bgLight: 'bg-indigo-50 dark:bg-indigo-950/20',
      textColor: 'text-indigo-600 dark:text-indigo-400',
    },
    {
      label: 'Alerts Today',
      value: stats.alerts_today,
      icon: <AlertsIcon />,
      gradient: 'from-amber-500 to-orange-600',
      shadow: 'shadow-amber-500/20',
      bgLight: 'bg-amber-50 dark:bg-amber-950/20',
      textColor: 'text-amber-600 dark:text-amber-400',
    },
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
      HEAD_LEFT: 'Head Looking Left',
      HEAD_RIGHT: 'Head Looking Right',
      PAPER_PASSING: 'Paper Passing'
    };
    return map[reason] || reason;
  };

  const getAlertSeverity = (type) => {
    const highSeverity = ['PHONE_DETECTED', 'WATCH_DETECTED', 'PAPER_PASSING'];
    return highSeverity.includes(type) ? 'high' : 'low';
  };

  const getAlertIcon = (type) => {
    const severity = getAlertSeverity(type);
    if (severity === 'high') {
      return (
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-sm shadow-red-500/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
      );
    }
    return (
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm shadow-amber-500/20">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  };

  const getTimeSince = (dateStr) => {
    if (!dateStr) return '';
    try {
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return new Date(dateStr).toLocaleDateString();
    } catch (_) { return ''; }
  };


  return (
    <div className="space-y-8 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          Teacher Dashboard
        </h1>
        <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-500 dark:text-gray-400">
          Monitor exam sessions and manage alerts in real-time
        </p>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {statCards.map((stat, index) => (
          <div
            key={stat.label}
            className={`glass-card p-5 animate-fade-in-up stagger-${index + 1}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
                <p className="text-3xl font-extrabold text-gray-900 dark:text-white mt-1.5 tracking-tight">
                  {isLoadingStats ? (
                    <span className="inline-block w-12 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></span>
                  ) : stat.value}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-lg ${stat.shadow}`}>
                {stat.icon}
              </div>
            </div>
            {statsError ? (
              <p className="text-xs text-red-600 dark:text-red-400 mt-3">{statsError}</p>
            ) : null}
          </div>
        ))}
      </div>

      {/* Live Monitoring */}
      <Card glass hover={false} padding="none" animate>
        <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-500/20">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Live Monitoring</h3>
              {activeSession && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {isSocketConnected ? (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Connected
                    </span>
                  ) : 'Connecting...'}
                </p>
              )}
            </div>
          </div>
          {activeSession && (
            <Button
              variant="gradient-primary"
              size="sm"
              onClick={() => navigate(`/teacher/monitoring/${activeSession.id}`)}
            >
              Open Full View
            </Button>
          )}
        </div>

        <div className="p-5">
          {isLoadingActiveSession ? (
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              <span className="text-sm">Loading active session...</span>
            </div>
          ) : activeSession ? (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{activeSession.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{activeSession.description || 'No description'}</p>
              </div>

              <div className="relative w-full max-w-full bg-gray-950 rounded-xl overflow-hidden aspect-video flex items-center justify-center min-h-[240px]">
                {hasFrame ? (
                  <>
                    <img
                      ref={videoImgRef}
                      src=""
                      alt="Live feed"
                      className="block w-full h-full max-w-full object-cover rounded-xl"
                    />
                    <div className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-sm text-white text-xs font-medium flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      FPS: {streamFps}
                      {streamLatencyMs !== null ? ` | ${streamLatencyMs}ms` : ''}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-500 p-6">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gray-800/60 flex items-center justify-center">
                      <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium">Waiting for live feed...</p>
                  </div>
                )}
              </div>

              {hasFrame && lastFrameAt ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Last frame: {lastFrameAt.toLocaleTimeString()}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-dashed border-gray-200/60 dark:border-gray-700/40">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-950/30 dark:to-purple-950/30 flex items-center justify-center">
                  <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">No active monitoring session</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Start an exam session to begin monitoring</p>
                {activeSessionError ? (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-2">{activeSessionError}</p>
                ) : null}
                <Button 
                  variant="gradient-primary" 
                  className="mt-5"
                  onClick={() => navigate('/teacher/sessions')}
                >
                  Go to Active Sessions
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Scheduled Sessions */}
      <Card glass hover={false} padding="none" animate>
        <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-sm shadow-blue-500/20">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Scheduled Sessions</h3>
        </div>

        <div className="p-5">
          {isLoadingSessions ? (
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              <span className="text-sm">Loading scheduled sessions...</span>
            </div>
          ) : sessionsError ? (
            <p className="text-red-600 dark:text-red-400 text-sm">{sessionsError}</p>
          ) : scheduledSessions.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No scheduled sessions</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Sessions assigned to you will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {scheduledSessions.map((session) => (
                <div
                  key={session.id}
                  className="border border-gray-200/60 dark:border-gray-700/40 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white/50 dark:bg-gray-800/30 hover:bg-white/80 dark:hover:bg-gray-800/50 transition-all duration-200"
                >
                  <div>
                    <p className="text-base font-bold text-gray-900 dark:text-white">{session.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{session.description || 'No description'}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <ClockIcon />
                        {formatDateTime(session.start_time)}
                      </span>
                      {session.classroom && (
                        <span className="flex items-center gap-1">
                          <LocationIcon />
                          {session.classroom}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/teacher/sessions')}
                  >
                    View Details
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Recent Alerts */}
      <Card glass hover={false} padding="none" animate>
        <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-sm shadow-red-500/20">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Recent Alerts</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/teacher/alerts')}>
            View All
          </Button>
        </div>

        <div className="p-5">
          {recentError ? <p className="text-red-500 dark:text-red-400 text-sm">{recentError}</p> : null}
          {isLoadingRecent ? (
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              <span className="text-sm">Loading alerts...</span>
            </div>
          ) : recentIncidents.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-950/30 dark:to-green-900/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">All Clear</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">No alerts recorded</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentIncidents.map((incident) => (
                <div
                  key={incident.id}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 hover:shadow-sm ${
                    getAlertSeverity(incident.incident_type) === 'high'
                      ? 'bg-red-50/40 dark:bg-red-950/10 border-red-200/50 dark:border-red-800/30'
                      : 'bg-gray-50/40 dark:bg-gray-800/30 border-gray-200/50 dark:border-gray-700/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {getAlertIcon(incident.incident_type)}
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatAlertReason(incident.incident_type)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {getTimeSince(incident.created_at) || formatDateTime(incident.created_at)}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                    getAlertSeverity(incident.incident_type) === 'high'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}>
                    {getAlertSeverity(incident.incident_type) === 'high' ? 'HIGH' : 'LOW'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default TeacherDashboard;
