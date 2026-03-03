import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import monitoringService from '../../api/services/monitoringService';
import socketService from '../../utils/socket';
import { useNotification } from '../../context/notification/NotificationContext';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

// Same pattern as FYP: default namespace, "frame" (raw base64) and "log" (string)
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
  const [lastFrameAt, setLastFrameAt] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const videoImgRef = useRef(null);
  const latestFrameRef = useRef(null);
  const renderScheduledRef = useRef(false);
  const receivedFramesRef = useRef(0);
  const lastStatsUpdateRef = useRef(0);

  const handleFrame = useCallback((data) => {
    if (data && typeof data === 'string' && data.length > 100) {
      latestFrameRef.current = data;
      receivedFramesRef.current += 1;

      if (!renderScheduledRef.current) {
        renderScheduledRef.current = true;
        requestAnimationFrame(() => {
          const latestFrame = latestFrameRef.current;
          if (videoImgRef.current && latestFrame) {
            videoImgRef.current.src = `data:image/jpeg;base64,${latestFrame}`;
          }
          renderScheduledRef.current = false;
        });
      }

      const now = Date.now();
      if (!hasFrame) {
        setHasFrame(true);
      }
      if (now - lastStatsUpdateRef.current >= 1000) {
        setFrameCount(receivedFramesRef.current);
        setLastFrameAt(new Date(now));
        lastStatsUpdateRef.current = now;
      }
    }
  }, [hasFrame]);

  const handleAlert = useCallback((payload) => {
    if (!payload || !payload.reason) return;
    const alertObj = {
      id: Date.now() + Math.random(),
      reason: payload.reason,
      timestamp: payload.timestamp || '',
      alert_time: payload.alert_time || new Date().toISOString(),
      filename: payload.filename,
      severity: payload.severity || (['PHONE_DETECTED', 'PAPER_PASSING'].includes(payload.reason) ? 'high' : ['WATCH_DETECTED', 'HAND_MOUTH'].includes(payload.reason) ? 'medium' : 'low'),
      warning_level: payload.warning_level,
      student_name: payload.student_name || null,
      roll_number: payload.roll_number || null,
      seat_number: payload.seat_number || null,
      head_turn_escalated: payload.head_turn_escalated || false,
      head_turn_count: payload.head_turn_count || null,
    };
    setAlerts((prev) => [alertObj, ...prev]);
    const studentLabel = payload.student_name
      ? ` — ${payload.student_name} (${payload.roll_number || 'N/A'})`
      : '';
    notification.showWarning(`Alert: ${formatAlertReason(payload.reason)}${studentLabel}`);
    playAlertSound();
  }, [notification]);

  const handleLog = useCallback((msg) => {
    if (!msg || typeof msg !== 'string') return;
    setLogs((prev) => [msg, ...prev].slice(0, 200));
    setSystemStatus(msg.length > 80 ? msg.slice(0, 80) + '...' : msg);
    if (msg.startsWith('ALERT:')) {
      const parts = msg.split(':');
      const reason = parts[1] || 'ALERT';
      const timestamp = parts[2] || '';
      // Basic fallback — detailed student info comes via monitoring_alert event
      setAlerts((prev) => {
        // Avoid duplicate if monitoring_alert already added it
        const recent = prev[0];
        if (recent && recent.reason === reason && Math.abs(new Date(recent.alert_time).getTime() - Date.now()) < 2000) {
          return prev;
        }
        return [
          {
            id: Date.now() + Math.random(),
            reason,
            timestamp,
            alert_time: new Date().toISOString(),
            filename: parts[3],
            severity: ['PHONE_DETECTED', 'PAPER_PASSING'].includes(reason) ? 'high' : ['WATCH_DETECTED', 'HAND_MOUTH'].includes(reason) ? 'medium' : 'low'
          },
          ...prev
        ];
      });
    }
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

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('frame', handleFrame);
      socket.off('log', handleLog);
      socket.off('monitoring_alert', handleAlert);
    };
  }, [handleFrame, handleLog, handleAlert]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await monitoringService.getMonitoringStatus();
        setIsMonitoring(Boolean(status?.is_monitoring));
      } catch (_) {
        setIsMonitoring(false);
      }
    };

    fetchStatus();
  }, []);

  useEffect(() => {
    if (!examSessionId) {
      notification.showError('Missing exam session. Start monitoring from Active Sessions.');
      navigate('/teacher/sessions');
    }
  }, [examSessionId, navigate, notification]);

  const stopMonitoring = async () => {
    try {
      setIsLoading(true);
      await monitoringService.stopMonitoring(examSessionId);
      setIsMonitoring(false);
      latestFrameRef.current = null;
      setHasFrame(false);
      setFrameCount(0);
      setLastFrameAt(null);
      notification.showSuccess('Camera stopped');
    } catch (error) {
      notification.showError(error.message || 'Failed to stop monitoring');
    } finally {
      setIsLoading(false);
    }
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

  const getAlertSeverity = (reason) => {
    const high = ['PHONE_DETECTED', 'PAPER_PASSING'];
    const medium = ['WATCH_DETECTED', 'HAND_MOUTH'];
    if (high.includes(reason)) return 'high';
    if (medium.includes(reason)) return 'medium';
    return 'low';
  };

  const playAlertSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch (_) {}
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-3 sm:p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Live Monitoring</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Real-time exam monitoring with AI detection</p>
          </div>
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => navigate(-1)}>Back</Button>
        </div>

        <Card className="mb-6">
          <div className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Camera Control</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
                  {isSocketConnected ? (
                    <span className="text-green-600 dark:text-green-400">● Live feed connected</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">○ Connecting...</span>
                  )}
                  {systemStatus ? ` • ${systemStatus}` : ''}
                </p>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                {!isMonitoring ? (
                  <Button
                    onClick={() => navigate('/teacher/sessions')}
                    disabled={isLoading}
                    variant="secondary"
                    className="w-full sm:w-auto"
                  >
                    Go to Active Sessions
                  </Button>
                ) : (
                  <Button onClick={stopMonitoring} disabled={isLoading} variant="danger" className="w-full sm:w-auto">
                    {isLoading ? <LoadingSpinner size="sm" /> : 'Stop Monitoring'}
                  </Button>
                )}
              </div>
            </div>
            {isMonitoring && (
              <div className="mt-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <span className="text-sm text-green-600 dark:text-green-400 font-medium">Monitoring Active</span>
              </div>
            )}
            {!isMonitoring && (
              <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                Start a session from Active Sessions to begin monitoring.
              </div>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card className="min-w-0 overflow-hidden">
            <div className="p-4 sm:p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Live Video Feed</h2>
              {isMonitoring && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Frames: {frameCount}
                  {lastFrameAt ? ` • Last: ${lastFrameAt.toLocaleTimeString()}` : ''}
                </p>
              )}
              <div className="relative w-full max-w-full bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center min-h-[220px] sm:min-h-[280px]">
                {hasFrame ? (
                  <>
                    <img
                      ref={videoImgRef}
                      src=""
                      alt="Live feed"
                      className="block w-full h-full max-w-full object-cover rounded-lg"
                      style={{ background: '#222' }}
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 bg-green-500/90 text-white text-xs font-semibold rounded-full flex items-center gap-1">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      LIVE
                    </div>
                  </>
                ) : (
                  <div className="text-gray-500 text-center p-4">
                    <svg className="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p>{isMonitoring ? 'Waiting for video feed...' : 'Click Start Monitoring to begin'}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="min-w-0">
            <div className="p-4 sm:p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Alerts ({alerts.length})</h2>
              <div className="space-y-3 max-h-[50vh] lg:max-h-[500px] overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>No alerts detected</p>
                  </div>
                ) : (
                  alerts.map((alert) => {
                    const severity = alert.severity || getAlertSeverity(alert.reason);
                    const colors = {
                      high: 'bg-red-100 border-red-500 text-red-800 dark:bg-red-900 dark:text-red-200',
                      medium: 'bg-yellow-100 border-yellow-500 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
                      low: 'bg-blue-100 border-blue-500 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    };
                    return (
                      <div key={alert.id} className={`p-4 rounded-lg border-l-4 ${colors[severity]}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold">{formatAlertReason(alert.reason)}</p>
                            {alert.student_name && (
                              <p className="text-sm font-medium mt-1">
                                👤 {alert.student_name}
                                {alert.roll_number ? ` (${alert.roll_number})` : ''}
                                {alert.seat_number ? ` — Seat ${alert.seat_number}` : ''}
                              </p>
                            )}
                            {alert.head_turn_escalated && (
                              <p className="text-xs font-bold text-red-700 dark:text-red-300 mt-1">
                                ⚠️ Escalated: {alert.head_turn_count} head turns in 60s
                              </p>
                            )}
                            <p className="text-sm opacity-75 mt-1">{new Date(alert.alert_time).toLocaleString()}</p>
                            <span className="inline-block text-xs mt-1 px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 font-bold text-slate-700 dark:text-slate-200">
                              Level {alert.warning_level || (['PHONE_DETECTED','PAPER_PASSING'].includes(alert.reason) ? 2 : 1)}
                            </span>
                          </div>
                          <span className="text-xs uppercase font-bold px-2 py-1 rounded">{severity}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Card>
        </div>

        <Card className="mt-6">
          <div className="p-4 sm:p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Activity Logs</h2>
            <div className="space-y-2 max-h-[40vh] lg:max-h-[300px] overflow-y-auto text-sm">
              {logs.length === 0 ? (
                <p className="text-gray-500 py-2">
                  {isSocketConnected ? 'Waiting for logs…' : 'Connecting to server… (ensure backend runs on port 5000)'}
                </p>
              ) : (
                logs.slice(0, 50).map((log, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded border-l-2 ${
                      log.includes('ALERT:') ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-500' :
                      log.includes('ERROR') ? 'bg-red-50 dark:bg-red-950/30 border-red-500' :
                      'bg-slate-50 dark:bg-slate-800 border-slate-300'
                    }`}
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ExamMonitoring;
