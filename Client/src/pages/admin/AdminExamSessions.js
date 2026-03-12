<<<<<<< HEAD
import React, { useState, useEffect, useCallback, useRef } from 'react';
=======
import React, { useState, useEffect } from 'react';
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import adminService from '../../api/services/adminService';
<<<<<<< HEAD
import { useNotificationActions } from '../../context/notification/NotificationContext';
=======
import { useNotification } from '../../context/notification/NotificationContext';
import {
  renderSeatingGrid,
  renderSeatingEditor,
  assignStudentToSeat,
  clearStudentFromSeat,
  getSeatStudentData,
  generateSeats as generateEmptySeats,
} from '../../utils/seatingUtils';
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8

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
<<<<<<< HEAD
  const planActionInFlightRef = useRef(false);
  const { showSuccess, showError } = useNotificationActions();
=======
  const { addNotification } = useNotification();
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    teacher_id: '',
    classroom: '',
    start_time: '',
    end_time: '',
  });

<<<<<<< HEAD
  const fetchData = useCallback(async () => {
=======
  const [seatingFormData, setSeatingFormData] = useState({
    classroom_name: '',
    total_seats: 5,
  });

  const [seats, setSeats] = useState([]);
  const [selectedSeatId, setSelectedSeatId] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [rollNumber, setRollNumber] = useState('');

  useEffect(() => {
    fetchData();
    
    // Add visibility change listener to refresh when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const fetchData = async () => {
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
    try {
      setLoading(true);
      const [sessionsData, teachersData] = await Promise.all([
        adminService.getAllExamSessions(),
        adminService.getAllUsers('teacher'),
      ]);
      
      setSessions(sessionsData.sessions);
      setTeachers(teachersData.users);
    } catch (error) {
<<<<<<< HEAD
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

      // Handle new response structure with linked and available plans
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
=======
      addNotification('error', error.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionSeatingPlans = async (sessionId) => {
    try {
      setSeatingPlanLoading(true);
      const data = await adminService.getSessionSeatingPlans(sessionId);
      console.log('=== SEATING PLANS RESPONSE ===');
      console.log('Full response:', data);
      console.log('Linked plans:', data.linked_seating_plans);
      console.log('Available plans:', data.available_seating_plans);
      
      // Handle new response structure with linked and available plans
      const linked = Array.isArray(data.linked_seating_plans) ? data.linked_seating_plans : [];
      const available = Array.isArray(data.available_seating_plans) ? data.available_seating_plans : [];
      
      console.log('After processing - Linked:', linked.length, 'Available:', available.length);
      setLinkedSeatingPlans(linked);
      setAvailableSeatingPlans(available);
    } catch (error) {
      console.error('Failed to load seating plans:', error);
      setLinkedSeatingPlans([]);
      setAvailableSeatingPlans([]);
      addNotification('error', 'Failed to load seating plans');
    } finally {
      setSeatingPlanLoading(false);
    }
  };
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

<<<<<<< HEAD
=======
  const handleSeatingInputChange = (e) => {
    const { name, value } = e.target;
    setSeatingFormData(prev => ({
      ...prev,
      [name]: name === 'total_seats' ? parseInt(value) || 0 : value
    }));
  };

  const generateSeats = () => {
    const newSeats = generateEmptySeats(seatingFormData.total_seats);
    setSeats(newSeats);
  };

>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const sessionData = {
        ...formData,
        start_time: new Date(formData.start_time).toISOString(),
        end_time: new Date(formData.end_time).toISOString(),
      };

      if (editingSession) {
        await adminService.updateExamSession(editingSession.id, sessionData);
<<<<<<< HEAD
        showSuccess('Exam session updated successfully');
      } else {
        await adminService.createExamSession(sessionData);
        showSuccess('Exam session created successfully');
=======
        addNotification('success', 'Exam session updated successfully');
      } else {
        await adminService.createExamSession(sessionData);
        addNotification('success', 'Exam session created successfully');
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
      }
      
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error) {
<<<<<<< HEAD
      showError(error.response?.data?.message || 'Operation failed');
    }
  };

=======
      addNotification('error', error.response?.data?.message || 'Operation failed');
    }
  };

  const handleSubmitSeatingPlan = async (e) => {
    if (e) e.preventDefault();
    
    try {
      if (!seatingFormData.classroom_name.trim()) {
        addNotification('error', 'Classroom name is required');
        return;
      }

      const seatsToSubmit = seats.length > 0 ? seats : generateEmptySeats(seatingFormData.total_seats);
      const planData = {
        classroom_name: seatingFormData.classroom_name,
        total_seats: seatingFormData.total_seats,
        seats: seatsToSubmit,
      };

      console.log('Submitting seating plan with data:', planData);
      console.log('Selected session:', selectedSessionForSeating);
      
      const response = await adminService.createSessionSeatingPlan(selectedSessionForSeating.id, planData);
      console.log('Seating plan created:', response);
      addNotification('success', 'Seating plan created successfully');
      
      resetSeatingForm();
      setTimeout(() => fetchSessionSeatingPlans(selectedSessionForSeating.id), 500);
      fetchData();
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Failed to create seating plan');
    }
  };

  const handleSeatSelect = (seatKey) => {
    setSelectedSeatId(seatKey);
    const [row, col] = seatKey.split('-').map(Number);
    const studentData = getSeatStudentData(seats, row, col);
    setStudentName(studentData.student_name || '');
    setRollNumber(studentData.roll_number || '');
  };

  const handleAssignSeat = () => {
    if (!selectedSeatId) {
      addNotification('error', 'Select a seat to assign');
      return;
    }
    if (!studentName.trim() || !rollNumber.trim()) {
      addNotification('error', 'Student name and roll number are required');
      return;
    }

    const updatedSeats = assignStudentToSeat(seats, selectedSeatId, studentName, rollNumber);
    setSeats(updatedSeats);
    addNotification('success', 'Student assigned successfully');
  };

  const handleClearSeat = () => {
    if (!selectedSeatId) {
      addNotification('error', 'Select a seat to clear');
      return;
    }

    const updatedSeats = clearStudentFromSeat(seats, selectedSeatId);
    setSeats(updatedSeats);
    setStudentName('');
    setRollNumber('');
    addNotification('success', 'Seat cleared successfully');
  };

>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
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
    // Fetch fresh session data to ensure we have the latest state
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
<<<<<<< HEAD
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
=======
    try {
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
      // Check if there's already a linked plan - only allow ONE
      if (linkedSeatingPlans.length > 0) {
        // Silently unlink the existing plan first
        const existingPlanId = linkedSeatingPlans[0].id;
        await adminService.unlinkSeatingPlanFromSession(selectedSessionForSeating.id, existingPlanId);
      }

      await adminService.linkSeatingPlanToSession(selectedSessionForSeating.id, planId);
<<<<<<< HEAD
      showSuccess('Seating plan linked successfully');

      // Refresh lists once without toggling modal-level spinner (prevents visible blink)
      await fetchSessionSeatingPlans(selectedSessionForSeating.id, { showLoader: false });
    } catch (error) {
      showError(error.response?.data?.message || 'Failed to link seating plan');
    } finally {
      planActionInFlightRef.current = false;
=======
      addNotification('success', 'Seating plan linked successfully');
      
      // Update local state immediately
      const planToLink = availableSeatingPlans.find(p => p.id === planId);
      if (planToLink) {
        // Move any existing linked plans back to available
        if (linkedSeatingPlans.length > 0) {
          setAvailableSeatingPlans(prev => [...prev, ...linkedSeatingPlans, planToLink].filter(p => p.id !== planId));
        } else {
          setAvailableSeatingPlans(prev => prev.filter(p => p.id !== planId));
        }
        
        // Set the new plan as the only linked plan
        setLinkedSeatingPlans([planToLink]);
        
        // Update session's classrooms - replace with single plan
        setSessions(prevSessions => 
          prevSessions.map(session => 
            session.id === selectedSessionForSeating.id
              ? { 
                  ...session, 
                  classrooms: [{
                    name: planToLink.classroom_name,
                    seating_plan_id: planId,
                    total_seats: planToLink.total_seats || (planToLink.seats ? planToLink.seats.length : 0)
                  }]
                }
              : session
          )
        );
      }
      
      await fetchSessionSeatingPlans(selectedSessionForSeating.id);
      // Refresh session data to update button
      await fetchData();
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Failed to link seating plan');
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
    }
  };

  const handleUnlinkSeatingPlan = async (planId) => {
<<<<<<< HEAD
    if (planActionInFlightRef.current) return;

=======
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
    if (!window.confirm('Are you sure you want to unlink this seating plan?')) {
      return;
    }

    try {
<<<<<<< HEAD
      planActionInFlightRef.current = true;
      await adminService.unlinkSeatingPlanFromSession(selectedSessionForSeating.id, planId);
      showSuccess('Seating plan unlinked successfully');

      // Refresh lists once without toggling modal-level spinner (prevents visible blink)
      await fetchSessionSeatingPlans(selectedSessionForSeating.id, { showLoader: false });
    } catch (error) {
      showError(error.response?.data?.message || 'Failed to unlink seating plan');
    } finally {
      planActionInFlightRef.current = false;
=======
      await adminService.unlinkSeatingPlanFromSession(selectedSessionForSeating.id, planId);
      addNotification('success', 'Seating plan unlinked successfully');
      
      // Update local state immediately
      const planToUnlink = linkedSeatingPlans.find(p => p.id === planId);
      if (planToUnlink) {
        setAvailableSeatingPlans(prev => [...prev, planToUnlink]);
        setLinkedSeatingPlans(prev => prev.filter(p => p.id !== planId));
        
        // Update session's classrooms count
        setSessions(prevSessions => 
          prevSessions.map(session => 
            session.id === selectedSessionForSeating.id
              ? { 
                  ...session, 
                  classrooms: (session.classrooms || []).filter(c => c.seating_plan_id !== planId)
                }
              : session
          )
        );
      }
      
      await fetchSessionSeatingPlans(selectedSessionForSeating.id);
      // Refresh session data to update button
      await fetchData();
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Failed to unlink seating plan');
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
    }
  };

  const handleDelete = async (sessionId) => {
    if (!window.confirm('Are you sure you want to delete this exam session?')) {
      return;
    }

    try {
      await adminService.deleteExamSession(sessionId);
<<<<<<< HEAD
      showSuccess('Exam session deleted successfully');
      fetchData();
    } catch (error) {
      showError(error.response?.data?.message || 'Failed to delete session');
=======
      addNotification('success', 'Exam session deleted successfully');
      fetchData();
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Failed to delete session');
    }
  };

  const handleDeleteSeatingPlan = async (planId) => {
    if (!window.confirm('Are you sure you want to delete this seating plan?')) {
      return;
    }

    try {
      await adminService.deleteSessionSeatingPlan(selectedSessionForSeating.id, planId);
      addNotification('success', 'Seating plan deleted successfully');
      
      // Update local state immediately
      setLinkedSeatingPlans(prev => prev.filter(plan => plan.id !== planId));
      
      // Update the session's classrooms count in the sessions list
      setSessions(prevSessions => 
        prevSessions.map(session => 
          session.id === selectedSessionForSeating.id
            ? { 
                ...session, 
                classrooms: (session.classrooms || []).filter(c => c.seating_plan_id !== planId) 
              }
            : session
        )
      );
      
      // Refresh from server
      await fetchSessionSeatingPlans(selectedSessionForSeating.id);
      await fetchData();
    } catch (error) {
      addNotification('error', 'Failed to delete seating plan');
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
    }
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

<<<<<<< HEAD
=======
  const resetSeatingForm = () => {
    setSeatingFormData({
      classroom_name: '',
      total_seats: 5,
    });
    setSeats([]);
    setSelectedSeatId(null);
    setStudentName('');
    setRollNumber('');
  };

>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleCloseSeatingModal = () => {
    setShowSeatingModal(false);
<<<<<<< HEAD
=======
    resetSeatingForm();
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
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
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
<<<<<<< HEAD
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Exam Sessions</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Manage exam sessions and assign classrooms</p>
        </div>
        <Button variant="primary" className="w-full sm:w-auto" onClick={() => setShowModal(true)}>
=======
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Exam Sessions</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Manage exam sessions and assign classrooms</p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
          + Create Session
        </Button>
      </div>

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sessions.map((session) => (
          <Card key={session.id}>
            <Card.Header>
              <div className="flex justify-between items-start">
                <div>
                  <Card.Title>{session.name}</Card.Title>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {session.description}
                  </p>
                </div>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                  session.is_active 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                }`}>
                  {session.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </Card.Header>
            <Card.Content className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Teacher</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{getTeacherName(session.teacher_id)}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Classroom</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{session.classroom || 'Not assigned'}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Schedule</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {formatDateTime(session.start_time)} - {formatDateTime(session.end_time)}
                </p>
              </div>
              
<<<<<<< HEAD
              <div className="flex flex-col sm:flex-row gap-2 mt-4">
=======
              <div className="flex gap-2 mt-4">
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
                <Button 
                  variant="primary" 
                  onClick={() => handleOpenSeatingPlans(session)} 
                  className="flex-1"
                >
                  {session.classrooms?.length > 0 ? 'View Seating Plan' : 'Assign Seating Plan'}
                </Button>
                <Button variant="secondary" onClick={() => handleEdit(session)} className="flex-1">
                  Edit
                </Button>
                <Button 
                  variant="danger" 
                  onClick={() => handleDelete(session.id)}
                  className="flex-1"
                >
                  Delete
                </Button>
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>

      {sessions.length === 0 && (
        <Card>
          <Card.Content className="p-8 text-center text-gray-500 dark:text-gray-400">
            No exam sessions found. Create one to get started.
          </Card.Content>
        </Card>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
<<<<<<< HEAD
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 w-full max-w-2xl my-4 sm:my-8">
=======
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl my-8">
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              {editingSession ? 'Edit Exam Session' : 'Create New Exam Session'}
            </h2>
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
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
                <Button type="submit" variant="primary" className="flex-1">
                  {editingSession ? 'Update Session' : 'Create Session'}
                </Button>
                <Button type="button" variant="secondary" onClick={handleCloseModal} className="flex-1">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Seating Plans Modal */}
      {showSeatingModal && selectedSessionForSeating && (
<<<<<<< HEAD
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Seating Plans</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Session: {selectedSessionForSeating.name}</p>
              </div>
              <button
                onClick={handleCloseSeatingModal}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors text-lg"
              >
                ✕
              </button>
            </div>

            {/* Single scrollable body */}
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
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                        linkedSeatingPlans.length > 0
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {linkedSeatingPlans.length > 0 ? 'Active' : 'Not Assigned'}
                      </span>
                    </div>

                    {linkedSeatingPlans.length === 0 ? (
                      <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center">
                        <p className="text-sm text-gray-400 dark:text-gray-500">No plan assigned — select one below</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {linkedSeatingPlans.map((plan) => (
                          <div key={plan.id} className="flex items-center justify-between gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl px-4 py-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-white truncate">{plan.classroom_name || 'Unnamed'}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {plan.total_seats || (plan.seats ? plan.seats.length : 0)} seats
                                {plan.occupied_seats > 0 ? ` · ${plan.occupied_seats} student${plan.occupied_seats !== 1 ? 's' : ''} assigned` : ''}
                              </p>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <Button
                                variant="outline"
                                onClick={() => handleUnlinkSeatingPlan(plan.id)}
                                className="text-xs py-1 px-3"
                              >
                                Unlink
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <hr className="border-gray-200 dark:border-gray-700" />

                  {/* Available Plans */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Available Plans</h3>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{availableSeatingPlans.length} available</span>
                    </div>

                    {availableSeatingPlans.length === 0 ? (
                      <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center">
                        <p className="text-sm text-gray-400 dark:text-gray-500">No plans available — create them in the Seating Plans page</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {availableSeatingPlans.map((plan) => (
                          <div
                            key={plan.id}
                            className={`flex items-center justify-between gap-3 border rounded-xl px-4 py-3 transition-colors ${
                              plan.is_assigned_elsewhere
                                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
                                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
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
                              onClick={() => handleLinkSeatingPlan(plan.id)}
                              disabled={linkedSeatingPlans.length > 0 || plan.is_assigned_elsewhere}
                              title={
                                plan.is_assigned_elsewhere
                                  ? `Already assigned to ${plan.assigned_session_name || 'another exam session'}`
                                  : linkedSeatingPlans.length > 0
                                    ? 'Unlink the current plan first'
                                    : 'Link this plan to the session'
                              }
                              className="text-xs py-1 px-4 flex-shrink-0"
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

=======
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-4xl my-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Seating Plans</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Session: {selectedSessionForSeating.name}
                </p>
              </div>
              <Button variant="secondary" onClick={handleCloseSeatingModal}>
                Close
              </Button>
            </div>

            <Card>
                <Card.Header>
                  <Card.Title>Existing Seating Plans</Card.Title>
                </Card.Header>
                <Card.Content>
                  {seatingPlanLoading ? (
                    <div className="flex justify-center items-center h-32">
                      <LoadingSpinner />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Linked Plan (Single) */}
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Assigned Seating Plan</h3>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            linkedSeatingPlans.length > 0 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}>
                            {linkedSeatingPlans.length > 0 ? 'Active' : 'Not Assigned'}
                          </span>
                        </div>
                        {linkedSeatingPlans.length === 0 ? (
                          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">No seating plan assigned</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">Select one from available plans below</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {linkedSeatingPlans.map((plan) => (
                              <div key={plan.id} className="border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 rounded-lg p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="text-base font-semibold text-gray-900 dark:text-white">{plan.classroom_name || 'Unnamed'}</p>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                      {plan.total_seats || (plan.seats ? plan.seats.length : 0)} seats
                                    </p>
                                    {plan.occupied_seats && plan.occupied_seats > 0 && (
                                      <p className="text-sm text-green-700 dark:text-green-400 mt-2 font-medium">
                                        {plan.occupied_seats} student{plan.occupied_seats !== 1 ? 's' : ''} assigned
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex gap-2 whitespace-nowrap">
                                    <Button 
                                      variant="outline" 
                                      onClick={() => handleUnlinkSeatingPlan(plan.id)}
                                      className="text-xs py-1"
                                    >
                                      Unlink
                                    </Button>
                                    <Button 
                                      variant="danger" 
                                      onClick={() => handleDeleteSeatingPlan(plan.id)}
                                      className="text-xs py-1"
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Available Plans */}
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Available Plans</h3>
                          <span className="text-xs text-gray-500">
                            {availableSeatingPlans.length} available
                          </span>
                        </div>
                        {availableSeatingPlans.length === 0 ? (
                          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">No available plans</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">Create seating plans in the Seating Plans page</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {availableSeatingPlans.map((plan) => (
                              <div key={plan.id} className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg p-3 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <p className="font-medium text-gray-900 dark:text-white">{plan.classroom_name || 'Unnamed'}</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                      {plan.total_seats || (plan.seats ? plan.seats.length : 0)} seats
                                    </p>
                                    {plan.occupied_seats && plan.occupied_seats > 0 && (
                                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        {plan.occupied_seats} student{plan.occupied_seats !== 1 ? 's' : ''} assigned
                                      </p>
                                    )}
                                  </div>
                                  <Button 
                                    onClick={() => handleLinkSeatingPlan(plan.id)}
                                    className="whitespace-nowrap text-xs py-1"
                                    disabled={linkedSeatingPlans.length > 0}
                                    title={linkedSeatingPlans.length > 0 ? 'Unlink the current plan first' : 'Link this plan to the session'}
                                  >
                                    Link
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card.Content>
              </Card>
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminExamSessions;
