from flask import request, jsonify, current_app
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity
from email_validator import validate_email, EmailNotValidError
from pymongo.errors import DuplicateKeyError
from app.auth import bp
from app import get_models

@bp.route('/signup', methods=['POST'])
def signup():
    """User registration endpoint"""
    try:
        data = request.get_json()
        models = get_models()
        user_model = models['user']

        # Validate required fields
        required_fields = ['name', 'email', 'password', 'role']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'message': f'{field.capitalize()} is required'}), 400

        name = data['name'].strip()
        email = data['email'].strip().lower()
        password = data['password']
        role = data['role'].strip().lower()

        # Validate email format
        try:
            validate_email(email)
        except EmailNotValidError:
            return jsonify({'message': 'Invalid email format'}), 400

        # Only allow teacher role for public signup
        if role != 'teacher':
            return jsonify({'message': 'Only teacher accounts can be created through signup. Admin accounts must be created by system administrators.'}), 400

        # Validate password length
        if len(password) < 6:
            return jsonify({'message': 'Password must be at least 6 characters long'}), 400

        # Check if user already exists
        existing_user = user_model.find_by_email(email)
        if existing_user:
            return jsonify({'message': 'Email already registered'}), 409

        # Create new user
        try:
            user = user_model.create_user(name, email, password, role)
        except DuplicateKeyError:
            return jsonify({'message': 'Email already registered'}), 409

        # Create access token
        access_token = create_access_token(identity=user['id'])
        refresh_token = create_refresh_token(identity=user['id'])

        return jsonify({
            'message': 'User created successfully',
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': user
        }), 201

    except Exception as e:
        current_app.logger.error(f"Signup error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/login', methods=['POST'])
def login():
    """User login endpoint"""
    try:
        data = request.get_json()
        models = get_models()
        user_model = models['user']

        # Validate required fields
        if not data.get('email') or not data.get('password'):
            return jsonify({'message': 'Email and password are required'}), 400

        email = data['email'].strip().lower()
        password = data['password']

        # Find user by email
        user = user_model.find_by_email(email)

        if not user or not user_model.check_password(password, user['password_hash']):
            return jsonify({'message': 'Invalid email or password'}), 401

        if not user.get('is_active', True):
            return jsonify({'message': 'Account is deactivated'}), 401

        # Create access token
        access_token = create_access_token(identity=user['id'])
        refresh_token = create_refresh_token(identity=user['id'])

        # Remove password hash from user data
        user_data = {k: v for k, v in user.items() if k != 'password_hash'}

        return jsonify({
            'message': 'Login successful',
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': user_data
        }), 200

    except Exception as e:
        current_app.logger.error(f"Login error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Refresh access token endpoint"""
    try:
        current_user_id = get_jwt_identity()
        models = get_models()
        user_model = models['user']

        user = user_model.find_by_id(current_user_id)

        if not user or not user.get('is_active', True):
            return jsonify({'message': 'User not found or inactive'}), 404

        new_token = create_access_token(identity=current_user_id)

        # Remove password hash from user data
        user_data = {k: v for k, v in user.items() if k != 'password_hash'}

        return jsonify({
            'access_token': new_token,
            'user': user_data
        }), 200

    except Exception as e:
        current_app.logger.error(f"Token refresh error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user information"""
    try:
        current_user_id = get_jwt_identity()
        models = get_models()
        user_model = models['user']

        user = user_model.find_by_id(current_user_id)

        if not user:
            return jsonify({'message': 'User not found'}), 404

        # Remove password hash from user data
        user_data = {k: v for k, v in user.items() if k != 'password_hash'}

        return jsonify({
            'user': user_data
        }), 200

    except Exception as e:
        current_app.logger.error(f"Get current user error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/me', methods=['PUT'])
@jwt_required()
def update_current_user():
    """Update current user profile fields."""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json() or {}
        models = get_models()
        user_model = models['user']

        user = user_model.find_by_id(current_user_id)
        if not user:
            return jsonify({'message': 'User not found'}), 404

        name = (data.get('name') or '').strip()
        email = (data.get('email') or '').strip().lower()

        if not name:
            return jsonify({'message': 'Name is required'}), 400

        if not email:
            return jsonify({'message': 'Email is required'}), 400

        try:
            validate_email(email, check_deliverability=False)
        except EmailNotValidError:
            return jsonify({'message': 'Invalid email format'}), 400

        existing_user = user_model.find_by_email(email)
        if existing_user and existing_user.get('id') != current_user_id:
            return jsonify({'message': 'Email already registered'}), 409

        updated_user = user_model.update_profile(current_user_id, name, email)
        if not updated_user:
            return jsonify({'message': 'Failed to update profile'}), 500

        user_data = {k: v for k, v in updated_user.items() if k != 'password_hash'}

        return jsonify({
            'message': 'Profile updated successfully',
            'user': user_data
        }), 200

    except DuplicateKeyError:
        return jsonify({'message': 'Email already registered'}), 409
    except Exception as e:
        current_app.logger.error(f"Update current user error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    """Change the current user's password."""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json() or {}
        models = get_models()
        user_model = models['user']

        current_password = data.get('current_password') or ''
        new_password = data.get('new_password') or ''
        confirm_password = data.get('confirm_password') or ''

        if not current_password or not new_password or not confirm_password:
            return jsonify({'message': 'All password fields are required'}), 400

        if len(new_password) < 6:
            return jsonify({'message': 'New password must be at least 6 characters long'}), 400

        if new_password != confirm_password:
            return jsonify({'message': 'New password and confirmation do not match'}), 400

        user = user_model.find_by_id(current_user_id)
        if not user:
            return jsonify({'message': 'User not found'}), 404

        if not user_model.check_password(current_password, user['password_hash']):
            return jsonify({'message': 'Current password is incorrect'}), 400

        if user_model.check_password(new_password, user['password_hash']):
            return jsonify({'message': 'New password must be different from the current password'}), 400

        if not user_model.change_password(current_user_id, new_password):
            return jsonify({'message': 'Failed to change password'}), 500

        return jsonify({'message': 'Password updated successfully'}), 200

    except Exception as e:
        current_app.logger.error(f"Change password error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """User logout endpoint (client-side token removal)"""
    return jsonify({'message': 'Logout successful'}), 200
