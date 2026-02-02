import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import adminService from '../../api/services/adminService';
import { useNotification } from '../../context/notification/NotificationContext';
import {
  renderSeatingGrid,
  renderSeatingEditor,
  assignStudentToSeat,
  clearStudentFromSeat,
  getSeatStudentData,
  generateSeats as generateEmptySeats,
} from '../../utils/seatingUtils';

function AdminSeatingPlans() {
  const [seatingPlans, setSeatingPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [showSeatingEditor, setShowSeatingEditor] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);
  const { addNotification } = useNotification();

  const [formData, setFormData] = useState({
    classroom_name: '',
    rows: 5,
    columns: 5,
  });

  const [seats, setSeats] = useState([]);
  const [selectedSeatKey, setSelectedSeatKey] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [rollNumber, setRollNumber] = useState('');

  useEffect(() => {
    fetchSeatingPlans();
  }, []);

  const fetchSeatingPlans = async () => {
    try {
      setLoading(true);
      const data = await adminService.getAllSeatingPlans();
      setSeatingPlans(data.plans);
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Failed to load seating plans');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'rows' || name === 'columns' ? parseInt(value) : value
    }));
  };

  const generateSeats = () => {
    if (editingPlan && seats.length > 0) {
      // In edit mode: preserve existing seat data and expand/shrink grid
      const newSeats = generateEmptySeats(formData.rows, formData.columns);
      
      // Copy over existing seat data
      const updatedSeats = newSeats.map(newSeat => {
        const existingSeat = seats.find(s => s.row === newSeat.row && s.column === newSeat.column);
        if (existingSeat) {
          return { ...existingSeat, id: newSeat.id };
        }
        return newSeat;
      });
      
      setSeats(updatedSeats);
      addNotification('success', 'Grid updated - existing seat data preserved');
    } else {
      // Create mode: generate fresh seats
      const newSeats = generateEmptySeats(formData.rows, formData.columns);
      setSeats(newSeats);
    }
    setShowSeatingEditor(true);
  };

  const toggleSeatAvailability = (row, column) => {
    setSeats(prev => prev.map(seat => 
      seat.row === row && seat.column === column 
        ? { ...seat, occupied: !seat.occupied }
        : seat
    ));
  };

  const handleSelectSeat = (row, column) => {
    const key = `${row}-${column}`;
    setSelectedSeatKey(key);
    const { student_name, roll_number } = getSeatStudentData(seats, row, column);
    setStudentName(student_name);
    setRollNumber(roll_number);
  };

  const handleToggleSelectedSeat = () => {
    if (!selectedSeatKey) {
      addNotification('error', 'Select a seat first');
      return;
    }
    const [rowStr, columnStr] = selectedSeatKey.split('-');
    toggleSeatAvailability(parseInt(rowStr, 10), parseInt(columnStr, 10));
  };

  const handleAssignSeat = () => {
    if (!selectedSeatKey) {
      addNotification('error', 'Select a seat to assign');
      return;
    }
    if (!studentName.trim() || !rollNumber.trim()) {
      addNotification('error', 'Student name and roll number are required');
      return;
    }

    const updatedSeats = assignStudentToSeat(seats, selectedSeatKey, studentName, rollNumber);
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
      
      setShowModal(false);
      setShowSeatingEditor(false);
      resetForm();
      fetchSeatingPlans();
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Operation failed');
    }
  };

  const handleEdit = (plan) => {
    setEditingPlan(plan);
    setFormData({
      classroom_name: plan.classroom_name,
      rows: plan.rows,
      columns: plan.columns,
    });
    setSeats(plan.seats || []);
    setShowSeatingEditor(true);
    setShowModal(true);
  };

  const handleView = (plan) => {
    setCurrentPlan(plan);
  };

  const handleDelete = async (planId) => {
    if (!window.confirm('Are you sure you want to delete this seating plan? It will be unlinked from any exam sessions.')) {
      return;
    }

    try {
      await adminService.deleteSeatingPlan(planId);
      addNotification('success', 'Seating plan deleted and unlinked from all sessions');
      fetchSeatingPlans();
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Failed to delete seating plan');
    }
  };

  const resetForm = () => {
    setFormData({
      classroom_name: '',
      rows: 5,
      columns: 5,
    });
    setSeats([]);
    setEditingPlan(null);
    setShowSeatingEditor(false);
    setSelectedSeatKey(null);
    setStudentName('');
    setRollNumber('');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Seating Plans</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Configure classroom seating arrangements</p>
        </div>
      </div>

      {/* Two Column Layout: Create (Left) + Existing (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN: Create Seating Plan Form */}
        <Card>
          <Card.Header>
            <div className="flex justify-between items-center">
              <Card.Title>{editingPlan ? 'Edit Seating Plan' : 'Create Seating Plan'}</Card.Title>
              {editingPlan && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setEditingPlan(null);
                    setFormData({ classroom_name: '', rows: 5, columns: 5 });
                    setSeats([]);
                    setShowSeatingEditor(false);
                    setSelectedSeatKey(null);
                    setStudentName('');
                    setRollNumber('');
                  }}
                >
                  Cancel Edit
                </Button>
              )}
            </div>
          </Card.Header>
          <Card.Content className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Classroom Name <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g., Room 101"
                name="classroom_name"
                value={formData.classroom_name}
                onChange={handleInputChange}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Rows <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min="1"
                  name="rows"
                  value={formData.rows}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Columns <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min="1"
                  name="columns"
                  value={formData.columns}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            {!showSeatingEditor ? (
              <Button onClick={generateSeats} className="w-full">
                Generate Seats
              </Button>
            ) : (
              <>
                {editingPlan && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs text-blue-900 dark:text-blue-300 mb-2">
                      <strong>Edit Mode:</strong> Change rows/columns above, then click below to update the grid.
                    </p>
                    <Button 
                      onClick={generateSeats}
                      variant="outline"
                      className="w-full text-sm"
                    >
                      Update Grid Size
                    </Button>
                  </div>
                )}
              </>
            )}
            
            {showSeatingEditor && (
              <>
                {/* Seating Grid */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Seating Layout</h3>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {formData.rows} × {formData.columns} = {formData.rows * formData.columns} seats
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                    Click a seat to assign student or toggle availability
                  </p>
                  {renderSeatingEditor(seats, formData.rows, formData.columns, selectedSeatKey, handleSelectSeat)}
                </div>

                {/* Seat Assignment Controls */}
                {selectedSeatKey && (
                  <div className="border-2 border-blue-300 dark:border-blue-700 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20 space-y-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                        Seat: {selectedSeatKey.split('-').map((n, i) => i === 0 ? String.fromCharCode(65 + parseInt(n)) : parseInt(n) + 1).join('')}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                        Student Name
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
                        Roll Number
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
                      <Button 
                        variant="outline"
                        onClick={handleToggleSelectedSeat}
                        className="flex-1 text-sm"
                      >
                        Toggle
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
          </Card.Content>
        </Card>

        {/* RIGHT COLUMN: Existing Seating Plans */}
        <Card>
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
                <div key={plan.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{plan.classroom_name}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {plan.rows} × {plan.columns} = {plan.total_seats || (plan.rows * plan.columns)} seats
                      </p>
                      {plan.occupied_seats && plan.occupied_seats > 0 && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          {plan.occupied_seats} students assigned
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button 
                        variant="outline"
                        onClick={() => handleView(plan)}
                        className="text-xs py-1 px-2"
                      >
                        View
                      </Button>
                      <Button 
                        variant="secondary"
                        onClick={() => handleEdit(plan)}
                        className="text-xs py-1 px-2"
                      >
                        Edit
                      </Button>
                      <Button 
                        variant="danger"
                        onClick={() => handleDelete(plan.id)}
                        className="text-xs py-1 px-2"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <Card.Header className="flex items-center justify-between">
              <Card.Title>{currentPlan.classroom_name}</Card.Title>
              <button
                onClick={handleCloseViewer}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none"
              >
                ×
              </button>
            </Card.Header>
            <Card.Content className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Rows</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{currentPlan.rows}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Columns</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{currentPlan.columns}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Seats</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {currentPlan.total_seats || (currentPlan.rows * currentPlan.columns)}
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
                          <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Seat</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Row</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Column</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Student Name</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Roll Number</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(currentPlan.seats || [])
                          .filter(s => s.student_name || s.studentName)
                          .sort((a, b) => {
                            if (a.row !== b.row) return a.row - b.row;
                            return a.column - b.column;
                          })
                          .map((seat, idx) => (
                            <tr 
                              key={idx}
                              className="border-b border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            >
                              <td className="px-4 py-2 font-semibold text-gray-900 dark:text-white">
                                {String.fromCharCode(65 + seat.row)}{seat.column + 1}
                              </td>
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{seat.row + 1}</td>
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{seat.column + 1}</td>
                              <td className="px-4 py-2 text-gray-900 dark:text-white">{seat.student_name || seat.studentName}</td>
                              <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{seat.roll_number || seat.rollNumber}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                      No students assigned yet
                    </div>
                  )}
                </div>
              </div>

              <Button onClick={handleCloseViewer} className="w-full">
                Close
              </Button>
            </Card.Content>
          </Card>
        </div>
      )}
    </div>
  );
}

export default AdminSeatingPlans;
