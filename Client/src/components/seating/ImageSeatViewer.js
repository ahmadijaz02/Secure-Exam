import React, { useRef, useState } from 'react';
import Button from '../ui/Button';
import LoadingSpinner from '../ui/LoadingSpinner';
import { API_CONFIG } from '../../api/config/apiConfig';

function ImageSeatViewer({ plan, onEdit, onClose }) {
  const imageCanvasRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(null);
  const [, forceUpdate] = useState(0); // Force re-render for SVG positioning

  const getFullImageUrl = (imagePath) => {
    if (!imagePath) return '';
    if (imagePath.startsWith('http')) return imagePath;
    // Keep /api in the path for uploads route
    const base = API_CONFIG.BASE_URL.replace(/\/$/, '');
    return `${base}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
  };

  const imageUrl = getFullImageUrl(plan?.image_path);
  const seats = plan?.seats || [];  
  console.log('ImageSeatViewer - Image URL:', imageUrl); // Debug log
  console.log('ImageSeatViewer - Plan:', plan); // Debug log
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Classroom Seating Arrangement
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {plan?.classroom_name} {plan?.room_number && `• Room ${plan.room_number}`}
          </p>
        </div>
        {onEdit && (
          <Button
            variant="secondary"
            onClick={onEdit}
            className="text-sm"
          >
            📍 Edit Seat Positions
          </Button>
        )}
      </div>

      {/* Image with Seat Markers */}
      {imageUrl && (
        <div className="border-2 border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900 relative" style={{ minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="relative w-full">
            {!imageLoaded && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <LoadingSpinner />
                <p className="ml-2 text-gray-600 dark:text-gray-400">Loading image...</p>
              </div>
            )}
            {imageError && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="text-center p-4">
                  <p className="text-red-600 dark:text-red-400 font-semibold">Failed to load image</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{imageError}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 break-all">{imageUrl}</p>
                </div>
              </div>
            )}
            <img
              ref={imageCanvasRef}
              src={imageUrl}
              alt="Classroom Layout"
              onLoad={() => {
                console.log('Image loaded successfully in viewer');
                setImageLoaded(true);
                setImageError(null);
                // Force re-render after image dimensions are available
                setTimeout(() => forceUpdate(prev => prev + 1), 100);
              }}
              onError={(e) => {
                console.error('Image failed to load in viewer:', imageUrl);
                setImageError('Image could not be loaded');
                setImageLoaded(false);
              }}
              className="w-full object-contain"
              style={{ display: imageLoaded ? 'block' : 'none', maxHeight: '600px', margin: '0 auto' }}
            />

            {/* SVG Overlay for Seat Markers - Only show when image is loaded */}
            {imageLoaded && seats.length > 0 && (
              <svg className="absolute top-0 left-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                {seats
                  .filter(seat => seat.norm_x !== undefined && seat.norm_y !== undefined)
                  .map((seat, index) => {
                    const imgEl = imageCanvasRef.current;
                    if (!imgEl) return null;

                    const imgRect = imgEl.getBoundingClientRect();
                    const containerRect = imgEl.parentElement.getBoundingClientRect();

                    // Calculate position relative to the container
                    const offsetX = imgRect.left - containerRect.left;
                    const offsetY = imgRect.top - containerRect.top;
                    const x = offsetX + (seat.norm_x * imgRect.width);
                    const y = offsetY + (seat.norm_y * imgRect.height);

                    if (index === 0) {
                      console.log('Viewer marker calc:', { 
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

                    const hasStudent = seat.student_name || seat.studentName;
                    const seatColor = hasStudent ? '#10b981' : '#3b82f6'; // Green if occupied, blue if empty
                    
                    return (
                      <g key={index}>
                        {/* Outer circle for visibility */}
                        <circle
                          cx={x}
                          cy={y}
                          r={24}
                          fill={seatColor}
                          fillOpacity="0.9"
                          stroke="white"
                          strokeWidth="3"
                        />
                        {/* Seat number */}
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
                      
                      {/* Student info tooltip-like display */}
                      {hasStudent && (
                        <g>
                          {/* Info background */}
                          <rect
                            x={x + 30}
                            y={y - 15}
                            width="auto"
                            height="30"
                            rx="4"
                            fill="rgba(0, 0, 0, 0.8)"
                            pointerEvents="none"
                          />
                          {/* Student name text */}
                          <text
                            x={x + 35}
                            y={y}
                            fontSize="11"
                            fontWeight="600"
                            fill="white"
                            pointerEvents="none"
                          >
                            {seat.student_name || seat.studentName}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Seat Legend */}
      <div className="flex items-center gap-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-green-500 border-2 border-white"></div>
          <span className="text-sm text-gray-700 dark:text-gray-300">Assigned ({seats.filter(s => s.student_name || s.studentName).length})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white"></div>
          <span className="text-sm text-gray-700 dark:text-gray-300">Empty ({seats.filter(s => !(s.student_name || s.studentName)).length})</span>
        </div>
        <div className="flex-1"></div>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          Total: {seats.length} seats
        </span>
      </div>

      {/* Student List */}
      {seats.filter(s => s.student_name || s.studentName).length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-100 dark:bg-gray-800 p-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Assigned Students ({seats.filter(s => s.student_name || s.studentName).length})
            </h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Seat #</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Student Name</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Roll Number</th>
                </tr>
              </thead>
              <tbody>
                {seats
                  .filter(s => s.student_name || s.studentName)
                  .sort((a, b) => {
                    const aNo = a.seat_number ? parseInt(a.seat_number, 10) : Number.MAX_SAFE_INTEGER;
                    const bNo = b.seat_number ? parseInt(b.seat_number, 10) : Number.MAX_SAFE_INTEGER;
                    return aNo - bNo;
                  })
                  .map((seat, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    >
                      <td className="px-4 py-2 font-semibold text-gray-900 dark:text-white">{seat.seat_number}</td>
                      <td className="px-4 py-2 text-gray-900 dark:text-white">{seat.student_name || seat.studentName}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{seat.roll_number || seat.rollNumber}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Close Button */}
      {onClose && (
        <div className="flex justify-end">
          <Button onClick={onClose} className="px-6">
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

export default ImageSeatViewer;
