from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from email_validator import validate_email, EmailNotValidError
from pymongo.errors import DuplicateKeyError
from app.admin import bp
from app import get_models

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

@bp.route('/users', methods=['GET'])
@jwt_required()
def list_users():
    """Admin-only endpoint to list all users"""
    try:
        current_user_id = get_jwt_identity()
        models = get_models()
        user_model = models['user']
        
        # Check if current user is admin
        current_user = user_model.find_by_id(current_user_id)
        if not current_user or current_user.get('role') != 'admin':
            return jsonify({'message': 'Access denied. Admin privileges required.'}), 403
        
        # Get all users
        users = list(user_model.collection.find({}, {'password_hash': 0}))  # Exclude password hashes
        
        # Convert ObjectIds to strings
        for user in users:
            user['id'] = str(user['_id'])
            del user['_id']
        
        return jsonify({
            'users': users,
            'total': len(users)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"List users error: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500
