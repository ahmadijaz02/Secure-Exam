import React, { useEffect, useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import adminService from '../../api/services/adminService';
import { API_CONFIG } from '../../api/config/apiConfig';

function AdminReports() {
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
				const data = await adminService.getAllExamSessions();
				const sessionList = Array.isArray(data.sessions) ? data.sessions : [];
				setSessions(sessionList);
				if (sessionList.length > 0) {
					setSelectedSessionId(sessionList[0].id);
				}
			} catch (err) {
				setError(err.message || 'Failed to load exam sessions');
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
				const data = await adminService.getIncidents({ exam_session_id: selectedSessionId });
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

	const formatDateTime = (value) => {
		if (!value) return 'N/A';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return String(value);
		return date.toLocaleString();
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

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
				<p className="text-gray-600 dark:text-gray-400">Filter alerts by exam session</p>
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
								{sessions.map((session) => (
									<option key={session.id} value={session.id}>
										{session.name}
									</option>
								))}
							</select>
						)}
					</div>

					{selectedSession ? (
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600 dark:text-gray-400">
							<div>
								<p className="font-semibold text-gray-800 dark:text-gray-200">Start</p>
								<p>{formatDateTime(selectedSession.start_time)}</p>
							</div>
							<div>
								<p className="font-semibold text-gray-800 dark:text-gray-200">End</p>
								<p>{formatDateTime(selectedSession.end_time)}</p>
							</div>
							<div>
								<p className="font-semibold text-gray-800 dark:text-gray-200">Classroom</p>
								<p>{selectedSession.classroom || 'N/A'}</p>
							</div>
						</div>
					) : null}
				</Card.Content>
			</Card>

			<Card>
				<Card.Header>
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 w-full">
						<Card.Title>Session Alerts</Card.Title>
						<div className="flex flex-col sm:flex-row gap-3">
							<input
								type="text"
								placeholder="Search evidence..."
								value={filterText}
								onChange={(e) => setFilterText(e.target.value)}
								className="w-full sm:w-64 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
							<Button
								variant="secondary"
								disabled={filteredIncidents.length === 0}
								onClick={downloadCSV}
							>
								Download Report
							</Button>
						</div>
					</div>
				</Card.Header>
				<Card.Content className="p-6">
					{error ? <p className="text-red-600 dark:text-red-400">{error}</p> : null}
					{isLoadingIncidents ? (
						<div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
							<LoadingSpinner size="sm" />
							<span>Loading incidents...</span>
						</div>
					) : incidents.length === 0 ? (
						<p className="text-gray-600 dark:text-gray-400">No alerts recorded for this session.</p>
					) : filteredIncidents.length === 0 ? (
						<p className="text-gray-600 dark:text-gray-400">No alerts match your search.</p>
					) : (
						<div className="space-y-3">
							{filteredIncidents.map((incident) => (
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

export default AdminReports;
