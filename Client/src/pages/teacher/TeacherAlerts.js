import React, { useEffect, useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import examService from '../../api/services/examService';
import incidentService from '../../api/services/incidentService';
import { API_CONFIG } from '../../api/config/apiConfig';

function TeacherAlerts() {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('all');
  const [incidents, setIncidents] = useState([]);
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
      try {
        setIsLoadingIncidents(true);
        const params = selectedSessionId === 'all' ? {} : { exam_session_id: selectedSessionId };
        const data = await incidentService.getIncidents(params);
        setIncidents(Array.isArray(data.incidents) ? data.incidents : []);
        setError('');
      } catch (err) {
        setIncidents([]);
        setError(err.message || 'Failed to load alerts');
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

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alerts</h1>
        <p className="text-gray-600 dark:text-gray-400">View alerts from your assigned sessions</p>
      </div>

      <Card>
        <Card.Content className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Exam Session</label>
            {isLoadingSessions ? (
              <div className="flex items-center gap-2 mt-2 text-gray-600 dark:text-gray-400">
                <LoadingSpinner size="sm" />
                <span>Loading sessions...</span>
              </div>
            ) : (
              <select
                className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100"
                value={selectedSessionId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
              >
                <option value="all">All sessions</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedSession ? (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {selectedSession.description || 'No description'}
            </div>
          ) : null}
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Session Alerts</Card.Title>
        </Card.Header>
        <Card.Content className="p-6">
          {error ? <p className="text-red-600 dark:text-red-400">{error}</p> : null}
          {isLoadingIncidents ? (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <LoadingSpinner size="sm" />
              <span>Loading alerts...</span>
            </div>
          ) : incidents.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">No alerts recorded.</p>
          ) : (
            <div className="space-y-3">
              {incidents.map((incident) => (
                <div
                  key={incident.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-500 dark:text-gray-400">{formatDateTime(incident.created_at)}</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {incident.incident_type}
                      </p>
                      {incident.student_name && (
                        <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mt-1">
                          👤 {incident.student_name}
                          {incident.roll_number ? ` (${incident.roll_number})` : ''}
                          {incident.seat_number ? ` — Seat ${incident.seat_number}` : ''}
                        </p>
                      )}
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {incident.description || 'No description'}
                      </p>
                    </div>
                    {incident.image_url ? (
                      <div className="w-full md:w-40 flex-shrink-0">
                        <img
                          src={resolveEvidenceUrl(incident.image_url)}
                          alt="Captured evidence"
                          className="w-full h-28 md:h-24 object-cover rounded-md border border-gray-200 dark:border-gray-700"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="w-full md:w-40 h-28 md:h-24 flex-shrink-0 rounded-md border border-dashed border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center">
                        No evidence
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}

export default TeacherAlerts;
