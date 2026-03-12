from datetime import datetime
from bson import ObjectId
from pymongo import MongoClient
from flask_bcrypt import Bcrypt

bcrypt = Bcrypt()

class MongoModel:
    """Base class for MongoDB models"""

    def __init__(self, db):
        self.db = db

    def to_dict(self, doc):
        """Convert MongoDB document to dictionary with string _id"""
        if doc:
            doc['id'] = str(doc['_id'])
            del doc['_id']
        return doc

class User(MongoModel):
    """User model for MongoDB"""

    def __init__(self, db):
        super().__init__(db)
        self.collection = db.users
        # Create unique index on email
        self.collection.create_index("email", unique=True)

    def create_user(self, name, email, password, role='teacher'):
        """Create a new user"""
        user_doc = {
            'name': name,
            'email': email.lower(),
            'password_hash': self.set_password(password),
            'role': role,
            'is_active': True,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }

        result = self.collection.insert_one(user_doc)
        user_doc['_id'] = result.inserted_id
        return self.to_dict(user_doc)

    def find_by_email(self, email):
        """Find user by email"""
        user = self.collection.find_one({'email': email.lower()})
        return self.to_dict(user) if user else None

    def find_by_id(self, user_id):
        """Find user by ID"""
        try:
            user = self.collection.find_one({'_id': ObjectId(user_id)})
            return self.to_dict(user) if user else None
        except:
            return None
    
    def find_all(self, filter_dict=None):
        """Find all users with optional filter"""
        filter_dict = filter_dict or {}
        users = self.collection.find(filter_dict)
        return [self.to_dict(user) for user in users]
    
    def find_by_role(self, role):
        """Find users by role"""
        users = self.collection.find({'role': role})
        return [self.to_dict(user) for user in users]

    def update_user(self, user_id, update_data):
        """Update user data"""
        try:
            update_data['updated_at'] = datetime.utcnow()
            result = self.collection.update_one(
                {'_id': ObjectId(user_id)},
                {'$set': update_data}
            )
            return result.modified_count > 0
        except:
            return False

    def update_profile(self, user_id, name, email):
        """Update profile fields for the current user and return the updated document."""
        try:
            self.collection.update_one(
                {'_id': ObjectId(user_id)},
                {'$set': {
                    'name': name,
                    'email': email.lower(),
                    'updated_at': datetime.utcnow()
                }}
            )
            return self.find_by_id(user_id)
        except:
            return None

    def change_password(self, user_id, new_password):
        """Change the user's password and return whether the operation succeeded."""
        try:
            result = self.collection.update_one(
                {'_id': ObjectId(user_id)},
                {'$set': {
                    'password_hash': self.set_password(new_password),
                    'updated_at': datetime.utcnow()
                }}
            )
            return result.matched_count > 0
        except:
            return False
    
    def delete_user(self, user_id):
        """Delete a user"""
        try:
            result = self.collection.delete_one({'_id': ObjectId(user_id)})
            return result.deleted_count > 0
        except:
            return False

    def set_password(self, password):
        """Hash password"""
        return bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password, password_hash):
        """Check if provided password matches the hash"""
        return bcrypt.check_password_hash(password_hash, password)

class ExamSession(MongoModel):
    """ExamSession model for MongoDB"""

    def __init__(self, db):
        super().__init__(db)
        self.collection = db.exam_sessions
        # Create index on teacher_id for faster queries
        self.collection.create_index("teacher_id")

    def create_session(self, name, description, teacher_id, start_time, end_time, 
                       classroom=None, classrooms=None):
        """Create a new exam session"""
        session_doc = {
            'name': name,
            'description': description,
            'teacher_id': teacher_id,
            'start_time': start_time,
            'end_time': end_time,
            'classroom': classroom,
            'classrooms': classrooms or [],  # List of classroom configs with seating plans
            'is_active': False,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }

        result = self.collection.insert_one(session_doc)
        session_doc['_id'] = result.inserted_id
        return self.to_dict(session_doc)

    def find_by_id(self, session_id):
        """Find session by ID"""
        try:
            session = self.collection.find_one({'_id': ObjectId(session_id)})
            return self.to_dict(session) if session else None
        except:
            return None
    
    def find_all(self):
        """Find all sessions"""
        sessions = self.collection.find()
        return [self.to_dict(session) for session in sessions]

    def find_by_teacher(self, teacher_id):
        """Find sessions by teacher ID"""
        sessions = self.collection.find({'teacher_id': teacher_id})
        return [self.to_dict(session) for session in sessions]

    def update_session(self, session_id, update_data):
        """Update session data"""
        try:
            update_data['updated_at'] = datetime.utcnow()
            result = self.collection.update_one(
                {'_id': ObjectId(session_id)},
                {'$set': update_data}
            )
            return result.modified_count > 0
        except:
            return False
    
    def delete_session(self, session_id):
        """Delete a session"""
        try:
            result = self.collection.delete_one({'_id': ObjectId(session_id)})
            return result.deleted_count > 0
        except:
            return False

class Incident(MongoModel):
    """Incident model for MongoDB"""

    def __init__(self, db):
        super().__init__(db)
        self.collection = db.incidents
        # Create indexes for faster queries
        self.collection.create_index("exam_session_id")
        self.collection.create_index("incident_type")
        self.collection.create_index("created_at")

    def create_incident(self, exam_session_id, incident_type, description=None,
                       image_url=None, confidence_score=None, student_id=None, 
                       student_name=None, roll_number=None, seat_number=None):
        """Create a new incident
        
        Args:
            exam_session_id: ID of the exam session
            incident_type: Type of incident (e.g., PHONE_DETECTED, CHEATING)
            description: Description of the incident
            image_url: URL of evidence image
            confidence_score: Confidence score if ML-based detection
            student_id: ID of student involved (if identified)
            student_name: Name of student involved (if identified)
            roll_number: Roll number of student involved (if identified)
            seat_number: Seat number where incident occurred (for image-based seating)
        """
        incident_doc = {
            'exam_session_id': exam_session_id,
            'incident_type': incident_type,
            'description': description,
            'image_url': image_url,
            'confidence_score': confidence_score,
            'is_reviewed': False,
            'reviewer_notes': None,
            'student_id': student_id,  # Student identified through seating plan
            'student_name': student_name,
            'roll_number': roll_number,
            'seat_number': seat_number,  # Seat where incident occurred
            'created_at': datetime.utcnow()
        }

        result = self.collection.insert_one(incident_doc)
        incident_doc['_id'] = result.inserted_id
        return self.to_dict(incident_doc)

    def find_by_id(self, incident_id):
        """Find incident by ID"""
        try:
            incident = self.collection.find_one({'_id': ObjectId(incident_id)})
            return self.to_dict(incident) if incident else None
        except:
            return None

    def find_by_session(self, session_id):
        """Find incidents by session ID"""
        incidents = self.collection.find({'exam_session_id': session_id})
        return [self.to_dict(incident) for incident in incidents]

    def update_incident(self, incident_id, update_data):
        """Update incident data"""
        try:
            result = self.collection.update_one(
                {'_id': ObjectId(incident_id)},
                {'$set': update_data}
            )
            return result.modified_count > 0
        except:
            return False

    def get_recent_incidents(self, limit=10):
        """Get recent incidents"""
        incidents = self.collection.find().sort('created_at', -1).limit(limit)
        return [self.to_dict(incident) for incident in incidents]

class SeatingPlan(MongoModel):
    """SeatingPlan model for MongoDB"""

    def __init__(self, db):
        super().__init__(db)
        self.collection = db.seating_plans
        # Create indexes for faster queries
        self.collection.create_index("classroom_name")
        self.collection.create_index("exam_session_id")
    
    def create_seating_plan(self, classroom_name, rows, columns, seats_data=None, exam_session_id=None, room_number=None, total_seats=None, image_path=None, is_image_based=False):
        """Create a new seating plan
        
        Args:
            classroom_name: Name of the classroom
            rows: Number of rows (0 for image-based flexible layout)
            columns: Number of columns (0 for image-based flexible layout)
            seats_data: List of seat objects with optional pixel coordinates for image-based plans
            exam_session_id: ID of the exam session this plan belongs to (optional)
            room_number: Room number for display (optional)
            total_seats: Total number of seats (optional, overrides calculated value)
            image_path: Path to the classroom image (for image-based plans)
            is_image_based: Whether this is an image-based seating plan
        """
        seats_data = seats_data or []
        occupied_seats = len([
            s for s in seats_data
            if s.get('occupied') or s.get('student_name') or s.get('roll_number')
        ])
        
        # Determine total seats: use provided value, or calculate from rows/columns,
        # or use the number of provided seats (image-based plans)
        if total_seats is not None:
            computed_total = total_seats
        else:
            computed_total = rows * columns if (rows and columns and rows * columns > 0) else len(seats_data)

        plan_doc = {
            'classroom_name': classroom_name,
            'exam_session_id': exam_session_id,  # Link to exam session
            'room_number': room_number,  # Room number for display (e.g., "Room 101")
            'rows': rows,
            'columns': columns,
            'is_image_based': is_image_based,  # Whether this plan uses image-based seating
            'image_path': image_path,  # Path to the classroom image
            'seats': seats_data,  # List of seat objects with pixel coordinates for image-based plans
            'total_seats': computed_total,
            'occupied_seats': occupied_seats,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        result = self.collection.insert_one(plan_doc)
        plan_doc['_id'] = result.inserted_id
        return self.to_dict(plan_doc)
    
    def find_by_id(self, plan_id):
        """Find seating plan by ID"""
        try:
            plan = self.collection.find_one({'_id': ObjectId(plan_id)})
            return self.to_dict(plan) if plan else None
        except:
            return None
    
    def find_by_classroom(self, classroom_name):
        """Find seating plan by classroom name"""
        plan = self.collection.find_one({'classroom_name': classroom_name})
        return self.to_dict(plan) if plan else None
    
    def find_by_session(self, exam_session_id):
        """Find all seating plans for an exam session"""
        plans = self.collection.find({'exam_session_id': exam_session_id})
        return [self.to_dict(plan) for plan in plans]
    
    def find_all(self):
        """Find all seating plans"""
        plans = self.collection.find()
        return [self.to_dict(plan) for plan in plans]
    
    def update_seating_plan(self, plan_id, update_data):
        """Update seating plan data"""
        try:
            update_data['updated_at'] = datetime.utcnow()
            result = self.collection.update_one(
                {'_id': ObjectId(plan_id)},
                {'$set': update_data}
            )
            return result.matched_count > 0
        except:
            return False
    
    def find_student_by_seat(self, plan_id, seat_number):
        """Find student assigned to a specific seat in a seating plan"""
        try:
            plan = self.find_by_id(plan_id)
            if not plan:
                return None
            
            for seat in plan.get('seats', []):
                if str(seat.get('seat_number', '')) == str(seat_number):
                    return {
                        'seat_number': seat.get('seat_number'),
                        'student_name': seat.get('student_name'),
                        'roll_number': seat.get('roll_number'),
                        'pixel_x': seat.get('pixel_x'),
                        'pixel_y': seat.get('pixel_y'),
                        'norm_x': seat.get('norm_x'),
                        'norm_y': seat.get('norm_y')
                    }
            return None
        except:
            return None
    
    def find_student_by_pixel_proximity(self, plan_id, pixel_x, pixel_y, tolerance_pixels=50):
        """Find student at or near pixel coordinates (for image-based seating plans)
        
        Args:
            plan_id: ID of the seating plan
            pixel_x: X coordinate of the incident (in original image pixels)
            pixel_y: Y coordinate of the incident (in original image pixels)
            tolerance_pixels: Maximum distance in pixels to consider as "at seat"
        
        Returns:
            Student info if found, otherwise None
        """
        try:
            plan = self.find_by_id(plan_id)
            if not plan or not plan.get('is_image_based'):
                return None
            
            seats = plan.get('seats', [])
            closest_seat = None
            closest_distance = float('inf')
            
            # Find the closest seat to the pixel coordinates
            for seat in seats:
                seat_x = seat.get('pixel_x', 0)
                seat_y = seat.get('pixel_y', 0)
                
                # Calculate Euclidean distance
                distance = ((seat_x - pixel_x) ** 2 + (seat_y - pixel_y) ** 2) ** 0.5
                
                if distance < closest_distance:
                    closest_distance = distance
                    closest_seat = seat
            
            # If closest seat is within tolerance and has a student, return it
            if closest_seat and closest_distance <= tolerance_pixels and closest_seat.get('student_name'):
                return {
                    'seat_number': closest_seat.get('seat_number'),
                    'student_name': closest_seat.get('student_name'),
                    'roll_number': closest_seat.get('roll_number'),
                    'pixel_x': closest_seat.get('pixel_x'),
                    'pixel_y': closest_seat.get('pixel_y'),
                    'distance_pixels': closest_distance
                }
            
            return None
        except:
            return None
    
    def delete_seating_plan(self, plan_id):
        """Delete a seating plan"""
        try:
            result = self.collection.delete_one({'_id': ObjectId(plan_id)})
            return result.deleted_count > 0
        except:
            return False


