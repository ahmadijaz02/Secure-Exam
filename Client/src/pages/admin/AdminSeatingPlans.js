import React, { useState, useEffect, useCallback } from 'react';

import Card from '../../components/ui/Card';

import Button from '../../components/ui/Button';

import Input from '../../components/ui/Input';

import LoadingSpinner from '../../components/ui/LoadingSpinner';

import ConfirmationModal from '../../components/ui/ConfirmationModal';

import adminService from '../../api/services/adminService';

import { useNotification } from '../../context/notification/NotificationContext';

import ImageSeatMarker from '../../components/seating/ImageSeatMarker';

import ImageSeatViewer from '../../components/seating/ImageSeatViewer';

import StudentAssignmentModal from '../../components/seating/StudentAssignmentModal';

import {

  renderSeatingGrid,

  renderSeatingEditor,

  assignStudentToSeat,

  clearStudentFromSeat,

  generateSeats as generateEmptySeats,

} from '../../utils/seatingUtils';



function AdminSeatingPlans() {

  const [seatingPlans, setSeatingPlans] = useState([]);

  const [loading, setLoading] = useState(true);

  const [editingPlan, setEditingPlan] = useState(null);

  const [showSeatingEditor, setShowSeatingEditor] = useState(false);

  const [currentPlan, setCurrentPlan] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    action: null, // 'delete', 'duplicate'
    targetId: null,
    isLoading: false
  });
  const { addNotification } = useNotification();



  // Image-based seating plan state

  const [useImageMode, setUseImageMode] = useState(false);



  const [formData, setFormData] = useState({

    classroom_name: '',

    room_number: '',

    total_seats: 1,

  });



  const [seats, setSeats] = useState([]);
  const [selectedSeatKey, setSelectedSeatKey] = useState(null);
  const [seatNumber, setSeatNumber] = useState('');
  const [studentName, setStudentName] = useState('');
  const [rollNumber, setRollNumber] = useState('');

  // New image-based seating modal state
  const [showStudentAssignmentModal, setShowStudentAssignmentModal] = useState(false);
  const [selectedPlanForAssignment, setSelectedPlanForAssignment] = useState(null);
  const [showImageMarkerModal, setShowImageMarkerModal] = useState(false);
  const [selectedPlanForMarking, setSelectedPlanForMarking] = useState(null);
  const [creatingImagePlan, setCreatingImagePlan] = useState(false);

  const fetchSeatingPlans = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminService.getAllSeatingPlans();
      setSeatingPlans(data.plans);
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Failed to load seating plans');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    fetchSeatingPlans();
  }, [fetchSeatingPlans]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      if (name === 'total_seats') {
        const numValue = parseInt(value) || 0;
        // Ensure minimum value of 1 for seat count
        const validValue = Math.max(1, numValue);
        return {
          ...prev,
          [name]: validValue
        };
      }
      return {
        ...prev,
        [name]: value
      };
    });
  };

  // ============ IMAGE MODE HANDLERS ============

  const resetImageMode = () => {
    setUseImageMode(false);
    setFormData({ classroom_name: '', room_number: '', total_seats: 1 });
  };

  const handleStartImageWorkflow = async () => {
    try {
      if (!formData.classroom_name.trim()) {
        addNotification('error', 'Please enter room number');
        return;
      }

      setCreatingImagePlan(true);

      const response = await adminService.createSeatingPlan({
        classroom_name: formData.classroom_name.trim(),
        room_number: formData.room_number?.trim() || undefined,
        total_seats: 1,
        seats: [],
        is_image_based: true,
      });

      const newPlan = response?.plan;
      if (!newPlan?.id) {
        addNotification('error', 'Failed to create seating plan');
        return;
      }

      await fetchSeatingPlans();
      setSelectedPlanForMarking(newPlan);
      setShowImageMarkerModal(true);
      setUseImageMode(false);
      setFormData({ classroom_name: '', room_number: '', total_seats: 1 });
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Failed to start image seating workflow');
    } finally {
      setCreatingImagePlan(false);
    }
  };

  // ============ TRADITIONAL MODE HANDLERS ============

  const generateSeats = () => {
    if (editingPlan && seats.length > 0) {
      // In edit mode: preserve existing seat data and expand/shrink count
      const newSeats = generateEmptySeats(formData.total_seats);
      
      // Copy over existing seat data if seats with matching seat_number exist
      const updatedSeats = newSeats.map(newSeat => {
        const existingSeat = seats.find(s => s.seat_number === newSeat.seat_number);
        if (existingSeat) {
          return { ...existingSeat, id: newSeat.id };
        }
        return newSeat;
      });
      
      setSeats(updatedSeats);
      addNotification('success', 'Seating layout updated');
    } else {
      // Create mode: generate fresh seats
      const newSeats = generateEmptySeats(formData.total_seats);
      setSeats(newSeats);
    }
    setShowSeatingEditor(true);
  };
  const handleSelectSeat = (seatNum) => {
    const seat = seats.find(s => String(s.seat_number) === String(seatNum));
    setSelectedSeatKey(seatNum);
    if (seat) {
      setSeatNumber(seat.seat_number || '');
      setStudentName(seat.student_name || seat.studentName || '');
      setRollNumber(seat.roll_number || seat.rollNumber || '');
    } else {
      setSeatNumber(seatNum);
      setStudentName('');
      setRollNumber('');
    }
  };

  const handleAssignSeat = () => {
    if (!selectedSeatKey) {
      addNotification('error', 'Select a seat to assign');
      return;
    }
    const seatNumberStr = String(seatNumber).trim();
    if (!seatNumberStr || !studentName.trim() || !rollNumber.trim()) {
      addNotification('error', 'Seat Number, Student Name, and Roll Number are required');
      return;
    }

    const updatedSeats = assignStudentToSeat(seats, selectedSeatKey, seatNumberStr, studentName, rollNumber);
    setSeats(updatedSeats);
    addNotification('success', 'Student assigned successfully');
  };

  const handleClearSeat = () => {
    if (!selectedSeatKey) {
      addNotification('error', 'Select a seat to clear');
      return;
    }

    const updatedSeats = clearStudentFromSeat(seats, selectedSeatKey);
    setSeats(updatedSeats);
    setStudentName('');
    setRollNumber('');
    addNotification('success', 'Seat cleared successfully');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!showSeatingEditor) {
      generateSeats();
      return;
    }

    try {
      const planData = {
        ...formData,
        seats: seats,
      };

      if (editingPlan) {
        await adminService.updateSeatingPlan(editingPlan.id, planData);
        addNotification('success', 'Seating plan updated successfully');
      } else {
        await adminService.createSeatingPlan(planData);
        addNotification('success', 'Seating plan created successfully');
      }

      setShowSeatingEditor(false);
      resetForm();
      fetchSeatingPlans();
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Operation failed');
    }
  };

  const handleEdit = (plan) => {
    setUseImageMode(false);
    setEditingPlan(plan);
    setFormData({
      classroom_name: plan.classroom_name,
      total_seats: plan.total_seats || (plan.seats ? plan.seats.length : 5),
    });
    setSeats(plan.seats || []);
    setShowSeatingEditor(true);
  };
  const handleView = (plan) => {
    setCurrentPlan(plan);
  };

  const handleDelete = (planId) => {
    setConfirmDialog({
      isOpen: true,
      action: 'delete',
      targetId: planId,
      isLoading: false
    });
  };

  const handleDuplicate = (planId) => {
    setConfirmDialog({
      isOpen: true,
      action: 'duplicate',
      targetId: planId,
      isLoading: false
    });
  };

  const handleConfirmAction = async () => {
    const { action, targetId } = confirmDialog;
    
    setConfirmDialog(prev => ({ ...prev, isLoading: true }));
    
    try {
      if (action === 'delete') {
        await adminService.deleteSeatingPlan(targetId);
        addNotification('success', 'Seating plan deleted and unlinked from all sessions');
      } else if (action === 'duplicate') {
        await adminService.duplicateSeatingPlan(targetId);
        addNotification('success', 'Seating plan duplicated successfully');
      }
      
      fetchSeatingPlans();
      setConfirmDialog({ isOpen: false, action: null, targetId: null, isLoading: false });
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Operation failed');
      setConfirmDialog(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleCancelAction = () => {
    setConfirmDialog({ isOpen: false, action: null, targetId: null, isLoading: false });
  };

  const resetForm = () => {
    setFormData({
      classroom_name: '',
      total_seats: 1,
    });
    setSeats([]);
    setEditingPlan(null);
    setShowSeatingEditor(false);
    setSelectedSeatKey(null);
    setSeatNumber('');
    setStudentName('');
    setRollNumber('');
  };

  const handleCloseViewer = () => {
    setCurrentPlan(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center animate-fade-in-up">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Seating Plans</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-500 dark:text-gray-400">Configure classroom seating arrangements</p>
        </div>
      </div>

      {/* Two Column Layout: Create (Left) + Existing (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* LEFT COLUMN: Create Seating Plan Form */}
        <Card glass hover={false} animate>
          <Card.Header>
            <div className="flex justify-between items-center">
              <Card.Title>
                {editingPlan ? 'Edit Seating Plan' : useImageMode ? 'Create from Image' : 'Create Seating Plan'}
              </Card.Title>
              {(editingPlan || useImageMode) && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    if (useImageMode) {
                      resetImageMode();
                    } else {
                      setEditingPlan(null);
                      setFormData({ classroom_name: '', total_seats: 5 });
                      setSeats([]);
                      setShowSeatingEditor(false);
                      setSelectedSeatKey(null);
                      setSeatNumber('');
                      setStudentName('');
                      setRollNumber('');
                    }
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </Card.Header>
          <Card.Content className="space-y-4">
            {!useImageMode && !editingPlan && (
              <div className="bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-200/60 dark:border-indigo-800/40 rounded-xl p-3 mb-4">
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setUseImageMode(true)}
                    variant="outline"
                    className="flex-1 text-sm"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    Create from Image
                  </Button>
                  <Button 
                    onClick={() => setShowSeatingEditor(false)}
                    variant="gradient-primary"
                    className="flex-1 text-sm"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    Manual Entry
                  </Button>
                </div>
              </div>
            )}

            {useImageMode ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Room Number <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g., 101"
                    name="classroom_name"
                    value={formData.classroom_name}
                    onChange={handleInputChange}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Building/Location <span className="text-gray-500">(Optional)</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g., Building A, Floor 2"
                    name="room_number"
                    value={formData.room_number}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="rounded-xl border border-indigo-200/60 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-900/20 p-4">
                  <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
                    Next step will open the guided flow:
                  </p>
                  <ul className="mt-2 text-sm text-indigo-800 dark:text-indigo-300 list-disc list-inside space-y-1">
                    <li>Upload classroom image</li>
                    <li>Mark seat positions and save</li>
                    <li>Assign students manually or by CSV</li>
                  </ul>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleStartImageWorkflow}
                    disabled={!formData.classroom_name.trim() || creatingImagePlan}
                    className="flex-1"
                  >
                    {creatingImagePlan ? <LoadingSpinner size="small" /> : 'Continue to Image Seat Marker'}
                  </Button>
                  <Button variant="outline" onClick={resetImageMode} className="flex-1">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Room Number <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g., 101"
                    name="classroom_name"
                    value={formData.classroom_name}
                    onChange={handleInputChange}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Building/Location <span className="text-gray-500">(Optional)</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g., Building A, Floor 2"
                    name="room_number"
                    value={formData.room_number}
                    onChange={handleInputChange}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Number of Seats <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    name="total_seats"
                    value={formData.total_seats}
                    onChange={handleInputChange}
                    onBlur={(e) => {
                      if (parseInt(e.target.value) < 1) {
                        setFormData(prev => ({ ...prev, total_seats: 1 }));
                      }
                    }}
                  />
                </div>

                {!showSeatingEditor ? (
                  <Button onClick={generateSeats} className="w-full">
                    Generate Seats
                  </Button>
                ) : (
                  <>
                    {editingPlan && (
                      <div className="bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-200/60 dark:border-indigo-800/40 rounded-xl p-3">
                        <p className="text-xs text-indigo-900 dark:text-indigo-300 mb-2">
                          <strong>Edit Mode:</strong> Change the number of seats above, then click below to update the layout.
                        </p>
                        <Button 
                          onClick={generateSeats}
                          variant="outline"
                          className="w-full text-sm"
                        >
                          Update Seat Count
                        </Button>
                      </div>
                    )}
                  </>
                )}
                
                {showSeatingEditor && (
                  <>
                    <div className="border border-gray-200/60 dark:border-gray-700/40 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-800/30">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Seating Layout</h3>
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                          {formData.total_seats} seats
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        Click a seat to assign student details
                      </p>
                      {renderSeatingEditor(seats, selectedSeatKey, handleSelectSeat)}
                    </div>

                    {selectedSeatKey && (
                      <div className="border-2 border-indigo-300/60 dark:border-indigo-700/40 rounded-xl p-4 bg-indigo-50/50 dark:bg-indigo-900/20 space-y-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-indigo-900 dark:text-indigo-300">
                            Seat: {selectedSeatKey}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                            Seat Number <span className="text-red-500">*</span>
                          </label>
                          <Input
                            type="text"
                            placeholder="e.g., 1"
                            value={seatNumber}
                            onChange={(e) => setSeatNumber(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                            Student Name <span className="text-red-500">*</span>
                          </label>
                          <Input
                            type="text"
                            placeholder="e.g., Ahmed Ali"
                            value={studentName}
                            onChange={(e) => setStudentName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                            Roll Number <span className="text-red-500">*</span>
                          </label>
                          <Input
                            type="text"
                            placeholder="e.g., CS-101"
                            value={rollNumber}
                            onChange={(e) => setRollNumber(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            onClick={handleAssignSeat}
                            className="flex-1 text-sm"
                          >
                            Assign
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={handleClearSeat}
                            className="flex-1 text-sm"
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button 
                        onClick={handleSubmit}
                        className="flex-1"
                      >
                        {editingPlan ? 'Update Plan' : 'Save Plan'}
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setShowSeatingEditor(false);
                          resetForm();
                        }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </Card.Content>
        </Card>

        {/* RIGHT COLUMN: Existing Seating Plans */}
        <Card glass hover={false} animate>
          <Card.Header>
            <Card.Title>Seating Plans Library</Card.Title>
          </Card.Header>
          <Card.Content className="space-y-3 max-h-[600px] overflow-y-auto">
            {seatingPlans.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                No seating plans yet. Create one on the left.
              </p>
            ) : (
              seatingPlans.map((plan) => (
                <div key={plan.id} className="border border-gray-200/60 dark:border-gray-700/40 rounded-xl p-3.5 hover:bg-white/60 dark:hover:bg-gray-800/40 transition-all duration-200 hover:shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                  <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white">{plan.classroom_name}</p>
                      {plan.room_number && (
                        <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5 font-semibold flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                          {plan.room_number}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {plan.total_seats || (plan.seats ? plan.seats.length : 0)} seats
                      </p>
                      {plan.occupied_seats && plan.occupied_seats > 0 && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                          {plan.occupied_seats} students assigned
                        </p>
                      )}
                      {plan.image_path && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                          Image-based plan
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
                      <Button 
                        variant="outline"
                        onClick={() => handleView(plan)}
                        className="text-xs py-1 px-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200"
                        title="View plan details"
                      >
                        View
                      </Button>
                      <Button 
                        variant="gradient-success"
                        onClick={() => handleDuplicate(plan.id)}
                        className="text-xs py-1 px-2"
                        title="Create a fresh copy of this plan for a new exam"
                      >
                        Duplicate
                      </Button>
                      {plan.image_path && (
                        <>
                          <Button 
                            variant="secondary"
                            onClick={() => {
                              setSelectedPlanForMarking(plan);
                              setShowImageMarkerModal(true);
                            }}
                            className="text-xs py-1 px-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                            title="Edit marked seat positions"
                          >
                            Seats
                          </Button>
                        </>
                      )}
                      <Button 
                        variant="secondary"
                        onClick={() => handleEdit(plan)}
                        className="text-xs py-1 px-2 bg-amber-500 hover:bg-amber-600 text-white"
                      >
                        Edit
                      </Button>
                      <Button 
                        variant="danger"
                        onClick={() => handleDelete(plan.id)}
                        className="text-xs py-1 px-2 bg-red-600 hover:bg-red-700 text-white"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </Card.Content>
        </Card>

      </div>

      {/* View Modal */}
      {currentPlan && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
          <Card glass hover={false} className="w-full max-w-4xl max-h-[90vh] overflow-y-auto my-4 !rounded-2xl">
            <Card.Header className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900 flex items-center justify-center text-blue-700 dark:text-blue-200 font-bold text-lg">
                  {currentPlan.room_number || (() => { const m = (currentPlan.classroom_name||'').match(/\d+/); return m ? m[0] : (currentPlan.classroom_name ? currentPlan.classroom_name.charAt(0) : '#'); })()}
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">{currentPlan.classroom_name || 'Room'}</div>
                  {currentPlan.room_number && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">{currentPlan.room_number}</div>
                  )}
                  {currentPlan.image_path && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Image-based plan</div>
                  )}
                </div>
              </div>
              <button
                onClick={handleCloseViewer}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </Card.Header>
            <Card.Content className="space-y-4">
              {currentPlan.image_path ? (
                <ImageSeatViewer
                  plan={currentPlan}
                  onEdit={() => {
                    setSelectedPlanForMarking(currentPlan);
                    setShowImageMarkerModal(true);
                    setCurrentPlan(null);
                  }}
                  onClose={handleCloseViewer}
                />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Total Seats</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {currentPlan.total_seats || (currentPlan.seats ? currentPlan.seats.length : 0)}
                      </p>
                    </div>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Seating Arrangement</h3>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      {renderSeatingGrid(currentPlan)}
                    </div>
                  </div>

                  {/* Student Details Table */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 dark:bg-gray-800 p-3 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Assigned Students ({(currentPlan.seats || []).filter(s => s.student_name || s.studentName).length})
                      </h3>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {(currentPlan.seats || []).filter(s => s.student_name || s.studentName).length > 0 ? (
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800">
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                              <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Seat Number</th>
                              <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Student Name</th>
                              <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Roll Number</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(currentPlan.seats || [])
                              .filter(s => s.student_name || s.studentName)
                              .sort((a, b) => {
                                const aNo = a.seat_number ? parseInt(a.seat_number, 10) : Number.MAX_SAFE_INTEGER;
                                const bNo = b.seat_number ? parseInt(b.seat_number, 10) : Number.MAX_SAFE_INTEGER;
                                return aNo - bNo;
                              })
                              .map((seat, idx) => {
                                const seatLabel = seat.seat_number || `Seat ${idx + 1}`;

                                return (
                                  <tr 
                                    key={idx}
                                    className="border-b border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                  >
                                    <td className="px-4 py-2 font-semibold text-gray-900 dark:text-white">{seatLabel}</td>
                                    <td className="px-4 py-2 text-gray-900 dark:text-white">{seat.student_name || seat.studentName}</td>
                                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{seat.roll_number || seat.rollNumber}</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                          No students assigned yet
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <Button onClick={handleCloseViewer} className="w-full">
                      Close
                    </Button>
                  </div>
                </>
              )}
            </Card.Content>
          </Card>
        </div>
      )}
      {/* Image Seat Marker Modal */}
      {showImageMarkerModal && selectedPlanForMarking && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-start sm:items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-slate-700/40 shadow-2xl w-full max-w-5xl my-4 sm:my-8 overflow-hidden">
            <div className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/40 p-3 sm:p-4 flex justify-between items-center z-10">
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                {selectedPlanForMarking.image_path ? 'Edit' : 'Create'} Seating Plan: {selectedPlanForMarking.classroom_name}
              </h2>
              <button
                onClick={() => setShowImageMarkerModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-3 sm:p-6 max-h-[calc(100vh-180px)] overflow-y-auto hide-scrollbar">
              <ImageSeatMarker
                planId={selectedPlanForMarking.id}
                plan={selectedPlanForMarking}
                onSeatsMarked={(updatedPlan) => {
                  if (updatedPlan?.id) {
                    setSeatingPlans((prevPlans) =>
                      prevPlans.map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan))
                    );
                    setSelectedPlanForMarking(updatedPlan);
                  }
                }}
                onNext={() => {
                  setShowImageMarkerModal(false);
                  setSelectedPlanForAssignment(selectedPlanForMarking);
                  setShowStudentAssignmentModal(true);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Student Assignment Modal */}
      <StudentAssignmentModal
        planId={selectedPlanForAssignment?.id}
        plan={selectedPlanForAssignment}
        isOpen={showStudentAssignmentModal}
        onClose={() => setShowStudentAssignmentModal(false)}
        onAssignmentComplete={(updatedPlan) => {
          if (updatedPlan?.id) {
            setSeatingPlans((prevPlans) =>
              prevPlans.map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan))
            );
            setSelectedPlanForAssignment(updatedPlan);
            if (selectedPlanForMarking?.id === updatedPlan.id) {
              setSelectedPlanForMarking(updatedPlan);
            }
          }
        }}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmDialog.isOpen}
        title={
          confirmDialog.action === 'delete' 
            ? 'Delete Seating Plan' 
            : 'Duplicate Seating Plan'
        }
        message={
          confirmDialog.action === 'delete'
            ? 'This will permanently delete the seating plan and unlink it from any exam sessions. This action cannot be undone.'
            : 'This will create a pristine copy with your drawn boxes but no students. Continue?'
        }
        confirmText={confirmDialog.action === 'delete' ? 'Delete' : 'Duplicate'}
        cancelText="Cancel"
        onConfirm={handleConfirmAction}
        onCancel={handleCancelAction}
        isDangerous={confirmDialog.action === 'delete'}
        isLoading={confirmDialog.isLoading}
      />
    </div>
  );
}

export default AdminSeatingPlans;
