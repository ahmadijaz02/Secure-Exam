import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import adminService from '../../api/services/adminService';
import socketService from '../../utils/socket';
import { useNotificationActions } from '../../context/notification/NotificationContext';

function AdminLiveSessions() {
  const [sessions, setSessions] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [frameCount, setFrameCount] = useState(0);
  const [streamFps, setStreamFps] = useState(0);
  const [streamLatencyMs, setStreamLatencyMs] = useState(null);
  const [lastFrameAt, setLastFrameAt] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [bootElapsedSec, setBootElapsedSec] = useState(0);
  const [alertFilterText, setAlertFilterText] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [systemStatus, setSystemStatus] = useState('');

  const { showSuccess, showError } = useNotificationActions();

  const videoImgRef = useRef(null);
  const latestFrameRef = useRef(null);
  const latestFrameTsRef = useRef(null);
  const renderScheduledRef = useRef(false);
  const receivedFramesRef = useRef(0);
  const lastStatsUpdateRef = useRef(0);
  const prevFramesRef = useRef(0);
  const bootStartMsRef = useRef(null);

  const objectAlertReasons = ['PHONE_DETECTED', 'WATCH_DETECTED', 'PAPER_PASSING'];

  const ALERT_ICONS = {
    PHONE_DETECTED: '📱',
    WATCH_DETECTED: '⌚',
    PAPER_PASSING: '📄',
    HEAD_LEFT: '↩️',
    HEAD_RIGHT: '↪️',
    HEAD_DOWN: '⬇️',
  };

  // Fetch active sessions
  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const [sessionsData, teachersData] = await Promise.all([
        adminService.getAllExamSessions(),
        adminService.getAllUsers('teacher'),
      ]);
      const activeSessions = (sessionsData.sessions || []).filter(s => s.is_active);
      setSessions(activeSessions);
      setTeachers(teachersData.users || []);
    } catch (error) {
      showError(error.response?.data?.message || 'Failed to load sessions');
      setSessions([]);
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const getTeacherName = (teacherId) => {
    const teacher = teachers.find(t => t.id === teacherId);
    return teacher ? teacher.name : 'Unknown';
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const formatDuration = useCallback((totalSeconds) => {
    const s = Math.max(0, Number(totalSeconds) || 0);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, []);

  const handleFrame = useCallback((data) => {
    const frameData = typeof data === 'string' ? data : data?.frame;
    const frameTs = typeof data === 'object' ? data?.ts : null;
    if (frameData && typeof frameData === 'string' && frameData.length > 100) {
      latestFrameRef.current = frameData;
      latestFrameTsRef.current = Number.isFinite(frameTs) ? frameTs : null;
      receivedFramesRef.current += 1;
      if (!renderScheduledRef.current) {
        renderScheduledRef.current = true;
        requestAnimationFrame(() => {
          if (videoImgRef.current && latestFrameRef.current)
            videoImgRef.current.src = `data:image/jpeg;base64,${latestFrameRef.current}`;
          if (latestFrameTsRef.current)
            setStreamLatencyMs(Math.max(0, Date.now() - latestFrameTsRef.current));
          renderScheduledRef.current = false;
        });
      }
    }
    const now = Date.now();
    if (!hasFrame) setHasFrame(true);
    if (now - lastStatsUpdateRef.current >= 1000) {
      setStreamFps(receivedFramesRef.current - prevFramesRef.current);
      prevFramesRef.current = receivedFramesRef.current;
      setFrameCount(receivedFramesRef.current);
      setLastFrameAt(new Date(now));
      lastStatsUpdateRef.current = now;
    }
  }, [hasFrame]);

  const handleAlert = useCallback((payload) => {
    if (!payload || !payload.reason) return;
    setAlerts((prev) => [{
      id: Date.now() + Math.random(),
      reason: payload.reason,
      timestamp: payload.timestamp || '',
      alert_time: payload.alert_time || new Date().toISOString(),
      filename: payload.filename,
      severity: payload.severity || (objectAlertReasons.includes(payload.reason) ? 'high' : 'low'),
      warning_level: payload.warning_level,
      category: payload.category || (objectAlertReasons.includes(payload.reason) ? 'object' : 'behavior'),
      student_name: payload.student_name || null,
      roll_number: payload.roll_number || null,
      seat_number: payload.seat_number || null,
      head_turn_escalated: payload.head_turn_escalated || false,
      head_turn_count: payload.head_turn_count || null,
    }, ...prev].slice(0, 100));
  }, [objectAlertReasons]);

  const handleLog = useCallback((msg) => {
    setLogs((prev) => [msg, ...prev].slice(0, 200));
    setSystemStatus(msg.length > 80 ? msg.slice(0, 80) + '...' : msg);
  }, []);

  // Setup socket connection for live feed
  useEffect(() => {
    const socket = socketService.joinMonitoring();
    const onConnect = () => setIsSocketConnected(true);
    const onDisconnect = () => setIsSocketConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) setIsSocketConnected(true);
    socket.on('frame', handleFrame);
    socket.on('log', handleLog);
    socket.on('monitoring_alert', handleAlert);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('frame', handleFrame);
      socket.off('log', handleLog);
      socket.off('monitoring_alert', handleAlert);
    };
  }, [handleFrame, handleLog, handleAlert]);

  // Auto-hide boot timer
  useEffect(() => {
    if (isMonitoring && !hasFrame) {
      if (!bootStartMsRef.current) {
        bootStartMsRef.current = Date.now();
        setBootElapsedSec(0);
      }
      const tick = () => setBootElapsedSec(Math.max(0, Math.floor((Date.now() - bootStartMsRef.current) / 1000)));
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }
  }, [isMonitoring, hasFrame]);

  const filteredAlerts = useMemo(() => {
    if (!alertFilterText.trim()) return alerts;
    const l = alertFilterText.toLowerCase();
    return alerts.filter(a =>
      (a.reason || '').toLowerCase().includes(l) || formatAlertReason(a.reason).toLowerCase().includes(l) ||
      (a.student_name?.toLowerCase().includes(l)) || (a.roll_number?.toLowerCase().includes(l))
    );
  }, [alerts, alertFilterText]);

  const formatAlertReason = (reason) => ({
    PHONE_DETECTED: 'Phone Detected',
    WATCH_DETECTED: 'Watch Detected',
    HEAD_LEFT: 'Head Turn Left',
    HEAD_RIGHT: 'Head Turn Right',
    HEAD_DOWN: 'Head Down',
    PAPER_PASSING: 'Paper Passing',
  }[reason] || reason);

  const getTimeSince = (d) => {
    try {
      const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      return new Date(d).toLocaleTimeString();
    } catch (_) {
      return '';
    }
  };

  const alertStats = useMemo(() => {
    const objectAlertReasons = ['PHONE_DETECTED', 'WATCH_DETECTED', 'PAPER_PASSING'];
    const high = alerts.filter(a => objectAlertReasons.includes(a.reason)).length;
    return { total: alerts.length, high };
  }, [alerts]);

  const handleSessionSelect = (session) => {
    setSelectedSession(session);
    setAlerts([]);
    setLogs([]);
    setHasFrame(false);
    setFrameCount(0);
    setStreamFps(0);
    setStreamLatencyMs(null);
    setLastFrameAt(null);
    setBootElapsedSec(0);
    bootStartMsRef.current = null;
    receivedFramesRef.current = 0;
    prevFramesRef.current = 0;
    lastStatsUpdateRef.current = 0;
    setIsMonitoring(true);
  };

  const handleCloseMonitoring = () => {
    setSelectedSession(null);
    setIsMonitoring(false);
    setAlerts([]);
    setLogs([]);
    setHasFrame(false);
  };

  if (loading && sessions.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!selectedSession) {
    return (
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center animate-fade-in-up">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Live Sessions</h1>
            <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-500 dark:text-gray-400">Monitor running exam sessions in real-time</p>
          </div>
          <Button variant="outline" onClick={fetchSessions} className="w-full sm:w-auto">
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </Button>
        </div>

        {/* Sessions Grid */}
        {sessions.length === 0 ? (
          <Card glass hover={false} animate>
            <div className="text-center py-10">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No active sessions</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Live sessions will appear here when exams are in progress</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((session, idx) => (
              <div key={session.id} className={`glass-card overflow-hidden animate-fade-in-up hover:shadow-lg transition-all duration-200 stagger-${Math.min(idx + 1, 5)}`}>
                <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">{session.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{session.description}</p>
                    </div>
                    <span className="ml-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 flex-shrink-0 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      LIVE
                    </span>
                  </div>
                </div>

                <div className="px-5 py-4 space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Teacher</p>
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{getTeacherName(session.teacher_id)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Classroom</p>
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{session.classroom || 'Not assigned'}</p>
                      </div>
                    </div>
                  </div>

                  <Button 
                    variant="gradient-primary"
                    className="w-full"
                    onClick={() => handleSessionSelect(session)}
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Watch Live Feed
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Monitoring view
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50/30 dark:from-gray-950 dark:via-gray-900 dark:to-slate-950 p-3 sm:p-5">
      <style>{`
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(400px); }
        }
        @keyframes slideright {
          0% { left: -33%; }
          100% { left: 100%; }
        }
      `}</style>
      <div className="max-w-[1680px] mx-auto space-y-4">
        {/* Control Bar */}
        <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40 shadow-sm">
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></div>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {isSocketConnected ? 'Connected' : 'Connecting...'}
              </span>
              {isMonitoring && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-500/20">
                  <span className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse"></span>
                  Active
                </span>
              )}
            </div>
            <button
              onClick={handleCloseMonitoring}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg active:scale-95 dark:from-blue-600 dark:to-blue-700 dark:hover:from-blue-700 dark:hover:to-blue-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back</span>
            </button>
          </div>

          {/* Stats strip */}
          {isMonitoring && (
            <div className="border-t border-gray-100 dark:border-gray-700/40 px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-gray-400 dark:text-gray-500">
              <span>Session: <b className="text-gray-600 dark:text-gray-300">{selectedSession.name}</b></span>
              <span>Frames: <b className="text-gray-600 dark:text-gray-300">{frameCount.toLocaleString()}</b></span>
              <span>FPS: <b className={streamFps >= 10 ? 'text-emerald-600 dark:text-emerald-400' : streamFps >= 5 ? 'text-amber-600' : 'text-red-500'}>{streamFps}</b></span>
              {streamLatencyMs !== null && <span>Latency: <b className={streamLatencyMs < 200 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}>{streamLatencyMs}ms</b></span>}
              {alertStats.total > 0 && <span className="ml-auto">Alerts: <b className="text-gray-600 dark:text-gray-300">{alertStats.total}</b>{alertStats.high > 0 && <b className="text-red-500 ml-1">({alertStats.high} critical)</b>}</span>}
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Video Feed */}
          <div className="xl:col-span-8 space-y-4">
            <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-gray-800 dark:text-white">Video Feed</span>
                </div>
                {hasFrame && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">Streaming</span>}
              </div>
              <div className="p-2.5">
                <div className="relative w-full bg-gray-950 rounded-xl overflow-hidden aspect-video flex items-center justify-center min-h-[260px] sm:min-h-[340px] lg:min-h-[420px]">
                  {hasFrame ? (
                    <img ref={videoImgRef} src="" alt="Live feed" className="block w-full h-full object-contain rounded-xl" />
                  ) : (
                    <div className="text-center p-6 flex flex-col items-center justify-center w-full h-full relative">
                      {isMonitoring && !hasFrame ? (
                        <div className="flex flex-col items-center opacity-70">
                          <div className="w-16 h-16 mb-4 rounded-2xl bg-gray-800/80 flex items-center justify-center border border-gray-700 shadow-inner">
                            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <p className="text-gray-400 text-sm font-medium tracking-wide">Initializing stream...</p>
                          <p className="text-gray-500 text-xs mt-2">Boot Time: {formatDuration(bootElapsedSec)}</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center opacity-70">
                          <div className="w-16 h-16 mb-4 rounded-2xl bg-gray-800/80 flex items-center justify-center border border-gray-700 shadow-inner">
                            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <p className="text-gray-400 text-sm font-medium tracking-wide">No active monitoring</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Alerts & Logs */}
          <div className="xl:col-span-4 space-y-4">
            {/* Alerts */}
            <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40 shadow-sm overflow-hidden flex flex-col max-h-[500px]">
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-bold text-gray-800 dark:text-white">Alerts</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{filteredAlerts.length}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredAlerts.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-xs text-gray-400 dark:text-gray-500">No alerts</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100/80 dark:divide-gray-700/30">
                    {filteredAlerts.map((alert) => {
                      const severity = alert.severity || (objectAlertReasons.includes(alert.reason) ? 'high' : 'low');
                      const level = alert.warning_level || (objectAlertReasons.includes(alert.reason) ? 2 : 1);
                      const icon = ALERT_ICONS[alert.reason] || '⚠️';
                      const isHigh = severity === 'high';

                      return (
                        <div key={alert.id} className={`group px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-700/15 transition-colors ${isHigh ? 'bg-red-50/30 dark:bg-red-950/5' : ''}`}>
                          <div className="flex items-start gap-2.5">
                            {/* Icon */}
                            <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-sm ${
                              isHigh ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-50 dark:bg-blue-900/20'
                            }`}>{icon}</div>
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="text-xs font-bold text-gray-800 dark:text-white truncate">{formatAlertReason(alert.reason)}</span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold leading-none ${
                                    level === 2 ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                  }`}>L{level}</span>
                                </div>
                              </div>
                              {alert.student_name && (
                                <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                                  👤 {alert.student_name}
                                  {alert.roll_number && <span className="text-gray-400"> ({alert.roll_number})</span>}
                                  {alert.seat_number && <span className="text-gray-400"> • Seat {alert.seat_number}</span>}
                                </p>
                              )}
                              {alert.head_turn_escalated && (
                                <p className="text-[10px] font-bold text-red-600 dark:text-red-400 mt-0.5">⚠️ Escalated: {alert.head_turn_count}× in 60s</p>
                              )}
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{getTimeSince(alert.alert_time)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Logs */}
            <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40 shadow-sm overflow-hidden flex flex-col max-h-[300px]">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/40 flex items-center justify-between hover:bg-gray-50/50 dark:hover:bg-gray-700/15 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-bold text-gray-800 dark:text-white">System Logs</span>
                </div>
                <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full font-medium">{logs.length}</span>
              </button>
              {showLogs && (
                <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5 font-mono text-[11px] max-h-[250px]">
                  {logs.length === 0 ? (
                    <p className="text-gray-400 dark:text-gray-500">No logs</p>
                  ) : (
                    logs.map((log, idx) => (
                      <div key={idx} className="text-gray-600 dark:text-gray-400 truncate hover:text-clip">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminLiveSessions;
