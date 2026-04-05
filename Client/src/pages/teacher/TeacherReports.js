import React, { useEffect, useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import examService from '../../api/services/examService';
import incidentService from '../../api/services/incidentService';
import { API_CONFIG } from '../../api/config/apiConfig';

const ALERT_CONFIG = {
  PHONE_DETECTED:  { label: 'Phone Detected',    severity: 'high', gradient: 'from-red-500 to-rose-600',   shadow: 'shadow-red-500/20' },
  WATCH_DETECTED:  { label: 'Watch Detected',    severity: 'high', gradient: 'from-red-500 to-rose-600',   shadow: 'shadow-red-500/20' },
  PAPER_PASSING:   { label: 'Paper Passing',     severity: 'high', gradient: 'from-red-500 to-rose-600',   shadow: 'shadow-red-500/20' },
  HEAD_LEFT:       { label: 'Head Looking Left',  severity: 'low',  gradient: 'from-amber-400 to-orange-500', shadow: 'shadow-amber-500/20' },
  HEAD_RIGHT:      { label: 'Head Looking Right', severity: 'low',  gradient: 'from-amber-400 to-orange-500', shadow: 'shadow-amber-500/20' },
  HEAD_DOWN:       { label: 'Head Down',          severity: 'low',  gradient: 'from-amber-400 to-orange-500', shadow: 'shadow-amber-500/20' },
};

function TeacherReports() {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [incidents, setIncidents] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingIncidents, setIsLoadingIncidents] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setIsLoadingSessions(true);
        const data = await examService.getTeacherSessions();
        const sessionList = Array.isArray(data.sessions) ? data.sessions : [];
        setSessions(sessionList);
        if (sessionList.length > 0) {
          setSelectedSessionId(sessionList[0].id);
        }
      } catch (err) {
        setError(err.message || 'Failed to load sessions');
      } finally {
        setIsLoadingSessions(false);
      }
    };

    fetchSessions();
  }, []);

  useEffect(() => {
    const fetchIncidents = async () => {
      if (!selectedSessionId) {
        setIncidents([]);
        return;
      }
      try {
        setIsLoadingIncidents(true);
        const data = await incidentService.getIncidents({ exam_session_id: selectedSessionId });
        setIncidents(Array.isArray(data.incidents) ? data.incidents : []);
        setError('');
      } catch (err) {
        setIncidents([]);
        setError(err.message || 'Failed to load incidents');
      } finally {
        setIsLoadingIncidents(false);
      }
    };

    fetchIncidents();
  }, [selectedSessionId]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId),
    [sessions, selectedSessionId]
  );

  const filteredIncidents = useMemo(() => {
    if (!filterText.trim()) return incidents;
    const lowerFilter = filterText.toLowerCase();
    return incidents.filter(i =>
      (i.student_name && i.student_name.toLowerCase().includes(lowerFilter)) ||
      (i.roll_number && i.roll_number.toLowerCase().includes(lowerFilter)) ||
      (i.incident_type && i.incident_type.toLowerCase().includes(lowerFilter)) ||
      (i.description && i.description.toLowerCase().includes(lowerFilter))
    );
  }, [incidents, filterText]);

  const alertStats = useMemo(() => {
    const high = incidents.filter(i => {
      const config = ALERT_CONFIG[i.incident_type];
      return config ? config.severity === 'high' : false;
    }).length;
    return { total: incidents.length, high, low: incidents.length - high };
  }, [incidents]);

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  };

  const getTimeSince = (dateStr) => {
    if (!dateStr) return '';
    try {
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return formatDateTime(dateStr);
    } catch (_) { return ''; }
  };

  const downloadCSV = () => {
    if (filteredIncidents.length === 0) return;
    
    const headers = ['Time', 'Type', 'Student Name', 'Roll Number', 'Seat', 'Description'];
    const rows = filteredIncidents.map(inc => [
      formatDateTime(inc.created_at),
      inc.incident_type || '',
      inc.student_name || '',
      inc.roll_number || '',
      inc.seat_number || '',
      inc.description ? inc.description.replace(/"/g, '""') : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const sessionName = selectedSession ? selectedSession.name.replace(/\s+/g, '_') : 'Session';
    link.href = url;
    link.setAttribute('download', `${sessionName}_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resolveEvidenceUrl = (value) => {
    if (!value) return '';
    if (value.startsWith('http')) return value;

    const normalized = String(value).replace(/\\/g, '/');
    if (/^[A-Za-z]:\//.test(normalized) || normalized.includes('/suspicious_alerts/')) {
      const marker = '/suspicious_alerts/';
      const idx = normalized.toLowerCase().indexOf(marker);
      const relative = idx >= 0 ? normalized.slice(idx + marker.length) : normalized.split('/').pop();
      const apiOrigin = API_CONFIG.BASE_URL.replace(/\/api\/?$/, '');
      return `${apiOrigin}/api/alerts/${relative}`;
    }

    if (normalized.startsWith('suspicious_alerts/')) {
      const apiOrigin = API_CONFIG.BASE_URL.replace(/\/api\/?$/, '');
      return `${apiOrigin}/api/alerts/${normalized.slice('suspicious_alerts/'.length)}`;
    }

    if (normalized.startsWith('/api/')) {
      const apiOrigin = API_CONFIG.BASE_URL.replace(/\/api\/?$/, '');
      return `${apiOrigin}${normalized}`;
    }
    return `${API_CONFIG.BASE_URL}${normalized.startsWith('/') ? normalized : `/${normalized}`}`;
  };

  const getAlertConfig = (type) => ALERT_CONFIG[type] || { label: type, severity: 'low', gradient: 'from-gray-400 to-gray-500', shadow: 'shadow-gray-500/20' };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Review alerts for a specific session</p>
      </div>

      {/* Session Selector */}
      <Card glass hover={false} padding="none" animate>
        <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Select Session</h3>
        </div>

        <div className="p-5 space-y-4">
          {isLoadingSessions ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              <span className="text-sm">Loading sessions...</span>
            </div>
          ) : (
            <select
              className="premium-select w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60 backdrop-blur-sm px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
              value={selectedSessionId}
              onChange={(event) => setSelectedSessionId(event.target.value)}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
          )}

          {selectedSession ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200/40 dark:border-gray-700/30">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Start</p>
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{formatDateTime(selectedSession.start_time)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200/40 dark:border-gray-700/30">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">End</p>
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{formatDateTime(selectedSession.end_time)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200/40 dark:border-gray-700/30">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Classroom</p>
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{selectedSession.classroom || 'N/A'}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Alerts Table */}
      <Card glass hover={false} padding="none" animate>
        <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Session Alerts</h3>
                {alertStats.total > 0 && (
                  <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{alertStats.total}</span>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search evidence..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="w-full sm:w-64 pl-10 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60 backdrop-blur-sm text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                />
              </div>
              <Button
                variant="gradient-success"
                size="sm"
                disabled={filteredIncidents.length === 0}
                onClick={downloadCSV}
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Report
              </Button>
            </div>
          </div>
        </div>

        <div className="p-5">
          {error ? <p className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p> : null}
          {isLoadingIncidents ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              <span className="text-sm">Loading alerts...</span>
            </div>
          ) : incidents.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-950/30 dark:to-green-900/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No Alerts</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">No alerts recorded for this session</p>
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-500 dark:text-gray-400">No alerts match your search</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIncidents.map((incident, index) => {
                const config = getAlertConfig(incident.incident_type);
                const isHigh = config.severity === 'high';
                return (
                  <div
                    key={incident.id}
                    className={`rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-sm animate-fade-in-up stagger-${Math.min(index + 1, 5)} ${
                      isHigh
                        ? 'border-red-200/50 dark:border-red-800/30 bg-red-50/30 dark:bg-red-950/10'
                        : 'border-gray-200/60 dark:border-gray-700/40 bg-white/50 dark:bg-gray-800/30'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-4 p-4">
                      {/* Alert Icon */}
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-sm ${config.shadow} flex-shrink-0`}>
                        {isHigh ? (
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{config.label}</p>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isHigh ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                          }`}>
                            {isHigh ? 'HIGH' : 'LOW'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{incident.description || 'No description'}</p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{getTimeSince(incident.created_at)}</p>
                      </div>

                      {/* Evidence */}
                      {incident.image_url ? (
                        <div className="w-full md:w-44 flex-shrink-0">
                          <img
                            src={resolveEvidenceUrl(incident.image_url)}
                            alt="Captured evidence"
                            className="w-full h-28 md:h-24 object-cover rounded-xl border border-gray-200/40 dark:border-gray-700/30 hover:scale-[1.03] transition-transform duration-300 cursor-pointer"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className="w-full md:w-44 h-28 md:h-24 flex-shrink-0 rounded-xl border border-dashed border-gray-200/60 dark:border-gray-700/40 text-xs text-gray-400 dark:text-gray-500 flex items-center justify-center">
                          <div className="text-center">
                            <svg className="w-5 h-5 mx-auto mb-1 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            No evidence
                          </div>
                        </div>
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

export default TeacherReports;
