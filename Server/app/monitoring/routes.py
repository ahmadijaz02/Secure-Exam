from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.monitoring import bp
from app import socketio
import subprocess
import threading
import os
from datetime import datetime
import sys

# Global state
current_process = None
monitoring_active = False


@socketio.on('connect', namespace='/')
def handle_default_connect():
    """When frontend connects to default namespace, send a log so they see connection works."""
    try:
        print("Client connected to default namespace (monitoring)")
        socketio.emit('log', 'Connected to monitoring server', namespace='/')
    except Exception as e:
        print(f"Default namespace connect error: {e}")


@socketio.on('connect', namespace='/monitoring')
def handle_monitoring_connect():
    try:
        print(f"Monitoring socket connected: {request.sid}")
        socketio.emit('monitoring_status', {
            'message': 'Monitoring socket connected'
        }, namespace='/monitoring')
    except Exception as e:
        print(f"Monitoring socket connect error: {e}")


@socketio.on('disconnect', namespace='/monitoring')
def handle_monitoring_disconnect():
    try:
        print(f"Monitoring socket disconnected: {request.sid}")
    except Exception as e:
        print(f"Monitoring socket disconnect error: {e}")


def get_severity(reason):
    """Get alert severity level"""
    high_severity = ['PHONE_DETECTED', 'PAPER_PASSING']
    medium_severity = ['WATCH_DETECTED', 'HAND_MOUTH']

    if reason in high_severity:
        return 'high'
    elif reason in medium_severity:
        return 'medium'
    else:
        return 'low'


def process_monitor_output(process, socketio_instance, app):
    """
    Read monitor.py stdout line-by-line and emit via Socket.IO.
    Runs inside Flask app context so emits reach all clients in /monitoring namespace.
    """
    global monitoring_active
    frame_count = 0
    try:
        while monitoring_active and process.poll() is None:
            line = process.stdout.readline()
            if not line:
                break

            line = line.strip()
            if not line:
                continue

            # Emit same as FYP: default namespace, "frame" (raw base64) and "log" (string)
            if line.startswith('FRAME:'):
                frame_data = line[6:]
                if not frame_data or len(frame_data) < 100:
                    continue
                frame_count += 1
                if frame_count % 10 == 0:
                    print(f"[Monitor] Emitted frame #{frame_count}")

                with app.app_context():
                    try:
                        # FYP style: emit raw base64 to default namespace as "frame"
                        socketio_instance.emit('frame', frame_data, namespace='/')
                        # Also emit to /monitoring for backward compatibility
                        socketio_instance.emit('video_frame', {'frame': f'data:image/jpeg;base64,{frame_data}'}, namespace='/monitoring')
                    except Exception as e:
                        print(f"Error emitting frame: {e}")

            elif line.startswith('ALERT:'):
                parts = line.split(':', 3)
                if len(parts) >= 2:
                    reason = parts[1]
                    timestamp = parts[2] if len(parts) > 2 else ""
                    filename = parts[3] if len(parts) > 3 else None
                    image_path = None
                    if filename:
                        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'suspicious_alerts'))
                        if os.path.isabs(filename):
                            relative_path = os.path.relpath(filename, base_dir)
                        else:
                            relative_path = os.path.relpath(filename, 'suspicious_alerts')
                        relative_path = relative_path.replace(os.sep, '/')
                        image_path = f"/api/alerts/{relative_path}"
                    print(f"[Monitor] Alert: {reason}")
                    # Determine warning level and type
                    behavior_types = ['HEAD_LEFT', 'HEAD_RIGHT', 'HAND_MOUTH', 'WATCH_DETECTED']
                    object_types = ['PHONE_DETECTED', 'PAPER_PASSING']
                    if reason in object_types:
                        warning_level = 2
                        send_email = True
                    else:
                        warning_level = 1
                        send_email = False
                    # Save to DB
                    with app.app_context():
                        try:
                            # Save incident to DB
                            incident_model = app.incident_model
                            # Try to get exam_session_id from global, request, or context (customize as needed)
                            exam_session_id = getattr(app, 'current_exam_session_id', None)
                            incident = incident_model.create_incident(
                                exam_session_id=exam_session_id,
                                incident_type=reason,
                                description=f"Auto-detected: {reason}",
                                image_url=image_path,
                                confidence_score=None
                            )
                            # Emit to dashboard
                            payload = {
                                'reason': reason,
                                'timestamp': timestamp,
                                'alert_time': datetime.now().isoformat(),
                                'filename': filename,
                                'severity': get_severity(reason),
                                'warning_level': warning_level,
                                'exam_session_id': exam_session_id
                            }
                            socketio_instance.emit('log', line, namespace='/')
                            socketio_instance.emit('monitoring_alert', payload, namespace='/monitoring')
                            socketio_instance.emit('monitoring_alert', payload, namespace='/')
                            # Send email for object detection only
                            if send_email:
                                try:
                                    print(f"[DEBUG] Level 2 alert: exam_session_id = {exam_session_id}")
                                    session_model = app.exam_session_model
                                    user_model = app.user_model
                                    session = session_model.find_by_id(exam_session_id) if exam_session_id else None
                                    print(f"[DEBUG] Session lookup result: {session}")
                                    teacher_email = None
                                    if session and 'teacher_id' in session:
                                        print(f"[DEBUG] Found teacher_id: {session['teacher_id']}")
                                        teacher = user_model.find_by_id(session['teacher_id'])
                                        print(f"[DEBUG] Teacher lookup result: {teacher}")
                                        if teacher and 'email' in teacher:
                                            teacher_email = teacher['email']
                                    if teacher_email:
                                        print(f"[DEBUG] Sending email to {teacher_email} for Level 2 warning: {reason}")
                                        from app.utils.helpers import send_email_alert
                                        send_email_alert(
                                            subject=f"Exam Alert: {reason}",
                                            body=f"Level 2 Warning: {reason} detected at {timestamp}. See evidence: {filename}",
                                            to_emails=[teacher_email]
                                        )
                                        print(f"[DEBUG] Email sent to {teacher_email} for Level 2 warning: {reason}")
                                    else:
                                        print(f"[DEBUG] No teacher email found for session {exam_session_id}. Email not sent.")
                                except Exception as e:
                                    print(f"[DEBUG] Error sending email for Level 2 warning: {e}")
                        except Exception as e:
                            print(f"Error emitting alert: {e}")

            else:
                # Status/log line - emit as "log" to default namespace (FYP style)
                print(f"[Monitor] {line[:200]}")
                with app.app_context():
                    try:
                        socketio_instance.emit('log', line, namespace='/')
                        socketio_instance.emit('monitoring_status', {'message': line}, namespace='/monitoring')
                    except Exception as e:
                        print(f"Error emitting status: {e}")

    except Exception as e:
        print(f"Error in monitor output: {e}")
        with app.app_context():
            try:
                socketio_instance.emit('monitoring_error', {'error': str(e)}, namespace='/monitoring')
            except Exception:
                pass
    finally:
        print("Monitor output reader ended")


@bp.route('/start', methods=['POST'])
@jwt_required()
def start_monitoring():
    """Start monitoring camera - launch monitor.py and stream frames via Socket.IO"""
    global current_process, monitoring_active

    try:
        current_user_id = get_jwt_identity()
        from app import get_models
        models = get_models()
        user_model = models['user']
        session_model = models['exam_session']

        user = user_model.find_by_id(current_user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if user.get('role') != 'teacher':
            return jsonify({'error': 'Access denied. Teacher privileges required.'}), 403

        data = request.get_json(silent=True) or {}
        session_id = data.get('session_id')
        if not session_id:
            return jsonify({'error': 'session_id is required'}), 400

        session = session_model.find_by_id(session_id)
        if not session:
            return jsonify({'error': 'Exam session not found'}), 404
        if session.get('teacher_id') != current_user_id:
            return jsonify({'error': 'Access denied. Session not assigned to you.'}), 403

        app = current_app._get_current_object()
        previous_session_id = getattr(app, 'current_exam_session_id', None)
        if previous_session_id and previous_session_id != session_id:
            session_model.update_session(previous_session_id, {'is_active': False})

        if monitoring_active and current_process and current_process.poll() is None:
            current_process.terminate()
            try:
                current_process.wait(timeout=2)
            except Exception:
                current_process.kill()
            current_process = None

        monitoring_active = True
        app.current_exam_session_id = session_id
        session_model.update_session(session_id, {'is_active': True})

        server_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        monitor_script = os.path.join(server_dir, 'monitor.py')
        if not os.path.exists(monitor_script):
            return jsonify({'error': f'monitor.py not found at {monitor_script}'}), 404

        session_name = session.get('name') or 'session'
        safe_session_name = ''.join(
            ch if ch.isalnum() or ch in ('-', '_') else '-'
            for ch in session_name
        ).strip('-') or 'session'
        session_folder = f"{safe_session_name}-{datetime.now().strftime('%Y-%m-%d')}"

        current_process = subprocess.Popen(
            [sys.executable, '-u', monitor_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1,
            cwd=os.path.dirname(monitor_script),
            env={
                **os.environ,
                'PYTHONUNBUFFERED': '1',
                'EXAM_SESSION_FOLDER': session_folder
            }
        )

        print(f"Monitor started PID={current_process.pid}")

        socketio_instance = current_app.extensions.get('socketio') or socketio

        # Use a real thread for subprocess readline (avoids eventlet blocking on pipe I/O)
        reader = threading.Thread(
            target=process_monitor_output,
            args=(current_process, socketio_instance, app),
            daemon=True
        )
        reader.start()

        return jsonify({
            'success': True,
            'message': 'Monitoring started',
            'pid': current_process.pid,
            'session_id': session_id
        }), 200

    except Exception as e:
        monitoring_active = False
        print(f"Error starting monitoring: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/stop', methods=['POST'])
@jwt_required()
def stop_monitoring():
    """Stop monitoring camera"""
    global current_process, monitoring_active

    try:
        current_user_id = get_jwt_identity()
        app = current_app._get_current_object()
        from app import get_models
        models = get_models()
        user_model = models['user']
        session_model = models['exam_session']
        current_session_id = getattr(app, 'current_exam_session_id', None)

        user = user_model.find_by_id(current_user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if user.get('role') != 'teacher':
            return jsonify({'error': 'Access denied. Teacher privileges required.'}), 403
        if current_session_id:
            session = session_model.find_by_id(current_session_id)
            if session and session.get('teacher_id') != current_user_id:
                return jsonify({'error': 'Access denied. Session not assigned to you.'}), 403

        monitoring_active = False
        if current_process:
            current_process.terminate()
            try:
                current_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                current_process.kill()
            current_process = None
        if current_session_id:
            session_model.update_session(current_session_id, {'is_active': False})
            app.current_exam_session_id = None
        return jsonify({'success': True, 'message': 'Monitoring stopped'}), 200
    except Exception as e:
        print(f"Error stopping monitoring: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/status', methods=['GET'])
def get_status():
    """Get monitoring status"""
    global monitoring_active, current_process
    is_running = monitoring_active and current_process and current_process.poll() is None
    return jsonify({
        'is_monitoring': is_running,
        'pid': current_process.pid if current_process else None
    }), 200


@bp.route('/test', methods=['GET'])
def test_endpoint():
    """Test endpoint"""
    return jsonify({'status': 'OK', 'message': 'Monitoring service is running'}), 200
