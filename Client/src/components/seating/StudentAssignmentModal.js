import React, { useState, useEffect, useCallback } from 'react';

import Button from '../ui/Button';

import Input from '../ui/Input';

import LoadingSpinner from '../ui/LoadingSpinner';

import { useNotification } from '../../context/notification/NotificationContext';

import adminService from '../../api/services/adminService';



function StudentAssignmentModal({ planId, plan, isOpen, onClose, onAssignmentComplete }) {

  const [activeTab, setActiveTab] = useState('manual'); // 'manual' or 'csv'

  const [manualAssignment, setManualAssignment] = useState({

    seat_number: '',

    student_name: '',

    roll_number: ''

  });

  const [csvFile, setCSVFile] = useState(null);

  const [loading, setLoading] = useState(false);

  const { addNotification } = useNotification();



  const toSeatValue = useCallback((seat) => seat?.seat_number != null ? String(seat.seat_number) : '', []);



  const getSortedEmptySeatValues = useCallback((planData) => {

    if (!planData?.seats || !Array.isArray(planData.seats)) return [];



    const emptySeats = planData.seats

      .filter((seat) => {

        const hasStudent = Boolean((seat.student_name || seat.studentName || '').trim());

        return !hasStudent;

      })

      .map((seat) => toSeatValue(seat))

      .filter(Boolean);



    return emptySeats.sort((a, b) => {

      const aNum = Number(a);

      const bNum = Number(b);

      const aIsNum = !Number.isNaN(aNum);

      const bIsNum = !Number.isNaN(bNum);



      if (aIsNum && bIsNum) return aNum - bNum;

      if (aIsNum) return -1;

      if (bIsNum) return 1;

      return a.localeCompare(b);

    });

  }, [toSeatValue]);



  const getNextEmptySeatValue = useCallback((planData, currentSeatValue) => {

    const emptySeatValues = getSortedEmptySeatValues(planData);

    if (emptySeatValues.length === 0) return '';



    if (!currentSeatValue) return emptySeatValues[0];



    const currentIndex = emptySeatValues.findIndex((value) => value === String(currentSeatValue));

    if (currentIndex === -1) return emptySeatValues[0];



    const nextIndex = (currentIndex + 1) % emptySeatValues.length;

    return emptySeatValues[nextIndex];

  }, [getSortedEmptySeatValues]);



  useEffect(() => {

    if (!isOpen) {

      setActiveTab('manual');

      setManualAssignment({ seat_number: '', student_name: '', roll_number: '' });

      setCSVFile(null);

      setLoading(false);

    }

  }, [isOpen]);



  useEffect(() => {

    if (!isOpen || activeTab !== 'manual') return;



    setManualAssignment((prev) => {

      if (prev.seat_number) return prev;

      const firstEmptySeat = getNextEmptySeatValue(plan, '');

      return {

        ...prev,

        seat_number: firstEmptySeat

      };

    });

  }, [isOpen, activeTab, plan, getNextEmptySeatValue]);



  const saveCurrentManualAssignment = async () => {

    const seatNumberValue = String(manualAssignment.seat_number || '').trim();

    const studentNameValue = manualAssignment.student_name.trim();

    const rollNumberValue = manualAssignment.roll_number.trim();



    const hasAnyValue = Boolean(seatNumberValue || studentNameValue || rollNumberValue);

    const hasAllValues = Boolean(seatNumberValue && studentNameValue && rollNumberValue);



    if (!hasAnyValue) {

      return { status: 'empty', response: null };

    }



    if (!hasAllValues) {

      addNotification('error', 'Seat number, student name, and roll number are required to save');

      return { status: 'blocked', response: null };

    }



    const seatNum = parseInt(seatNumberValue, 10);

    const response = await adminService.assignStudentToSeat(planId, {

      seat_number: seatNum,

      student_name: studentNameValue,

      roll_number: rollNumberValue

    });



    addNotification('success', response.message);



    if (onAssignmentComplete) {

      onAssignmentComplete(response.plan);

    }



    return { status: 'saved', response };

  };



  const handleNextSeat = async () => {

    try {

      setLoading(true);



      const saveResult = await saveCurrentManualAssignment();

      if (saveResult.status === 'blocked') {

        return;

      }



      const sourcePlan = saveResult.response?.plan || plan;

      const currentSeat = String(manualAssignment.seat_number || '');

      const nextSeat = getNextEmptySeatValue(sourcePlan, currentSeat);



      if (!nextSeat) {

        setManualAssignment({ seat_number: '', student_name: '', roll_number: '' });

        addNotification('info', 'All seats are assigned');

        return;

      }



      setManualAssignment({

        seat_number: nextSeat,

        student_name: '',

        roll_number: ''

      });

    } catch (error) {

      addNotification('error', error.response?.data?.message || 'Failed to save and move to next seat');

    } finally {

      setLoading(false);

    }

  };



  const handleManualAssign = async () => {

    try {

      setLoading(true);

      const saveResult = await saveCurrentManualAssignment();

      if (saveResult.status === 'blocked') {

        return;

      }

      onClose();

    } catch (error) {

      addNotification('error', error.response?.data?.message || 'Failed to finalize assignment');

    } finally {

      setLoading(false);

    }

  };



  const handleCSVUpload = async () => {

    if (!csvFile) {

      addNotification('error', 'Please select a CSV file');

      return;

    }



    try {

      setLoading(true);

      const response = await adminService.assignStudentsFromCSV(planId, csvFile);



      addNotification('success', response.message);

      addNotification('success', 'Seating plan updated successfully');

      

      if (response.summary?.failed_seats?.length > 0) {

        addNotification(

          'warning',

          `Assigned ${response.summary.assignments_made} students. Failed seats: ${response.summary.failed_seats.join(', ')}`

        );

      } else {

        addNotification('success', `Successfully assigned ${response.summary?.assignments_made} students`);

      }



      setCSVFile(null);

      

      if (onAssignmentComplete) {

        onAssignmentComplete(response.plan);

      }



      onClose();

    } catch (error) {

      addNotification('error', error.response?.data?.message || 'Failed to upload CSV');

    } finally {

      setLoading(false);

    }

  };



  const handleExportCSV = async () => {

    try {

      const csvContent = await adminService.exportStudentAssignments(planId);

      

      // Create blob and download

      const element = document.createElement('a');

      element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));

      element.setAttribute('download', `seating_plan_${planId}.csv`);

      element.style.display = 'none';

      document.body.appendChild(element);

      element.click();

      document.body.removeChild(element);

      

      addNotification('success', 'Seating plan exported as CSV');

    } catch (error) {

      addNotification('error', 'Failed to export CSV');

    }

  };



  if (!isOpen) return null;



  return (

    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto hide-scrollbar">

      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-slate-700/40 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto hide-scrollbar my-4">

        <div className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-gray-200/60 dark:border-slate-700/40 p-4 sm:p-6 flex justify-between items-center z-10">

          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white">Assign Students to Seats</h2>

          <button

            onClick={onClose}

            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all"

          >

            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>

          </button>

        </div>



        <div className="p-6 space-y-6">

          {/* Plan Info */}

          <div className="bg-indigo-50/80 dark:bg-indigo-900/20 border border-indigo-200/80 dark:border-indigo-800/60 rounded-xl p-4">

                <p className="text-sm text-gray-700 dark:text-gray-300">

              <strong>Seating Plan:</strong> {plan?.classroom_name} 

              {' | '}

              <strong>Total Seats:</strong> {plan?.total_seats}

              {' | '}

              <strong>Occupied:</strong> {plan?.occupied_seats || 0}

            </p>

          </div>



          {/* Tabs */}

          <div className="flex border-b border-gray-200/70 dark:border-slate-700/60 space-x-4">

            <button

              onClick={() => setActiveTab('manual')}

              className={`px-4 py-2 font-medium border-b-2 transition-colors ${

                activeTab === 'manual'

                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'

                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'

              }`}

            >

              Manual Assignment

            </button>

            <button

              onClick={() => setActiveTab('csv')}

              className={`px-4 py-2 font-medium border-b-2 transition-colors ${

                activeTab === 'csv'

                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'

                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'

              }`}

            >

              CSV Upload

            </button>

          </div>



          {/* Manual Assignment Tab */}

          {activeTab === 'manual' && (

            <div className="space-y-4">

              <div className="p-4 bg-gray-50/80 dark:bg-slate-800/70 rounded-xl text-sm text-gray-600 dark:text-gray-300 border border-gray-200/60 dark:border-slate-700/50">

                Select a seat number and enter student details to assign manually.

              </div>



              <div className="space-y-3">

                <div>

                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">

                    Seat Number

                  </label>

                  <select

                    value={manualAssignment.seat_number}

                    onChange={(e) =>

                      setManualAssignment({ ...manualAssignment, seat_number: e.target.value })

                    }

                    className="premium-select w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-slate-800 dark:text-white"

                  >

                    <option value="">Select Seat</option>

                    {plan?.seats?.map((seat) => (

                      <option key={seat.seat_number} value={seat.seat_number}>

                        Seat {seat.seat_number}

                        {seat.student_name ? ` (${seat.student_name})` : ' (Empty)'}

                      </option>

                    ))}

                  </select>

                </div>



                <div>

                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">

                    Student Name

                  </label>

                  <Input

                    type="text"

                    value={manualAssignment.student_name}

                    onChange={(e) =>

                      setManualAssignment({ ...manualAssignment, student_name: e.target.value })

                    }

                    placeholder="Enter student name"

                  />

                </div>



                <div>

                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">

                    Roll Number

                  </label>

                  <Input

                    type="text"

                    value={manualAssignment.roll_number}

                    onChange={(e) =>

                      setManualAssignment({ ...manualAssignment, roll_number: e.target.value })

                    }

                    placeholder="Enter roll number"

                  />

                </div>



                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                  <Button

                    onClick={handleManualAssign}

                    disabled={loading}

                    variant="gradient-primary"
                    className="w-full"

                  >

                    {loading ? <LoadingSpinner size="small" /> : 'Assign & Finish'}

                  </Button>

                  <Button

                    onClick={handleNextSeat}

                    disabled={loading}

                    variant="secondary"

                    className="w-full"

                  >

                    Next Empty Seat

                  </Button>

                </div>

              </div>

            </div>

          )}



          {/* CSV Upload Tab */}

          {activeTab === 'csv' && (

            <div className="space-y-4">

              <div className="p-4 bg-indigo-50/80 dark:bg-indigo-900/20 border border-indigo-200/80 dark:border-indigo-800/60 rounded-xl">

                <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-2">CSV Format Required:</p>

                <code className="text-xs text-indigo-800 dark:text-indigo-200 block bg-white dark:bg-slate-800 p-3 rounded-xl border border-indigo-200 dark:border-indigo-700/70 overflow-x-auto hide-scrollbar">

                  seat_number,student_name,roll_number<br/>

                  1,Ahmad Ijaz,22F-3643<br/>

                  2,Umar Raza,22F-3625

                </code>

              </div>



              <div className="flex items-center justify-center w-full">

                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-indigo-300 dark:border-indigo-700/60 rounded-xl cursor-pointer bg-indigo-50/60 dark:bg-indigo-900/20 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/30 transition-colors">

                  <div className="flex flex-col items-center justify-center pt-5 pb-6">

                    <svg

                      className="w-8 h-8 mb-2 text-indigo-500 dark:text-indigo-400"

                      fill="none"

                      stroke="currentColor"

                      viewBox="0 0 24 24"

                    >

                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />

                    </svg>

                    <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">

                      {csvFile ? csvFile.name : 'Click to upload CSV file'}

                    </p>

                  </div>

                  <input

                    type="file"

                    accept=".csv"

                    onChange={(e) => setCSVFile(e.target.files?.[0] || null)}

                    className="hidden"

                  />

                </label>

              </div>



              {csvFile && (

                <Button

                  onClick={handleCSVUpload}

                  disabled={loading}

                  variant="gradient-primary"

                  className="w-full"

                >

                  {loading ? <LoadingSpinner size="small" /> : 'Upload and Assign'}

                </Button>

              )}



              <Button

                onClick={handleExportCSV}

                variant="outline"

                className="w-full"

              >

                Export Current Assignments

              </Button>

            </div>

          )}

        </div>



        {/* Footer */}

        <div className="border-t border-gray-200/70 dark:border-slate-700/60 p-4 sm:p-6 flex justify-end gap-3">

          <Button onClick={onClose} variant="secondary">

            Close

          </Button>

        </div>

      </div>

    </div>

  );

}



export default StudentAssignmentModal;


