/**
 * Shared seating plan utility functions
 * Used by both AdminExamSessions and AdminSeatingPlans pages
 */

/**
 * Render seating grid for viewing/displaying arrangements
 * Total Seats Logic - displays seats as a flexible list without row/column information
 * @param {Object} plan - Seating plan object with seats array
 * @returns {JSX.Element} Rendered grid
 */
export const renderSeatingGrid = (plan) => {
  if (!plan || !plan.seats || plan.seats.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No seats available</div>;
  }

  // Render seats as flexible grid - no row/column display
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {plan.seats.map((seat, idx) => {
        const isOccupied = !!(seat.student_name || seat.studentName);
        const studentName = seat.student_name || seat.studentName || '';
        const rollNumber = seat.roll_number || seat.rollNumber || '';
        const seatLabel = seat.seat_number || `${idx + 1}`;

        return (
          <div
            key={seat.id || `${seat.pixel_x}-${seat.pixel_y}-${idx}`}
            className={`border rounded p-3 text-xs text-left transition-all relative ${
              isOccupied 
                ? 'bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700' 
                : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
            }`}
            title={studentName ? `${seatLabel}: ${studentName}${rollNumber ? ` (${rollNumber})` : ''}` : ''}
          >
            <div className="font-bold text-sm mb-2 text-blue-600 dark:text-blue-400">{seatLabel}</div>
            <div className="text-[13px] font-semibold truncate text-gray-900 dark:text-gray-100">{studentName || <span className="text-gray-400 dark:text-gray-500">—</span>}</div>
            {rollNumber && <div className="text-[12px] text-gray-600 dark:text-gray-400 mt-1">{rollNumber}</div>}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Render editable seating grid for creating/editing arrangements
 * Total Seats Logic - render as flexible list without grid constraints
 * @param {Array} seats - Seats array
 * @param {string} selectedSeatKey - Currently selected seat number
 * @param {Function} onSelectSeat - Callback when seat is selected (passes seat number)
 * @returns {JSX.Element} Rendered editable grid
 */
export const renderSeatingEditor = (seats, selectedSeatKey, onSelectSeat) => {
  if (!seats || seats.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No seats available</div>;
  }

  // Render seats as flexible grid - no row/column constraints
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {seats.map((seat) => {
        const isOccupied = !!(seat.student_name || seat.studentName);
        const studentName = seat.student_name || seat.studentName || '';
        const rollNumber = seat.roll_number || seat.rollNumber || '';
        const seatLabel = seat.seat_number || `Seat ${seat.id}`;
        const seatKey = String(seat.seat_number);

        return (
          <button
            key={seatKey}
            onClick={() => onSelectSeat(seatKey)}
            className={`border rounded p-3 text-xs text-left cursor-pointer transition-all relative ${
              isOccupied
                ? 'bg-blue-100 border-blue-300 hover:bg-blue-200 dark:bg-blue-900 dark:border-blue-700 dark:hover:bg-blue-800'
                : 'bg-green-100 border-green-300 hover:bg-green-200 dark:bg-green-900 dark:border-green-700 dark:hover:bg-green-800'
            } ${selectedSeatKey === seatKey ? 'ring-2 ring-blue-500' : ''}`}
            title={studentName ? `${seatLabel}: ${studentName} (${rollNumber})` : `Seat ${seatLabel}`}
          >
            <div className="font-bold text-sm mb-2 text-blue-600 dark:text-blue-400">{seatLabel}</div>
            <div className="text-[13px] font-semibold truncate text-gray-900 dark:text-gray-100">{studentName || <span className="text-gray-400 dark:text-gray-500">—</span>}</div>
            {rollNumber && <div className="text-[12px] text-gray-600 dark:text-gray-400 mt-1">{rollNumber}</div>}
          </button>
        );
      })}
    </div>
  );
};

/**
 * Assign student to a seat using seat_number as primary key
 * Now includes seat_number, student_name, and roll_number as mandatory fields
 * UPDATED: Respects protected seats (manually assigned)
 * @param {Array} seats - Current seats array
 * @param {string} selectedSeatKey - Selected seat_number (primary key)
 * @param {string|number} seatNumber - Seat number (can be edited)
 * @param {string} studentName - Student name to assign
 * @param {string} rollNumber - Roll number to assign
 * @returns {Array} Updated seats array
 */
export const assignStudentToSeat = (seats, selectedSeatKey, seatNumber, studentName, rollNumber) => {
  if (!selectedSeatKey || !studentName.trim() || !rollNumber.trim()) {
    return seats;
  }

  return seats.map(seat => {
    // Primary key: match by seat_number (normalized)
    const isMatch = seatIdMatches(seat.seat_number, selectedSeatKey);
    
    return isMatch
      ? {
          ...seat,
          seat_number: seatNumber || selectedSeatKey,
          student_name: studentName.trim(),
          roll_number: rollNumber.trim(),
          occupied: true,
          protected: true, // Mark as protected when manually assigned
        }
      : seat;
  });
};

/**
 * Clear student from a seat using seat_number as primary key
 * UPDATED: Uses normalized seat ID matching
 * @param {Array} seats - Current seats array
 * @param {string} selectedSeatKey - Selected seat_number (primary key)
 * @returns {Array} Updated seats array
 */
export const clearStudentFromSeat = (seats, selectedSeatKey) => {
  if (!selectedSeatKey) {
    return seats;
  }

  return seats.map(seat => {
    // Primary key: match by seat_number (normalized)
    const isMatch = seatIdMatches(seat.seat_number, selectedSeatKey);
    
    return isMatch
      ? {
          ...seat,
          student_name: null,
          roll_number: null,
          occupied: false,
          protected: false, // Clear protection when clearing student
        }
      : seat;
  });
};

/**
 * Get student data from a seat using seat_number
 * UPDATED: Uses normalized seat ID matching
 * @param {Array} seats - Seats array
 * @param {number|string} seatNumber - Seat number to lookup
 * @returns {Object} Object with student_name and roll_number
 */
export const getSeatStudentData = (seats, seatNumber) => {
  const seat = seats.find(s => seatIdMatches(s.seat_number, seatNumber));
  return {
    seat_number: seat?.seat_number || seatNumber || '',
    student_name: seat?.student_name || seat?.studentName || '',
    roll_number: seat?.roll_number || seat?.rollNumber || '',
  };
};

/**
 * Generate empty seats array - flat list based on total seat count
 * @param {number} totalSeats - Total number of seats to generate
 * @returns {Array} Generated seats array
 */
export const generateSeats = (totalSeats) => {
  const newSeats = [];
  for (let i = 1; i <= totalSeats; i++) {
    newSeats.push({
      id: `seat-${i}`,
      seat_number: i,
      student_id: null,
      student_name: null,
      roll_number: null,
      occupied: false,
      protected: false,
    });
  }
  return newSeats;
};

/**
 * Normalize seat identifier for consistent matching
 * Handles numeric and alphabetic identifiers (case-insensitive)
 * @param {string|number} seatId - Seat identifier to normalize
 * @returns {string} Normalized seat identifier
 */
export const normalizeSeatId = (seatId) => {
  if (!seatId) return '';
  const str = String(seatId).trim();
  // Try to parse as integer first
  const num = parseInt(str, 10);
  if (!isNaN(num)) {
    return String(num);
  }
  // For alphabetic identifiers, convert to uppercase for consistent matching
  return str.toUpperCase();
};

/**
 * Check if two seat identifiers match (handles numeric and alphabetic)
 * @param {string|number} seatId1 - First seat identifier
 * @param {string|number} seatId2 - Second seat identifier
 * @returns {boolean} True if seats match
 */
export const seatIdMatches = (seatId1, seatId2) => {
  return normalizeSeatId(seatId1) === normalizeSeatId(seatId2);
};

/**
 * Mark a seat as protected (manually assigned - should not be overwritten by CSV)
 * @param {Array} seats - Current seats array
 * @param {string} selectedSeatKey - Seat number to protect
 * @returns {Array} Updated seats array
 */
export const markSeatAsProtected = (seats, selectedSeatKey) => {
  if (!selectedSeatKey) return seats;

  return seats.map(seat => {
    const isMatch = seatIdMatches(seat.seat_number, selectedSeatKey);
    return isMatch
      ? { ...seat, protected: true }
      : seat;
  });
};

/**
 * Unprotect a seat (allow CSV overwrite)
 * @param {Array} seats - Current seats array
 * @param {string} selectedSeatKey - Seat number to unprotect
 * @returns {Array} Updated seats array
 */
export const unprotectSeat = (seats, selectedSeatKey) => {
  if (!selectedSeatKey) return seats;

  return seats.map(seat => {
    const isMatch = seatIdMatches(seat.seat_number, selectedSeatKey);
    return isMatch
      ? { ...seat, protected: false }
      : seat;
  });
};

/**
 * Assign student to a seat with protected seat awareness
 * Respects protected seats - will not overwrite if seat is protected
 * @param {Array} seats - Current seats array
 * @param {string} selectedSeatKey - Selected seat_number (primary key)
 * @param {string|number} seatNumber - Seat number (can be edited)
 * @param {string} studentName - Student name to assign
 * @param {string} rollNumber - Roll number to assign
 * @param {boolean} markAsProtected - Whether to mark as protected after assignment (default: true)
 * @returns {Array} Updated seats array
 */
export const assignStudentToSeatSafe = (seats, selectedSeatKey, seatNumber, studentName, rollNumber, markAsProtected = true) => {
  if (!selectedSeatKey || !studentName.trim() || !rollNumber.trim()) {
    return seats;
  }

  return seats.map(seat => {
    const isMatch = seatIdMatches(seat.seat_number, selectedSeatKey);
    
    if (isMatch) {
      return {
        ...seat,
        seat_number: seatNumber || selectedSeatKey,
        student_name: studentName.trim(),
        roll_number: rollNumber.trim(),
        occupied: true,
        protected: markAsProtected,
      };
    }
    return seat;
  });
};

/**
 * Check if a seat is protected (manually assigned)
 * @param {Array} seats - Seats array
 * @param {string} seatNumber - Seat number to check
 * @returns {boolean} True if seat is protected
 */
export const isSeatProtected = (seats, seatNumber) => {
  const seat = seats.find(s => seatIdMatches(s.seat_number, seatNumber));
  return seat ? (seat.protected || false) : false;
};

/**
 * Get protected seat information
 * @param {Array} seats - Seats array
 * @param {string} seatNumber - Seat number to lookup
 * @returns {Object} Seat object if protected, null otherwise
 */
export const getProtectedSeatInfo = (seats, seatNumber) => {
  const seat = seats.find(s => seatIdMatches(s.seat_number, seatNumber));
  return (seat && seat.protected) ? seat : null;
};
