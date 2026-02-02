/**
 * Shared seating plan utility functions
 * Used by both AdminExamSessions and AdminSeatingPlans pages
 */

/**
 * Render seating grid for viewing/displaying arrangements
 * @param {Object} plan - Seating plan object with seats array
 * @returns {JSX.Element} Rendered grid
 */
export const renderSeatingGrid = (plan) => {
  const seatMap = {};
  (plan.seats || []).forEach(seat => {
    const key = `${seat.row}-${seat.column}`;
    seatMap[key] = seat;
  });

  const rows = [];
  for (let r = 0; r < plan.rows; r++) {
    const cols = [];
    for (let c = 0; c < plan.columns; c++) {
      const key = `${r}-${c}`;
      const seat = seatMap[key] || { row: r, column: c, occupied: false };
      
      const isOccupied = seat.student_name || seat.studentName;
      const studentName = seat.student_name || seat.studentName || '';
      const rollNumber = seat.roll_number || seat.rollNumber || '';
      
      cols.push(
        <div
          key={key}
          className={`h-16 border rounded flex flex-col items-center justify-center p-1 text-center text-xs font-medium cursor-default transition-all ${
            isOccupied
              ? 'bg-blue-100 border-blue-300 text-blue-900 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-100'
              : 'bg-green-100 border-green-300 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200'
          }`}
          title={isOccupied ? `${studentName}\n${rollNumber}` : `Seat ${String.fromCharCode(65 + r)}${c + 1}`}
        >
          {isOccupied ? (
            <>
              <div className="font-semibold text-[10px] truncate w-full">{String.fromCharCode(65 + r)}{c + 1}</div>
              <div className="text-[10px] truncate w-full leading-tight">{studentName}</div>
              <div className="text-[9px] truncate w-full opacity-75">{rollNumber}</div>
            </>
          ) : (
            <div className="font-semibold text-xs">{String.fromCharCode(65 + r)}{c + 1}</div>
          )}
        </div>
      );
    }
    rows.push(
      <div key={r} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${plan.columns}, minmax(0, 1fr))` }}>
        {cols}
      </div>
    );
  }
  return <div className="space-y-2">{rows}</div>;
};

/**
 * Render editable seating grid for creating/editing arrangements
 * @param {Array} seats - Seats array
 * @param {number} rows - Number of rows
 * @param {number} columns - Number of columns
 * @param {string} selectedSeatKey - Currently selected seat key
 * @param {Function} onSelectSeat - Callback when seat is selected
 * @returns {JSX.Element} Rendered editable grid
 */
export const renderSeatingEditor = (seats, rows, columns, selectedSeatKey, onSelectSeat) => {
  const seatMap = {};
  seats.forEach(seat => {
    const key = `${seat.row}-${seat.column}`;
    seatMap[key] = seat;
  });

  const gridRows = [];
  for (let r = 0; r < rows; r++) {
    const cols = [];
    for (let c = 0; c < columns; c++) {
      const key = `${r}-${c}`;
      const seat = seatMap[key] || { row: r, column: c, occupied: false };
      cols.push(
        <button
          type="button"
          key={key}
          onClick={() => onSelectSeat(r, c)}
          className={`h-12 border rounded flex items-center justify-center text-xs font-medium cursor-pointer transition-colors ${
            !seat.occupied
              ? 'bg-green-100 border-green-300 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:border-green-700 dark:text-green-200'
              : 'bg-blue-100 border-blue-300 text-blue-900 hover:bg-blue-200 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-200'
          } ${selectedSeatKey === key ? 'ring-2 ring-blue-500' : ''}`}
          title={seat.student_name ? `${seat.student_name} (${seat.roll_number || 'N/A'})` : `Seat ${String.fromCharCode(65 + r)}${c + 1}`}
        >
          {String.fromCharCode(65 + r)}{c + 1}
        </button>
      );
    }
    gridRows.push(
      <div key={r} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {cols}
      </div>
    );
  }
  return <div className="space-y-2">{gridRows}</div>;
};

/**
 * Assign student to a seat and auto-set occupied flag
 * @param {Array} seats - Current seats array
 * @param {string} selectedSeatKey - Selected seat key (row-column)
 * @param {string} studentName - Student name to assign
 * @param {string} rollNumber - Roll number to assign
 * @returns {Array} Updated seats array
 */
export const assignStudentToSeat = (seats, selectedSeatKey, studentName, rollNumber) => {
  if (!selectedSeatKey || !studentName.trim() || !rollNumber.trim()) {
    return seats;
  }

  const [rowStr, columnStr] = selectedSeatKey.split('-');
  const row = parseInt(rowStr, 10);
  const column = parseInt(columnStr, 10);

  return seats.map(seat =>
    seat.row === row && seat.column === column
      ? {
          ...seat,
          student_name: studentName.trim(),
          roll_number: rollNumber.trim(),
          occupied: true, // Auto-set occupied to true
        }
      : seat
  );
};

/**
 * Clear student from a seat
 * @param {Array} seats - Current seats array
 * @param {string} selectedSeatKey - Selected seat key (row-column)
 * @returns {Array} Updated seats array
 */
export const clearStudentFromSeat = (seats, selectedSeatKey) => {
  if (!selectedSeatKey) {
    return seats;
  }

  const [rowStr, columnStr] = selectedSeatKey.split('-');
  const row = parseInt(rowStr, 10);
  const column = parseInt(columnStr, 10);

  return seats.map(seat =>
    seat.row === row && seat.column === column
      ? {
          ...seat,
          student_name: null,
          roll_number: null,
          occupied: false,
        }
      : seat
  );
};

/**
 * Get student data from a seat
 * @param {Array} seats - Seats array
 * @param {number} row - Row index
 * @param {number} column - Column index
 * @returns {Object} Object with student_name and roll_number
 */
export const getSeatStudentData = (seats, row, column) => {
  const seat = seats.find(s => s.row === row && s.column === column);
  return {
    student_name: seat?.student_name || seat?.studentName || '',
    roll_number: seat?.roll_number || seat?.rollNumber || '',
  };
};

/**
 * Generate empty seats array
 * @param {number} rows - Number of rows
 * @param {number} columns - Number of columns
 * @returns {Array} Generated seats array
 */
export const generateSeats = (rows, columns) => {
  const newSeats = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      newSeats.push({
        id: `${row}-${col}`,
        row,
        column: col,
        student_id: null,
        student_name: null,
        roll_number: null,
        occupied: false,
      });
    }
  }
  return newSeats;
};
