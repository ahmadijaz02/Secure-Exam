from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.monitoring import bp
from app import socketio
import subprocess
import threading
import os
from datetime import datetime
import sys
import math
import time

EMIT_LEGACY_MONITORING_FRAME = os.environ.get('EMIT_LEGACY_MONITORING_FRAME', '0').lower() in ('1', 'true', 'yes', 'on')

# Global state
current_process = None
monitoring_active = False

# Per-student head-turn tracker.
# Key: student identifier ("roll_number" or "seat_number"), Value: list of timestamps
# When a student accumulates HEAD_TURN_ESCALATION_THRESHOLD turns within
# HEAD_TURN_WINDOW_SECONDS, the alert is escalated to warning level 2.
HEAD_TURN_WINDOW_SECONDS = 60
HEAD_TURN_ESCALATION_THRESHOLD = 3
student_head_turn_tracker = {}   # { student_key: [timestamp, ...] }


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


def resolve_student_from_detection(app, exam_session_id, norm_x, norm_y):
    """Look up the student nearest to a normalised detection coordinate.

    The function iterates over all seating plans linked to the active exam
    session (via the ``classrooms`` array) and finds the seat whose normalised
    position is closest to (norm_x, norm_y).

    Args:
        app: Flask application object (for model access).
        exam_session_id: ID of the current exam session.
        norm_x: Detection centre x, normalised 0-1.
        norm_y: Detection centre y, normalised 0-1.

    Returns:
        dict with ``student_name``, ``roll_number``, ``seat_number`` if a
        match is found within tolerance, otherwise ``None``.
    """
    if not exam_session_id or norm_x is None or norm_y is None:
        return None

    try:
        session_model = app.exam_session_model
        seating_plan_model = app.seating_plan_model

        session = session_model.find_by_id(exam_session_id)
        if not session:
            return None

        classrooms = session.get('classrooms', [])
        if not classrooms:
            return None

        # Tolerance in normalised coords (roughly 15% of frame dimension)
        NORM_TOLERANCE = 0.15
        best_match = None
        best_dist = float('inf')

        for classroom in classrooms:
            plan_id = classroom.get('seating_plan_id')
            if not plan_id:
                continue

            plan = seating_plan_model.find_by_id(plan_id)
            if not plan:
                continue

            for seat in plan.get('seats', []):
                seat_nx = seat.get('norm_x')
                seat_ny = seat.get('norm_y')
                student_name = seat.get('student_name', '')
                roll_number = seat.get('roll_number', '')

                if seat_nx is None or seat_ny is None:
                    continue
                if not student_name:
                    continue

                dist = math.sqrt((seat_nx - norm_x) ** 2 + (seat_ny - norm_y) ** 2)
                if dist < best_dist:
                    best_dist = dist
                    best_match = {
                        'student_name': student_name,
                        'roll_number': roll_number or '',
                        'seat_number': seat.get('seat_number', ''),
                        'plan_id': plan.get('id', plan_id),
                        'classroom_name': plan.get('classroom_name', ''),
                    }

        if best_match and best_dist <= NORM_TOLERANCE:
            return best_match
        return None
    except Exception as e:
        print(f"[resolve_student] Error: {e}")
        return None


def process_monitor_output(process, socketio_instance, app):
    """
    Read monitor.py stdout line-by-line and emit via Socket.IO.
    Runs inside Flask app context so emits reach all clients in /monitoring namespace.
    """
    global monitoring_active
    frame_count = 0
    try:
        with app.app_context():
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
                    if frame_count % 30 == 0:
                        print(f"[Monitor] Emitted frame #{frame_count}")

                    try:
                        # FYP style: emit raw base64 to default namespace as "frame"
                        socketio_instance.emit('frame', frame_data, namespace='/')
                        # Optional backward compatibility event (off by default for lower latency)
                        if EMIT_LEGACY_MONITORING_FRAME:
                            socketio_instance.emit('video_frame', {'frame': f'data:image/jpeg;base64,{frame_data}'}, namespace='/monitoring')
                    except Exception as e:
                        print(f"Error emitting frame: {e}")

                elif line.startswith('ALERT:'):
                    parts = line.split(':', 4)
                    if len(parts) >= 2:
                        reason = parts[1]
                        timestamp = parts[2] if len(parts) > 2 else ""
                        filename = parts[3] if len(parts) > 3 else None
                        bbox_info = parts[4] if len(parts) > 4 else None

                        # Parse optional bounding-box centre + frame dimensions
                        # Format: cx,cy,frame_w,frame_h
                        norm_x = None
                        norm_y = None
                        if bbox_info:
                            try:
                                bbox_parts = bbox_info.split(',')
                                if len(bbox_parts) >= 4:
                                    cx = int(bbox_parts[0])
                                    cy = int(bbox_parts[1])
                                    fw = int(bbox_parts[2])
                                    fh = int(bbox_parts[3])
                                    if fw > 0 and fh > 0:
                                        norm_x = cx / fw
                                        norm_y = cy / fh
                            except (ValueError, ZeroDivisionError):
                                pass

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

                        # Resolve student from seating plan (if coordinates available)
                        exam_session_id = getattr(app, 'current_exam_session_id', None)
                        student_info = resolve_student_from_detection(app, exam_session_id, norm_x, norm_y)
                        student_name = student_info['student_name'] if student_info else None
                        roll_number = student_info['roll_number'] if student_info else None
                        seat_number = student_info['seat_number'] if student_info else None

                        if student_info:
                            print(f"[Monitor] Detected student: {student_name} (Roll: {roll_number}, Seat: {seat_number})")

                        # Determine warning level and type
                        behavior_types = ['HEAD_LEFT', 'HEAD_RIGHT', 'HAND_MOUTH', 'WATCH_DETECTED']
                        object_types = ['PHONE_DETECTED', 'PAPER_PASSING']
                        head_turn_types = ['HEAD_LEFT', 'HEAD_RIGHT']
                        head_turn_escalated = False
                        head_turn_count = 0

                        if reason in object_types:
                            warning_level = 2
                            send_email = True
                        else:
                            warning_level = 1
                            send_email = False

                        # --- Head-turn escalation logic ---
                        if reason in head_turn_types and student_info:
                            student_key = roll_number or seat_number or student_name
                            now_ts = time.time()

                            # Append current timestamp
                            if student_key not in student_head_turn_tracker:
                                student_head_turn_tracker[student_key] = []
                            student_head_turn_tracker[student_key].append(now_ts)

                            # Prune entries older than the window
                            cutoff = now_ts - HEAD_TURN_WINDOW_SECONDS
                            student_head_turn_tracker[student_key] = [
                                t for t in student_head_turn_tracker[student_key] if t >= cutoff
                            ]

                            head_turn_count = len(student_head_turn_tracker[student_key])

                            if head_turn_count >= HEAD_TURN_ESCALATION_THRESHOLD:
                                warning_level = 2
                                send_email = True
                                head_turn_escalated = True
                                print(
                                    f"[Monitor] Head-turn ESCALATED to Level 2 for "
                                    f"{student_name} ({roll_number}) — "
                                    f"{head_turn_count} turns in last {HEAD_TURN_WINDOW_SECONDS}s"
                                )

                        # Build description with student info
                        description = f"Auto-detected: {reason}"
                        if student_info:
                            description = f"{reason} — {student_name} (Roll: {roll_number}, Seat: {seat_number})"
                        if head_turn_escalated:
                            description += f" [ESCALATED: {head_turn_count} head turns in {HEAD_TURN_WINDOW_SECONDS}s]"

                        # Save to DB
                        try:
                            # Save incident to DB
                            incident_model = app.incident_model
                            incident = incident_model.create_incident(
                                exam_session_id=exam_session_id,
                                incident_type=reason,
                                description=description,
                                image_url=image_path,
                                confidence_score=None,
                                student_name=student_name,
                                roll_number=roll_number,
                                seat_number=seat_number,
                            )
                            # Emit to dashboard
                            payload = {
                                'reason': reason,
                                'timestamp': timestamp,
                                'alert_time': datetime.now().isoformat(),
                                'filename': filename,
                                'severity': 'high' if head_turn_escalated else get_severity(reason),
                                'warning_level': warning_level,
                                'exam_session_id': exam_session_id,
                                'student_name': student_name,
                                'roll_number': roll_number,
                                'seat_number': seat_number,
                                'head_turn_escalated': head_turn_escalated,
                                'head_turn_count': head_turn_count if head_turn_escalated else None,
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
                                        email_body = f"Level 2 Warning: {reason} detected at {timestamp}."
                                        if head_turn_escalated and student_name:
                                            email_body = (
                                                f"Level 2 Warning: {student_name} (Roll: {roll_number}, Seat: {seat_number}) "
                                                f"has turned their head {head_turn_count} times in the last {HEAD_TURN_WINDOW_SECONDS} seconds."
                                            )
                                        if filename:
                                            email_body += f" See evidence: {filename}"
                                        send_email_alert(
                                            subject=f"Exam Alert: {reason}{' — ' + student_name if student_name else ''}",
                                            body=email_body,
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
        data = request.get_json(silent=True) or {}
        requested_session_id = data.get('session_id')

        user = user_model.find_by_id(current_user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if user.get('role') != 'teacher':
            return jsonify({'error': 'Access denied. Teacher privileges required.'}), 403

        target_session_id = requested_session_id or current_session_id
        target_session = None
        if target_session_id:
            target_session = session_model.find_by_id(target_session_id)
            if not target_session:
                return jsonify({'error': 'Exam session not found'}), 404
            if target_session.get('teacher_id') != current_user_id:
                return jsonify({'error': 'Access denied. Session not assigned to you.'}), 403

        monitoring_active = False
        # Reset per-student head-turn tracker
        student_head_turn_tracker.clear()
        if current_process:
            current_process.terminate()
            try:
                current_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                current_process.kill()
            current_process = None

        if target_session_id:
            session_model.update_session(target_session_id, {'is_active': False})

        if current_session_id and (not target_session_id or target_session_id == current_session_id):
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
