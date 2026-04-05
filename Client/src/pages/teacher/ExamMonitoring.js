import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import monitoringService from '../../api/services/monitoringService';
import socketService from '../../utils/socket';
import { useNotification } from '../../context/notification/NotificationContext';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const objectAlertReasons = ['PHONE_DETECTED', 'WATCH_DETECTED', 'PAPER_PASSING'];

const ALERT_ICONS = {
  PHONE_DETECTED: '📱', WATCH_DETECTED: '⌚', PAPER_PASSING: '📄',
  HEAD_LEFT: '↩️', HEAD_RIGHT: '↪️', HEAD_DOWN: '⬇️',
};

const ExamMonitoring = () => {
  const navigate = useNavigate();
  const { examSessionId } = useParams();
  const notification = useNotification();

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [systemStatus, setSystemStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [streamFps, setStreamFps] = useState(0);
  const [streamLatencyMs, setStreamLatencyMs] = useState(null);
  const [lastFrameAt, setLastFrameAt] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [bootElapsedSec, setBootElapsedSec] = useState(0);
  const [alertFilterText, setAlertFilterText] = useState('');
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(true);
  const [showLogs, setShowLogs] = useState(false);

  const videoImgRef = useRef(null);
  const latestFrameRef = useRef(null);
  const latestFrameTsRef = useRef(null);
  const renderScheduledRef = useRef(false);
  const receivedFramesRef = useRef(0);
  const lastStatsUpdateRef = useRef(0);
  const prevFramesRef = useRef(0);
  const bootStartMsRef = useRef(null);

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
      const now = Date.now();
      if (!hasFrame) setHasFrame(true);
      if (now - lastStatsUpdateRef.current >= 1000) {
        setStreamFps(receivedFramesRef.current - prevFramesRef.current);
        prevFramesRef.current = receivedFramesRef.current;
        setFrameCount(receivedFramesRef.current);
        setLastFrameAt(new Date(now));
        lastStatsUpdateRef.current = now;
      }
    }
  }, [hasFrame]);

  const handleAlert = useCallback((payload) => {
    if (!payload || !payload.reason) return;
    setAlerts((prev) => [{
      id: Date.now() + Math.random(), reason: payload.reason,
      timestamp: payload.timestamp || '', alert_time: payload.alert_time || new Date().toISOString(),
      filename: payload.filename,
      severity: payload.severity || (objectAlertReasons.includes(payload.reason) ? 'high' : 'low'),
      warning_level: payload.warning_level,
      category: payload.category || (objectAlertReasons.includes(payload.reason) ? 'object' : 'behavior'),
      student_name: payload.student_name || null, roll_number: payload.roll_number || null,
      seat_number: payload.seat_number || null,
      head_turn_escalated: payload.head_turn_escalated || false,
      head_turn_count: payload.head_turn_count || null,
    }, ...prev]);
    const sl = payload.student_name ? ` — ${payload.student_name} (${payload.roll_number || 'N/A'})` : '';
    notification.showWarning(`Alert: ${formatAlertReason(payload.reason)}${sl}`);
    playAlertSound();
  }, [notification]);

  const handleLog = useCallback((msg) => {
    if (!msg || typeof msg !== 'string') return;
    setLogs((prev) => [msg, ...prev].slice(0, 200));
    setSystemStatus(msg.length > 80 ? msg.slice(0, 80) + '...' : msg);
  }, []);

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
    socket.on('email_alerts_status', (d) => { if (d && typeof d.enabled === 'boolean') setEmailAlertsEnabled(d.enabled); });
    return () => {
      socket.off('connect', onConnect); socket.off('disconnect', onDisconnect);
      socket.off('frame', handleFrame); socket.off('log', handleLog);
      socket.off('monitoring_alert', handleAlert); socket.off('email_alerts_status');
    };
  }, [handleFrame, handleLog, handleAlert]);

  useEffect(() => {
    (async () => { try { const s = await monitoringService.getMonitoringStatus(); setIsMonitoring(Boolean(s?.is_monitoring)); } catch (_) { setIsMonitoring(false); } })();
  }, []);

  useEffect(() => {
    if (!examSessionId) { notification.showError('Missing exam session.'); navigate('/teacher/sessions'); }
  }, [examSessionId, navigate, notification]);

  useEffect(() => {
    if (isMonitoring && !hasFrame) {
      if (!bootStartMsRef.current) { bootStartMsRef.current = Date.now(); setBootElapsedSec(0); }
      const tick = () => setBootElapsedSec(Math.max(0, Math.floor((Date.now() - bootStartMsRef.current) / 1000)));
      tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
    }
    bootStartMsRef.current = null; setBootElapsedSec(0);
  }, [isMonitoring, hasFrame]);

  const stopMonitoring = async () => {
    try {
      setIsLoading(true);
      await monitoringService.stopMonitoring(examSessionId);
      setIsMonitoring(false); latestFrameRef.current = null; setHasFrame(false); setFrameCount(0); setLastFrameAt(null);
      notification.showSuccess('Monitoring stopped');
    } catch (e) { notification.showError(e.message || 'Failed to stop'); }
    finally { setIsLoading(false); }
  };

  const formatAlertReason = (reason) => ({
    PHONE_DETECTED: 'Phone Detected', WATCH_DETECTED: 'Watch Detected',
    HEAD_LEFT: 'Head Turn Left', HEAD_RIGHT: 'Head Turn Right',
    HEAD_DOWN: 'Head Down', PAPER_PASSING: 'Paper Passing',
  }[reason] || reason);

  const filteredAlerts = useMemo(() => {
    if (!alertFilterText.trim()) return alerts;
    const l = alertFilterText.toLowerCase();
    return alerts.filter(a => (a.student_name?.toLowerCase().includes(l)) || (a.roll_number?.toLowerCase().includes(l)) || (a.reason?.toLowerCase().includes(l)));
  }, [alerts, alertFilterText]);

  const alertStats = useMemo(() => {
    const high = alerts.filter(a => (a.severity || (objectAlertReasons.includes(a.reason) ? 'high' : 'low')) === 'high').length;
    return { total: alerts.length, high, low: alerts.length - high };
  }, [alerts]);

  const playAlertSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 800;
      g.gain.setValueAtTime(0.3, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.5);
    } catch (_) {}
  };

  const toggleEmailAlerts = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setEmailAlertsEnabled((prev) => {
      const newVal = !prev;
      socketService.emitMonitoring('toggle_email_alerts', { enabled: newVal });
      return newVal;
    });
  }, []);

  const getTimeSince = (d) => {
    try { const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000); if (diff < 60) return `${diff}s ago`; if (diff < 3600) return `${Math.floor(diff / 60)}m ago`; return new Date(d).toLocaleTimeString(); } catch (_) { return ''; }
  };

  /* ========== Pill badge component ========== */
  const Pill = ({ color, children, pulse, className = '' }) => {
    const colorMap = {
      green: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 ring-emerald-200/80 dark:ring-emerald-800/60',
      amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 ring-amber-200/80 dark:ring-amber-800/60',
      indigo: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 ring-indigo-200/80 dark:ring-indigo-800/60',
      blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 ring-blue-200/80 dark:ring-blue-800/60',
      gray: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 ring-gray-200/80 dark:ring-gray-700/60',
      red: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 ring-red-200/80 dark:ring-red-800/60',
    };
    const dotColor = { green: 'bg-emerald-500', amber: 'bg-amber-500', indigo: 'bg-indigo-500', blue: 'bg-blue-500', gray: 'bg-gray-400', red: 'bg-red-500' };
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 ${colorMap[color] || colorMap.gray} ${className}`}>
        {pulse !== undefined && <span className={`w-1.5 h-1.5 rounded-full ${dotColor[color] || dotColor.gray} ${pulse ? 'animate-pulse' : ''}`} />}
        {children}
      </span>
    );
  };

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
      <div className="max-w-[1680px] mx-auto space-y-4">        {/* ─── Control Bar ─── */}
        <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40 shadow-sm">
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            {/* Left pills */}
            <div className="flex flex-wrap items-center gap-2">
              <Pill color={isSocketConnected ? 'green' : 'amber'} pulse={isSocketConnected}>
                {isSocketConnected ? 'Connected' : 'Connecting...'}
              </Pill>
              {isMonitoring && <Pill color="indigo" pulse>Active</Pill>}
              {isMonitoring && (
                <button onClick={toggleEmailAlerts} className="transition-all hover:scale-105 active:scale-95">
                  <Pill color={emailAlertsEnabled ? 'blue' : 'gray'} className="cursor-pointer">
                    {emailAlertsEnabled ? '📧 Email ON' : '🔕 Email OFF'}
                    <span className={`ml-1 relative flex w-7 h-3.5 rounded-full transition-colors ${emailAlertsEnabled ? 'bg-blue-400/40 dark:bg-blue-500/30' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${emailAlertsEnabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                    </span>
                  </Pill>
                </button>
              )}
            </div>
            {/* Right action */}
            <div>
              {!isMonitoring ? (
                <button onClick={() => navigate('/teacher/sessions')} disabled={isLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-md shadow-indigo-500/20 transition-all hover:shadow-lg disabled:opacity-50">
                  Go to Active Sessions →
                </button>
              ) : (
                <button onClick={stopMonitoring} disabled={isLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-md shadow-red-500/20 transition-all hover:shadow-lg disabled:opacity-50">
                  {isLoading ? <LoadingSpinner size="sm" /> : <>
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                    Stop
                  </>}
                </button>
              )}
            </div>
          </div>

          {/* Stats strip */}
          {isMonitoring && (
            <div className="border-t border-gray-100 dark:border-gray-700/40 px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-gray-400 dark:text-gray-500">
              <span>Frames: <b className="text-gray-600 dark:text-gray-300">{frameCount.toLocaleString()}</b></span>
              <span>FPS: <b className={streamFps >= 10 ? 'text-emerald-600 dark:text-emerald-400' : streamFps >= 5 ? 'text-amber-600' : 'text-red-500'}>{streamFps}</b></span>
              {streamLatencyMs !== null && <span>Latency: <b className={streamLatencyMs < 200 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}>{streamLatencyMs}ms</b></span>}
              {!hasFrame && isMonitoring && <span>Boot: <b className="text-gray-600 dark:text-gray-300">{formatDuration(bootElapsedSec)}</b></span>}
              {lastFrameAt && <span>Last: <b className="text-gray-600 dark:text-gray-300">{lastFrameAt.toLocaleTimeString()}</b></span>}
              {alertStats.total > 0 && <span className="ml-auto">Alerts: <b className="text-gray-600 dark:text-gray-300">{alertStats.total}</b>{alertStats.high > 0 && <b className="text-red-500 ml-1">({alertStats.high} critical)</b>}</span>}
            </div>
          )}
        </div>

        {/* ─── Main Content: Feed + Alerts ─── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">

          {/* ── Video Feed Column ── */}
          <div className="xl:col-span-8 space-y-4">
            <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40 shadow-sm overflow-hidden">
              {/* Feed header */}
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </div>
                  <span className="text-sm font-bold text-gray-800 dark:text-white">Video Feed</span>
                </div>
                {hasFrame && <Pill color="green" pulse>Streaming</Pill>}
              </div>
              {/* Feed viewport */}
              <div className="p-2.5">
                <div className="relative w-full bg-gray-950 rounded-xl overflow-hidden aspect-video flex items-center justify-center min-h-[260px] sm:min-h-[340px] lg:min-h-[420px]">
                  {hasFrame ? (
                    <>
                      <img ref={videoImgRef} src="" alt="Live feed" className="block w-full h-full object-contain rounded-xl" />
                    </>
                  ) : (
                    <div className="text-center p-6 flex flex-col items-center justify-center w-full h-full relative">
                      {!isMonitoring ? (
                        <div className="flex flex-col items-center opacity-70">
                          <div className="w-16 h-16 mb-4 rounded-2xl bg-gray-800/80 flex items-center justify-center border border-gray-700 shadow-inner">
                            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <p className="text-gray-400 text-sm font-medium tracking-wide">No active monitoring session</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center relative z-10 w-full max-w-md">
                          {/* High-tech Radar Animation */}
                          <div className="relative w-32 h-32 flex items-center justify-center mb-10">
                            {/* Outer pulsing rings */}
                            <div className="absolute inset-0 rounded-full border-[1.5px] border-indigo-500/20 animate-ping" style={{ animationDuration: '3s' }}></div>
                            <div className="absolute inset-2 rounded-full border border-indigo-500/30"></div>
                            <div className="absolute -inset-4 rounded-full border border-dashed border-indigo-500/10 animate-[spin_8s_linear_infinite]"></div>
                            
                            {/* Inner rotating dashed ring */}
                            <div className="absolute inset-4 rounded-full border-2 border-dashed border-indigo-400/40 animate-[spin_3s_linear_infinite]"></div>
                            
                            {/* Radar sweep using CSS gradient and spin */}
                            <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                              <div className="absolute w-1/2 h-1/2 top-0 right-0 bg-gradient-to-bl from-indigo-500/40 to-transparent origin-bottom-left animate-[spin_2s_linear_infinite]"></div>
                            </div>
                            
                            {/* Center Icon */}
                            <div className="relative z-10 w-12 h-12 rounded-full bg-gray-900 border border-indigo-500/60 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)]">
                              <svg className="w-5 h-5 text-indigo-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </div>
                          </div>

                          {/* Connection Status Text */}
                          <div className="w-full bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-xl p-5 shadow-2xl relative overflow-hidden">
                            {/* Scanning bar effect across the card */}
                            <div className="absolute inset-0 border-t border-indigo-500/50 opacity-30 blur-[1px]"
                                 style={{ animation: 'scanline 2.5s linear infinite' }}></div>
                                 
                            <div className="flex flex-col items-center text-center font-mono space-y-4 z-10 relative">
                              <h3 className="text-indigo-400 text-[13px] font-semibold tracking-[0.2em] uppercase animate-pulse">
                                Initializing Camera Stream
                              </h3>
                              
                              <div className="flex flex-col items-center justify-center gap-1">
                                <span className="text-gray-500 text-[10px] uppercase font-bold tracking-[0.2em]">Elapsed Time</span>
                                <span className="text-4xl text-gray-100 font-light tracking-wider leading-none">
                                  {formatDuration(bootElapsedSec)}
                                </span>
                              </div>

                              {/* Progress bar container */}
                              <div className="w-full max-w-[200px] h-1.5 bg-gray-800 rounded-full overflow-hidden mt-2 relative">
                                <div className="absolute left-0 top-0 h-full bg-indigo-500/80 w-1/3 rounded-full blur-[1px]"></div>
                                <div className="absolute left-0 top-0 h-full bg-indigo-400 w-1/3 rounded-full"
                                     style={{ animation: 'slideright 1.5s ease-in-out infinite alternate' }}></div>
                              </div>
                              
                              <p className="text-[10px] text-gray-500 mt-2 uppercase tracking-wider">
                                Contacting remote surveillance server...
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── System Logs (collapsible) ── */}
            <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40 shadow-sm overflow-hidden">
              <button onClick={() => setShowLogs(!showLogs)} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50/60 dark:hover:bg-gray-700/20 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-gray-400 to-slate-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
                  </div>
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">System Logs</span>
                  <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full font-medium">{logs.length}</span>
                </div>
                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${showLogs ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showLogs && (
                <div className="border-t border-gray-100 dark:border-gray-700/40 max-h-[200px] overflow-y-auto p-2.5 space-y-0.5 font-mono text-[11px]">
                  {logs.length === 0 ? (
                    <p className="text-gray-400 py-4 text-center text-xs">{isSocketConnected ? 'Waiting for logs…' : 'Connecting...'}</p>
                  ) : logs.slice(0, 50).map((log, i) => (
                    <div key={i} className={`px-2.5 py-1 rounded-lg leading-relaxed ${
                      log.includes('ALERT:') ? 'bg-amber-50/80 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400' :
                      log.includes('ERROR') ? 'bg-red-50/80 dark:bg-red-950/20 text-red-600 dark:text-red-400' :
                      'text-gray-500 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/40'
                    }`}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Alerts Sidebar ── */}
          <div className="xl:col-span-4">
            <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/40 shadow-sm overflow-hidden xl:sticky xl:top-4">
              {/* Alerts header */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/40">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-sm shadow-red-500/20">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    </div>
                    <span className="text-sm font-bold text-gray-800 dark:text-white">Alerts</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {alertStats.high > 0 && <Pill color="red">{alertStats.high} Critical</Pill>}
                    {alertStats.total > 0 && (
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{alertStats.total}</span>
                    )}
                  </div>
                </div>
                {/* Search */}
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input type="text" placeholder="Search alerts..." value={alertFilterText} onChange={(e) => setAlertFilterText(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition" />
                </div>
              </div>

              {/* Alert list */}
              <div className="max-h-[55vh] lg:max-h-[540px] overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="text-center py-14 px-6">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-950/30 dark:to-green-900/20 flex items-center justify-center">
                      <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    </div>
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">All clear</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">No suspicious activity detected</p>
                  </div>
                ) : filteredAlerts.length === 0 ? (
                  <div className="text-center py-10"><p className="text-xs text-gray-400">No matching alerts</p></div>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamMonitoring;
