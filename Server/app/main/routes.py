from datetime import datetime
import os
from flask import jsonify, request, send_from_directory
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
        user_session_ids = [s.get('id') for s in user_sessions]

        incident_query = {}
        if user_session_ids:
            incident_query['exam_session_id'] = {'$in': user_session_ids}

        start_of_day = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        alerts_today_query = dict(incident_query)
        alerts_today_query['created_at'] = {'$gte': start_of_day}

        alerts_today = incident_model.collection.count_documents(alerts_today_query)
        recent_incidents = list(
            incident_model.collection.find(incident_query).sort('created_at', -1).limit(5)
        )
        recent_incidents = [incident_model.to_dict(inc) for inc in recent_incidents]

        dashboard_data = {
            'user': user_data,
            'stats': {
                'active_sessions': len([s for s in user_sessions if s.get('is_active', False)]),
                'total_sessions': len(user_sessions),
                'alerts_today': alerts_today
            },
            'recent_sessions': user_sessions[:5],  # Last 5 sessions
            'recent_incidents': recent_incidents
        }

        return jsonify(dashboard_data), 200

    except Exception as e:
        return jsonify({'message': 'Internal server error'}), 500


def _normalize_datetime(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    return None


def _now_for_datetime(dt_value):
    if dt_value and dt_value.tzinfo:
        return datetime.now(dt_value.tzinfo)
    return datetime.utcnow()


@bp.route('/exam-sessions', methods=['GET'])
@jwt_required()
def list_teacher_exam_sessions():
    """Teacher-only endpoint to list own exam sessions"""
    try:
        current_user_id = get_jwt_identity()
        models = get_models()
        user_model = models['user']
        session_model = models['exam_session']

        user = user_model.find_by_id(current_user_id)
        if not user:
            return jsonify({'message': 'User not found'}), 404
        if user.get('role') != 'teacher':
            return jsonify({'message': 'Access denied. Teacher privileges required.'}), 403

        sessions = session_model.find_by_teacher(current_user_id)
        status = (request.args.get('status') or '').lower().strip()

        if status:
            def is_active(session):
                return bool(session.get('is_active', False))

            def is_scheduled(session):
                start_time = _normalize_datetime(session.get('start_time'))
                if not start_time:
                    return False
                now = _now_for_datetime(start_time)
                return start_time > now and not session.get('is_active', False)

            def is_completed(session):
                end_time = _normalize_datetime(session.get('end_time'))
                if not end_time:
                    return False
                now = _now_for_datetime(end_time)
                return end_time < now and not session.get('is_active', False)

            if status == 'active':
                sessions = [s for s in sessions if is_active(s)]
            elif status == 'scheduled':
                sessions = [s for s in sessions if is_scheduled(s)]
            elif status == 'completed':
                sessions = [s for s in sessions if is_completed(s)]

        return jsonify({
            'sessions': sessions,
            'total': len(sessions)
        }), 200

    except Exception as e:
        return jsonify({'message': 'Internal server error'}), 500


@bp.route('/incidents', methods=['GET'])
@jwt_required()
def list_teacher_incidents():
    """Teacher-only endpoint to list incidents for assigned sessions"""
    try:
        current_user_id = get_jwt_identity()
        models = get_models()
        user_model = models['user']
        session_model = models['exam_session']
        incident_model = models['incident']

        user = user_model.find_by_id(current_user_id)
        if not user:
            return jsonify({'message': 'User not found'}), 404
        if user.get('role') != 'teacher':
            return jsonify({'message': 'Access denied. Teacher privileges required.'}), 403

        exam_session_id = request.args.get('exam_session_id')
        limit = request.args.get('limit')

        teacher_sessions = session_model.find_by_teacher(current_user_id)
        teacher_session_ids = [s.get('id') for s in teacher_sessions]

        if exam_session_id and exam_session_id not in teacher_session_ids:
            return jsonify({'message': 'Access denied. Session not assigned to you.'}), 403

        query = {}
        if exam_session_id:
            query['exam_session_id'] = exam_session_id
        else:
            if not teacher_session_ids:
                return jsonify({'incidents': [], 'total': 0}), 200
            query['exam_session_id'] = {'$in': teacher_session_ids}

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
        return jsonify({'message': 'Internal server error'}), 500


@bp.route('/alerts/<path:filename>', methods=['GET'])
def get_alert_image(filename):
    """Serve stored alert evidence images"""
    try:
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'suspicious_alerts'))
        return send_from_directory(base_dir, filename)
    except FileNotFoundError:
        return jsonify({'message': 'Image not found'}), 404
