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

  // Drag-to-draw state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingStart, setDrawingStart] = useState(null);
  const [drawingCurrent, setDrawingCurrent] = useState(null);

  const imageCanvasRef = useRef(null);
  const imageContainerRef = useRef(null);
  const { addNotification } = useNotification();

  // Load existing plan data if editing
  useEffect(() => {
    if (plan && plan.image_path && step === 1) {
      const getFullImageUrl = (imagePath) => {
        if (!imagePath) return '';
        if (imagePath.startsWith('http')) return imagePath;
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

  // Helper to get normalized coordinates from mouse event
  const getNormCoords = (e) => {
    if (!imageCanvasRef.current) return null;
    const imgRect = imageCanvasRef.current.getBoundingClientRect();
    const normX = (e.clientX - imgRect.left) / imgRect.width;
    const normY = (e.clientY - imgRect.top) / imgRect.height;
    // clamp to 0-1
    return {
      normX: Math.max(0, Math.min(1, normX)),
      normY: Math.max(0, Math.min(1, normY))
    };
  };

  const handleMouseDown = (e) => {
    // Only start drawing if we click the image directly (or the SVG overlay)
    e.preventDefault();
    const coords = getNormCoords(e);
    if (!coords) return;

    setIsDrawing(true);
    setDrawingStart(coords);
    setDrawingCurrent(coords);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    const coords = getNormCoords(e);
    if (coords) setDrawingCurrent(coords);
  };

  const handleMouseUp = (e) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (!drawingStart || !drawingCurrent || !imageCanvasRef.current) return;

    let minX = Math.min(drawingStart.normX, drawingCurrent.normX);
    let minY = Math.min(drawingStart.normY, drawingCurrent.normY);
    let maxX = Math.max(drawingStart.normX, drawingCurrent.normX);
    let maxY = Math.max(drawingStart.normY, drawingCurrent.normY);

    let norm_w = maxX - minX;
    let norm_h = maxY - minY;

    // If it was just a click (or tiny drag), create a default-sized zone
    if (norm_w < 0.02 || norm_h < 0.02) {
      norm_w = 0.15;
      norm_h = 0.20;
      minX = Math.max(0, drawingStart.normX - norm_w / 2);
      minY = Math.max(0, drawingStart.normY - norm_h / 2);
      maxX = Math.min(1, minX + norm_w);
      maxY = Math.min(1, minY + norm_h);
      // recalculate actual dimensions in case of boundary clamping
      norm_w = maxX - minX;
      norm_h = maxY - minY;
    }

    const norm_x = minX + (norm_w / 2);
    const norm_y = minY + (norm_h / 2);

    const imgEl = imageCanvasRef.current;
    const actualW = imgEl.naturalWidth;
    const actualH = imgEl.naturalHeight;
    const pixelX = Math.round(norm_x * actualW);
    const pixelY = Math.round(norm_y * actualH);

    // Prevent fully overlapping identical seats
    const isDuplicate = markedSeats.some(
      seat => Math.abs(seat.norm_x - norm_x) < 0.05 && Math.abs(seat.norm_y - norm_y) < 0.05
    );

    if (isDuplicate) {
      addNotification('warning', 'A seat is already marked very close to here');
      setDrawingStart(null);
      setDrawingCurrent(null);
      return;
    }

    const seatNumber = markedSeats.length + 1;
    const newSeat = {
      seat_number: seatNumber,
      pixel_x: pixelX,
      pixel_y: pixelY,
      norm_x: norm_x,
      norm_y: norm_y,
      norm_w: norm_w,
      norm_h: norm_h,
      student_name: '',
      roll_number: ''
    };

    setMarkedSeats([...markedSeats, newSeat]);
    addNotification('success', `Seat ${seatNumber} marked ✓`);

    setDrawingStart(null);
    setDrawingCurrent(null);
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
    <div className="space-y-5">
      {/* Progress Indicator */}
      <div className="flex items-center justify-between mb-6 gap-2 sm:gap-3">
        <div className={`flex items-center gap-2 text-xs sm:text-sm ${step >= 1 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30' : 'bg-gray-300 dark:bg-gray-700'}`}>
            1
          </div>
          <span className="font-semibold">Upload Image</span>
        </div>
        <div className={`flex-1 h-1 rounded-full ${step >= 2 ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-700'}`}></div>
        <div className={`flex items-center gap-2 text-xs sm:text-sm ${step >= 2 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 2 ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30' : 'bg-gray-300 dark:bg-gray-700'}`}>
            2
          </div>
          <span className="font-semibold">Mark Seats</span>
        </div>
        <div className={`flex-1 h-1 rounded-full ${step >= 3 ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-700'}`}></div>
        <div className={`flex items-center gap-2 text-xs sm:text-sm ${step >= 3 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 3 ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30' : 'bg-gray-300 dark:bg-gray-700'}`}>
            3
          </div>
          <span className="font-semibold">Review</span>
        </div>
      </div>

      {/* STEP 1: Upload Image */}
      {step === 1 && (
        <div className="glass-card-static rounded-2xl border border-indigo-200/60 dark:border-indigo-800/40 p-5 sm:p-7">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Step 1: Upload Classroom Image</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Take a photo of your exam room from above</p>

          <div className="flex items-center justify-center w-full mb-6">
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-indigo-300 dark:border-indigo-700/60 rounded-xl cursor-pointer bg-indigo-50/60 dark:bg-indigo-900/20 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/30 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg className="w-12 h-12 mb-3 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="mb-2 text-sm text-indigo-600 dark:text-indigo-400 font-semibold">
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
              variant="gradient-primary"
              className="w-full py-3 text-lg"
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
            <div className="bg-indigo-50/70 dark:bg-indigo-900/20 border border-indigo-200/70 dark:border-indigo-800/50 rounded-xl p-4 text-sm text-indigo-800 dark:text-indigo-200">
              📸 Tip: Take a clear photo from above showing all seats clearly. Good lighting helps!
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Mark Seats */}
      {step === 2 && imagePreview && (
        <div className="glass-card-static rounded-2xl p-4 sm:p-6 space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Step 2: Mark Seat Regions</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            <strong>Click and drag</strong> on the image below to draw a bounding box around each seat or desk area.
            (If you just click, a default-sized box will be created).
          </p>

          {/* Image Display */}
          <div
            ref={imageContainerRef}
            className="border-2 border-indigo-200 dark:border-indigo-800/60 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-900 cursor-crosshair relative"
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
              draggable="false"
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
              className="w-full object-contain pointer-events-none select-none"
              style={{ display: imageLoaded ? 'block' : 'none', maxHeight: '600px' }}
            />

            {/* SVG Markers & Drawing Overlay */}
            {imageLoaded && (
              <svg
                className="absolute top-0 left-0 w-full h-full cursor-crosshair"
                style={{ touchAction: 'none' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {/* Existing Seats */}
                {markedSeats.map((seat, index) => {
                  const imgEl = imageCanvasRef.current;
                  if (!imgEl) return null;

                  const imgRect = imgEl.getBoundingClientRect();
                  const containerRect = imgEl.parentElement.getBoundingClientRect();

                  const offsetX = imgRect.left - containerRect.left;
                  const offsetY = imgRect.top - containerRect.top;

                  // fallback for old points without norm_w/h
                  const w = (seat.norm_w || 0.15) * imgRect.width;
                  const h = (seat.norm_h || 0.20) * imgRect.height;

                  const centerX = offsetX + (seat.norm_x * imgRect.width);
                  const centerY = offsetY + (seat.norm_y * imgRect.height);

                  const x = centerX - (w / 2);
                  const y = centerY - (h / 2);

                  return (
                    <g key={index} style={{ pointerEvents: 'none' }}>
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill={selectedSeatIndex === index ? '#ef4444' : '#3b82f6'}
                        fillOpacity="0.3"
                        stroke={selectedSeatIndex === index ? '#ef4444' : '#3b82f6'}
                        strokeWidth="3"
                        rx="4"
                      />
                      <rect
                        x={centerX - 15}
                        y={centerY - 15}
                        width="30"
                        height="30"
                        rx="15"
                        fill={selectedSeatIndex === index ? '#ef4444' : '#3b82f6'}
                        fillOpacity="0.8"
                      />
                      <text
                        x={centerX}
                        y={centerY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="14"
                        fontWeight="bold"
                        fill="white"
                      >
                        {seat.seat_number}
                      </text>
                    </g>
                  );
                })}

                {/* Actively Drawing Seat Preview */}
                {isDrawing && drawingStart && drawingCurrent && (
                  <g pointerEvents="none">
                    {(() => {
                      const imgRect = imageCanvasRef.current.getBoundingClientRect();
                      const containerRect = imageCanvasRef.current.parentElement.getBoundingClientRect();
                      const offsetX = imgRect.left - containerRect.left;
                      const offsetY = imgRect.top - containerRect.top;

                      const minX = Math.min(drawingStart.normX, drawingCurrent.normX);
                      const minY = Math.min(drawingStart.normY, drawingCurrent.normY);
                      let normW = Math.abs(drawingCurrent.normX - drawingStart.normX);
                      let normH = Math.abs(drawingCurrent.normY - drawingStart.normY);
                      let drawnRect = { x: minX, y: minY, w: normW, h: normH };

                      // Show the preview using default size if they are just clicking
                      if (normW < 0.02 || normH < 0.02) {
                        drawnRect.w = 0.15;
                        drawnRect.h = 0.20;
                        drawnRect.x = Math.max(0, drawingStart.normX - drawnRect.w / 2);
                        drawnRect.y = Math.max(0, drawingStart.normY - drawnRect.h / 2);
                      }

                      const x = offsetX + (drawnRect.x * imgRect.width);
                      const y = offsetY + (drawnRect.y * imgRect.height);
                      const w = drawnRect.w * imgRect.width;
                      const h = drawnRect.h * imgRect.height;

                      return (
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          fill="#10b981"
                          fillOpacity="0.4"
                          stroke="#10b981"
                          strokeWidth="2"
                          strokeDasharray="4"
                          rx="4"
                        />
                      );
                    })()}
                  </g>
                )}
              </svg>
            )}
          </div>

          <div className="bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/80 dark:border-amber-700/60 rounded-xl p-3 text-sm text-amber-800 dark:text-amber-200">
            ✓ <strong>{markedSeats.length} seats marked</strong> | Click on the image to add more
          </div>

          {/* Marked Seats Summary */}
          {markedSeats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {markedSeats.map((seat, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedSeatIndex(selectedSeatIndex === index ? null : index)}
                  className={`p-2.5 rounded-xl text-center cursor-pointer font-bold transition-all ${selectedSeatIndex === index
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/50'
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
              variant="outline"
              className="flex-1"
              disabled={markedSeats.length === 0}
            >
              Clear All
            </Button>
            <Button
              onClick={handleSaveSeats}
              disabled={savingSeats || markedSeats.length === 0}
              variant="gradient-success"
              className="flex-1 py-3 font-bold"
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
        <div className="glass-card-static rounded-2xl border border-emerald-300/70 dark:border-emerald-700/60 p-6 sm:p-8 text-center space-y-6">
          <div className="text-6xl mb-4">✓</div>
          <h2 className="text-3xl font-bold text-green-600 dark:text-green-400">Seating Plan Saved!</h2>
          <div className="bg-emerald-50/80 dark:bg-emerald-900/20 border border-emerald-200/80 dark:border-emerald-700/60 rounded-xl p-4">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {markedSeats.length} Seats Marked Successfully
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Great! Now you need to assign students to these seats.
            </p>
          </div>

          <Button
            onClick={() => onNext && onNext()}
            variant="gradient-success"
            className="w-full py-4 text-lg font-bold"
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
