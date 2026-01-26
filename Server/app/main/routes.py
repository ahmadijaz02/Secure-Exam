from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.main import bp
from app import get_models

@bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'Secure Exam API is running'
    }), 200

@bp.route('/dashboard', methods=['GET'])
@jwt_required()
def dashboard():
    """Dashboard data endpoint"""
    try:
        current_user_id = get_jwt_identity()
        models = get_models()
        user_model = models['user']
        exam_session_model = models['exam_session']
        incident_model = models['incident']

        user = user_model.find_by_id(current_user_id)

        if not user:
            return jsonify({'message': 'User not found'}), 404

        # Remove password hash from user data
        user_data = {k: v for k, v in user.items() if k != 'password_hash'}

        # Get dashboard statistics
        user_sessions = exam_session_model.find_by_teacher(current_user_id)
        recent_incidents = incident_model.get_recent_incidents(5)

        dashboard_data = {
            'user': user_data,
            'stats': {
                'active_sessions': len([s for s in user_sessions if s.get('is_active', False)]),
                'total_sessions': len(user_sessions),
                'alerts_today': len(recent_incidents)  # Simplified for now
            },
            'recent_sessions': user_sessions[:5],  # Last 5 sessions
            'recent_incidents': recent_incidents
        }

        return jsonify(dashboard_data), 200

    except Exception as e:
        return jsonify({'message': 'Internal server error'}), 500
