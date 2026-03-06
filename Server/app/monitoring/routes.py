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
SOCKET_STREAM_TARGET_FPS = max(1, int(os.environ.get('SOCKET_STREAM_TARGET_FPS', '10')))
SOCKET_EMIT_EVERY_N = max(1, int(os.environ.get('SOCKET_EMIT_EVERY_N', '1')))

MONITOR_QUALITY_PRESETS = {
    'onnx_directml': {
        'MONITOR_FRAME_WIDTH': '1280',
        'MONITOR_FRAME_HEIGHT': '720',
        'YOLO_IMAGE_SIZE': '640',
        'YOLO_PROCESS_EVERY': '3',
        'MEDIAPIPE_PROCESS_EVERY': '10',
        'MEDIAPIPE_REFINE_LANDMARKS': '0',
        'ENABLE_CLAHE': '0',
        'STREAM_WIDTH': '1280',
        'STREAM_HEIGHT': '720',
        'STREAM_JPEG_QUALITY': '70',
        'STREAM_TARGET_FPS': '8',
        'SOCKET_STREAM_TARGET_FPS': '8',
        'CAMERA_READ_LATEST': '1',
        'CAMERA_BUFFER_FLUSH': '3',
        'SKIP_CAMERA_PROBE': '1',
        'CAMERA_WARMUP_FRAMES': '2',
        'CAMERA_WARMUP_DELAY_SEC': '0.02',
        'POST_CAMERA_INIT_DELAY_SEC': '0.2',
        'ENABLE_TILED_INFERENCE': '0',
        'FORCE_PREDICT_ONLY': '1',
        'USE_ONNX_RUNTIME_DML': '1',
    },
    'yolo_only': {
        'MONITOR_FRAME_WIDTH': '854',
        'MONITOR_FRAME_HEIGHT': '480',
        'YOLO_IMAGE_SIZE': '512',
        'YOLO_PROCESS_EVERY': '4',
        'MEDIAPIPE_PROCESS_EVERY': '99',
        'DISABLE_MEDIAPIPE': '1',
        'ENABLE_CLAHE': '0',
        'STREAM_WIDTH': '320',
        'STREAM_HEIGHT': '180',
        'STREAM_JPEG_QUALITY': '32',
        'STREAM_TARGET_FPS': '11',
        'SOCKET_STREAM_TARGET_FPS': '10',
        'CAMERA_READ_LATEST': '1',
        'CAMERA_BUFFER_FLUSH': '3',
        'SKIP_CAMERA_PROBE': '1',
        'CAMERA_WARMUP_FRAMES': '2',
        'CAMERA_WARMUP_DELAY_SEC': '0.02',
        'POST_CAMERA_INIT_DELAY_SEC': '0.2',
        'ENABLE_TILED_INFERENCE': '0',
        'FORCE_PREDICT_ONLY': '1',
        'USE_ONNX_RUNTIME_DML': '1',
    },
    'ultra_low_latency': {
        'MONITOR_FRAME_WIDTH': '960',
        'MONITOR_FRAME_HEIGHT': '540',
        'YOLO_IMAGE_SIZE': '512',
        'YOLO_PROCESS_EVERY': '7',
        'MEDIAPIPE_PROCESS_EVERY': '99',
        'DISABLE_MEDIAPIPE': '1',
        'MEDIAPIPE_REFINE_LANDMARKS': '0',
        'ENABLE_CLAHE': '0',
        'STREAM_WIDTH': '640',
        'STREAM_HEIGHT': '360',
        'STREAM_JPEG_QUALITY': '45',
        'STREAM_TARGET_FPS': '12',
        'SOCKET_STREAM_TARGET_FPS': '10',
        'CAMERA_READ_LATEST': '1',
        'CAMERA_BUFFER_FLUSH': '2',
        'SKIP_CAMERA_PROBE': '1',
        'CAMERA_WARMUP_FRAMES': '2',
        'CAMERA_WARMUP_DELAY_SEC': '0.02',
        'POST_CAMERA_INIT_DELAY_SEC': '0.2',
        'ENABLE_TILED_INFERENCE': '0',
        'FORCE_PREDICT_ONLY': '1',
        'USE_ONNX_RUNTIME_DML': '1',
    },
    'low_latency': {
        'YOLO_IMAGE_SIZE': '640',
        'YOLO_PROCESS_EVERY': '3',
        'MEDIAPIPE_PROCESS_EVERY': '8',
        'MEDIAPIPE_REFINE_LANDMARKS': '0',
        'ENABLE_CLAHE': '0',
        'STREAM_WIDTH': '426',
        'STREAM_HEIGHT': '240',
        'STREAM_JPEG_QUALITY': '38',
        'STREAM_TARGET_FPS': '15',
        'SOCKET_STREAM_TARGET_FPS': '12',
        'CAMERA_READ_LATEST': '1',
        'CAMERA_BUFFER_FLUSH': '1',
        'ENABLE_TILED_INFERENCE': '0',
    },
    'balanced': {
        'YOLO_IMAGE_SIZE': '960',
        'YOLO_PROCESS_EVERY': '2',
        'MEDIAPIPE_PROCESS_EVERY': '4',
        'STREAM_WIDTH': '512',
        'STREAM_HEIGHT': '288',
        'STREAM_JPEG_QUALITY': '48',
        'STREAM_TARGET_FPS': '12',
        'SOCKET_STREAM_TARGET_FPS': '10',
        'CAMERA_READ_LATEST': '1',
        'CAMERA_BUFFER_FLUSH': '2',
        'ENABLE_TILED_INFERENCE': '1',
        'TILED_INFERENCE_EVERY': '4',
    },
    'amd_optimized': {
        'MONITOR_FRAME_WIDTH': '1280',
        'MONITOR_FRAME_HEIGHT': '720',
        'YOLO_IMAGE_SIZE': '960',
        'YOLO_PROCESS_EVERY': '2',
        'MEDIAPIPE_PROCESS_EVERY': '6',
        'MEDIAPIPE_REFINE_LANDMARKS': '0',
        'ENABLE_CLAHE': '1',
        'STREAM_WIDTH': '640',
        'STREAM_HEIGHT': '360',
        'STREAM_JPEG_QUALITY': '68',
        'STREAM_TARGET_FPS': '12',
        'SOCKET_STREAM_TARGET_FPS': '10',
        'CAMERA_READ_LATEST': '1',
        'CAMERA_BUFFER_FLUSH': '1',
        'SKIP_CAMERA_PROBE': '1',
        'CAMERA_WARMUP_FRAMES': '2',
        'CAMERA_WARMUP_DELAY_SEC': '0.02',
        'POST_CAMERA_INIT_DELAY_SEC': '0.2',
        'ENABLE_TILED_INFERENCE': '1',
        'TILED_INFERENCE_EVERY': '3',
        'YOLO_MAX_DETECTIONS': '60',
        'FORCE_PREDICT_ONLY': '1',
        'USE_ONNX_RUNTIME_DML': '1',
    },
    'high_accuracy': {
        'MONITOR_FRAME_WIDTH': '1920',
        'MONITOR_FRAME_HEIGHT': '1080',
        'YOLO_IMAGE_SIZE': '1280',
        'YOLO_PROCESS_EVERY': '1',
        'MEDIAPIPE_PROCESS_EVERY': '4',
        'STREAM_WIDTH': '640',
        'STREAM_HEIGHT': '360',
        'STREAM_JPEG_QUALITY': '60',
        'STREAM_TARGET_FPS': '10',
        'SOCKET_STREAM_TARGET_FPS': '10',
        'CAMERA_READ_LATEST': '1',
        'CAMERA_BUFFER_FLUSH': '1',
        'ENABLE_TILED_INFERENCE': '1',
        'TILED_INFERENCE_EVERY': '2',
    },
}

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

# Keep email dispatch non-blocking and rate-limited so stdout reader does not stall.
EMAIL_ALERT_COOLDOWN_SECONDS = 20
last_email_sent_at = {}


def _send_alert_email_async(app_obj, exam_session_id, reason, timestamp, filename, student_name, roll_number, seat_number, head_turn_escalated, head_turn_count, window_seconds):
    """Send alert email in a background thread to avoid blocking frame stream I/O."""
    try:
        with app_obj.app_context():
            now_ts = time.time()
            email_key = f"{exam_session_id}:{reason}:{student_name or ''}:{roll_number or ''}:{seat_number or ''}"
            last_sent = last_email_sent_at.get(email_key, 0)
            if now_ts - last_sent < EMAIL_ALERT_COOLDOWN_SECONDS:
                return

            session_model = app_obj.exam_session_model
            user_model = app_obj.user_model

            session = session_model.find_by_id(exam_session_id) if exam_session_id else None
            teacher_email = None
            if session and 'teacher_id' in session:
                teacher = user_model.find_by_id(session['teacher_id'])
                if teacher and 'email' in teacher:
                    teacher_email = teacher['email']

            if not teacher_email:
                return

            from app.utils.helpers import send_email_alert
            email_body = f"Level 2 Warning: {reason} detected at {timestamp}."
            if head_turn_escalated and student_name:
                email_body = (
                    f"Level 2 Warning: {student_name} (Roll: {roll_number}, Seat: {seat_number}) "
                    f"has turned their head {head_turn_count} times in the last {window_seconds} seconds."
                )
            if filename:
                email_body += f" See evidence: {filename}"

            send_email_alert(
                subject=f"Exam Alert: {reason}{' - ' + student_name if student_name else ''}",
                body=email_body,
                to_emails=[teacher_email]
            )
            last_email_sent_at[email_key] = now_ts
    except Exception as e:
        print(f"[DEBUG] Async email send failed: {e}")


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

    **Perspective-aware matching:**  In a typical exam-hall camera setup the
    camera is mounted at one end of the room looking across rows of desks.
    Objects that are physically far from the camera appear in the *upper*
    portion of the frame (small norm_y) while objects close to the camera
    appear in the *lower* portion (large norm_y).  A fixed Euclidean
    tolerance therefore doesn't work well — seats far from the camera are
    packed into a small band of normalised Y while seats nearby spread out.

    To compensate we:
      1. Use a **wider X-tolerance** than before (seats in a row are spaced
         more evenly along the horizontal axis).
      2. Use a **Y-tolerance that scales with the Y position** — tighter at the
         bottom of the frame (close seats, easy to distinguish) and wider at
         the top (distant seats, compressed by perspective).
      3. Apply a **weighted distance** that emphasises Y-axis differences less
         for the upper half of the frame.

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

        # --- Perspective-aware tolerances ---
        # Base tolerance — applies when the detection is in the lower half of
        # the frame (close to camera, good spatial separation).
        BASE_X_TOLERANCE = 0.12
        BASE_Y_TOLERANCE = 0.10

        # For the upper portion of the frame (far from camera) we allow up to
        # this much extra tolerance because perspective compresses Y.
        MAX_EXTRA_Y_TOLERANCE = 0.12  # at norm_y == 0

        # Overall hard cutoff (even with scaling, never match beyond this).
        HARD_CUTOFF = 0.25

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

                dx = abs(seat_nx - norm_x)
                dy = abs(seat_ny - norm_y)

                # Dynamic Y tolerance: wider when detection is near the top of
                # the frame (small norm_y) where perspective compresses rows.
                # Linear interpolation: at norm_y=0 -> base + max_extra,
                #                       at norm_y=1 -> base
                effective_y_tol = BASE_Y_TOLERANCE + MAX_EXTRA_Y_TOLERANCE * (1.0 - norm_y)

                # Quick bounding-box reject before computing full distance
                if dx > BASE_X_TOLERANCE or dy > effective_y_tol:
                    continue

                # Weighted Euclidean: downweight Y difference for distant
                # detections (upper frame) by a perspective scale factor.
                # perspective_weight ranges from 0.5 (top of frame) to 1.0 (bottom).
                perspective_weight = 0.5 + 0.5 * norm_y
                dist = math.sqrt(dx ** 2 + (dy * perspective_weight) ** 2)

                if dist < best_dist:
                    best_dist = dist
                    best_match = {
                        'student_name': student_name,
                        'roll_number': roll_number or '',
                        'seat_number': seat.get('seat_number', ''),
                        'plan_id': plan.get('id', plan_id),
                        'classroom_name': plan.get('classroom_name', ''),
                    }

        if best_match and best_dist <= HARD_CUTOFF:
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
    last_frame_emit_ts = 0.0
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
                    if SOCKET_EMIT_EVERY_N > 1 and (frame_count % SOCKET_EMIT_EVERY_N != 0):
                        continue

                    now_ts = time.time()
                    if now_ts - last_frame_emit_ts < (1.0 / SOCKET_STREAM_TARGET_FPS):
                        continue
                    last_frame_emit_ts = now_ts

                    if frame_count % 30 == 0:
                        print(f"[Monitor] Emitted frame #{frame_count}")

                    try:
                        # Emit frame with server timestamp for latency measurement
                        socketio_instance.emit('frame', {
                            'frame': frame_data,
                            'ts': int(now_ts * 1000)
                        }, namespace='/')
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
                                    threading.Thread(
                                        target=_send_alert_email_async,
                                        args=(
                                            app,
                                            exam_session_id,
                                            reason,
                                            timestamp,
                                            filename,
                                            student_name,
                                            roll_number,
                                            seat_number,
                                            head_turn_escalated,
                                            head_turn_count,
                                            HEAD_TURN_WINDOW_SECONDS,
                                        ),
                                        daemon=True,
                                    ).start()
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
    global current_process, monitoring_active, SOCKET_STREAM_TARGET_FPS, SOCKET_EMIT_EVERY_N

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
        quality_preset = str(data.get('quality_preset') or 'balanced').strip().lower()
        if not session_id:
            return jsonify({'error': 'session_id is required'}), 400
        if quality_preset not in MONITOR_QUALITY_PRESETS:
            return jsonify({
                'error': 'Invalid quality_preset. Use onnx_directml, yolo_only, ultra_low_latency, low_latency, balanced, amd_optimized, or high_accuracy.'
            }), 400

        # Apply socket emission throttle from selected preset in the parent process.
        # (Preset env vars are also passed to monitor.py child process.)
        selected_preset = MONITOR_QUALITY_PRESETS.get(quality_preset, {})
        try:
            SOCKET_STREAM_TARGET_FPS = max(1, int(selected_preset.get('SOCKET_STREAM_TARGET_FPS', SOCKET_STREAM_TARGET_FPS)))
        except (TypeError, ValueError):
            pass
        try:
            SOCKET_EMIT_EVERY_N = max(1, int(selected_preset.get('SOCKET_EMIT_EVERY_N', SOCKET_EMIT_EVERY_N)))
        except (TypeError, ValueError):
            pass

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
                **MONITOR_QUALITY_PRESETS.get(quality_preset, {}),
                'PYTHONUNBUFFERED': '1',
                'EXAM_SESSION_FOLDER': session_folder,
                'MONITOR_QUALITY_PRESET': quality_preset,
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
            'session_id': session_id,
            'quality_preset': quality_preset,
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
