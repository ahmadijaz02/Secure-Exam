"""
Utility functions for seating plan image processing and student data parsing
"""

import pandas as pd
import json
import os
from datetime import datetime

class SeatIdNormalizer:
    """Utility class for normalizing and comparing seat identifiers"""
    
    @staticmethod
    def normalize(seat_id):
        """
        Normalize seat identifier for consistent matching
        Handles numeric and alphabetic identifiers (case-insensitive)
        
        Args:
            seat_id: Seat identifier (string or int)
        
        Returns:
            str: Normalized seat identifier
        """
        if seat_id is None:
            return ''
        
        seat_str = str(seat_id).strip()
        
        # Try to parse as integer first
        try:
            num = int(seat_str)
            return str(num)
        except ValueError:
            pass
        
        # For alphabetic identifiers, convert to uppercase for consistent matching
        return seat_str.upper()
    
    @staticmethod
    def matches(seat_id_1, seat_id_2):
        """
        Check if two seat identifiers match (handles numeric and alphabetic)
        
        Args:
            seat_id_1: First seat identifier
            seat_id_2: Second seat identifier
        
        Returns:
            bool: True if seats match
        """
        return SeatIdNormalizer.normalize(seat_id_1) == SeatIdNormalizer.normalize(seat_id_2)


class StudentDataParser:
    """Parse student data from various file formats"""
    
    @staticmethod
    def parse_csv(file_path):
        """
        Parse CSV file with student data
        Expected columns: Student Name, Roll No, Seat No
        """
        try:
            df = pd.read_csv(file_path)
            # Normalize column names (case-insensitive)
            df.columns = df.columns.str.lower().str.strip()
            
            # Rename columns to standard format
            column_mapping = {
                'name': 'student_name',
                'student name': 'student_name',
                'roll_number': 'roll_number',
                'roll number': 'roll_number',
                'roll_no': 'roll_number',
                'roll no': 'roll_number',
                'rollno': 'roll_number',
                'seat_number': 'seat_number',
                'seat number': 'seat_number',
                'seat_no': 'seat_number',
                'seat no': 'seat_number',
                'seatno': 'seat_number'
            }
            
            for old_col, new_col in column_mapping.items():
                if old_col in df.columns and new_col not in df.columns:
                    df = df.rename(columns={old_col: new_col})
            
            # Required columns
            if 'student_name' not in df.columns or 'roll_number' not in df.columns or 'seat_number' not in df.columns:
                return None, "CSV must contain 'Student Name', 'Roll No', and 'Seat No' columns"
            
            # Remove NaN rows
            df = df.dropna(subset=['student_name', 'roll_number', 'seat_number'])
            
            # Sort by seat number
            df = df.sort_values(by='seat_number')
            students = df[['student_name', 'roll_number', 'seat_number']].to_dict('records')
            
            return students, None
        except Exception as e:
            return None, f"Error parsing CSV: {str(e)}"
    
    @staticmethod
    def parse_excel(file_path, sheet_name='Sheet1'):
        """
        Parse Excel file with student data
        Expected columns: Student Name, Roll No, Seat No
        """
        try:
            # Try to read the first sheet if specified sheet doesn't exist
            try:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
            except:
                df = pd.read_excel(file_path, sheet_name=0)
            
            # Normalize column names (case-insensitive)
            df.columns = df.columns.str.lower().str.strip()
            
            # Rename columns to standard format
            column_mapping = {
                'name': 'student_name',
                'student name': 'student_name',
                'roll_number': 'roll_number',
                'roll number': 'roll_number',
                'roll_no': 'roll_number',
                'roll no': 'roll_number',
                'rollno': 'roll_number',
                'seat_number': 'seat_number',
                'seat number': 'seat_number',
                'seat_no': 'seat_number',
                'seat no': 'seat_number',
                'seatno': 'seat_number'
            }
            
            for old_col, new_col in column_mapping.items():
                if old_col in df.columns and new_col not in df.columns:
                    df = df.rename(columns={old_col: new_col})
            
            # Required columns
            if 'student_name' not in df.columns or 'roll_number' not in df.columns or 'seat_number' not in df.columns:
                return None, f"Excel must contain 'Student Name', 'Roll No', and 'Seat No' columns. Found: {list(df.columns)}"
            
            # Remove NaN rows
            df = df.dropna(subset=['student_name', 'roll_number', 'seat_number'])
            
            # Sort by seat number
            df = df.sort_values(by='seat_number')
            students = df[['student_name', 'roll_number', 'seat_number']].to_dict('records')
            
            return students, None
        except Exception as e:
            return None, f"Error parsing Excel: {str(e)}"
    
    @staticmethod
    def parse_pdf(file_path):
        """
        Parse PDF file with student data
        Expected format: Lines with "Student Name, Roll Number" or table format
        """
        try:
            students = []
            try:
                from PyPDF2 import PdfReader
            except ImportError:
                return None, "PDF parsing is not available on the server. Please install PyPDF2 to enable PDF uploads."

            reader = PdfReader(file_path)

            for page in reader.pages:
                text = page.extract_text() or ''
                lines = text.split('\n')

                for line in lines:
                    # Try to parse line with comma separation
                    if ',' in line:
                        parts = [p.strip() for p in line.split(',')]
                        if len(parts) >= 2:
                            students.append({
                                'student_name': parts[0],
                                'roll_number': parts[1]
                            })

            if not students:
                return None, "No student data found in PDF"

            return students, None
        except Exception as e:
            return None, f"Error parsing PDF: {str(e)}"
    
    @staticmethod
    def parse_file(file_path):
        """
        Auto-detect and parse file based on extension
        Returns: (students_list, error_message)
        """
        if not os.path.exists(file_path):
            return None, "File not found"
        
        _, file_ext = os.path.splitext(file_path)
        file_ext = file_ext.lower()
        
        if file_ext == '.csv':
            return StudentDataParser.parse_csv(file_path)
        elif file_ext in ['.xlsx', '.xls']:
            return StudentDataParser.parse_excel(file_path)
        elif file_ext == '.pdf':
            return StudentDataParser.parse_pdf(file_path)
        else:
            return None, f"Unsupported file format: {file_ext}"


class SeatingCoordinateMapper:
    """Map student data to seat coordinates from image"""
    
    @staticmethod
    def is_seat_occupied(seat):
        """
        Check if a seat is occupied (has both student_name and roll_number)
        Case-insensitive and handles both empty strings and None values
        
        Args:
            seat: Seat object with student_name and roll_number
        
        Returns:
            bool: True if seat has both student_name and roll_number
        """
        student_name = seat.get('student_name', '')
        roll_number = seat.get('roll_number', '')
        
        # Handle None values
        if student_name is None:
            student_name = ''
        if roll_number is None:
            roll_number = ''
        
        # Convert to string and strip whitespace
        student_name_str = str(student_name).strip()
        roll_number_str = str(roll_number).strip()
        
        return bool(student_name_str and roll_number_str)
    
    @staticmethod
    def map_students_to_coordinates_sequential(students_list, coordinates_list, existing_seats=None):
        """
        Map students to seat coordinates using SEQUENTIAL MAPPING (click order based)
        
        IMPORTANT: The order of coordinates matches the order of clicks, and each coordinate
        should be assigned to the student with the matching SEAT NUMBER from the CSV file.
        
        Args:
            students_list: List of dicts with 'student_name', 'roll_number', 'seat_number'
                          SORTED by seat_number
            coordinates_list: List of dicts with 'pixel_x', 'pixel_y', 'seat_number'
                            (seat_number should match CSV seat numbers)
            existing_seats: List of existing seat objects (for protected seat logic)
        
        Returns:
            Tuple (List of seat objects with student info and coordinates, error message)
            
        Protected Seat Logic (Case-Insensitive):
            - If a seat is marked as 'protected' OR has existing student data:
              - The CSV upload will NOT overwrite it
              - The existing data is preserved
            - Seat numbers are matched case-insensitively to ensure protection works
            - Example: "Seat 10", "SEAT 10", "seat 10" are all treated as the same seat
        """
        try:
            mapped_seats = []

            # Build lookup by normalized seat_number from students_list
            # Key: normalized seat number, Value: student data
            students_by_seat = {}
            for s in students_list:
                seat_no_str = s.get('seat_number')
                if seat_no_str is not None:
                    seat_no_normalized = SeatIdNormalizer.normalize(seat_no_str)
                    if seat_no_normalized:
                        students_by_seat[seat_no_normalized] = s

            # Build lookup for existing seats by normalized seat_number for protected seat checking
            existing_seats_by_number = {}
            if existing_seats:
                for seat in existing_seats:
                    seat_no_str = seat.get('seat_number')
                    if seat_no_str is not None:
                        seat_no_normalized = SeatIdNormalizer.normalize(seat_no_str)
                        if seat_no_normalized:
                            existing_seats_by_number[seat_no_normalized] = seat

            # Process each coordinate
            for idx, coordinate in enumerate(coordinates_list):
                # Get coordinate seat number and normalize it (case-insensitive)
                coord_seat_no_str = coordinate.get('seat_number')
                coord_seat_no_normalized = SeatIdNormalizer.normalize(coord_seat_no_str) if coord_seat_no_str else None

                # Look up student data by SEAT NUMBER (case-insensitive)
                student = None
                if coord_seat_no_normalized and coord_seat_no_normalized in students_by_seat:
                    student = students_by_seat.get(coord_seat_no_normalized)

                # Determine the final seat number
                seat_number = coord_seat_no_str if coord_seat_no_str else (idx + 1)

                # ===== PROTECTED SEAT LOGIC =====
                # Check if this seat is already occupied (manually assigned)
                is_protected = False
                protected_student_name = None
                protected_roll_number = None
                
                if coord_seat_no_normalized and coord_seat_no_normalized in existing_seats_by_number:
                    existing_seat = existing_seats_by_number[coord_seat_no_normalized]
                    
                    # A seat is protected if:
                    # 1. It has the 'protected' flag set to True, OR
                    # 2. It already has student data (manually assigned via UI)
                    marked_as_protected = existing_seat.get('protected', False)
                    is_seat_occupied = SeatingCoordinateMapper.is_seat_occupied(existing_seat)
                    
                    if marked_as_protected or is_seat_occupied:
                        is_protected = True
                        protected_student_name = existing_seat.get('student_name', '')
                        protected_roll_number = existing_seat.get('roll_number', '')

                # ===== ASSIGN STUDENT DATA =====
                # If seat is protected, keep existing data; otherwise use CSV data
                if is_protected:
                    student_name = protected_student_name if protected_student_name else ''
                    roll_number = protected_roll_number if protected_roll_number else ''
                else:
                    student_name = student.get('student_name', '') if student else ''
                    roll_number = student.get('roll_number', '') if student else ''
                
                occupied = SeatingCoordinateMapper.is_seat_occupied({
                    'student_name': student_name,
                    'roll_number': roll_number
                })

                seat = {
                    'id': f"{coordinate.get('pixel_x', idx)}-{coordinate.get('pixel_y', idx)}",
                    'pixel_x': coordinate.get('pixel_x'),
                    'pixel_y': coordinate.get('pixel_y'),
                    'seat_number': seat_number,
                    'student_name': student_name,
                    'roll_number': roll_number,
                    'occupied': occupied,
                    'protected': is_protected,
                    'created_at': datetime.utcnow().isoformat()
                }
                mapped_seats.append(seat)

            return mapped_seats, None
        except Exception as e:
            return None, f"Error mapping students to coordinates: {str(e)}"
    
    @staticmethod
    def map_students_to_coordinates(students_list, coordinates_list, existing_seats=None):
        """
        Map students to clicked seat coordinates with protected seat logic
        
        DEPRECATED: Use map_students_to_coordinates_sequential() instead for new implementations
        
        Args:
            students_list: List of dicts with 'student_name', 'roll_number', 'seat_number'
            coordinates_list: List of dicts with 'pixel_x', 'pixel_y', 'seat_number'
            existing_seats: List of existing seat objects (for protected seat logic)
        
        Returns:
            Tuple (List of seat objects with student info and coordinates, error message)
            
        Protected Seat Logic:
            - If a seat is already occupied (manually assigned), it will NOT be overwritten by CSV data
            - Protected status is preserved to prevent future overwrites
        """
        try:
            mapped_seats = []

            # Build lookup by normalized seat_number from students_list
            students_by_seat = {}
            remaining_students = []
            for s in students_list:
                seat_no_str = s.get('seat_number')
                if seat_no_str is not None:
                    seat_no_normalized = SeatIdNormalizer.normalize(seat_no_str)
                    if seat_no_normalized:
                        students_by_seat[seat_no_normalized] = s
                    else:
                        remaining_students.append(s)
                else:
                    remaining_students.append(s)

            # Prepare an iterator for remaining students
            rem_iter = iter(remaining_students)

            # Build lookup for existing seats by normalized seat_number for protected seat checking
            existing_seats_by_number = {}
            if existing_seats:
                for seat in existing_seats:
                    seat_no_str = seat.get('seat_number')
                    if seat_no_str is not None:
                        seat_no_normalized = SeatIdNormalizer.normalize(seat_no_str)
                        if seat_no_normalized:
                            existing_seats_by_number[seat_no_normalized] = seat

            for idx, coordinate in enumerate(coordinates_list):
                # Get coordinate seat number and normalize it
                coord_seat_no_str = coordinate.get('seat_number')
                coord_seat_no_normalized = SeatIdNormalizer.normalize(coord_seat_no_str) if coord_seat_no_str else None

                student = None
                
                # Try to match by explicit seat_number (normalized)
                if coord_seat_no_normalized and coord_seat_no_normalized in students_by_seat:
                    student = students_by_seat.pop(coord_seat_no_normalized)
                else:
                    # If no direct match, pick next remaining student (if any)
                    try:
                        student = next(rem_iter)
                    except StopIteration:
                        student = None

                # Determine the final seat number
                if coord_seat_no_str:
                    seat_number = coord_seat_no_str
                elif student and student.get('seat_number'):
                    seat_number = student.get('seat_number')
                else:
                    seat_number = idx + 1

                # Check if this seat is protected (manually assigned via UI)
                is_protected = False
                protected_student_name = None
                protected_roll_number = None
                marked_as_protected = False
                
                if coord_seat_no_normalized and coord_seat_no_normalized in existing_seats_by_number:
                    existing_seat = existing_seats_by_number[coord_seat_no_normalized]
                    # Check if the seat has protected flag or has student data already assigned
                    marked_as_protected = existing_seat.get('protected', False)
                    is_seat_occupied = SeatingCoordinateMapper.is_seat_occupied(existing_seat)
                    
                    if marked_as_protected or is_seat_occupied:
                        is_protected = True
                        protected_student_name = existing_seat.get('student_name')
                        protected_roll_number = existing_seat.get('roll_number')

                # Use protected data if seat is protected, otherwise use CSV data
                if is_protected:
                    student_name = protected_student_name if protected_student_name else ''
                    roll_number = protected_roll_number if protected_roll_number else ''
                else:
                    student_name = student.get('student_name', '') if student else ''
                    roll_number = student.get('roll_number', '') if student else ''
                
                occupied = SeatingCoordinateMapper.is_seat_occupied({
                    'student_name': student_name,
                    'roll_number': roll_number
                })

                seat = {
                    'id': f"{coordinate.get('pixel_x', idx)}-{coordinate.get('pixel_y', idx)}",
                    'pixel_x': coordinate.get('pixel_x'),
                    'pixel_y': coordinate.get('pixel_y'),
                    'seat_number': seat_number,
                    'student_name': student_name,
                    'roll_number': roll_number,
                    'occupied': occupied,
                    'protected': is_protected,
                    'created_at': datetime.utcnow().isoformat()
                }
                mapped_seats.append(seat)

            return mapped_seats, None
        except Exception as e:
            return None, f"Error mapping students to coordinates: {str(e)}"
    
    @staticmethod
    def create_seating_plan_from_image_and_students(
        classroom_name, 
        rows, 
        columns, 
        image_path, 
        student_coordinates
    ):
        """
        Create a complete seating plan from image coordinates and students
        
        Args:
            classroom_name: Name of classroom
            rows: Number of rows
            columns: Number of columns
            image_path: Path to classroom image
            student_coordinates: List of {pixel_x, pixel_y, seat_number}
        
        Returns:
            Seating plan data ready for database
        """
        try:
            seats = []
            
            for idx, coord in enumerate(student_coordinates):
                seat = {
                    'id': f"{coord['pixel_x']}-{coord['pixel_y']}",
                    'row': coord.get('row', idx // columns),
                    'column': coord.get('column', idx % columns),
                    'pixel_x': coord['pixel_x'],
                    'pixel_y': coord['pixel_y'],
                    'seat_number': coord.get('seat_number', idx + 1),
                    'student_name': coord.get('student_name', ''),
                    'roll_number': coord.get('roll_number', ''),
                    'occupied': bool(coord.get('student_name')),
                    'image_path': image_path,
                    'created_at': datetime.utcnow().isoformat()
                }
                seats.append(seat)
            
            total_seats = rows * columns
            occupied_seats = len([s for s in seats if s['occupied']])
            
            seating_plan = {
                'classroom_name': classroom_name,
                'rows': rows,
                'columns': columns,
                'seats': seats,
                'total_seats': total_seats,
                'occupied_seats': occupied_seats,
                'image_path': image_path,
                'created_at': datetime.utcnow().isoformat()
            }
            
            return seating_plan, None
        except Exception as e:
            return None, f"Error creating seating plan: {str(e)}"
