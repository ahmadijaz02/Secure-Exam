import React, { useState, useRef, useEffect } from 'react';
import Button from '../ui/Button';
import LoadingSpinner from '../ui/LoadingSpinner';
import { useNotification } from '../../context/notification/NotificationContext';
import adminService from '../../api/services/adminService';
import { API_CONFIG } from '../../api/config/apiConfig';

function ImageSeatMarker({ planId, plan, onSeatsMarked, onNext }) {
  const [step, setStep] = useState(1); // 1: Upload, 2: Mark, 3: Review
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [markedSeats, setMarkedSeats] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingSeats, setSavingSeats] = useState(false);
  const [selectedSeatIndex, setSelectedSeatIndex] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(null);
  const [, forceUpdate] = useState(0); // Force re-render for SVG positioning
  const imageCanvasRef = useRef(null);
  const imageContainerRef = useRef(null);
  const { addNotification } = useNotification();

  // Load existing plan data if editing
  useEffect(() => {
    if (plan && plan.image_path && step === 1) {
      // Editing mode: load existing image and seats (only on initial mount)
      const getFullImageUrl = (imagePath) => {
        if (!imagePath) return '';
        if (imagePath.startsWith('http')) return imagePath;
        // Keep /api in the path for uploads route
        const base = API_CONFIG.BASE_URL.replace(/\/$/, '');
        return `${base}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
      };
      
      const imageUrl = getFullImageUrl(plan.image_path);
      console.log('Loading image from:', imageUrl); // Debug log
      setImagePreview(imageUrl);
      setImageLoaded(false); // Reset loading state
      setImageError(null); // Reset error state
      
      // Load existing seats if they have coordinates
      if (plan.seats && plan.seats.length > 0) {
        const seatsWithCoords = plan.seats.filter(s => 
          s.norm_x !== undefined && s.norm_y !== undefined
        );
        if (seatsWithCoords.length > 0) {
          setMarkedSeats(seatsWithCoords);
        }
      }
      
      setStep(2); // Skip upload step, go directly to marking
    }
  }, [plan, step]); // Added step to dependency array

  // Handle image file selection
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addNotification('error', 'Please select a valid image file');
      return;
    }

    setImageFile(file);
    setImageLoaded(false); // Reset loading state
    setImageError(null); // Reset error state
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Upload image to server
  const handleUploadImage = async () => {
    if (!imageFile) {
      addNotification('error', 'Please select an image first');
      return;
    }

    try {
      setUploadingImage(true);
      await adminService.uploadClassroomImage(planId, imageFile);
      addNotification('success', 'Classroom image uploaded successfully');
      setStep(2); // Move to marking step
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  // Handle clicking on image to mark seat
  const handleImageClick = (e) => {
    if (!imageCanvasRef.current || !imagePreview) return;

    const imgRect = imageCanvasRef.current.getBoundingClientRect();
    const imgEl = imageCanvasRef.current;

    const normX = (e.clientX - imgRect.left) / imgRect.width;
    const normY = (e.clientY - imgRect.top) / imgRect.height;

    // Prevent marking outside image bounds
    if (normX < 0 || normY < 0 || normX > 1 || normY > 1) {
      addNotification('warning', 'Click inside the image area');
      return;
    }

    const actualW = imgEl.naturalWidth;
    const actualH = imgEl.naturalHeight;

    const pixelX = Math.round(normX * actualW);
    const pixelY = Math.round(normY * actualH);

    // Check for duplicates
    const minDistPixels = Math.max(20, Math.round(Math.min(actualW, actualH) * 0.02));
    const isDuplicate = markedSeats.some(
      seat => Math.hypot((seat.pixel_x || 0) - pixelX, (seat.pixel_y || 0) - pixelY) < minDistPixels
    );

    if (isDuplicate) {
      addNotification('warning', 'Seat already marked at this location');
      return;
    }

    const seatNumber = markedSeats.length + 1;
    const newSeat = {
      seat_number: seatNumber,
      pixel_x: pixelX,
      pixel_y: pixelY,
      norm_x: normX,
      norm_y: normY,
      student_name: '',
      roll_number: ''
    };

    setMarkedSeats([...markedSeats, newSeat]);
    addNotification('success', `Seat ${seatNumber} marked ✓`);
  };

  // Remove a marked seat
  const handleRemoveSeat = (index) => {
    const updatedSeats = markedSeats.filter((_, i) => i !== index);
    const renumberedSeats = updatedSeats.map((seat, i) => ({
      ...seat,
      seat_number: i + 1
    }));
    setMarkedSeats(renumberedSeats);
    setSelectedSeatIndex(null);
    addNotification('info', 'Seat removed');
  };

  // Save marked seats to server
  const handleSaveSeats = async () => {
    if (markedSeats.length === 0) {
      addNotification('warning', 'Please mark at least one seat');
      return;
    }

    try {
      setSavingSeats(true);
      const response = await adminService.saveMarkedSeats(planId, markedSeats);
      addNotification('success', `${markedSeats.length} seats saved successfully!`);
      setStep(3); // Move to review step
      if (onSeatsMarked) {
        onSeatsMarked(response.plan);
      }
    } catch (error) {
      addNotification('error', error.response?.data?.message || 'Failed to save marked seats');
    } finally {
      setSavingSeats(false);
    }
  };

  // Clear all marked seats
  const handleClearSeats = () => {
    if (window.confirm('Clear all marked seats?')) {
      setMarkedSeats([]);
      setSelectedSeatIndex(null);
      addNotification('info', 'Seats cleared');
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex items-center justify-between mb-8">
        <div className={`flex items-center gap-2 ${step >= 1 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
            1
          </div>
          <span className="font-medium">Upload Image</span>
        </div>
        <div className={`flex-1 h-1 mx-2 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
        <div className={`flex items-center gap-2 ${step >= 2 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
            2
          </div>
          <span className="font-medium">Mark Seats</span>
        </div>
        <div className={`flex-1 h-1 mx-2 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
        <div className={`flex items-center gap-2 ${step >= 3 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
            3
          </div>
          <span className="font-medium">Review</span>
        </div>
      </div>

      {/* STEP 1: Upload Image */}
      {step === 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-blue-400 p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Step 1: Upload Classroom Image</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Take a photo of your exam room from above</p>

          <div className="flex items-center justify-center w-full mb-6">
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg className="w-12 h-12 mb-3 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="mb-2 text-sm text-blue-600 dark:text-blue-400 font-semibold">
                  {imageFile ? '✓ ' + imageFile.name : 'Click to select image or drag & drop'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">PNG, JPG, GIF (up to 10MB)</p>
              </div>
              <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
            </label>
          </div>

          {imageFile && (
            <Button
              onClick={handleUploadImage}
              disabled={uploadingImage}
              className="w-full bg-blue-600 hover:bg-blue-700 py-3 text-lg"
            >
              {uploadingImage ? (
                <>
                  <LoadingSpinner size="small" className="mr-2" />
                  Uploading...
                </>
              ) : (
                '✓ Upload & Continue'
              )}
            </Button>
          )}

          {!imageFile && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-200">
              📸 Tip: Take a clear photo from above showing all seats clearly. Good lighting helps!
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Mark Seats */}
      {step === 2 && imagePreview && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Step 2: Mark Seat Positions</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            <strong>Click on each seat location</strong> on the image below. Skip over empty desks or areas without seats.
          </p>

          {/* Image Display */}
          <div
            ref={imageContainerRef}
            className="border-2 border-blue-300 dark:border-blue-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900 cursor-crosshair relative"
            style={{ minHeight: '400px', maxHeight: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {!imageLoaded && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingSpinner />
                <p className="ml-2 text-gray-600 dark:text-gray-400">Loading image...</p>
              </div>
            )}
            {imageError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center p-4">
                  <p className="text-red-600 dark:text-red-400 font-semibold">Failed to load image</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{imageError}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">URL: {imagePreview}</p>
                </div>
              </div>
            )}
            <img
              ref={imageCanvasRef}
              src={imagePreview}
              alt="Classroom"
              onClick={handleImageClick}
              onLoad={() => {
                console.log('Image loaded successfully');
                setImageLoaded(true);
                setImageError(null);
                // Force re-render after image dimensions are available
                setTimeout(() => forceUpdate(prev => prev + 1), 100);
              }}
              onError={(e) => {
                console.error('Image failed to load:', imagePreview);
                setImageError('Image could not be loaded. Check if the file exists.');
                setImageLoaded(false);
              }}
              className="w-full object-contain"
              style={{ display: imageLoaded ? 'block' : 'none', maxHeight: '600px' }}
            />

            {/* SVG Markers - Only show when image is loaded */}
            {imageLoaded && markedSeats.length > 0 && (
              <svg className="absolute top-0 left-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                {markedSeats.map((seat, index) => {
                  const imgEl = imageCanvasRef.current;
                  if (!imgEl) {
                    console.log('No image element ref');
                    return null;
                  }
                  const imgRect = imgEl.getBoundingClientRect();
                  const containerRect = imgEl.parentElement.getBoundingClientRect();
                  
                  // Calculate position relative to container
                  const offsetX = imgRect.left - containerRect.left;
                  const offsetY = imgRect.top - containerRect.top;
                  const x = offsetX + (seat.norm_x * imgRect.width);
                  const y = offsetY + (seat.norm_y * imgRect.height);

                  if (index === 0) {
                    console.log('Marker position calc:', { 
                      seatNum: seat.seat_number,
                      norm_x: seat.norm_x, 
                      norm_y: seat.norm_y, 
                      imgWidth: imgRect.width,
                      imgHeight: imgRect.height,
                      offsetX, 
                      offsetY, 
                      finalX: x, 
                      finalY: y 
                    });
                  }

                  return (
                    <g key={index}>
                      <circle
                        cx={x}
                        cy={y}
                        r={20}
                        fill={selectedSeatIndex === index ? '#ef4444' : '#3b82f6'}
                        fillOpacity="0.8"
                        stroke="white"
                        strokeWidth="2"
                      />
                      <text
                        x={x}
                        y={y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="14"
                        fontWeight="bold"
                        fill="white"
                        pointerEvents="none"
                      >
                        {seat.seat_number}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
            ✓ <strong>{markedSeats.length} seats marked</strong> | Click on the image to add more
          </div>

          {/* Marked Seats Summary */}
          {markedSeats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {markedSeats.map((seat, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedSeatIndex(selectedSeatIndex === index ? null : index)}
                  className={`p-2 rounded text-center cursor-pointer font-bold transition-all ${
                    selectedSeatIndex === index
                      ? 'bg-red-500 text-white'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50'
                  }`}
                >
                  <div>Seat {seat.seat_number}</div>
                  {selectedSeatIndex === index && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSeat(index);
                      }}
                      className="text-xs mt-1 opacity-90 hover:opacity-100"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleClearSeats}
              variant="secondary"
              className="flex-1"
              disabled={markedSeats.length === 0}
            >
              Clear All
            </Button>
            <Button
              onClick={handleSaveSeats}
              disabled={savingSeats || markedSeats.length === 0}
              className="flex-1 bg-green-600 hover:bg-green-700 py-3 font-bold"
            >
              {savingSeats ? (
                <>
                  <LoadingSpinner size="small" className="mr-2" />
                  Saving...
                </>
              ) : (
                `✓ Save ${markedSeats.length} Seats & Continue`
              )}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Review & Proceed */}
      {step === 3 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-green-400 p-8 text-center space-y-6">
          <div className="text-6xl mb-4">✓</div>
          <h2 className="text-3xl font-bold text-green-600 dark:text-green-400">Seating Plan Saved!</h2>
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {markedSeats.length} Seats Marked Successfully
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Great! Now you need to assign students to these seats.
            </p>
          </div>

          <Button
            onClick={() => onNext && onNext()}
            className="w-full bg-green-600 hover:bg-green-700 py-4 text-lg font-bold"
          >
            Next: Assign Students to Seats →
          </Button>

          <div className="text-sm text-gray-500 dark:text-gray-400">
            You can come back later to edit seats if needed
          </div>
        </div>
      )}
    </div>
  );
}

export default ImageSeatMarker;
