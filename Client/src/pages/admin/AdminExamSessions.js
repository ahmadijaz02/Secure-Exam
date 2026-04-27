import React, { useState, useEffect, useCallback, useRef } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import adminService from '../../api/services/adminService';
import { useNotificationActions } from '../../context/notification/NotificationContext';

function AdminExamSessions() {
  const [sessions, setSessions] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSeatingModal, setShowSeatingModal] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [selectedSessionForSeating, setSelectedSessionForSeating] = useState(null);
  const [linkedSeatingPlans, setLinkedSeatingPlans] = useState([]);
  const [availableSeatingPlans, setAvailableSeatingPlans] = useState([]);
  const [seatingPlanLoading, setSeatingPlanLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    action: null, // 'delete', 'unlink'
    targetId: null,
    isLoading: false
  });
  const planActionInFlightRef = useRef(false);
  const submittingRef = useRef(false);
  const { showSuccess, showError } = useNotificationActions();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    teacher_id: '',
    classroom: '',
    start_time: '',
    end_time: '',
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [sessionsData, teachersData] = await Promise.all([
        adminService.getAllExamSessions(),
        adminService.getAllUsers('teacher'),
      ]);
      
      setSessions(sessionsData.sessions);
      setTeachers(teachersData.users);
    } catch (error) {
      showError(error.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchSessionSeatingPlans = useCallback(async (sessionId, options = {}) => {
    const { showLoader = true } = options;
    try {
      if (showLoader) {
        setSeatingPlanLoading(true);
      }
      const data = await adminService.getSessionSeatingPlans(sessionId);

      const linked = Array.isArray(data.linked_seating_plans) ? data.linked_seating_plans : [];
      const available = Array.isArray(data.available_seating_plans) ? data.available_seating_plans : [];

      setLinkedSeatingPlans(linked);
      setAvailableSeatingPlans(available);
    } catch (error) {
      setLinkedSeatingPlans([]);
      setAvailableSeatingPlans([]);
      showError('Failed to load seating plans');
    } finally {
      if (showLoader) {
        setSeatingPlanLoading(false);
      }
    }
  }, [showError]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Prevent duplicate submissions
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    
    try {
      const sessionData = {
        ...formData,
        start_time: new Date(formData.start_time).toISOString(),
        end_time: new Date(formData.end_time).toISOString(),
      };

      if (editingSession) {
        await adminService.updateExamSession(editingSession.id, sessionData);
        showSuccess('Exam session updated successfully');
      } else {
        await adminService.createExamSession(sessionData);
        showSuccess('Exam session created successfully');
      }
      
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      showError(error.response?.data?.message || 'Operation failed');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleEdit = (session) => {
    setEditingSession(session);
    
    const startTime = new Date(session.start_time);
    const endTime = new Date(session.end_time);
    
    setFormData({
      name: session.name,
      description: session.description,
      teacher_id: session.teacher_id,
      classroom: session.classroom || '',
      start_time: startTime.toISOString().slice(0, 16),
      end_time: endTime.toISOString().slice(0, 16),
    });
    setShowModal(true);
  };

  const handleOpenSeatingPlans = async (session) => {
    try {
      const sessionsData = await adminService.getAllExamSessions();
      setSessions(sessionsData.sessions || []);
      const freshSession = (sessionsData.sessions || []).find(s => s.id === session.id);
      setSelectedSessionForSeating(freshSession || session);
    } catch (error) {
      setSelectedSessionForSeating(session);
    }
    setShowSeatingModal(true);
    await fetchSessionSeatingPlans(session.id);
  };

  const handleLinkSeatingPlan = async (planId) => {
    if (planActionInFlightRef.current) return;

    const selectedPlan = availableSeatingPlans.find((p) => p.id === planId);
    const assignedElsewhere = Boolean(
      selectedPlan?.exam_session_id && selectedPlan.exam_session_id !== selectedSessionForSeating?.id
    );
    if (assignedElsewhere) {
      showError(
        `This room is already assigned to ${selectedPlan?.assigned_session_name || 'another exam session'}. Unlink it first.`
      );
      return;
    }

    try {
      planActionInFlightRef.current = true;
      if (linkedSeatingPlans.length > 0) {
        const existingPlanId = linkedSeatingPlans[0].id;
        await adminService.unlinkSeatingPlanFromSession(selectedSessionForSeating.id, existingPlanId);
      }

      await adminService.linkSeatingPlanToSession(selectedSessionForSeating.id, planId);
      showSuccess('Seating plan linked successfully');
      await fetchSessionSeatingPlans(selectedSessionForSeating.id, { showLoader: false });
    } catch (error) {
      showError(error.response?.data?.message || 'Failed to link seating plan');
    } finally {
      planActionInFlightRef.current = false;
    }
  };

  const handleUnlinkSeatingPlan = async (planId) => {
    setConfirmDialog({
      isOpen: true,
      action: 'unlink',
      targetId: planId,
      isLoading: false
    });
  };

  const handleDelete = async (sessionId) => {
    setConfirmDialog({
      isOpen: true,
      action: 'delete',
      targetId: sessionId,
      isLoading: false
    });
  };

  const handleConfirmAction = async () => {
    if (planActionInFlightRef.current) return;

    const { action, targetId } = confirmDialog;
    
    setConfirmDialog(prev => ({ ...prev, isLoading: true }));
    
    try {
      planActionInFlightRef.current = true;
      
      if (action === 'unlink') {
        await adminService.unlinkSeatingPlanFromSession(selectedSessionForSeating.id, targetId);
        showSuccess('Seating plan unlinked successfully');
        await fetchSessionSeatingPlans(selectedSessionForSeating.id, { showLoader: false });
      } else if (action === 'delete') {
        await adminService.deleteExamSession(targetId);
        showSuccess('Exam session deleted successfully');
        fetchData();
      }
      
      setConfirmDialog({ isOpen: false, action: null, targetId: null, isLoading: false });
    } catch (error) {
      showError(error.response?.data?.message || 'Operation failed');
      setConfirmDialog(prev => ({ ...prev, isLoading: false }));
    } finally {
      planActionInFlightRef.current = false;
    }
  };

  const handleCancelAction = () => {
    setConfirmDialog({ isOpen: false, action: null, targetId: null, isLoading: false });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      teacher_id: '',
      classroom: '',
      start_time: '',
      end_time: '',
    });
    setEditingSession(null);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleCloseSeatingModal = () => {
    setShowSeatingModal(false);
    setSelectedSessionForSeating(null);
    fetchData();
  };

  const getTeacherName = (teacherId) => {
    const teacher = teachers.find(t => t.id === teacherId);
    return teacher ? teacher.name : 'Unknown';
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center animate-fade-in-up">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Exam Sessions</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-500 dark:text-gray-400">Manage exam sessions and assign classrooms</p>
        </div>
        <Button variant="gradient-primary" className="w-full sm:w-auto" onClick={() => setShowModal(true)}>
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Session
        </Button>
      </div>

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {sessions.map((session, index) => (
          <div key={session.id} className={`glass-card overflow-hidden animate-fade-in-up stagger-${Math.min(index + 1, 5)}`}>
            {/* Card Header */}
            <div className="px-5 py-4 border-b border-gray-200/40 dark:border-gray-700/30">
              <div className="flex justify-between items-start">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">{session.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{session.description}</p>
                </div>
                <span className={`ml-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 flex-shrink-0 ${
                  session.is_active 
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20' 
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 ring-gray-500/20'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${session.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}></span>
                  {session.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Card Body */}
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
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

              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Schedule</p>
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{formatDateTime(session.start_time)} - {formatDateTime(session.end_time)}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button 
                  variant="gradient-primary"
                  size="sm"
                  onClick={() => handleOpenSeatingPlans(session)} 
                  className="flex-1"
                >
                  {session.classrooms?.length > 0 ? 'View Seating' : 'Assign Seating'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleEdit(session)} className="flex-1">
                  Edit
                </Button>
                <Button 
                  variant="danger" 
                  size="sm"
                  onClick={() => handleDelete(session.id)}
                  className="flex-1"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {sessions.length === 0 && (
        <Card glass hover={false} animate>
          <div className="text-center py-10">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No exam sessions found</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Create one to get started</p>
          </div>
        </Card>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto p-4">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/60 dark:border-slate-700/40 p-5 sm:p-6 w-full max-w-2xl my-4 sm:my-8 animate-scale-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingSession ? 'Edit Exam Session' : 'Create New Exam Session'}
              </h2>
              <button onClick={handleCloseModal} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Session Name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="e.g., Final Exam - Mathematics"
              />
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all text-sm"
                  required
                  placeholder="Describe the exam session..."
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Teacher
                  </label>
                  <select
                    name="teacher_id"
                    value={formData.teacher_id}
                    onChange={handleInputChange}
                    className="premium-select w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60 backdrop-blur-sm px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                    required
                  >
                    <option value="">Select a teacher</option>
                    {teachers.map(teacher => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <Input
                  label="Classroom"
                  name="classroom"
                  value={formData.classroom}
                  onChange={handleInputChange}
                  placeholder="e.g., Room 101"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Start Time"
                  type="datetime-local"
                  name="start_time"
                  value={formData.start_time}
                  onChange={handleInputChange}
                  required
                />
                
                <Input
                  label="End Time"
                  type="datetime-local"
                  name="end_time"
                  value={formData.end_time}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="flex gap-3 mt-6">
                <Button 
                  type="submit" 
                  variant="gradient-primary" 
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {editingSession ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    editingSession ? 'Update Session' : 'Create Session'
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCloseModal} 
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Seating Plans Modal */}
      {showSeatingModal && selectedSessionForSeating && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/60 dark:border-slate-700/40 w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/60 dark:border-gray-700/30 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Seating Plans</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Session: {selectedSessionForSeating.name}</p>
              </div>
              <button
                onClick={handleCloseSeatingModal}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {seatingPlanLoading ? (
                <div className="flex justify-center items-center h-32">
                  <LoadingSpinner />
                </div>
              ) : (
                <>
                  {/* Assigned Plan */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Assigned Plan</h3>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ${
                        linkedSeatingPlans.length > 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 ring-gray-500/20'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${linkedSeatingPlans.length > 0 ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                        {linkedSeatingPlans.length > 0 ? 'Active' : 'Not Assigned'}
                      </span>
                    </div>

                    {linkedSeatingPlans.length === 0 ? (
                      <div className="border-2 border-dashed border-gray-200/60 dark:border-gray-700/40 rounded-xl p-6 text-center">
                        <p className="text-sm text-gray-400 dark:text-gray-500">No plan assigned — select one below</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {linkedSeatingPlans.map((plan) => (
                          <div key={plan.id} className="flex items-center justify-between gap-3 bg-emerald-50/60 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-700/40 rounded-xl px-4 py-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-white truncate">{plan.classroom_name || 'Unnamed'}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {plan.total_seats || (plan.seats ? plan.seats.length : 0)} seats
                                {plan.occupied_seats > 0 ? ` · ${plan.occupied_seats} student${plan.occupied_seats !== 1 ? 's' : ''} assigned` : ''}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUnlinkSeatingPlan(plan.id)}
                            >
                              Unlink
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <hr className="border-gray-200/60 dark:border-gray-700/30" />

                  {/* Available Plans */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Available Plans</h3>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{availableSeatingPlans.length} available</span>
                    </div>

                    {availableSeatingPlans.length === 0 ? (
                      <div className="border-2 border-dashed border-gray-200/60 dark:border-gray-700/40 rounded-xl p-6 text-center">
                        <p className="text-sm text-gray-400 dark:text-gray-500">No plans available — create them in the Seating Plans page</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {availableSeatingPlans.map((plan) => (
                          <div
                            key={plan.id}
                            className={`flex items-center justify-between gap-3 border rounded-xl px-4 py-3 transition-all duration-200 ${
                              plan.is_assigned_elsewhere
                                ? 'bg-amber-50/50 dark:bg-amber-900/20 border-amber-200/60 dark:border-amber-700/40'
                                : 'bg-white/50 dark:bg-gray-800/30 border-gray-200/60 dark:border-gray-700/40 hover:border-indigo-300 dark:hover:border-indigo-600'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white truncate">{plan.classroom_name || 'Unnamed'}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {plan.total_seats || (plan.seats ? plan.seats.length : 0)} seats
                                {plan.occupied_seats > 0 ? ` · ${plan.occupied_seats} student${plan.occupied_seats !== 1 ? 's' : ''} assigned` : ''}
                              </p>
                              {plan.is_assigned_elsewhere && (
                                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                                  Assigned to: {plan.assigned_session_name || 'Another Exam Session'}
                                </p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleLinkSeatingPlan(plan.id)}
                              disabled={linkedSeatingPlans.length > 0 || plan.is_assigned_elsewhere}
                              title={
                                plan.is_assigned_elsewhere
                                  ? `Already assigned to ${plan.assigned_session_name || 'another exam session'}`
                                  : linkedSeatingPlans.length > 0
                                    ? 'Unlink the current plan first'
                                    : 'Link this plan to the session'
                              }
                            >
                              {plan.is_assigned_elsewhere ? 'Assigned' : 'Link'}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmDialog.isOpen}
        title={
          confirmDialog.action === 'delete' 
            ? 'Delete Exam Session' 
            : 'Unlink Seating Plan'
        }
        message={
          confirmDialog.action === 'delete'
            ? 'This will permanently delete the exam session. This action cannot be undone.'
            : 'Are you sure you want to unlink this seating plan from the session?'
        }
        confirmText={confirmDialog.action === 'delete' ? 'Delete' : 'Unlink'}
        cancelText="Cancel"
        onConfirm={handleConfirmAction}
        onCancel={handleCancelAction}
        isDangerous={confirmDialog.action === 'delete'}
        isLoading={confirmDialog.isLoading}
      />
    </div>
  );
}

export default AdminExamSessions;
