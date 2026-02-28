import React, { useState, useEffect, useRef } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import adminService from '../../api/services/adminService';
import { API_CONFIG } from '../../api/config/apiConfig';
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

  // Image-based seating plan state
  const [useImageMode, setUseImageMode] = useState(false);
  const [classroomImage, setClassroomImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [studentFile, setStudentFile] = useState(null);
  const [parsedStudents, setParsedStudents] = useState([]);
  const [seatCoordinates, setSeatCoordinates] = useState([]);
  const [selectedCoordIndex, setSelectedCoordIndex] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const imageCanvasRef = useRef(null);
  const imageContainerRef = useRef(null);
  const [overlayBox, setOverlayBox] = useState(null);
  const [showImageOverlay, setShowImageOverlay] = useState(false);
  const [imageSeatsSaved, setImageSeatsSaved] = useState(false); // Track if image seats  are saved

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

  useEffect(() => {
    fetchSeatingPlans();
  }, []);

  const getFullImageUrl = (imagePath) => {
    if (!imagePath) return '';
    if (imagePath.startsWith('http')) return imagePath;
    // API_CONFIG.BASE_URL is like http://127.0.0.1:5000/api -> remove trailing '/api'
    const base = API_CONFIG.BASE_URL.replace(/\/api\/?$/i, '').replace(/\/$/,'');
    return `${base}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
  };

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

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      addNotification('error', 'Please select a valid image file');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target.result);
      setClassroomImage(file);
      setSeatCoordinates([]);
      setSelectedCoordIndex(null);
      // Open full-screen image overlay for seat selection
      setShowImageOverlay(true);
    };
    reader.readAsDataURL(file);
  };

  const handleImageClick = (e) => {
    if (!imageCanvasRef.current || !imageContainerRef.current) return;

    const imgEl = imageCanvasRef.current;
    const containerEl = imageContainerRef.current;
    
    // Get image position relative to container
    const imgRect = imgEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    
    // Calculate click position relative to image element (account for element position within container)
    const relativeX = e.clientX - imgRect.left;
    const relativeY = e.clientY - imgRect.top;

    // Only process clicks inside the image bounds
    if (relativeX < 0 || relativeY < 0 || relativeX > imgRect.width || relativeY > imgRect.height) {
      addNotification('warning', 'Click inside the image area');
      return;
    }

    // Normalize coordinates relative to displayed image dimensions (0..1)
    // This is independent of screen resolution
    const normX = relativeX / imgRect.width;
    const normY = relativeY / imgRect.height;

    // Calculate pixel coordinates relative to the image's ORIGINAL resolution
    // These are the absolute coordinates that will be stored in database
    const naturalW = imgEl.naturalWidth || imgRect.width;
    const naturalH = imgEl.naturalHeight || imgRect.height;
    const pixelX = Math.round(normX * naturalW);
    const pixelY = Math.round(normY * naturalH);

    // Check for duplicate selections (in pixel space for consistency)
    const minDistPixels = Math.max(20, Math.round(Math.min(naturalW, naturalH) * 0.02));
    const isDuplicate = seatCoordinates.some(
      coord => Math.hypot((coord.pixel_x || 0) - pixelX, (coord.pixel_y || 0) - pixelY) < minDistPixels
    );

    if (isDuplicate) {
      addNotification('warning', 'Seat already selected at this location');
      return;
    }

    // Prepare seat data
    const seatNumberDefault = seatCoordinates.length + 1;
    let student_name = '';
    let roll_number = '';
    let actual_seat_no = seatNumberDefault;

    // If parsed students exist, ask admin which Seat No (from file) to assign to this clicked position
    if (parsedStudents && parsedStudents.length > 0) {
      const assignedNumbers = seatCoordinates.map(c => parseInt(c.seat_number, 10));
      // find first unassigned seat number from parsedStudents
      const firstUnassigned = parsedStudents.map(s => parseInt(s.seat_number, 10)).find(n => !assignedNumbers.includes(n));
      const suggested = firstUnassigned || seatNumberDefault;
      const input = window.prompt('Enter Seat No to assign to this clicked position (from uploaded file):', String(suggested));
      if (input !== null && input.trim() !== '') {
        const chosen = parseInt(input, 10);
        if (!isNaN(chosen)) {
          actual_seat_no = chosen;
          const match = parsedStudents.find(s => parseInt(s.seat_number, 10) === chosen);
          if (match) {
            student_name = match.student_name;
            roll_number = match.roll_number;
          }
        }
      }
    }

    const newCoordinate = {
      // Store pixel coordinates in original image resolution (database values)
      pixel_x: pixelX,
      pixel_y: pixelY,
      // Store normalized coordinates for SVG display (0..1)
      norm_x: normX,
      norm_y: normY,
      seat_number: actual_seat_no,
      student_name: student_name,
      roll_number: roll_number,
    };

    setSeatCoordinates(prev => [...prev, newCoordinate]);
    setSelectedCoordIndex(seatCoordinates.length);
    addNotification('success', `Seat ${actual_seat_no} marked at pixel (${pixelX}, ${pixelY})`);
  };

  const clearAllCoordinates = () => {
    setSeatCoordinates([]);
    setSelectedCoordIndex(null);
    addNotification('info', 'All seat selections cleared');
  };

  const closeOverlay = () => {
    setShowImageOverlay(false);
  };

  useEffect(() => {
    // Prevent zoom and pan on the image container
    const handlePreventZoom = (e) => {
      // Prevent pinch-to-zoom on touch devices
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
      // Prevent mouse wheel zoom (Ctrl/Cmd + Scroll)
      if ((e.ctrlKey || e.metaKey) && e.deltaY) {
        e.preventDefault();
      }
    };

    const containerEl = imageContainerRef.current;
    if (containerEl && showImageOverlay) {
      containerEl.addEventListener('wheel', handlePreventZoom, { passive: false });
      containerEl.addEventListener('touchmove', handlePreventZoom, { passive: false });
      
      // Prevent context menu (right-click) on image
      const handleContextMenu = (e) => e.preventDefault();
      containerEl.addEventListener('contextmenu', handleContextMenu);
      
      return () => {
        containerEl.removeEventListener('wheel', handlePreventZoom);
        containerEl.removeEventListener('touchmove', handlePreventZoom);
        containerEl.removeEventListener('contextmenu', handleContextMenu);
      };
    }
  }, [showImageOverlay]);

  useEffect(() => {
    // Update overlay box on window resize/scroll to keep SVG synchronized
    const handleResize = () => {
      if (imageCanvasRef.current && imageContainerRef.current) {
        const imgRect = imageCanvasRef.current.getBoundingClientRect();
        const containerRect = imageContainerRef.current.getBoundingClientRect();
        const left = imgRect.left - containerRect.left;
        const top = imgRect.top - containerRect.top;
        setOverlayBox({ left, top, width: imgRect.width, height: imgRect.height });
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [showImageOverlay]);

  const handleStudentFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf'];
    const fileExt = file.name.split('.').pop().toLowerCase();
    const validExts = ['csv', 'xlsx', 'xls', 'pdf'];

    if (!validExts.includes(fileExt) && !validTypes.includes(file.type)) {
      addNotification('error', 'Please upload a CSV, Excel, or PDF file');
      return;
    }

    setUploadingFile(true);
    try {
      // Create FormData and send to backend
      const formDataFD = new FormData();
      formDataFD.append('file', file);

      const response = await fetch(`${API_CONFIG.BASE_URL}/admin/seating-plans/students/parse`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: formDataFD,
      });

      // Check response status first
      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = 'Failed to parse student file';
        try {
          const errorData = JSON.parse(errorText);
          errorMsg = errorData.message || errorMsg;
        } catch (e) {
          console.error('Response text:', errorText);
        }
        addNotification('error', errorMsg);
        return;
      }

      const data = await response.json();

      setParsedStudents(data.students);
      setStudentFile(file);
      addNotification('success', `Loaded ${data.count} students from file`);

      // Auto-map students to already selected seat coordinates based on seat_number
      if (data.students && seatCoordinates.length > 0) {
        const mappedSeats = seatCoordinates.map((coord) => {
          // Find student data that matches this seat number
          const studentData = data.students.find(s => parseInt(s.seat_number, 10) === parseInt(coord.seat_number, 10));
          if (studentData) {
            return {
              ...coord,
              student_name: studentData.student_name,
              roll_number: studentData.roll_number,
            };
          }
          return coord;
        });
        setSeatCoordinates(mappedSeats);
        addNotification('success', 'Students automatically mapped to selected seats based on Seat No');
      }
    } catch (error) {
      console.error('Student file upload error:', error);
      addNotification('error', 'Error uploading student file. Please try again.');
    } finally {
      setUploadingFile(false);
    }
  };

  const removeCoordinate = (index) => {
    setSeatCoordinates(seatCoordinates.filter((_, i) => i !== index));
    setSelectedCoordIndex(null);
    addNotification('info', 'Seat removed');
  };

  const handleSaveImageSeats = () => {
    try {
      if (!imagePreview || seatCoordinates.length === 0) {
        addNotification('error', 'Please select image and click on seats');
        return;
      }

      if (!formData.classroom_name.trim()) {
        addNotification('error', 'Please enter room number');
        return;
      }

      // Validate that we have at least the image and seats selected
      if (!classroomImage) {
        addNotification('error', 'No image selected');
        return;
      }

      addNotification('success', 'Seats saved! You can now upload a student file or generate the seating plan.');
      setImageSeatsSaved(true);
      setShowImageOverlay(false); // Auto-close the overlay
    } catch (error) {
      console.error('Save image seats error:', error);
      addNotification('error', 'Error saving seats. Please try again.');
    }
  };

  const handleCreateFromImage = async () => {
    try {
      if (!imagePreview || seatCoordinates.length === 0) {
        addNotification('error', 'Please select image and click on seats');
        return;
      }

      if (!formData.classroom_name.trim()) {
        addNotification('error', 'Please enter room number');
        return;
      }

      setLoading(true);

      // Upload image first
      let imagePath = imagePreview;
      if (classroomImage) {
        const formDataImage = new FormData();
        formDataImage.append('image', classroomImage);

        const imageResponse = await fetch(`${API_CONFIG.BASE_URL}/admin/seating-plans/image/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
          body: formDataImage,
        });

        // Check response status first
        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          let errorMsg = 'Failed to upload image';
          try {
            const errorData = JSON.parse(errorText);
            errorMsg = errorData.message || errorMsg;
          } catch (e) {
            console.error('Image upload response:', errorText);
          }
          addNotification('error', errorMsg);
          return;
        }

        const imageData = await imageResponse.json();
        imagePath = imageData.image_path;
      }

      // Create seating plan from image (dynamic rows/columns based on seat count)
      const totalSeats = seatCoordinates.length;
      const createPlanResponse = await fetch(`${API_CONFIG.BASE_URL}/admin/seating-plans/create-from-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          classroom_name: formData.classroom_name,
          room_number: formData.room_number || undefined,  // Optional room number
          total_seats: totalSeats,
          image_path: imagePath,
          seats: seatCoordinates,
        }),
      });

      // Check response status first
      if (!createPlanResponse.ok) {
        const errorText = await createPlanResponse.text();
        let errorMsg = 'Failed to create seating plan';
        try {
          const errorData = JSON.parse(errorText);
          errorMsg = errorData.message || errorMsg;
        } catch (e) {
          console.error('Create plan response:', errorText);
        }
        addNotification('error', errorMsg);
        return;
      }

      const planData = await createPlanResponse.json();

      addNotification('success', 'Seating plan generated successfully');
      resetImageMode();
      fetchSeatingPlans();
    } catch (error) {
      console.error('Create from image error:', error);
      addNotification('error', 'Error creating seating plan. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetImageMode = () => {
    setUseImageMode(false);
    setClassroomImage(null);
    setImagePreview(null);
    setStudentFile(null);
    setParsedStudents([]);
    setSeatCoordinates([]);
    setSelectedCoordIndex(null);
    setFormData({ classroom_name: '' });
    setShowImageOverlay(false);
    setImageSeatsSaved(false);
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



  const toggleSeatAvailability = (seatNum) => {
    setSeats(prev => prev.map(seat => 
      seat.seat_number === seatNum
        ? { ...seat, occupied: !seat.occupied }
        : seat
    ));
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

  const handleToggleSelectedSeat = () => {
    if (!selectedSeatKey) {
      addNotification('error', 'Select a seat first');
      return;
    }
    toggleSeatAvailability(selectedSeatKey);
    addNotification('info', 'Seat availability toggled');
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
      
      setShowModal(false);
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
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setUseImageMode(true)}
                    variant="outline"
                    className="flex-1 text-sm"
                  >
                    📸 Create from Image
                  </Button>
                  <Button 
                    onClick={() => setShowSeatingEditor(false)}
                    className="flex-1 text-sm"
                  >
                    📋 Manual Entry
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

                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Upload Classroom Image <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    accept="image/*,.jpg,.jpeg"
                    onChange={handleImageUpload}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-sm"
                  />
                </div>

                {imagePreview && !imageSeatsSaved && (
                  <div className="border-2 border-dashed border-blue-400 dark:border-blue-600 rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20">
                    <p className="text-xs font-medium text-blue-900 dark:text-blue-300 mb-2">
                      Click on each seat in the image ({seatCoordinates.length} selected)
                    </p>
                        <div ref={imageContainerRef} className="relative bg-white rounded overflow-hidden max-h-96">
                          <img
                            ref={imageCanvasRef}
                            src={imagePreview}
                            alt="Classroom"
                            onClick={handleImageClick}
                            onLoad={() => {
                              // Image loaded - SVG overlay will use percentage positioning
                            }}
                            className="w-full cursor-crosshair"
                          />
                          <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" width="100%" height="100%">
                            {seatCoordinates.map((coord, idx) => (
                              <g key={idx}>
                                <circle cx={`${((coord.norm_x || 0) * 100).toFixed(2)}%`} cy={`${((coord.norm_y || 0) * 100).toFixed(2)}%`} r="6" fill="rgba(59,130,246,0.35)" />
                                <text x={`${((coord.norm_x || 0) * 100).toFixed(2)}%`} y={`${((coord.norm_y || 0) * 100).toFixed(2)}%`} textAnchor="middle" dy="0.35em" fill="#0b5fff" style={{ fontSize: '10px', fontWeight: '600' }}>{coord.seat_number || idx + 1}</text>
                              </g>
                            ))}
                          </svg>
                        </div>

                    {/* Selected list */}
                    {seatCoordinates.length > 0 && (
                      <div className="mt-3 border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                        {seatCoordinates.map((coord, idx) => (
                          <div key={idx} className="flex justify-between items-center p-2">
                            <div>
                              <div className="font-medium">Seat {coord.seat_number || idx + 1}</div>
                              <div className="text-xs text-gray-500">{coord.student_name || ''} {coord.roll_number ? `(${coord.roll_number})` : ''}</div>
                            </div>
                            <button onClick={() => removeCoordinate(idx)} className="text-red-500">Remove</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Student File Upload + Parsed summary */}
                    <div className="mt-3">
                      <input type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={handleStudentFileUpload} />
                      {parsedStudents.length > 0 && <div className="mt-2 text-sm text-green-600">{parsedStudents.length} students loaded</div>}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <Button onClick={() => setShowImageOverlay(true)} disabled={!imagePreview} variant="outline">Open Full Screen</Button>
                      <Button onClick={resetImageMode} variant="outline">Cancel</Button>
                    </div>
                  </div>
                )}

                {/* Upload Seating Plan Section - appears after seats are saved */}
                {imageSeatsSaved && imagePreview && (
                  <div className="border-2 border-dashed border-green-400 dark:border-green-600 rounded-lg p-4 bg-green-50 dark:bg-green-900/20 space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">✅</span>
                      <p className="font-semibold text-green-900 dark:text-green-300">
                        Seats Saved! Room: {formData.classroom_name}
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                        Upload Seating Plan <span className="text-gray-500">(Optional)</span>
                      </label>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                        Upload a CSV/Excel file with student data (Student Name, Roll No, Seat No)
                      </p>
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls,.pdf"
                        onChange={handleStudentFileUpload}
                        disabled={uploadingFile}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-sm"
                      />
                      {parsedStudents.length > 0 && (
                        <div className="mt-2 text-sm text-green-600 dark:text-green-400">
                          ✓ {parsedStudents.length} students loaded
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={handleCreateFromImage}
                        disabled={!formData.classroom_name.trim() || seatCoordinates.length === 0 || uploadingFile}
                        className="flex-1"
                      >
                        Generate Seating Plan
                      </Button>
                      <Button variant="outline" onClick={resetImageMode} className="flex-1">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
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
                      // Ensure value doesn't go below 1 on blur
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
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <p className="text-xs text-blue-900 dark:text-blue-300 mb-2">
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
                    {/* Seating Grid */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Seating Layout</h3>
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {formData.total_seats} seats
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                        Click a seat to assign student details
                      </p>
                      {renderSeatingEditor(seats, selectedSeatKey, handleSelectSeat)}
                    </div>

                    {/* Seat Assignment Controls */}
                    {selectedSeatKey && (
                      <div className="border-2 border-blue-300 dark:border-blue-700 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20 space-y-3 shadow-sm">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
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
                      {plan.room_number && (
                        <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5 font-semibold">
                          🏢 {plan.room_number}
                        </p>
                      )}
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {plan.total_seats || (plan.seats ? plan.seats.length : 0)} seats
                      </p>
                      {plan.occupied_seats && plan.occupied_seats > 0 && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          {plan.occupied_seats} students assigned
                        </p>
                      )}
                      {plan.image_path && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          📸 Image-based plan
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
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900 flex items-center justify-center text-blue-700 dark:text-blue-200 font-bold text-lg">
                  {currentPlan.room_number || (() => { const m = (currentPlan.classroom_name||'').match(/\d+/); return m ? m[0] : (currentPlan.classroom_name ? currentPlan.classroom_name.charAt(0) : '#'); })()}
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">{currentPlan.classroom_name || 'Room'}</div>
                  {currentPlan.room_number && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">🏢 {currentPlan.room_number}</div>
                  )}
                </div>
              </div>
              <button
                onClick={handleCloseViewer}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none"
              >
                ×
              </button>
            </Card.Header>
            <Card.Content className="space-y-4">
              {/* Room header is displayed above in Card.Header */}

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
                    Assigned Students ({(currentPlan.seats || []).filter(s => s.student_name).length})
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
            </Card.Content>
          </Card>
        </div>
      )}
      {/* Full-screen Image Overlay for precise clicking - Fixed Container with No Zoom/Pan */}
      {showImageOverlay && imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          {/* Close on background click disabled - must use button */}
          <div className="relative bg-white rounded-lg shadow-2xl w-[98%] h-[98%] max-w-7xl max-h-[98vh] p-4 flex flex-col overflow-hidden">
            {/* Header Controls */}
            <div className="flex justify-between items-center mb-3 flex-shrink-0 border-b border-gray-200 dark:border-gray-700 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Select Seats - Full Screen</h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">({seatCoordinates.length} selected)</span>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={clearAllCoordinates}
                  className="text-sm"
                >
                  Clear All
                </Button>
                <Button 
                  onClick={handleSaveImageSeats} 
                  disabled={!formData.classroom_name.trim() || seatCoordinates.length === 0}
                  className="text-sm"
                >
                  Save Seats
                </Button>
                <Button 
                  variant="outline" 
                  onClick={closeOverlay}
                  className="text-sm"
                >
                  Close
                </Button>
              </div>
            </div>

            {/* Image Container - Fixed Aspect Ratio, No Zoom/Pan */}
            <div 
              ref={imageContainerRef} 
              className="relative flex-1 bg-black flex items-center justify-center overflow-hidden"
              style={{
                position: 'relative',
                width: '100%',
                height: '100%'
              }}
            >
              {/* Image - Static, No Zoom or Pan */}
              <img
                ref={imageCanvasRef}
                src={imagePreview}
                alt="Classroom Seating Map"
                onClick={handleImageClick}
                onLoad={() => {
                  // Trigger any calculations needed when image loads
                  // SVG overlay uses percentage positioning, so no need to update overlay box
                }}
                draggable={false}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: 'auto',
                  height: 'auto',
                  cursor: 'crosshair',
                  userSelect: 'none',
                  WebkitUserDrag: 'none',
                  touchAction: 'none',
                  display: 'block'
                }}
                className="select-none"
              />

              {/* SVG Overlay - Synchronized with Image */}
              <svg 
                className="absolute inset-0 pointer-events-none select-none" 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  overflow: 'visible'
                }}
                preserveAspectRatio="none"
              >
                <defs>
                  <style>{`
                    .seat-circle {
                      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
                    }
                    .seat-text {
                      font-weight: 700;
                      text-anchor: middle;
                      dominant-baseline: middle;
                      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
                      pointer-events: none;
                    }
                  `}</style>
                </defs>
                {seatCoordinates.map((coord, idx) => {
                  const percentX = ((coord.norm_x || 0) * 100).toFixed(2);
                  const percentY = ((coord.norm_y || 0) * 100).toFixed(2);
                  
                  return (
                    <g key={idx}>
                      {/* Seat circle marker */}
                      <circle 
                        cx={`${percentX}%`}
                        cy={`${percentY}%`}
                        r="8"
                        fill="rgba(59, 130, 246, 0.4)"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        className="seat-circle"
                      />
                      {/* Seat number label */}
                      <text 
                        x={`${percentX}%`}
                        y={`${percentY}%`}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#0b5fff"
                        fontSize="12"
                        className="seat-text"
                      >
                        {coord.seat_number || idx + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Coordinate Info Panel */}
            {seatCoordinates.length > 0 && (
              <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3 max-h-24 overflow-y-auto flex-shrink-0">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Selected Seats (Pixel Coordinates):</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {seatCoordinates.map((coord, idx) => (
                    <div key={idx} className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-200 dark:border-blue-700">
                      <div className="font-semibold text-blue-900 dark:text-blue-200">Seat {coord.seat_number || idx + 1}</div>
                      <div className="text-gray-600 dark:text-gray-400">Pixel: ({coord.pixel_x}, {coord.pixel_y})</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminSeatingPlans;