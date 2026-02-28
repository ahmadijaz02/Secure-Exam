from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from email_validator import validate_email, EmailNotValidError
from pymongo.errors import DuplicateKeyError
from datetime import datetime
import os
from app.admin import bp
from app import get_models

def require_admin():
    """Decorator to check if user is admin"""
    current_user_id = get_jwt_identity()
    models = get_models()
    user_model = models['user']
    
    current_user = user_model.find_by_id(current_user_id)
    if not current_user or current_user.get('role') != 'admin':
        return None, jsonify({'message': 'Access denied. Admin privileges required.'}), 403
    
    return current_user, None, None

# ========== DASHBOARD STATS ==========

@bp.route('/dashboard/stats', methods=['GET'])
@jwt_required()
def get_dashboard_stats():
    """Admin-only endpoint to get dashboard statistics"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        user_model = models['user']
        session_model = models['exam_session']
        incident_model = models['incident']
        seating_plan_model = models['seating_plan']
        
        # Get counts
        total_users = len(user_model.find_all())
        total_sessions = len(session_model.find_all())
        total_invigilators = len(user_model.find_by_role('invigilator'))
        total_teachers = len(user_model.find_by_role('teacher'))
        total_incidents = incident_model.collection.count_documents({})
        total_classrooms = len(seating_plan_model.find_all())
        
        # Get active sessions count
        active_sessions = session_model.collection.count_documents({'is_active': True})
        
        return jsonify({
            'stats': {
                'total_users': total_users,
                'total_sessions': total_sessions,
                'active_sessions': active_sessions,
                'total_invigilators': total_invigilators,
                'total_teachers': total_teachers,
                'total_incidents': total_incidents,
                'total_classrooms': total_classrooms,
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Get dashboard stats error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

# ========== INCIDENTS (REPORTING) ==========

@bp.route('/incidents', methods=['GET'])
@jwt_required()
def list_incidents():
    """Admin-only endpoint to list incidents with optional session filter"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code

        models = get_models()
        incident_model = models['incident']

        exam_session_id = request.args.get('exam_session_id')
        limit = request.args.get('limit')

        query = {}
        if exam_session_id:
            query['exam_session_id'] = exam_session_id

        cursor = incident_model.collection.find(query).sort('created_at', -1)
        if limit:
            try:
                cursor = cursor.limit(int(limit))
            except ValueError:
                return jsonify({'message': 'Invalid limit value'}), 400

        incidents = [incident_model.to_dict(i) for i in cursor]
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'suspicious_alerts'))
        for incident in incidents:
            image_url = incident.get('image_url')
            if not image_url or image_url.startswith('http') or image_url.startswith('/api/alerts/'):
                continue
            if image_url.startswith('suspicious_alerts'):
                relative = image_url.split('suspicious_alerts', 1)[1].lstrip('/\\')
                incident['image_url'] = f"/api/alerts/{relative.replace(os.sep, '/')}"
                continue
            if os.path.isabs(image_url):
                relative = os.path.relpath(image_url, base_dir)
                if not relative.startswith('..'):
                    incident['image_url'] = f"/api/alerts/{relative.replace(os.sep, '/')}"
                    continue
            incident['image_url'] = f"/api/alerts/{os.path.basename(image_url)}"

        return jsonify({
            'incidents': incidents,
            'total': len(incidents)
        }), 200

    except Exception as e:
        current_app.logger.error(f"List incidents error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

# ========== USER MANAGEMENT ROUTES ==========

@bp.route('/users', methods=['GET'])
@jwt_required()
def list_users():
    """Admin-only endpoint to list all users"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        user_model = models['user']
        
        # Get query parameters for filtering
        role = request.args.get('role')
        is_active = request.args.get('is_active')
        
        # Build filter
        filter_dict = {}
        if role:
            filter_dict['role'] = role
        if is_active is not None:
            filter_dict['is_active'] = is_active.lower() == 'true'
        
        # Get all users
        users = user_model.find_all(filter_dict)
        
        # Remove password hashes
        for user in users:
            user.pop('password_hash', None)
        
        return jsonify({
            'users': users,
            'total': len(users)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"List users error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/users/<user_id>', methods=['GET'])
@jwt_required()
def get_user(user_id):
    """Admin-only endpoint to get a specific user"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        user_model = models['user']
        
        user = user_model.find_by_id(user_id)
        if not user:
            return jsonify({'message': 'User not found'}), 404
        
        # Remove password hash
        user.pop('password_hash', None)
        
        return jsonify({'user': user}), 200
        
    except Exception as e:
        current_app.logger.error(f"Get user error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/users', methods=['POST'])
@jwt_required()
def create_user():
    """Admin-only endpoint to create a new user"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        user_model = models['user']
        
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'email', 'password', 'role']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'message': f'{field.capitalize()} is required'}), 400
        
        name = data['name'].strip()
        email = data['email'].strip().lower()
        password = data['password']
        role = data['role']
        
        # Validate role
        valid_roles = ['admin', 'teacher']
        if role not in valid_roles:
            return jsonify({'message': f'Role must be one of: {", ".join(valid_roles)}'}), 400
        
        # Validate email format
        try:
            validate_email(email)
        except EmailNotValidError:
            return jsonify({'message': 'Invalid email format'}), 400
        
        # Validate password length
        if len(password) < 6:
            return jsonify({'message': 'Password must be at least 6 characters long'}), 400
        
        # Check if user already exists
        existing_user = user_model.find_by_email(email)
        if existing_user:
            return jsonify({'message': 'Email already registered'}), 409
        
        # Create new user
        try:
            new_user = user_model.create_user(name, email, password, role)
            
            # Remove password hash from response
            user_data = {k: v for k, v in new_user.items() if k != 'password_hash'}
            
            return jsonify({
                'message': 'User created successfully',
                'user': user_data
            }), 201
            
        except DuplicateKeyError:
            return jsonify({'message': 'Email already registered'}), 409
        
    except Exception as e:
        current_app.logger.error(f"Create user error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/users/<user_id>', methods=['PUT'])
@jwt_required()
def update_user(user_id):
    """Admin-only endpoint to update a user"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        user_model = models['user']
        
        # Check if user exists
        user = user_model.find_by_id(user_id)
        if not user:
            return jsonify({'message': 'User not found'}), 404
        
        data = request.get_json()
        update_data = {}
        
        # Update allowed fields
        if 'name' in data:
            update_data['name'] = data['name'].strip()
        
        if 'email' in data:
            email = data['email'].strip().lower()
            # Validate email format
            try:
                validate_email(email)
                update_data['email'] = email
            except EmailNotValidError:
                return jsonify({'message': 'Invalid email format'}), 400
        
        if 'role' in data:
            valid_roles = ['admin', 'teacher']
            if data['role'] not in valid_roles:
                return jsonify({'message': f'Role must be one of: {", ".join(valid_roles)}'}), 400
            update_data['role'] = data['role']
        
        if 'is_active' in data:
            update_data['is_active'] = bool(data['is_active'])
        
        if 'password' in data and data['password']:
            if len(data['password']) < 6:
                return jsonify({'message': 'Password must be at least 6 characters long'}), 400
            update_data['password_hash'] = user_model.set_password(data['password'])
        
        if not update_data:
            return jsonify({'message': 'No valid fields to update'}), 400
        
        # Update user
        success = user_model.update_user(user_id, update_data)
        if success:
            updated_user = user_model.find_by_id(user_id)
            updated_user.pop('password_hash', None)
            
            return jsonify({
                'message': 'User updated successfully',
                'user': updated_user
            }), 200
        else:
            return jsonify({'message': 'Failed to update user'}), 500
        
    except Exception as e:
        current_app.logger.error(f"Update user error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/users/<user_id>', methods=['DELETE'])
@jwt_required()
def delete_user(user_id):
    """Admin-only endpoint to delete a user"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        user_model = models['user']
        
        # Check if user exists
        user = user_model.find_by_id(user_id)
        if not user:
            return jsonify({'message': 'User not found'}), 404
        
        # Prevent self-deletion
        if user['id'] == current_user['id']:
            return jsonify({'message': 'Cannot delete your own account'}), 400
        
        # Delete user
        success = user_model.delete_user(user_id)
        if success:
            return jsonify({'message': 'User deleted successfully'}), 200
        else:
            return jsonify({'message': 'Failed to delete user'}), 500
        
    except Exception as e:
        current_app.logger.error(f"Delete user error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/create-admin', methods=['POST'])
@jwt_required()
def create_admin():
    """Admin-only endpoint to create new admin users"""
    try:
        current_user_id = get_jwt_identity()
        models = get_models()
        user_model = models['user']
        
        # Check if current user is admin
        current_user = user_model.find_by_id(current_user_id)
        if not current_user or current_user.get('role') != 'admin':
            return jsonify({'message': 'Access denied. Admin privileges required.'}), 403
        
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'email', 'password']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'message': f'{field.capitalize()} is required'}), 400
        
        name = data['name'].strip()
        email = data['email'].strip().lower()
        password = data['password']
        
        # Validate email format
        try:
            validate_email(email)
        except EmailNotValidError:
            return jsonify({'message': 'Invalid email format'}), 400
        
        # Validate password length
        if len(password) < 6:
            return jsonify({'message': 'Password must be at least 6 characters long'}), 400
        
        # Check if user already exists
        existing_user = user_model.find_by_email(email)
        if existing_user:
            return jsonify({'message': 'Email already registered'}), 409
        
        # Create new admin user
        try:
            admin_user = user_model.create_user(name, email, password, 'admin')
            
            # Remove password hash from response
            admin_data = {k: v for k, v in admin_user.items() if k != 'password_hash'}
            
            return jsonify({
                'message': 'Admin user created successfully',
                'user': admin_data
            }), 201
            
        except DuplicateKeyError:
            return jsonify({'message': 'Email already registered'}), 409
        
    except Exception as e:
        current_app.logger.error(f"Create admin error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

# ========== EXAM SESSION MANAGEMENT ROUTES ==========

@bp.route('/exam-sessions', methods=['GET'])
@jwt_required()
def list_exam_sessions():
    """Admin-only endpoint to list all exam sessions"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        session_model = models['exam_session']
        seating_plan_model = models['seating_plan']
        
        # Get all exam sessions
        sessions = session_model.find_all()
        
        # Clean up invalid seating plan references in classrooms array
        for session in sessions:
            classrooms = session.get('classrooms', [])
            if classrooms:
                # Verify each seating plan still exists
                valid_classrooms = []
                for classroom in classrooms:
                    plan_id = classroom.get('seating_plan_id')
                    if plan_id:
                        plan = seating_plan_model.find_by_id(plan_id)
                        if plan:  # Only keep if plan still exists
                            valid_classrooms.append(classroom)
                        else:
                            current_app.logger.info(f"Removed invalid seating plan reference {plan_id} from session {session['id']}")
                
                # Update session if classrooms changed
                if len(valid_classrooms) != len(classrooms):
                    session_model.update_session(session['id'], {'classrooms': valid_classrooms})
                    session['classrooms'] = valid_classrooms
        
        return jsonify({
            'sessions': sessions,
            'total': len(sessions)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"List exam sessions error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/exam-sessions/<session_id>', methods=['GET'])
@jwt_required()
def get_exam_session(session_id):
    """Admin-only endpoint to get a specific exam session"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        session_model = models['exam_session']
        seating_plan_model = models['seating_plan']
        
        session = session_model.find_by_id(session_id)
        if not session:
            return jsonify({'message': 'Exam session not found'}), 404
        
        # Clean up invalid seating plan references
        classrooms = session.get('classrooms', [])
        if classrooms:
            valid_classrooms = []
            for classroom in classrooms:
                plan_id = classroom.get('seating_plan_id')
                if plan_id:
                    plan = seating_plan_model.find_by_id(plan_id)
                    if plan:
                        valid_classrooms.append(classroom)
                    else:
                        current_app.logger.info(f"Removed invalid seating plan reference {plan_id} from session {session_id}")
            
            if len(valid_classrooms) != len(classrooms):
                session_model.update_session(session_id, {'classrooms': valid_classrooms})
                session['classrooms'] = valid_classrooms
        
        return jsonify({'session': session}), 200
        
    except Exception as e:
        current_app.logger.error(f"Get exam session error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/exam-sessions', methods=['POST'])
@jwt_required()
def create_exam_session():
    """Admin-only endpoint to create a new exam session"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        session_model = models['exam_session']
        user_model = models['user']
        
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'description', 'teacher_id', 'start_time', 'end_time']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'message': f'{field.replace("_", " ").capitalize()} is required'}), 400
        
        # Validate teacher exists
        teacher = user_model.find_by_id(data['teacher_id'])
        if not teacher or teacher.get('role') != 'teacher':
            return jsonify({'message': 'Invalid teacher ID'}), 400
        
        # Parse datetime strings
        try:
            start_time = datetime.fromisoformat(data['start_time'].replace('Z', '+00:00'))
            end_time = datetime.fromisoformat(data['end_time'].replace('Z', '+00:00'))
        except ValueError:
            return jsonify({'message': 'Invalid datetime format. Use ISO format'}), 400
        
        # Validate time range
        if end_time <= start_time:
            return jsonify({'message': 'End time must be after start time'}), 400
        
        # Create exam session
        new_session = session_model.create_session(
            name=data['name'],
            description=data['description'],
            teacher_id=data['teacher_id'],
            start_time=start_time,
            end_time=end_time,
            classroom=data.get('classroom')
        )
        
        return jsonify({
            'message': 'Exam session created successfully',
            'session': new_session
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Create exam session error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/exam-sessions/<session_id>', methods=['PUT'])
@jwt_required()
def update_exam_session(session_id):
    """Admin-only endpoint to update an exam session"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        session_model = models['exam_session']
        user_model = models['user']
        
        # Check if session exists
        session = session_model.find_by_id(session_id)
        if not session:
            return jsonify({'message': 'Exam session not found'}), 404
        
        data = request.get_json()
        update_data = {}
        
        # Update allowed fields
        if 'name' in data:
            update_data['name'] = data['name']
        
        if 'description' in data:
            update_data['description'] = data['description']
        
        if 'teacher_id' in data:
            teacher = user_model.find_by_id(data['teacher_id'])
            if not teacher or teacher.get('role') != 'teacher':
                return jsonify({'message': 'Invalid teacher ID'}), 400
            update_data['teacher_id'] = data['teacher_id']
        
        if 'classroom' in data:
            update_data['classroom'] = data['classroom']
        
        if 'start_time' in data:
            try:
                update_data['start_time'] = datetime.fromisoformat(data['start_time'].replace('Z', '+00:00'))
            except ValueError:
                return jsonify({'message': 'Invalid start_time format'}), 400
        
        if 'end_time' in data:
            try:
                update_data['end_time'] = datetime.fromisoformat(data['end_time'].replace('Z', '+00:00'))
            except ValueError:
                return jsonify({'message': 'Invalid end_time format'}), 400
        
        if 'is_active' in data:
            update_data['is_active'] = bool(data['is_active'])
        
        if not update_data:
            return jsonify({'message': 'No valid fields to update'}), 400
        
        # Update session
        success = session_model.update_session(session_id, update_data)
        if success:
            updated_session = session_model.find_by_id(session_id)
            return jsonify({
                'message': 'Exam session updated successfully',
                'session': updated_session
            }), 200
        else:
            return jsonify({'message': 'Failed to update exam session'}), 500
        
    except Exception as e:
        current_app.logger.error(f"Update exam session error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/exam-sessions/<session_id>', methods=['DELETE'])
@jwt_required()
def delete_exam_session(session_id):
    """Admin-only endpoint to delete an exam session"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        session_model = models['exam_session']
        
        # Check if session exists
        session = session_model.find_by_id(session_id)
        if not session:
            return jsonify({'message': 'Exam session not found'}), 404
        
        # Delete session
        success = session_model.delete_session(session_id)
        if success:
            return jsonify({'message': 'Exam session deleted successfully'}), 200
        else:
            return jsonify({'message': 'Failed to delete exam session'}), 500
        
    except Exception as e:
        current_app.logger.error(f"Delete exam session error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

# ========== SEATING PLAN MANAGEMENT ROUTES ==========

@bp.route('/seating-plans', methods=['GET'])
@jwt_required()
def list_seating_plans():
    """Admin-only endpoint to list all seating plans"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        
        # Get all seating plans
        plans = seating_plan_model.find_all()
        
        return jsonify({
            'plans': plans,
            'total': len(plans)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"List seating plans error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/seating-plans/<plan_id>', methods=['GET'])
@jwt_required()
def get_seating_plan(plan_id):
    """Admin-only endpoint to get a specific seating plan"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        
        plan = seating_plan_model.find_by_id(plan_id)
        if not plan:
            return jsonify({'message': 'Seating plan not found'}), 404
        
        return jsonify({'plan': plan}), 200
        
    except Exception as e:
        current_app.logger.error(f"Get seating plan error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/seating-plans/classroom/<classroom_name>', methods=['GET'])
@jwt_required()
def get_seating_plan_by_classroom(classroom_name):
    """Admin-only endpoint to get seating plan by classroom name"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        
        plan = seating_plan_model.find_by_classroom(classroom_name)
        if not plan:
            return jsonify({'message': 'Seating plan not found for this classroom'}), 404
        
        return jsonify({'plan': plan}), 200
        
    except Exception as e:
        current_app.logger.error(f"Get seating plan by classroom error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/seating-plans', methods=['POST'])
@jwt_required()
def create_seating_plan():
    """Admin-only endpoint to create a new seating plan"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['classroom_name', 'total_seats']
        for field in required_fields:
            if field not in data:
                return jsonify({'message': f'{field.replace("_", " ").capitalize()} is required'}), 400
        
        classroom_name = data['classroom_name'].strip()
        total_seats = data['total_seats']
        seats_data = data.get('seats', [])
        
        # Validate numeric fields
        if not isinstance(total_seats, int) or total_seats <= 0:
            return jsonify({'message': 'Total seats must be a positive integer'}), 400
        
        # Check if seating plan already exists for this classroom
        existing_plan = seating_plan_model.find_by_classroom(classroom_name)
        if existing_plan:
            return jsonify({'message': 'Seating plan already exists for this classroom'}), 409
        
        # Create seating plan with total_seats (no fixed rows/columns)
        new_plan = seating_plan_model.create_seating_plan(
            classroom_name=classroom_name,
            rows=0,
            columns=0,
            seats_data=seats_data,
            total_seats=total_seats
        )
        
        return jsonify({
            'message': 'Seating plan created successfully',
            'plan': new_plan
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Create seating plan error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/seating-plans/<plan_id>', methods=['PUT'])
@jwt_required()
def update_seating_plan(plan_id):
    """Admin-only endpoint to update a seating plan"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        
        # Check if plan exists
        plan = seating_plan_model.find_by_id(plan_id)
        if not plan:
            return jsonify({'message': 'Seating plan not found'}), 404
        
        data = request.get_json()
        update_data = {}
        
        # Update allowed fields
        if 'classroom_name' in data:
            update_data['classroom_name'] = data['classroom_name'].strip()
        
        if 'total_seats' in data:
            if not isinstance(data['total_seats'], int) or data['total_seats'] <= 0:
                return jsonify({'message': 'Total seats must be a positive integer'}), 400
            update_data['total_seats'] = data['total_seats']
        
        if 'seats' in data:
            update_data['seats'] = data['seats']
            # Recalculate occupied_seats count
            occupied_seats = len([
                s for s in data['seats']
                if s.get('occupied') or s.get('student_name') or s.get('roll_number')
            ])
            update_data['occupied_seats'] = occupied_seats
            # Update total_seats to match seats count if not explicitly set
            if 'total_seats' not in update_data:
                update_data['total_seats'] = len(data['seats'])
        
        if not update_data:
            return jsonify({'message': 'No valid fields to update'}), 400
        
        # Update plan
        success = seating_plan_model.update_seating_plan(plan_id, update_data)
        if success:
            updated_plan = seating_plan_model.find_by_id(plan_id)
            return jsonify({
                'message': 'Seating plan updated successfully',
                'plan': updated_plan
            }), 200
        else:
            return jsonify({'message': 'Failed to update seating plan'}), 500
        
    except Exception as e:
        current_app.logger.error(f"Update seating plan error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/seating-plans/<plan_id>', methods=['DELETE'])
@jwt_required()
def delete_seating_plan(plan_id):
    """Admin-only endpoint to delete a seating plan"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        session_model = models['exam_session']
        
        # Check if plan exists
        plan = seating_plan_model.find_by_id(plan_id)
        if not plan:
            return jsonify({'message': 'Seating plan not found'}), 404
        
        # If plan is linked to a session, unlink it from all sessions
        linked_session_id = plan.get('exam_session_id')
        if linked_session_id:
            # Remove from the specific linked session's classrooms list
            session = session_model.find_by_id(linked_session_id)
            if session:
                classrooms = session.get('classrooms', [])
                classrooms = [c for c in classrooms if c.get('seating_plan_id') != plan_id]
                session_model.update_session(linked_session_id, {'classrooms': classrooms})
                current_app.logger.info(f"Unlinked seating plan {plan_id} from session {linked_session_id} before deletion")
        
        # Also check all sessions for this plan_id in classrooms array (extra safety)
        all_sessions = session_model.find_all()
        for session in all_sessions:
            classrooms = session.get('classrooms', [])
            if any(c.get('seating_plan_id') == plan_id for c in classrooms):
                classrooms = [c for c in classrooms if c.get('seating_plan_id') != plan_id]
                session_model.update_session(session['id'], {'classrooms': classrooms})
                current_app.logger.info(f"Removed seating plan {plan_id} from session {session['id']} classrooms list")
        
        # Delete plan
        success = seating_plan_model.delete_seating_plan(plan_id)
        if success:
            return jsonify({'message': 'Seating plan deleted and unlinked from all sessions successfully'}), 200
        else:
            return jsonify({'message': 'Failed to delete seating plan'}), 500
        
    except Exception as e:
        current_app.logger.error(f"Delete seating plan error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500


# ========== EXAM SESSION SEATING PLANS WORKFLOW ==========

@bp.route('/exam-sessions/<session_id>/seating-plans', methods=['GET'])
@jwt_required()
def get_session_seating_plans(session_id):
    """Get all seating plans: both linked to session and unlinked (for linking)"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        session_model = models['exam_session']
        
        # Verify session exists
        session = session_model.find_by_id(session_id)
        if not session:
            return jsonify({'message': 'Exam session not found'}), 404
        
        # Get seating plans linked to this session
        linked_plans = seating_plan_model.find_by_session(session_id)
        current_app.logger.info(f"Linked plans for session {session_id}: {len(linked_plans)}")
        
        # Get all unlinked seating plans (no exam_session_id or different session)
        all_plans = seating_plan_model.find_all()
        current_app.logger.info(f"Total plans in database: {len(all_plans)}")
        
        unlinked_plans = [p for p in all_plans if p.get('exam_session_id') != session_id]
        current_app.logger.info(f"Unlinked plans: {len(unlinked_plans)}")
        
        for plan in unlinked_plans:
            current_app.logger.debug(f"  - {plan.get('classroom_name')} (exam_session_id: {plan.get('exam_session_id')})")
        
        return jsonify({
            'linked_seating_plans': linked_plans,
            'available_seating_plans': unlinked_plans,
            'session_info': {
                'id': session['id'],
                'name': session['name'],
                'classroom': session['classroom']
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Get session seating plans error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500


@bp.route('/exam-sessions/<session_id>/seating-plans', methods=['POST'])
@jwt_required()
def create_session_seating_plan(session_id):
    """Create a seating plan for an exam session"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        session_model = models['exam_session']
        
        data = request.get_json()
        
        current_app.logger.info(f"Received seating plan request with data: {data}")
        
        # Verify session exists
        session = session_model.find_by_id(session_id)
        if not session:
            return jsonify({'message': 'Exam session not found'}), 404
        
        # Validate required fields
        if not data.get('classroom_name') or not data['classroom_name'].strip():
            current_app.logger.error(f"Missing or empty classroom_name")
            return jsonify({'message': 'Classroom name is required'}), 400
        
        if 'total_seats' not in data or data['total_seats'] <= 0:
            current_app.logger.error(f"Invalid total_seats: {data.get('total_seats')}")
            return jsonify({'message': 'Total seats must be greater than 0'}), 400
        
        # Create seating plan with total_seats (no fixed rows/columns)
        seats_data = data.get('seats', [])
        room_number = data.get('room_number', '').strip() or None  # Optional room number
        
        new_plan = seating_plan_model.create_seating_plan(
            classroom_name=data['classroom_name'],
            room_number=room_number,  # Include room number
            rows=0,
            columns=0,
            seats_data=seats_data,
            exam_session_id=session_id,
            total_seats=data['total_seats']
        )
        
        current_app.logger.info(f"Created seating plan: {new_plan['id']} for session {session_id}")
        
        # Update session's classrooms list
        classrooms = session.get('classrooms', [])
        classrooms.append({
            'name': data['classroom_name'],
            'room_number': room_number,  # Include room number in session
            'seating_plan_id': new_plan['id'],
            'total_seats': data['total_seats']
        })
        session_model.update_session(session_id, {'classrooms': classrooms})
        
        current_app.logger.info(f"Updated session classrooms. Total classrooms: {len(classrooms)}")
        
        return jsonify({
            'message': 'Seating plan created successfully',
            'seating_plan': new_plan
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Create session seating plan error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500


@bp.route('/exam-sessions/<session_id>/seating-plans/<plan_id>', methods=['PUT'])
@jwt_required()
def update_session_seating_plan(session_id, plan_id):
    """Update a seating plan for an exam session"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        session_model = models['exam_session']
        
        # Verify session exists
        session = session_model.find_by_id(session_id)
        if not session:
            return jsonify({'message': 'Exam session not found'}), 404
        
        # Verify seating plan exists and belongs to session
        plan = seating_plan_model.find_by_id(plan_id)
        if not plan or plan.get('exam_session_id') != session_id:
            return jsonify({'message': 'Seating plan not found or does not belong to this session'}), 404
        
        data = request.get_json()
        update_data = {}
        
        if 'seats' in data:
            update_data['seats'] = data['seats']
            update_data['occupied_seats'] = len([
                s for s in data['seats']
                if s.get('occupied') or s.get('student_name') or s.get('roll_number')
            ])
        
        if 'classroom_name' in data:
            update_data['classroom_name'] = data['classroom_name']
        
        success = seating_plan_model.update_seating_plan(plan_id, update_data)
        
        if success:
            return jsonify({
                'message': 'Seating plan updated successfully',
                'seating_plan': seating_plan_model.find_by_id(plan_id)
            }), 200
        else:
            return jsonify({'message': 'Failed to update seating plan'}), 500
            
    except Exception as e:
        current_app.logger.error(f"Update session seating plan error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500


@bp.route('/exam-sessions/<session_id>/seating-plans/<plan_id>', methods=['DELETE'])
@jwt_required()
def delete_session_seating_plan(session_id, plan_id):
    """Delete a seating plan from an exam session"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        session_model = models['exam_session']
        
        # Verify session exists
        session = session_model.find_by_id(session_id)
        if not session:
            return jsonify({'message': 'Exam session not found'}), 404
        
        # Verify seating plan exists
        plan = seating_plan_model.find_by_id(plan_id)
        if not plan or plan.get('exam_session_id') != session_id:
            return jsonify({'message': 'Seating plan not found or does not belong to this session'}), 404
        
        # Remove from session's classrooms list
        classrooms = session.get('classrooms', [])
        classrooms = [c for c in classrooms if c['seating_plan_id'] != plan_id]
        session_model.update_session(session_id, {'classrooms': classrooms})
        
        # Delete seating plan
        success = seating_plan_model.delete_seating_plan(plan_id)
        
        if success:
            return jsonify({'message': 'Seating plan deleted successfully'}), 200
        else:
            return jsonify({'message': 'Failed to delete seating plan'}), 500
    
    except Exception as e:
        current_app.logger.error(f"Delete session seating plan error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/exam-sessions/<session_id>/seating-plans/<plan_id>/link', methods=['POST'])
@jwt_required()
def link_seating_plan_to_session(session_id, plan_id):
    """Link an existing seating plan to an exam session"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        session_model = models['exam_session']
        
        # Verify session exists
        session = session_model.find_by_id(session_id)
        if not session:
            return jsonify({'message': 'Exam session not found'}), 404
        
        # Verify seating plan exists
        plan = seating_plan_model.find_by_id(plan_id)
        if not plan:
            return jsonify({'message': 'Seating plan not found'}), 404
        
        # ENFORCE: Only ONE seating plan per session
        # First, unlink any existing plans from this session
        existing_plans = seating_plan_model.find_by_session(session_id)
        for existing_plan in existing_plans:
            if existing_plan['id'] != plan_id:
                # Unlink the existing plan
                seating_plan_model.update_seating_plan(
                    existing_plan['id'],
                    {'exam_session_id': None}
                )
                current_app.logger.info(f"Auto-unlinked existing plan {existing_plan['id']} from session {session_id}")
        
        # Update plan to link to this session
        success = seating_plan_model.update_seating_plan(
            plan_id,
            {'exam_session_id': session_id}
        )
        
        if not success:
            return jsonify({'message': 'Failed to link seating plan'}), 500
        
        # Update session's classrooms list - REPLACE with single plan (not append)
        classrooms = [{
            'name': plan['classroom_name'],
            'seating_plan_id': plan_id,
            'rows': plan['rows'],
            'columns': plan['columns']
        }]
        session_model.update_session(session_id, {'classrooms': classrooms})
        
        current_app.logger.info(f"Linked seating plan {plan_id} to session {session_id}")
        
        return jsonify({'message': 'Seating plan linked successfully'}), 200
        
    except Exception as e:
        current_app.logger.error(f"Link seating plan error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/exam-sessions/<session_id>/seating-plans/<plan_id>/unlink', methods=['POST'])
@jwt_required()
def unlink_seating_plan_from_session(session_id, plan_id):
    """Unlink a seating plan from an exam session (keeps the plan, just removes link)"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        session_model = models['exam_session']
        
        # Verify session exists
        session = session_model.find_by_id(session_id)
        if not session:
            return jsonify({'message': 'Exam session not found'}), 404
        
        # Verify seating plan exists and is linked to this session
        plan = seating_plan_model.find_by_id(plan_id)
        if not plan or plan.get('exam_session_id') != session_id:
            return jsonify({'message': 'Seating plan not found or not linked to this session'}), 404
        
        # Update plan to remove session link
        success = seating_plan_model.update_seating_plan(
            plan_id,
            {'exam_session_id': None}
        )
        
        if not success:
            return jsonify({'message': 'Failed to unlink seating plan'}), 500
        
        # Remove from session's classrooms list
        classrooms = session.get('classrooms', [])
        classrooms = [c for c in classrooms if c['seating_plan_id'] != plan_id]
        session_model.update_session(session_id, {'classrooms': classrooms})
        
        current_app.logger.info(f"Unlinked seating plan {plan_id} from session {session_id}")
        
        return jsonify({'message': 'Seating plan unlinked successfully'}), 200
        
    except Exception as e:
        current_app.logger.error(f"Unlink seating plan error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500
            
    except Exception as e:
        current_app.logger.error(f"Delete session seating plan error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

# ========== IMAGE-BASED SEATING PLAN ROUTES ==========

@bp.route('/seating-plans/image/upload', methods=['POST'])
@jwt_required()
def upload_classroom_image():
    """Upload classroom image for seat mapping"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        # Check if image file is provided
        if 'image' not in request.files:
            return jsonify({'message': 'No image file provided'}), 400
        
        image_file = request.files['image']
        if image_file.filename == '':
            return jsonify({'message': 'No image file selected'}), 400
        
        # Validate file extension
        ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'bmp'}
        file_ext = image_file.filename.rsplit('.', 1)[1].lower() if '.' in image_file.filename else ''
        
        if file_ext not in ALLOWED_EXTENSIONS:
            return jsonify({'message': f'Invalid image format. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'}), 400
        
        # Create uploads directory if it doesn't exist
        upload_dir = os.path.join(current_app.root_path, '..', 'uploads', 'classroom_images')
        os.makedirs(upload_dir, exist_ok=True)
        
        # Save image with timestamp
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = f"classroom_{timestamp}_{image_file.filename}"
        filepath = os.path.join(upload_dir, filename)
        
        image_file.save(filepath)
        
        # Return file path for frontend use
        return jsonify({
            'message': 'Image uploaded successfully',
            'image_path': f'/uploads/classroom_images/{filename}',
            'filename': filename
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Upload classroom image error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500


@bp.route('/seating-plans/students/parse', methods=['POST'])
@jwt_required()
def parse_student_data():
    """Parse student data from CSV, Excel, or PDF file"""
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        # Check if file is provided
        if 'file' not in request.files:
            return jsonify({'message': 'No file provided'}), 400
        
        student_file = request.files['file']
        if student_file.filename == '':
            return jsonify({'message': 'No file selected'}), 400
        
        # Validate file extension
        ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls', 'pdf'}
        file_ext = student_file.filename.rsplit('.', 1)[1].lower() if '.' in student_file.filename else ''
        
        if file_ext not in ALLOWED_EXTENSIONS:
            return jsonify({'message': f'Invalid file format. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'}), 400
        
        # Create uploads directory if it doesn't exist
        upload_dir = os.path.join(current_app.root_path, '..', 'uploads', 'student_data')
        os.makedirs(upload_dir, exist_ok=True)
        
        # Save file temporarily
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = f"students_{timestamp}_{student_file.filename}"
        filepath = os.path.join(upload_dir, filename)
        
        student_file.save(filepath)
        
        # Parse the file
        from app.utils.seating_image_utils import StudentDataParser
        students, error = StudentDataParser.parse_file(filepath)
        
        if error:
            # Clean up file on error
            try:
                os.remove(filepath)
            except:
                pass
            return jsonify({'message': error}), 400
        
        if not students:
            try:
                os.remove(filepath)
            except:
                pass
            return jsonify({'message': 'No valid student data found in file'}), 400
        
        return jsonify({
            'message': 'Student data parsed successfully',
            'students': students,
            'count': len(students),
            'file_path': filepath
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Parse student data error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500


@bp.route('/seating-plans/create-from-image', methods=['POST'])
@jwt_required()
def create_seating_plan_from_image():
    """
    Create seating plan from image seats and student data
    
    Expects:
    {
        'classroom_name': str,
        'room_number': str (optional, e.g., "Room 101"),
        'total_seats': int (dynamic - no fixed rows/columns),
        'image_path': str (from image upload),
        'seats': [
            {
                'pixel_x': int,
                'pixel_y': int,
                'seat_number': int,
                'student_name': str,
                'roll_number': str
            }
        ]
    }
    """
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code
        
        models = get_models()
        seating_plan_model = models['seating_plan']
        
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['classroom_name', 'seats']
        for field in required_fields:
            if field not in data:
                return jsonify({'message': f'{field} is required'}), 400
        
        classroom_name = data['classroom_name'].strip()
        room_number = data.get('room_number', '').strip() or None  # Optional room number
        seats_data = data.get('seats', [])
        image_path = data.get('image_path', '')
        total_seats = data.get('total_seats', len(seats_data))
        
        if not isinstance(seats_data, list):
            return jsonify({'message': 'Seats must be an array'}), 400
        
        if total_seats <= 0:
            return jsonify({'message': 'At least one seat must be selected'}), 400
        
        # Check if seating plan exists
        existing_plan = seating_plan_model.find_by_classroom(classroom_name)
        if existing_plan:
            return jsonify({'message': 'Seating plan already exists for this classroom'}), 409
        
        # Process seats data - add row, column based on seat number for display
        processed_seats = []
        for idx, seat in enumerate(seats_data):
            processed_seat = {
                'id': f"{seat.get('pixel_x', seat.get('norm_x', idx))}-{seat.get('pixel_y', seat.get('norm_y', idx))}",
                'row': idx // 5 if total_seats > 0 else 0,  # Approximate row (5 per row)
                'column': idx % 5,  # Approximate column
                'pixel_x': seat.get('pixel_x') if 'pixel_x' in seat else None,
                'pixel_y': seat.get('pixel_y') if 'pixel_y' in seat else None,
                'norm_x': seat.get('norm_x') if 'norm_x' in seat else None,
                'norm_y': seat.get('norm_y') if 'norm_y' in seat else None,
                'seat_number': int(seat.get('seat_number', idx + 1)),
                'student_name': seat.get('student_name', ''),
                'roll_number': seat.get('roll_number', ''),
                'occupied': bool(seat.get('student_name')),
            }
            processed_seats.append(processed_seat)
        
        # Create seating plan (no fixed rows/columns, dynamic based on image)
        new_plan = seating_plan_model.create_seating_plan(
            classroom_name=classroom_name,
            room_number=room_number,  # Include room number
            rows=0,  # 0 indicates image-based flexible layout
            columns=0,  # 0 indicates image-based flexible layout
            seats_data=processed_seats
        )
        
        # Store image path if provided
        if image_path:
            seating_plan_model.update_seating_plan(new_plan['id'], {'image_path': image_path})
            new_plan['image_path'] = image_path
        
        return jsonify({
            'message': 'Seating plan created from image successfully',
            'plan': new_plan
        }), 201
        
    except Exception as e:
        current_app.logger.error(f"Create seating plan from image error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500


@bp.route('/seating-plans/<plan_id>/students/map', methods=['POST'])
@jwt_required()
def map_students_to_seating_plan(plan_id):
    """
    Upload student file and map to existing image-based seating plan
    
    SEQUENTIAL MAPPING: The Nth click on the image corresponds to the Nth seat in the Excel file
    
    CSV PROTECTION:
    - If a seat already has student data (manually assigned), it will NOT be overwritten
    - The admin must use the Edit button to overwrite protected (occupied) seats
    - This ensures intentional updates and prevents accidental overwrites
    """
    try:
        current_user, error_response, status_code = require_admin()
        if error_response:
            return error_response, status_code

        # Check file
        if 'file' not in request.files:
            return jsonify({'message': 'No file provided'}), 400

        student_file = request.files['file']
        if student_file.filename == '':
            return jsonify({'message': 'No file selected'}), 400

        # Save file temporarily
        upload_dir = os.path.join(current_app.root_path, '..', 'uploads', 'student_data')
        os.makedirs(upload_dir, exist_ok=True)
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = f"students_map_{timestamp}_{student_file.filename}"
        filepath = os.path.join(upload_dir, filename)
        student_file.save(filepath)

        # Parse student file
        from app.utils.seating_image_utils import StudentDataParser, SeatingCoordinateMapper
        students, error = StudentDataParser.parse_file(filepath)
        if error:
            try:
                os.remove(filepath)
            except:
                pass
            return jsonify({'message': error}), 400

        models = get_models()
        seating_plan_model = models['seating_plan']

        plan = seating_plan_model.find_by_id(plan_id)
        if not plan:
            try:
                os.remove(filepath)
            except:
                pass
            return jsonify({'message': 'Seating plan not found'}), 404

        # Use existing seat coordinates from plan
        coordinates = plan.get('seats', [])

        # IMPORTANT: Use sequential mapping for CSV-to-coordinate mapping
        # This ensures the Nth click maps to the Nth seat in the CSV (by seat number)
        mapped_seats, map_error = SeatingCoordinateMapper.map_students_to_coordinates_sequential(
            students, 
            coordinates, 
            coordinates  # existing_seats for protected seat checking
        )
        if map_error:
            try:
                os.remove(filepath)
            except:
                pass
            return jsonify({'message': map_error}), 400

        # Update plan with mapped seats & occupied count
        occupied_seats = len([s for s in mapped_seats if s.get('occupied')])
        update_success = seating_plan_model.update_seating_plan(plan_id, {'seats': mapped_seats, 'occupied_seats': occupied_seats})
        if not update_success:
            try:
                os.remove(filepath)
            except:
                pass
            return jsonify({'message': 'Failed to update seating plan with mapped students'}), 500

        updated_plan = seating_plan_model.find_by_id(plan_id)

        try:
            os.remove(filepath)
        except:
            pass

        return jsonify({
            'message': 'Students mapped to seating plan successfully',
            'plan': updated_plan,
            'summary': {
                'total_students_mapped': len([s for s in mapped_seats if s.get('occupied')]),
                'protected_seats_preserved': len([s for s in mapped_seats if s.get('protected')])
            }
        }), 200

    except Exception as e:
        current_app.logger.error(f"Map students to seating plan error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500